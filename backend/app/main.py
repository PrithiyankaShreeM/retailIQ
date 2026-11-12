import csv
import io
import os
import re
from typing import Optional
import uuid
from contextlib import asynccontextmanager
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

from fastapi import FastAPI, Depends, HTTPException, Response, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from openpyxl import load_workbook
from pypdf import PdfReader
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from .database import Base, engine, get_db
from .models import (
    User, Store, Product, Sale, SaleItem, Payment, Purchase, PurchaseItem,
    StockMovement, ImportRecord, utcnow,
)
from .schemas import (
    RegisterRequest, LoginRequest, ProductCreate, ProductUpdate, SaleCreate,
    PurchaseCreate, StockAdjustment, SettingsUpdate, AssistantQuery, TextToSpeechRequest, PasswordChange,
)
from .security import hash_password, verify_password, create_token, current_user
from .seed import seed_demo, DEMO_EMAIL
from .sarvam import (
    speech_to_text, text_to_speech, is_sarvam_configured,
    DEFAULT_STT_MODEL, DEFAULT_TTS_MODEL,
)
from .services import (
    money, product_dict, sale_dict, purchase_dict, dashboard_data, forecast_data,
    assistant_reply, sales_stats, day_start,
)


def is_production() -> bool:
    env = os.getenv("ENVIRONMENT", os.getenv("APP_ENV", "")).lower()
    cookie_secure = os.getenv("COOKIE_SECURE", "false").lower() == "true"
    is_postgres = os.getenv("DATABASE_URL", "").startswith(("postgresql", "postgres"))
    return env in ("production", "prod") or cookie_secure or is_postgres


def is_demo_seeding_allowed() -> bool:
    if is_production():
        seed_env = os.getenv("SEED_DEMO", "false")
        if seed_env.lower() not in ("true", "1", "yes"):
            return False
        demo_pass = os.getenv("DEMO_PASSWORD", "")
        if not demo_pass or demo_pass == DEFAULT_DEMO_PASSWORD:
            return False
        return True
    seed_env = os.getenv("SEED_DEMO", "true")
    return seed_env.lower() in ("true", "1", "yes")


@asynccontextmanager
async def lifespan(_app):
    Base.metadata.create_all(bind=engine)
    from .database import SessionLocal
    db = SessionLocal()
    try:
        if is_demo_seeding_allowed():
            seed_demo(db)
    finally:
        db.close()
    yield


app = FastAPI(
    title="RetailIQ API",
    description="Store-isolated retail billing, inventory, analytics and Vihzi APIs.",
    version="1.0.0",
    lifespan=lifespan,
)
origins = [origin.strip() for origin in os.getenv(
    "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
).split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def store_payload(user: User):
    store = user.store
    return {
        "id": store.id, "name": store.name, "address": store.address or "",
        "contact": store.contact or "", "business_category": store.business_category,
        "tax_rate": money(store.tax_rate), "language": store.language,
        "printer_width": store.printer_width, "notifications": store.notifications,
    }


def auth_payload(user: User, response: Response):
    token = create_token(user)
    response.set_cookie(
        "retailiq_session", token, max_age=7 * 24 * 60 * 60,
        httponly=True, secure=os.getenv("COOKIE_SECURE", "false").lower() == "true",
        samesite="lax", path="/",
    )
    return {
        "token": token,
        "user": {"id": user.id, "full_name": user.full_name, "email": user.email},
        "store": store_payload(user),
    }


def get_product(db, store_id, product_id):
    product = db.query(Product).filter(Product.id == product_id, Product.store_id == store_id).first()
    if not product:
        raise HTTPException(404, "Product not found in your shop")
    return product


def next_sku(db, store_id):
    skus = db.query(Product.sku).filter(Product.store_id == store_id).all()
    numbers = [int(match.group(1)) for (sku,) in skus if (match := re.match(r"PRD(\d+)$", sku or ""))]
    return f"PRD{max(numbers, default=0) + 1:03d}"


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "RetailIQ API", "time": datetime.now(timezone.utc).isoformat()}


