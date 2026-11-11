from datetime import datetime, timedelta
from decimal import Decimal
import random
from sqlalchemy.orm import Session
from .models import User, Store, Product, Sale, SaleItem, Payment, StockMovement, Purchase, PurchaseItem
from .security import hash_password

DEMO_EMAIL = "demo@retailiq.in"
DEMO_PASSWORD = "demo1234"


def seed_demo(db: Session):
    if db.query(User).filter(User.email == DEMO_EMAIL).first():
        return
    store = Store(
        name="Lakshmi Provisions",
        address="24, South Mada Street, Mylapore, Chennai 600004",
        contact="+91 98400 24518",
        business_category="Grocery & Daily Needs",
        tax_rate=5,
    )
    db.add(store)
    db.flush()
    user = User(
        store_id=store.id,
        full_name="Lakshmi Narayanan",
        email=DEMO_EMAIL,
        password_hash=hash_password(DEMO_PASSWORD),
    )
    db.add(user)
    catalogue = [
        ("PRD001", "Basmati Rice 1kg", "Grocery", 120, 82, 15, 42),
        ("PRD002", "Milk 500ml", "Dairy", 28, 22, 20, 6),
        ("PRD003", "Whole Wheat Bread", "Bakery", 40, 29, 10, 4),
        ("PRD004", "Sugar 1kg", "Grocery", 48, 41, 12, 8),
        ("PRD005", "Tea Powder 250g", "Beverages", 95, 72, 10, 30),
        ("PRD006", "Salt Biscuits", "Snacks", 20, 14, 25, 0),
        ("PRD007", "Toor Dal 1kg", "Grocery", 135, 108, 10, 25),
        ("PRD008", "Neem Soap Bar", "Home Care", 35, 25, 15, 60),
        ("PRD009", "Cold Pressed Oil 1L", "Grocery", 240, 195, 8, 18),
        ("PRD010", "Farm Eggs 6 pack", "Dairy", 54, 43, 12, 9),
    ]
    products = []
    for sku, name, category, price, cost, reorder, _target in catalogue:
        product = Product(
            store_id=store.id, sku=sku, name=name, category=category,
            selling_price=price, cost_price=cost, stock=1400,
            reorder_threshold=reorder, qr_reference=f"RETAILIQ:{sku}",
        )
        db.add(product)
        db.flush()
        db.add(StockMovement(
            store_id=store.id, product_id=product.id, movement_type="initial",
            quantity=1400, balance_after=1400, note="Demo opening stock",
            created_at=datetime.utcnow() - timedelta(days=46),
        ))
        products.append(product)

    rng = random.Random(42)
    bill_sequence = 1000
    now = datetime.utcnow()
    for days_ago in range(45, -1, -1):
        date = now - timedelta(days=days_ago)
        number_of_bills = rng.randint(3, 6) + (2 if date.weekday() >= 5 else 0)
        for bill_index in range(number_of_bills):
            bill_sequence += 1
            selected = rng.sample(products, rng.randint(1, 4))
            subtotal = Decimal("0")
            item_count = 0
            created_at = date - timedelta(hours=rng.randint(1, 8), minutes=rng.randint(0, 50))
            sale = Sale(
                store_id=store.id, bill_number=f"B-{bill_sequence}",
                client_token=f"demo-seed-{days_ago}-{bill_index}",
                subtotal=0, tax=0, discount=0, total=0, item_count=0,
                payment_method=rng.choice(["Cash", "UPI", "UPI", "Card"]),
                source="Internal QR Billing", created_at=created_at,
            )
            db.add(sale)
            db.flush()
            for product in selected:
                quantity = rng.choices([1, 2, 3, 4], weights=[55, 28, 12, 5])[0]
                line = Decimal(str(product.selling_price)) * quantity
                subtotal += line
                item_count += quantity
                db.add(SaleItem(
                    sale_id=sale.id, product_id=product.id, product_name=product.name,
                    sku=product.sku, quantity=quantity, unit_price=product.selling_price,
                    line_total=line,
                ))
                product.stock -= quantity
                db.add(StockMovement(
                    store_id=store.id, product_id=product.id, movement_type="sale",
                    quantity=-quantity, balance_after=product.stock,
                    reference_id=sale.bill_number, created_at=created_at,
                ))
            tax = (subtotal * Decimal("0.05")).quantize(Decimal("0.01"))
            sale.subtotal = subtotal
            sale.tax = tax
            sale.total = subtotal + tax
            sale.item_count = item_count
            db.add(Payment(sale_id=sale.id, method=sale.payment_method, amount=sale.total))

    purchase = Purchase(
        store_id=store.id, purchase_number="PO-0001", supplier_name="Chennai Wholesale Mart",
        invoice_number="CWM-8842", source="CSV Import", original_filename="october-stock.csv",
        notes="Seeded supplier purchase for the demo shop", created_at=now - timedelta(days=6),
    )
    db.add(purchase)
    db.flush()
    for product, quantity in [(products[0], 80), (products[1], 120), (products[4], 40)]:
        cost = Decimal(str(product.cost_price)) * quantity
        db.add(PurchaseItem(
            purchase_id=purchase.id, product_id=product.id, product_name=product.name,
            quantity=quantity, unit_cost=product.cost_price, line_total=cost,
        ))
        product.stock += quantity
        purchase.total_cost += cost
        db.add(StockMovement(
            store_id=store.id, product_id=product.id, movement_type="purchase",
            quantity=quantity, balance_after=product.stock, reference_id=purchase.purchase_number,
            note="Chennai Wholesale Mart · CWM-8842", created_at=purchase.created_at,
        ))

    # Set a useful current-stock snapshot while retaining a complete movement audit trail.
    for product, catalogue_row in zip(products, catalogue):
        target = catalogue_row[-1]
        difference = target - product.stock
        product.stock = target
        db.add(StockMovement(
            store_id=store.id, product_id=product.id, movement_type="adjustment",
            quantity=difference, balance_after=target, reference_id="DEMO-SNAPSHOT",
            note="Demo current-stock snapshot", created_at=now,
        ))
    db.commit()