@app.post("/api/auth/register", status_code=201)
def register(response: Response, payload: RegisterRequest, db: Session = Depends(get_db)):
    email = str(payload.email).lower()
    if db.query(User).filter(func.lower(User.email) == email).first():
        raise HTTPException(409, "An account with this email already exists")
    store = Store(
        name=payload.shop_name.strip(), address=payload.shop_address.strip(),
        contact=payload.contact.strip(), business_category=payload.business_category,
    )
    db.add(store)
    db.flush()
    user = User(
        store_id=store.id, full_name=payload.full_name.strip(), email=email,
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return auth_payload(user, response)


@app.post("/api/auth/login")
def login(response: Response, payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(func.lower(User.email) == str(payload.email).lower()).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(401, "Incorrect email or password")
    return auth_payload(user, response)


@app.post("/api/auth/demo")
def demo_login(response: Response, db: Session = Depends(get_db)):
    if not is_demo_seeding_allowed() or is_production():
        raise HTTPException(404, "Demo access is disabled in production")
    user = db.query(User).filter(User.email == DEMO_EMAIL).first()
    if not user:
        raise HTTPException(404, "Demo shop is not available")
    return auth_payload(user, response)


@app.post("/api/auth/logout")
def logout(response: Response):
    response.delete_cookie("retailiq_session", path="/")
    return {"message": "Signed out"}


@app.get("/api/auth/me")
def me(user: User = Depends(current_user)):
    return {"user": {"id": user.id, "full_name": user.full_name, "email": user.email}, "store": store_payload(user)}


@app.post("/api/auth/change-password")
def change_password(payload: PasswordChange, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(400, "Your current password is incorrect")
    user.password_hash = hash_password(payload.new_password)
    db.commit()
    return {"message": "Password updated securely"}


@app.get("/api/dashboard")
def dashboard(days: int = 30, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return dashboard_data(db, user.store, days)


@app.get("/api/products")
def list_products(
    search: str = "", category: str = "", user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    query = db.query(Product).filter(Product.store_id == user.store_id)
    if search:
        term = f"%{search.strip()}%"
        query = query.filter((Product.name.ilike(term)) | (Product.sku.ilike(term)))
    if category:
        query = query.filter(Product.category == category)
    products = query.order_by(Product.name).all()
    _, stats = sales_stats(db, user.store_id, 30)
    max_sold = max((stat["quantity"] for stat in stats.values()), default=0)
    active_days = db.query(func.count(func.distinct(func.date(Sale.created_at)))).filter(
        Sale.store_id == user.store_id, Sale.status == "Paid"
    ).scalar() or 0
    result = []
    for product in products:
        stat = stats.get(product.id, {"quantity": 0, "revenue": 0})
        performance = "Insufficient history" if active_days < 7 else (
            "No recent sales" if stat["quantity"] == 0 else
            "Selling well" if stat["quantity"] >= max_sold * 0.55 else
            "Average" if stat["quantity"] >= max_sold * 0.2 else "Slow moving"
        )
        result.append({**product_dict(product, stat["quantity"], stat["revenue"]), "performance": performance})
    categories = sorted({p.category for p in db.query(Product).filter(Product.store_id == user.store_id).all()})
    return {"products": result, "categories": categories}


@app.post("/api/products", status_code=201)
def create_product(payload: ProductCreate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    sku = (payload.sku or next_sku(db, user.store_id)).strip().upper()
    if not re.match(r"^[A-Z0-9_-]{2,60}$", sku):
        raise HTTPException(422, "Product ID may contain only letters, numbers, hyphens and underscores")
    if db.query(Product).filter(Product.store_id == user.store_id, Product.sku == sku).first():
        raise HTTPException(409, f"Product ID {sku} is already in use")
    product = Product(
        store_id=user.store_id, sku=sku, name=payload.name.strip(),
        category=payload.category.strip() or "General", description=payload.description,
        selling_price=payload.selling_price, cost_price=payload.cost_price,
        stock=payload.initial_stock, reorder_threshold=payload.reorder_threshold,
        qr_reference=f"RETAILIQ:{sku}",
    )
    db.add(product)
    db.flush()
    if payload.initial_stock:
        db.add(StockMovement(
            store_id=user.store_id, product_id=product.id, movement_type="initial",
            quantity=payload.initial_stock, balance_after=payload.initial_stock,
            note="Opening stock entered during product registration",
        ))
    db.commit()
    db.refresh(product)
    return product_dict(product)


@app.patch("/api/products/{product_id}")
def update_product(product_id: str, payload: ProductUpdate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    product = get_product(db, user.store_id, product_id)
    changes = payload.model_dump(exclude_unset=True)
    for key, value in changes.items():
        setattr(product, key, value)
    product.updated_at = utcnow()
    db.commit()
    db.refresh(product)
    return product_dict(product)


@app.get("/api/products/scan")
def scan_product(reference: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    cleaned = reference.strip()
    stripped = cleaned.replace("RETAILIQ:", "").strip()
    product = db.query(Product).filter(
        Product.store_id == user.store_id,
        Product.active == True,
        (
            (Product.qr_reference == cleaned)
            | (Product.qr_reference == f"RETAILIQ:{stripped.upper()}")
            | (Product.sku == cleaned.upper())
            | (Product.sku == stripped.upper())
            | (Product.id == cleaned)
            | (func.lower(Product.name) == cleaned.lower())
        ),
    ).first()
    if not product:
        raise HTTPException(404, "Unknown QR or barcode. This product is not in your shop catalogue.")
    return product_dict(product)


@app.post("/api/sales", status_code=201)
def create_sale(payload: SaleCreate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    existing = db.query(Sale).options(joinedload(Sale.items)).filter(
        Sale.store_id == user.store_id, Sale.client_token == payload.client_token
    ).first()
    if existing:
        return sale_dict(existing)

    quantities = defaultdict(int)
    for item in payload.items:
        quantities[item.product_id] += item.quantity
    products = db.query(Product).filter(
        Product.store_id == user.store_id, Product.id.in_(quantities.keys()), Product.active == True
    ).with_for_update().all()
    if len(products) != len(quantities):
        raise HTTPException(400, "One or more products are invalid or no longer active")
    subtotal = Decimal("0")
    item_count = 0
    for product in products:
        requested = quantities[product.id]
        if product.stock < requested:
            raise HTTPException(409, f"{product.name} has only {product.stock} unit(s) available")
        subtotal += Decimal(str(product.selling_price)) * requested
        item_count += requested
    discount = Decimal(str(payload.discount))
    if discount > subtotal:
        raise HTTPException(422, "Discount cannot be greater than the subtotal")
    tax = ((subtotal - discount) * Decimal(str(user.store.tax_rate)) / 100).quantize(Decimal("0.01"))
    # The client token makes the human-readable bill number safe under concurrent checkouts too.
    bill_number = f"B-{datetime.now(timezone.utc):%Y%m%d}-{payload.client_token.replace('-', '')[:8].upper()}"
    sale = Sale(
        store_id=user.store_id, bill_number=bill_number, client_token=payload.client_token,
        subtotal=subtotal, tax=tax, discount=discount, total=subtotal - discount + tax,
        item_count=item_count, payment_method=payload.payment_method,
    )
    db.add(sale)
    db.flush()
    for product in products:
        quantity = quantities[product.id]
        line_total = Decimal(str(product.selling_price)) * quantity
        db.add(SaleItem(
            sale_id=sale.id, product_id=product.id, product_name=product.name,
            sku=product.sku, quantity=quantity, unit_price=product.selling_price,
            line_total=line_total,
        ))
        product.stock -= quantity
        db.add(StockMovement(
            store_id=user.store_id, product_id=product.id, movement_type="sale",
            quantity=-quantity, balance_after=product.stock, reference_id=sale.bill_number,
            note=f"Customer bill {sale.bill_number}",
        ))
    db.add(Payment(sale_id=sale.id, method=payload.payment_method, amount=sale.total, status="Completed"))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = db.query(Sale).options(joinedload(Sale.items)).filter(
            Sale.store_id == user.store_id, Sale.client_token == payload.client_token
        ).first()
        if existing:
            return sale_dict(existing)
        raise HTTPException(409, "This bill was already submitted")
    db.refresh(sale)
    return sale_dict(sale)


@app.get("/api/sales")
def list_sales(days: int = 30, user: User = Depends(current_user), db: Session = Depends(get_db)):
    days = min(max(days, 1), 365)
    start = day_start() - timedelta(days=days - 1)
    sales = db.query(Sale).options(joinedload(Sale.items)).filter(
        Sale.store_id == user.store_id, Sale.created_at >= start
    ).order_by(Sale.created_at.desc()).limit(500).all()
    paid = [sale for sale in sales if sale.status == "Paid"]
    total = sum(money(sale.total) for sale in paid)
    return {
        "sales": [sale_dict(sale) for sale in sales],
        "summary": {
            "revenue": money(total), "transactions": len(paid),
            "items": sum(sale.item_count for sale in paid),
            "average_bill": money(total / len(paid)) if paid else 0,
        },
    }


@app.get("/api/sales/{sale_id}")
def get_sale(sale_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    sale = db.query(Sale).options(joinedload(Sale.items)).filter(
        Sale.id == sale_id, Sale.store_id == user.store_id
    ).first()
    if not sale:
        raise HTTPException(404, "Transaction not found")
    return sale_dict(sale)


@app.post("/api/sales/{sale_id}/refund")
def refund_sale(sale_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    sale = db.query(Sale).options(joinedload(Sale.items)).filter(
        Sale.id == sale_id, Sale.store_id == user.store_id
    ).first()
    if not sale:
        raise HTTPException(404, "Transaction not found")
    if sale.status == "Refunded":
        raise HTTPException(409, "This bill has already been refunded")
    for item in sale.items:
        product = db.query(Product).filter(Product.id == item.product_id, Product.store_id == user.store_id).with_for_update().first()
        if product:
            product.stock += item.quantity
            db.add(StockMovement(
                store_id=user.store_id, product_id=product.id, movement_type="return",
                quantity=item.quantity, balance_after=product.stock, reference_id=sale.bill_number,
                note=f"Return against {sale.bill_number}",
            ))
    sale.status = "Refunded"
    if sale.payment:
        sale.payment.status = "Refunded"
    db.commit()
    return sale_dict(sale)


@app.post("/api/purchases", status_code=201)
def create_purchase(payload: PurchaseCreate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    allowed_sources = {"Manual Entry", "CSV Import", "Excel Import", "PDF Import", "Supplier Bill"}
    if payload.source not in allowed_sources:
        raise HTTPException(422, "Unsupported stock intake source")
    invoice = payload.invoice_number.strip()
    if invoice:
        duplicate = db.query(Purchase).filter(
            Purchase.store_id == user.store_id,
            func.lower(Purchase.supplier_name) == payload.supplier_name.lower(),
            func.lower(Purchase.invoice_number) == invoice.lower(),
        ).first()
        if duplicate:
            raise HTTPException(409, f"Invoice {invoice} from this supplier was already imported as {duplicate.purchase_number}")
    quantities = defaultdict(int)
    costs = {}
    for item in payload.items:
        quantities[item.product_id] += item.quantity
        costs[item.product_id] = item.unit_cost
    products = db.query(Product).filter(
        Product.store_id == user.store_id, Product.id.in_(quantities.keys())
    ).with_for_update().all()
    if len(products) != len(quantities):
        raise HTTPException(400, "The purchase contains products that do not belong to your catalogue")
    purchase_number = f"PO-{uuid.uuid4().hex[:8].upper()}"
    purchase = Purchase(
        store_id=user.store_id, purchase_number=purchase_number,
        supplier_name=payload.supplier_name.strip(), invoice_number=invoice,
        source=payload.source, original_filename=payload.original_filename,
        notes=payload.notes, total_cost=0,
    )
    db.add(purchase)
    db.flush()
    total_cost = Decimal("0")
    for product in products:
        quantity = quantities[product.id]
        unit_cost = Decimal(str(costs[product.id]))
        line_total = unit_cost * quantity
        total_cost += line_total
        db.add(PurchaseItem(
            purchase_id=purchase.id, product_id=product.id, product_name=product.name,
            quantity=quantity, unit_cost=unit_cost, line_total=line_total,
        ))
        product.stock += quantity
        if unit_cost > 0:
            product.cost_price = unit_cost
        db.add(StockMovement(
            store_id=user.store_id, product_id=product.id, movement_type="purchase",
            quantity=quantity, balance_after=product.stock, reference_id=purchase.purchase_number,
            note=f"{purchase.supplier_name}" + (f" · {invoice}" if invoice else ""),
        ))
    purchase.total_cost = total_cost
    if payload.source in {"CSV Import", "Excel Import", "PDF Import"}:
        db.add(ImportRecord(
            store_id=user.store_id, filename=payload.original_filename or "supplier-stock-file",
            import_type=payload.source, status="Completed", rows_received=len(payload.items),
            rows_imported=len(payload.items), message=f"Saved as {purchase.purchase_number}",
        ))
    db.commit()
    db.refresh(purchase)
    return purchase_dict(purchase)


@app.get("/api/purchases")
def list_purchases(user: User = Depends(current_user), db: Session = Depends(get_db)):
    purchases = db.query(Purchase).options(joinedload(Purchase.items)).filter(
        Purchase.store_id == user.store_id
    ).order_by(Purchase.created_at.desc()).limit(200).all()
    return {"purchases": [purchase_dict(purchase) for purchase in purchases]}


@app.get("/api/inventory")
def inventory(user: User = Depends(current_user), db: Session = Depends(get_db)):
    products = db.query(Product).filter(Product.store_id == user.store_id).order_by(Product.name).all()
    _, stats = sales_stats(db, user.store_id, 30)
    payload = []
    for product in products:
        velocity = stats.get(product.id, {}).get("quantity", 0) / 30
        payload.append({
            **product_dict(product, stats.get(product.id, {}).get("quantity", 0), stats.get(product.id, {}).get("revenue", 0)),
            "daily_velocity": round(velocity, 2),
            "days_left": int(product.stock / velocity) if velocity > 0 else None,
        })
    movements = db.query(StockMovement).join(Product).filter(
        StockMovement.store_id == user.store_id
    ).order_by(StockMovement.created_at.desc()).limit(150).all()
    return {
        "summary": {
            "products": len(products),
            "units": sum(product.stock for product in products),
            "low_stock": sum(1 for product in products if 0 < product.stock <= product.reorder_threshold),
            "out_of_stock": sum(1 for product in products if product.stock <= 0),
            "stock_value": money(sum(Decimal(str(product.cost_price or 0)) * product.stock for product in products)),
        },
        "products": payload,
        "movements": [{
            "id": movement.id, "product_name": movement.product.name,
            "sku": movement.product.sku, "type": movement.movement_type,
            "quantity": movement.quantity, "balance_after": movement.balance_after,
            "reference": movement.reference_id, "note": movement.note,
            "created_at": movement.created_at.isoformat() + "Z",
        } for movement in movements],
    }


@app.post("/api/inventory/adjust")
def adjust_stock(payload: StockAdjustment, user: User = Depends(current_user), db: Session = Depends(get_db)):
    product = get_product(db, user.store_id, payload.product_id)
    signed = payload.quantity if payload.direction == "add" else -payload.quantity
    if product.stock + signed < 0:
        raise HTTPException(409, f"Only {product.stock} units are available; stock cannot become negative")
    product.stock += signed
    movement = StockMovement(
        store_id=user.store_id, product_id=product.id, movement_type="adjustment",
        quantity=signed, balance_after=product.stock, note=payload.reason.strip(),
    )
    db.add(movement)
    db.commit()
    return {"message": "Stock adjustment saved", "product": product_dict(product)}


def normalized_row(row):
    return {re.sub(r"[^a-z0-9]", "", str(key).lower()): value for key, value in row.items() if key is not None}


def validate_purchase_rows(rows, db, store_id):
    products = db.query(Product).filter(Product.store_id == store_id).all()
    by_sku = {product.sku.lower(): product for product in products}
    by_name = {product.name.lower(): product for product in products}
    validated = []
    for index, source in enumerate(rows[:500], start=2):
        row = normalized_row(source)
        sku = str(row.get("productid") or row.get("sku") or row.get("productcode") or "").strip()
        name = str(row.get("productname") or row.get("itemname") or "").strip()
        product = by_sku.get(sku.lower()) if sku else by_name.get(name.lower())
        raw_quantity = row.get("quantity") or row.get("qty") or row.get("receivedquantity")
        raw_cost = row.get("unitcost") or row.get("costprice") or row.get("purchaseprice") or 0
        errors = []
        try:
            quantity = int(float(str(raw_quantity).strip()))
            if quantity <= 0:
                errors.append("Quantity must be greater than zero")
        except (ValueError, TypeError):
            quantity = 0
            errors.append("Quantity is required")
        try:
            unit_cost = float(str(raw_cost).strip() or 0)
            if unit_cost < 0:
                errors.append("Unit cost cannot be negative")
        except (ValueError, TypeError):
            unit_cost = 0
            errors.append("Unit cost is invalid")
        if not product:
            errors.append("Product not found; add it to My Products first")
        validated.append({
            "row": index, "product_id": product.id if product else "",
            "sku": product.sku if product else sku, "product_name": product.name if product else name,
            "quantity": quantity, "unit_cost": unit_cost, "valid": not errors,
            "error": "; ".join(errors),
        })
    return validated


@app.post("/api/imports/purchases/preview")
async def preview_purchase_import(
    file: UploadFile = File(...), user: User = Depends(current_user), db: Session = Depends(get_db),
):
    filename = Path(file.filename or "upload").name
    extension = Path(filename).suffix.lower()
    if extension not in {".csv", ".xlsx", ".pdf"}:
        raise HTTPException(422, "Upload a CSV, XLSX or PDF supplier bill")
    content = await file.read(6 * 1024 * 1024 + 1)
    if len(content) > 6 * 1024 * 1024:
        raise HTTPException(413, "File is too large. Maximum size is 6 MB")
    if not content:
        raise HTTPException(422, "The uploaded file is empty")
    rows = []
    source = {".csv": "CSV Import", ".xlsx": "Excel Import", ".pdf": "PDF Import"}[extension]
    try:
        if extension == ".csv":
            text = content.decode("utf-8-sig")
            rows = list(csv.DictReader(io.StringIO(text)))
        elif extension == ".xlsx":
            workbook = load_workbook(io.BytesIO(content), read_only=True, data_only=True)
            sheet = workbook.active
            values = list(sheet.iter_rows(values_only=True, max_row=502))
            if values:
                headers = [str(value or "").strip() for value in values[0]]
                rows = [dict(zip(headers, row)) for row in values[1:] if any(value is not None for value in row)]
        else:
            reader = PdfReader(io.BytesIO(content))
            text = "\n".join((page.extract_text() or "") for page in reader.pages[:10])
            for line in text.splitlines():
                # Preview deliberately requires confirmation because supplier PDF layouts vary.
                match = re.search(r"([A-Za-z0-9_-]{2,60})\s*[,|\t]\s*(\d+(?:\.\d+)?)\s*[,|\t]\s*(\d+(?:\.\d+)?)", line)
                if match:
                    rows.append({"product_id": match.group(1), "quantity": match.group(2), "unit_cost": match.group(3)})
    except (UnicodeDecodeError, ValueError, KeyError) as error:
        raise HTTPException(422, f"Could not read this file: {error}")
    except Exception:
        raise HTTPException(422, "Could not extract this document. Use the CSV template or enter the supplier bill manually.")
    if not rows:
        raise HTTPException(422, "No stock rows were found. Required columns: product_id, quantity, unit_cost")
    validated = validate_purchase_rows(rows, db, user.store_id)
    return {
        "filename": filename, "source": source, "rows": validated,
        "valid_count": sum(1 for row in validated if row["valid"]),
        "error_count": sum(1 for row in validated if not row["valid"]),
        "requires_confirmation": True,
        "message": "Review every row. Only valid rows will be received into stock after confirmation.",
    }


@app.get("/api/forecast")
def forecast(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return forecast_data(db, user.store)


@app.post("/api/vihzi/query")
def vihzi(payload: AssistantQuery, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return assistant_reply(
        db,
        user.store,
        payload.query,
        payload.language,
        history=payload.history,
        confirm_action=bool(payload.confirm_action),
        action_payload=payload.action_payload,
    )


@app.get("/api/vihzi/status")
def vihzi_status():
    return {
        "sarvam_configured": is_sarvam_configured(),
        "stt_model": DEFAULT_STT_MODEL,
        "tts_model": DEFAULT_TTS_MODEL,
        "languages": ["English", "Tamil", "Tanglish"],
    }


@app.post("/api/vihzi/speech-to-text")
async def vihzi_speech_to_text(
    file: UploadFile = File(...),
    language_code: Optional[str] = None,
    user: User = Depends(current_user),
):
    content = await file.read()
    if not content:
        raise HTTPException(422, "Audio recording is empty")
    return await speech_to_text(
        audio_bytes=content,
        filename=file.filename or "speech.wav",
        content_type=file.content_type or "audio/wav",
        language_code=language_code,
    )


@app.post("/api/vihzi/text-to-speech")
async def vihzi_text_to_speech(
    payload: TextToSpeechRequest,
    user: User = Depends(current_user),
):
    return await text_to_speech(
        text=payload.text,
        language=payload.language,
        speaker=payload.speaker,
        pace=payload.pace,
    )


@app.patch("/api/settings")
def update_settings(payload: SettingsUpdate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    store = user.store
    for key, value in payload.model_dump().items():
        setattr(store, key, value)
    db.commit()
    return {"message": "Settings saved", "store": store_payload(user)}


# Serve the production React build from the same origin. Vite proxies /api in development.
dist = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if dist.exists():
    app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_frontend(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(404, "API endpoint not found")
        requested = (dist / full_path).resolve()
        if full_path and requested.is_file() and dist.resolve() in requested.parents:
            return FileResponse(requested)
        return FileResponse(dist / "index.html")
