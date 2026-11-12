from collections import defaultdict
from datetime import datetime, timedelta, time, timezone
from decimal import Decimal, ROUND_HALF_UP
import re
from statistics import mean, pstdev
from sqlalchemy import func
from .models import Product, Sale, SaleItem, Purchase, StockMovement, Payment


def money(value):
    return float(Decimal(str(value or 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def day_start(value=None):
    value = value or datetime.now(timezone.utc).replace(tzinfo=None)
    return datetime.combine(value.date(), time.min)


def product_dict(product: Product, sold_30=0, revenue_30=0):
    return {
        "id": product.id,
        "sku": product.sku,
        "name": product.name,
        "category": product.category,
        "description": product.description or "",
        "selling_price": money(product.selling_price),
        "cost_price": money(product.cost_price),
        "stock": product.stock,
        "reorder_threshold": product.reorder_threshold,
        "qr_reference": product.qr_reference,
        "active": product.active,
        "status": "out" if product.stock <= 0 else "low" if product.stock <= product.reorder_threshold else "ok",
        "sold_30": int(sold_30),
        "revenue_30": money(revenue_30),
    }


def sale_dict(sale: Sale, include_items=True):
    data = {
        "id": sale.id,
        "bill_number": sale.bill_number,
        "subtotal": money(sale.subtotal),
        "tax": money(sale.tax),
        "discount": money(sale.discount),
        "total": money(sale.total),
        "item_count": sale.item_count,
        "payment_method": sale.payment_method,
        "status": sale.status,
        "source": sale.source,
        "created_at": sale.created_at.isoformat() + "Z",
    }
    if include_items:
        data["items"] = [{
            "product_id": item.product_id,
            "product_name": item.product_name,
            "sku": item.sku,
            "quantity": item.quantity,
            "unit_price": money(item.unit_price),
            "line_total": money(item.line_total),
        } for item in sale.items]
    return data


def purchase_dict(purchase: Purchase):
    return {
        "id": purchase.id,
        "purchase_number": purchase.purchase_number,
        "supplier_name": purchase.supplier_name,
        "invoice_number": purchase.invoice_number or "",
        "source": purchase.source,
        "original_filename": purchase.original_filename or "",
        "total_cost": money(purchase.total_cost),
        "notes": purchase.notes or "",
        "created_at": purchase.created_at.isoformat() + "Z",
        "items": [{
            "product_id": item.product_id,
            "product_name": item.product_name,
            "quantity": item.quantity,
            "unit_cost": money(item.unit_cost),
            "line_total": money(item.line_total),
        } for item in purchase.items],
    }


def sales_stats(db, store_id, days=30):
    start = day_start() - timedelta(days=days - 1)
    sales = db.query(Sale).filter(
        Sale.store_id == store_id, Sale.created_at >= start, Sale.status == "Paid"
    ).all()
    rows = db.query(
        SaleItem.product_id,
        func.sum(SaleItem.quantity),
        func.sum(SaleItem.line_total),
    ).join(Sale).filter(
        Sale.store_id == store_id, Sale.created_at >= start, Sale.status == "Paid"
    ).group_by(SaleItem.product_id).all()
    product_sales = {row[0]: {"quantity": int(row[1] or 0), "revenue": money(row[2])} for row in rows}
    return sales, product_sales


def dashboard_data(db, store, days=30):
    days = min(max(int(days), 1), 365)
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    today = day_start(now)
    month = today.replace(day=1)
    products = db.query(Product).filter(Product.store_id == store.id, Product.active == True).all()
    sales, product_sales = sales_stats(db, store.id, days)
    today_sales = [s for s in sales if s.created_at >= today]
    monthly_sales = db.query(Sale).filter(
        Sale.store_id == store.id, Sale.created_at >= month, Sale.status == "Paid"
    ).all()

    trend_map = defaultdict(lambda: {"revenue": 0.0, "transactions": 0, "items": 0})
    for sale in sales:
        key = sale.created_at.date().isoformat()
        trend_map[key]["revenue"] += money(sale.total)
        trend_map[key]["transactions"] += 1
        trend_map[key]["items"] += sale.item_count
    trend = []
    for offset in range(days):
        date = (today - timedelta(days=days - 1 - offset)).date()
        values = trend_map[date.isoformat()]
        trend.append({
            "date": date.isoformat(),
            "label": date.strftime("%d %b"),
            "revenue": round(values["revenue"], 2),
            "transactions": values["transactions"],
            "items": values["items"],
        })

    def sum_period(from_day, to_day):
        selected = trend[from_day:to_day]
        return sum(item["revenue"] for item in selected)

    # Growth comparison: current half of period vs previous half of period
    half_days = max(1, days // 2)
    this_week = sum_period(-min(7, days), None)
    previous_week = sum_period(-min(14, days), -min(7, days)) if days >= 14 else 0
    change = ((this_week - previous_week) / previous_week * 100) if previous_week else None

    # Top & least selling products
    active_days = len({s.created_at.date() for s in sales})
    top_products = sorted(
        products,
        key=lambda p: product_sales.get(p.id, {}).get("quantity", 0),
        reverse=True,
    )
    max_sold = product_sales[top_products[0].id]["quantity"] if top_products and top_products[0].id in product_sales else 0

    top_payload = []
    for product in top_products[:8]:
        stat = product_sales.get(product.id, {"quantity": 0, "revenue": 0.0})
        sold = stat["quantity"]
        performance = "Insufficient history" if active_days < 7 else (
            "Selling well" if sold >= max_sold * 0.55 and sold > 0 else "Average" if sold >= max_sold * 0.2 and sold > 0 else "Slow moving"
        )
        top_payload.append({**product_dict(product, sold, stat["revenue"]), "performance": performance})

    # Least selling products
    least_payload = []
    least_sorted = sorted(
        products,
        key=lambda p: (product_sales.get(p.id, {}).get("quantity", 0), product.stock),
    )
    for product in least_sorted[:6]:
        stat = product_sales.get(product.id, {"quantity": 0, "revenue": 0.0})
        sold = stat["quantity"]
        least_payload.append({
            **product_dict(product, sold, stat["revenue"]),
            "performance": "Slow moving" if sold == 0 else "Low volume",
        })

    best = top_products[0] if top_products and top_products[0].id in product_sales and product_sales[top_products[0].id]["quantity"] > 0 else None

    category_map = defaultdict(float)
    for product in products:
        if product.id in product_sales:
            category_map[product.category] += product_sales[product.id]["revenue"]
    categories = [{"name": name, "value": round(value, 2)} for name, value in sorted(
        category_map.items(), key=lambda item: item[1], reverse=True
    )]

    alerts = sorted(
        [product_dict(p, product_sales.get(p.id, {}).get("quantity", 0)) for p in products if p.stock <= p.reorder_threshold],
        key=lambda p: p["stock"],
    )
    out_of_stock = [p for p in products if p.stock <= 0]
    total_stock_value = sum(money(p.cost_price) * max(0, p.stock) for p in products)
    total_stock_units = sum(max(0, p.stock) for p in products)

    insights = []
    if change is not None:
        insights.append(f"Your sales are {'up' if change >= 0 else 'down'} {abs(change):.1f}% compared with the previous 7 days.")
    elif this_week:
        insights.append("A full previous-week comparison will appear once more sales history is available.")
    if best:
        insights.append(f"{best.name} is your best-selling product in this period, with {product_sales[best.id]['quantity']} units sold.")
    if alerts:
        insights.append(f"{len(alerts)} product{'s need' if len(alerts) != 1 else ' needs'} attention: {', '.join(p['name'] for p in alerts[:3])}.")
    if out_of_stock:
        insights.append(f"{len(out_of_stock)} product(s) are completely out of stock.")
    if not insights:
        insights.append("Complete your first bill to unlock insights calculated from your shop records.")

    return {
        "kpis": {
            "today_sales": money(sum(money(s.total) for s in today_sales)),
            "today_items": sum(s.item_count for s in today_sales),
            "today_transactions": len(today_sales),
            "month_revenue": money(sum(money(s.total) for s in monthly_sales)),
            "period_revenue": money(sum(money(s.total) for s in sales)),
            "average_bill": money(sum(money(s.total) for s in sales) / len(sales)) if sales else 0,
            "best_seller": best.name if best else "No sales yet",
            "low_stock_count": len(alerts),
            "out_of_stock_count": len(out_of_stock),
            "total_products": len(products),
            "total_stock_units": total_stock_units,
            "stock_valuation": money(total_stock_value),
            "week_change": round(change, 1) if change is not None else None,
        },
        "trend": trend,
        "categories": categories,
        "top_products": top_payload,
        "least_products": least_payload,
        "alerts": alerts,
        "insights": insights,
        "recent_sales": [sale_dict(s, False) for s in sorted(sales, key=lambda s: s.created_at, reverse=True)[:6]],
    }


def forecast_data(db, store):
    days = 60
    today = day_start()
    start = today - timedelta(days=days - 1)
    sales = db.query(Sale).filter(
        Sale.store_id == store.id, Sale.created_at >= start, Sale.status == "Paid"
    ).all()
    daily = defaultdict(float)
    for sale in sales:
        daily[sale.created_at.date().isoformat()] += money(sale.total)
    series = [daily[(today - timedelta(days=days - 1 - i)).date().isoformat()] for i in range(days)]
    active_days = sum(1 for value in series if value > 0)
    history = [{
        "date": (today - timedelta(days=days - 1 - i)).date().isoformat(),
        "actual": round(value, 2),
    } for i, value in enumerate(series)]

    products = db.query(Product).filter(Product.store_id == store.id, Product.active == True).all()
    item_rows = db.query(SaleItem.product_id, SaleItem.quantity, Sale.created_at).join(Sale).filter(
        Sale.store_id == store.id, Sale.created_at >= start, Sale.status == "Paid"
    ).all()
    product_daily = defaultdict(float)
    recent_qty = defaultdict(float)
    previous_qty = defaultdict(float)
    midpoint = today - timedelta(days=14)
    for product_id, quantity, created_at in item_rows:
        product_daily[product_id] += quantity / days
        if created_at >= midpoint:
            recent_qty[product_id] += quantity
        else:
            previous_qty[product_id] += quantity

    restocking = []
    demand = []
    for product in products:
        velocity = product_daily[product.id]
        days_left = int(product.stock / velocity) if velocity > 0 else None
        suggested = max(0, int((velocity * 10 + product.reorder_threshold) - product.stock + 0.999))
        if (days_left is not None and days_left <= 10) or product.stock <= product.reorder_threshold:
            restocking.append({
                "product_id": product.id, "name": product.name, "stock": product.stock,
                "daily_velocity": round(velocity, 2), "days_left": days_left,
                "suggested_quantity": suggested,
            })
        recent = recent_qty[product.id]
        previous = previous_qty[product.id]
        direction = "stable"
        change = None
        if previous > 0:
            change = round((recent - previous) / previous * 100, 1)
            direction = "rising" if change >= 15 else "declining" if change <= -15 else "stable"
        elif recent > 0:
            direction = "rising"
        demand.append({
            "product_id": product.id, "name": product.name, "direction": direction,
            "change": change, "recent_units": int(recent), "previous_units": int(previous),
            "expected_daily_units": round(velocity, 2),
        })

    if active_days < 7:
        return {
            "sufficient": False,
            "active_days": active_days,
            "required_days": 7,
            "message": f"Vihzi needs at least 7 days with recorded sales. Your shop currently has {active_days}. Keep billing—no forecast has been invented.",
            "history": history,
            "forecast": [], "periods": [],
            "restocking": sorted(restocking, key=lambda item: item["days_left"] if item["days_left"] is not None else 999),
            "demand": sorted(demand, key=lambda item: item["recent_units"], reverse=True),
        }

    recent_window = series[-min(28, days):]
    baseline = mean(recent_window)
    count = len(recent_window)
    x_mean = (count - 1) / 2
    y_mean = baseline
    denominator = sum((i - x_mean) ** 2 for i in range(count)) or 1
    slope = sum((i - x_mean) * (value - y_mean) for i, value in enumerate(recent_window)) / denominator
    slope = max(-baseline * 0.025, min(baseline * 0.025, slope)) if baseline else 0
    residuals = [recent_window[i] - (baseline + slope * (i - x_mean)) for i in range(count)]
    uncertainty = pstdev(residuals) if len(residuals) > 1 else baseline * 0.25
    forecast = []
    for i in range(1, 31):
        value = max(0, baseline + slope * (count - 1 - x_mean + i * 0.65))
        margin = uncertainty * (1 + i / 45)
        forecast.append({
            "date": (today + timedelta(days=i)).date().isoformat(),
            "predicted": round(value, 2),
            "lower": round(max(0, value - margin), 2),
            "upper": round(value + margin, 2),
        })
    periods = []
    for number in (7, 15, 30):
        selected = forecast[:number]
        periods.append({
            "days": number,
            "amount": round(sum(item["predicted"] for item in selected), 2),
            "lower": round(sum(item["lower"] for item in selected), 2),
            "upper": round(sum(item["upper"] for item in selected), 2),
        })
    busiest = "Not enough variation"
    weekday_totals = defaultdict(list)
    for i, value in enumerate(series):
        if value:
            weekday = (today - timedelta(days=days - 1 - i)).strftime("%A")
            weekday_totals[weekday].append(value)
    if weekday_totals:
        busiest = max(weekday_totals, key=lambda day: mean(weekday_totals[day]))
    return {
        "sufficient": True,
        "active_days": active_days,
        "required_days": 7,
        "confidence": "Medium" if active_days >= 21 else "Low",
        "method": "Damped 28-day revenue trend with residual-based uncertainty",
        "history": history[-30:],
        "forecast": forecast,
        "periods": periods,
        "restocking": sorted(restocking, key=lambda item: item["days_left"] if item["days_left"] is not None else 999),
        "demand": sorted(demand, key=lambda item: item["recent_units"], reverse=True),
        "busiest_day": busiest,
        "limitations": "Estimates use recorded revenue only. Festivals, weather, promotions, supplier delays and future price changes are not included.",
    }


def detect_language(text: str, user_preference: str = "English") -> str:
    """Detect whether query is English, Tamil script, or Tanglish (code-mixed Latin script)."""
    clean = (text or "").strip()
    if not clean:
        return user_preference or "English"

    # Check for Tamil Unicode range (\u0B80-\u0BFF)
    if any("\u0b80" <= char <= "\u0bff" for char in clean):
        return "Tamil"

    # Common Tamil/Tanglish retail phonetics and conversational words in Latin script
    tanglish_words = {
        "enna", "kammiya", "kammi", "evlo", "evvalavu", "evalo", "irukku", "iruku", "irukka",
        "vithathu", "vikkithu", "vithuchu", "inniku", "innikku", "indru", "nethu", "netru",
        "naalaiku", "ippo", "kudunga", "kudu", "solla", "sollu", "panrathu", "vilai", "kasu",
        "panam", "porul", "porutkal", "saridhana", "seri", "aama", "aamam", "illa", "vendam",
        "romba", "mudiyuma", "kadai", "kadaisi", "pathu", "paaru", "theva", "ethana", "ethu",
        "yaar", "enga", "epdi", "yen", "laabam", "athigam", "adhigam", "adhigham", "konjam",
        "seriya", "pannu", "podu", "kuraiva", "kurainja", "evalavu",
    }
    tokens = set(re.findall(r"[a-zA-Z]+", clean.lower()))
    matches = tokens.intersection(tanglish_words)

    if len(matches) >= 1:
        return "Tanglish"

    # If user explicitly preferred Tamil or Tanglish and query has ambiguous words, retain it
    if user_preference in ("Tamil", "Tanglish") and len(tokens) <= 3:
        return user_preference

    return "English"


def format_currency(value) -> str:
    return f"₹{value:,.0f}" if value == int(value) else f"₹{value:,.2f}"


def assistant_reply(
    db,
    store,
    query: str,
    language: str = "English",
    history: list = None,
    confirm_action: bool = False,
    action_payload: dict = None,
):
    """Grounded, multilingual Vizhi conversational retail assistant.

    Supports:
        - English, Tamil, Tanglish (code-mixed Tamil)
        - Dynamic language detection matching user communication style
        - Conversational context and follow-ups
        - Grounded queries for sales, stock, products, movements, and billing
        - Safe action execution requiring explicit user confirmation
    """
    raw_query = (query or "").strip()
    detected_lang = detect_language(raw_query, language)
    is_tamil = detected_lang == "Tamil"
    is_tanglish = detected_lang == "Tanglish"
    q = raw_query.lower()

    # 1. Action confirmation handling (e.g. user confirmed stock adjustment)
    confirmation_words = ["yes", "confirm", "aama", "aamam", "seri", "ok", "proceed", "do it", "pannunga", "kudunga"]
    is_confirming = confirm_action or any(w in q for w in confirmation_words)

    if is_confirming and action_payload and action_payload.get("type") == "stock_adjustment":
        product_id = action_payload.get("product_id")
        quantity = int(action_payload.get("quantity", 0))
        direction = action_payload.get("direction", "add")
        reason = action_payload.get("reason", "Vizhi voice assistant verified adjustment")

        product = db.query(Product).filter(Product.id == product_id, Product.store_id == store.id).first()
        if not product:
            msg = "Product was not found in your shop records."
            if is_tamil:
                msg = "பொருள் உங்கள் கடை பதிவுகளில் கிடைக்கவில்லை."
            elif is_tanglish:
                msg = "Indha product unga shop records-la illa."
            return {"answer": msg, "intent": "action_error", "language": detected_lang}

        signed = quantity if direction == "add" else -quantity
        if product.stock + signed < 0:
            msg = f"Cannot reduce stock below zero. Only {product.stock} units currently available."
            if is_tamil:
                msg = f"இருப்பு பூஜ்ஜியத்திற்கு கீழே குறைய முடியாது. இப்போது {product.stock} யூனிட்கள் மட்டுமே உள்ளன."
            elif is_tanglish:
                msg = f"Stock zero ku keela poga mudiyadhu. Ippo {product.stock} units thaan irukku."
            return {"answer": msg, "intent": "action_error", "language": detected_lang}

        product.stock += signed
        movement = StockMovement(
            store_id=store.id,
            product_id=product.id,
            movement_type="adjustment",
            quantity=signed,
            balance_after=product.stock,
            note=reason,
        )
        db.add(movement)
        db.commit()

        if is_tamil:
            answer = f"சரி! {product.name} பொருளுக்கு {quantity} யூனிட்கள் {'சேர்க்கப்பட்டது' if direction == 'add' else 'குறைக்கப்பட்டது'}. புதிய இருப்பு: {product.stock} யூனிட்கள்."
        elif is_tanglish:
            answer = f"Done! {product.name} ku {quantity} units {'add panniyachu' if direction == 'add' else 'kuraichachu'}. Ippo total stock: {product.stock} units."
        else:
            answer = f"Confirmed! Successfully {'added' if direction == 'add' else 'removed'} {quantity} units for {product.name}. Updated stock balance is {product.stock} units."

        return {
            "answer": answer,
            "intent": "action_executed",
            "language": detected_lang,
            "data": {"product_id": product.id, "new_stock": product.stock},
        }

    # 2. Check for action proposal in user input (e.g., "Add 10 units to Basmati Rice" or "Restock PRD001")
    adjust_match = re.search(r"(?:add|increase|restock|podu|ethu|serka)\s+(\d+)\s+(?:units?\s+)?(?:of|to|ku)?\s+(.+)", q)
    if adjust_match:
        qty_str, prod_term = adjust_match.groups()
        prod_term = prod_term.strip().rstrip("?.!")
        product = db.query(Product).filter(
            Product.store_id == store.id,
            Product.active == True,
            (func.lower(Product.name).contains(prod_term.lower())) | (func.lower(Product.sku) == prod_term.lower())
        ).first()

        if product:
            qty = int(qty_str)
            action_data = {
                "type": "stock_adjustment",
                "product_id": product.id,
                "product_name": product.name,
                "quantity": qty,
                "direction": "add",
                "reason": "Vizhi voice assistant request",
            }
            new_stock = product.stock + qty
            if is_tamil:
                prompt_text = f"{product.name} பொருளுக்கு {qty} யூனிட்கள் சேர்க்கட்டுமா? (தற்போதைய இருப்பு: {product.stock} ➔ புதிய இருப்பு: {new_stock}). தயவுசெய்து உறுதிப்படுத்தவும்."
            elif is_tanglish:
                prompt_text = f"{product.name} ku {qty} units add panna venduma? (Current stock: {product.stock} ➔ New: {new_stock}). Please confirm panreengala?"
            else:
                prompt_text = f"Would you like me to add {qty} units to {product.name}? (Current stock: {product.stock} ➔ New balance: {new_stock}). Please confirm to proceed."

            return {
                "answer": prompt_text,
                "intent": "confirm_stock_adjustment",
                "language": detected_lang,
                "requires_confirmation": True,
                "action_payload": action_data,
            }

    # Fetch live store data
    dashboard = dashboard_data(db, store, 30)
    kpis = dashboard["kpis"]
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    today_start = day_start(now)

    # 3. Specific product lookup by name or SKU
    # Check if user query references a specific product from catalogue
    products = db.query(Product).filter(Product.store_id == store.id, Product.active == True).all()
    target_product = None
    for p in products:
        p_name_lower = p.name.lower()
        p_sku_lower = p.sku.lower()
        if (p_sku_lower in q) or (len(p_name_lower) >= 3 and p_name_lower in q):
            target_product = p
            break
        # Match significant words (e.g., "basmati", "neem", "bread", "milk", "tea")
        name_tokens = [tok for tok in re.findall(r"[a-z0-9]+", p_name_lower) if len(tok) >= 4]
        if any(tok in q for tok in name_tokens):
            target_product = p
            break

    if target_product and any(w in q for w in ["stock", "price", "rate", "cost", "left", "irukku", "vilai", "evlo", "units"]):
        stock_val = target_product.stock
        status_text = "in stock" if stock_val > target_product.reorder_threshold else "low stock" if stock_val > 0 else "out of stock"
        sp = format_currency(target_product.selling_price)
        cp = format_currency(target_product.cost_price)

        if is_tamil:
            answer = f"{target_product.name} ({target_product.sku}): தற்போதைய இருப்பு {stock_val} யூனிட்கள் ({status_text}). விற்பனை விலை {sp}, கொள்முதல் விலை {cp}."
        elif is_tanglish:
            answer = f"{target_product.name} ({target_product.sku}) stock {stock_val} units irukku ({status_text}). Selling price {sp}, cost price {cp}."
        else:
            answer = f"{target_product.name} ({target_product.sku}) has {stock_val} unit(s) available ({status_text}). Selling price is {sp} (cost price: {cp})."

        return {
            "answer": answer,
            "intent": "product_stock",
            "language": detected_lang,
            "data": product_dict(target_product),
        }

    # 4. Low stock / Out of stock inquiry
    if any(word in q for word in ["low stock", "kammi", "shortage", "reorder", "theva", "out of stock", "ஸ்டாக்", "இருப்பு", "mudinj"]):
        alerts = dashboard["alerts"]
        if not alerts:
            if is_tamil:
                answer = "அனைத்து பொருட்களும் போதுமான இருப்பில் உள்ளன. மறுஆர்டர் தேவைப்படும் பொருட்கள் எதுவும் இல்லை."
            elif is_tanglish:
                answer = "All products-um safe stock level-la irukku. Reorder panra alavukku shortage edhuvum illa."
            else:
                answer = "All products are comfortably above their reorder thresholds. No immediate restocking is needed."
        else:
            names = ", ".join(f"{p['name']} ({p['stock']} left)" for p in alerts[:5])
            if is_tamil:
                answer = f"குறைந்த இருப்பில் உள்ள பொருட்கள்: {names}. மறுஆர்டர் வரம்பிற்கு கீழே உள்ளதால் உடனடி கொள்முதல் பரிந்துரைக்கப்படுகிறது."
            elif is_tanglish:
                answer = f"Indha items stock kammiya irukku: {names}. Supplier kitta reorder panna nalladhu."
            else:
                answer = f"Attention needed for {len(alerts)} item(s): {names}. These have reached or fallen below your reorder levels."
        return {"answer": answer, "intent": "low_stock", "language": detected_lang, "data": {"alerts": alerts}}

    # 5. Best-selling / Top products
    if any(word in q for word in ["best", "most sold", "top product", "highest", "athigam", "adhigam", "அதிக", "முதலிடம்"]):
        top = dashboard["top_products"]
        if not top or top[0].get("sold_30", 0) == 0:
            if is_tamil:
                answer = "கடந்த 30 நாட்களில் இன்னும் விற்பனை பதிவாகவில்லை. விற்பனை தொடங்கியதும் அதிகம் விற்ற பொருள் இங்கே காட்டப்படும்."
            elif is_tanglish:
                answer = "Innum sales record aagala, so best seller-a solla mudiyadhu. Bills generate pannadhukku appuram update aagum."
            else:
                answer = "No sales have been recorded in the past 30 days yet, so I cannot identify a best-selling product."
            return {"answer": answer, "intent": "best_seller", "language": detected_lang, "data": None}

        leader = top[0]
        units = leader["sold_30"]
        rev = format_currency(leader["revenue_30"])
        if is_tamil:
            answer = f"உங்கள் கடையின் அதிகம் விற்ற பொருள் {leader['name']} ({leader['sku']}). கடந்த 30 நாட்களில் {units} யூனிட்கள் விற்று {rev} வருவாய் ஈட்டியுள்ளது."
        elif is_tanglish:
            answer = f"Unga kadaila top-selling product {leader['name']}! Last 30 days-la {units} units sell aagi {rev} revenue vandhurukku."
        else:
            answer = f"{leader['name']} ({leader['sku']}) is your top performer with {units} units sold, generating {rev} in revenue over the last 30 days."
        return {"answer": answer, "intent": "best_seller", "language": detected_lang, "data": {"product": leader}}

    # 6. Slow-moving / Least-selling products
    if any(word in q for word in ["slow", "least", "worst", "moving slow", "stagnant", "kurainja", "vikkala", "sariyilla"]):
        least = dashboard.get("least_products", [])
        if not least:
            answer = "All products have active movement in your catalogue."
        else:
            sample = ", ".join(f"{p['name']} ({p['stock']} in stock, {p.get('sold_30', 0)} sold)" for p in least[:4])
            if is_tamil:
                answer = f"குறைந்த விற்பனை கொண்ட பொருட்கள்: {sample}. இவற்றின் இருப்பை கவனியுங்கள்."
            elif is_tanglish:
                answer = f"Indha items romba slow-moving-a irukku: {sample}. Promotion panna consider pannunga."
            else:
                answer = f"Slow-moving products in your catalogue include: {sample}. You may want to run a promotion to clear stagnant stock."
        return {"answer": answer, "intent": "slow_moving", "language": detected_lang, "data": {"least_products": least}}

    # 7. Yesterday's sales
    if any(word in q for word in ["yesterday", "nethu", "netru", "நேற்று"]):
        yesterday_start = today_start - timedelta(days=1)
        yesterday_sales = db.query(Sale).filter(
            Sale.store_id == store.id,
            Sale.created_at >= yesterday_start,
            Sale.created_at < today_start,
            Sale.status == "Paid",
        ).all()
        y_rev = format_currency(sum(money(s.total) for s in yesterday_sales))
        y_count = len(yesterday_sales)
        y_items = sum(s.item_count for s in yesterday_sales)

        if is_tamil:
            answer = f"நேற்றைய விற்பனை: {y_rev}. மொத்தம் {y_count} பில்கள் மூலம் {y_items} பொருட்கள் விற்றுள்ளன."
        elif is_tanglish:
            answer = f"Nethu unga kadaila {y_rev} sales aagiyirukku, {y_count} bills and {y_items} items total."
        else:
            answer = f"Yesterday's recorded sales were {y_rev} across {y_count} bill(s), accounting for {y_items} items."
        return {"answer": answer, "intent": "yesterday_sales", "language": detected_lang, "data": {"revenue": y_rev, "bills": y_count}}

    # 8. Weekly / Monthly / Total sales
    if any(word in q for word in ["this month", "month revenue", "indha maasam", "மாதம்", "திங்கள்"]):
        m_rev = format_currency(kpis["month_revenue"])
        if is_tamil:
            answer = f"நடப்பு மாதத்தின் மொத்த விற்பனை வருவாய்: {m_rev}."
        elif is_tanglish:
            answer = f"Indha month total revenue {m_rev} aagiyirukku."
        else:
            answer = f"Total revenue for the current calendar month is {m_rev}."
        return {"answer": answer, "intent": "monthly_sales", "language": detected_lang, "data": {"month_revenue": m_rev}}

    if any(word in q for word in ["this week", "weekly", "varam", "வாரம்", "last 7 days"]):
        start_7d = today_start - timedelta(days=6)
        sales_7d = db.query(Sale).filter(
            Sale.store_id == store.id,
            Sale.created_at >= start_7d,
            Sale.status == "Paid",
        ).all()
        w_rev = format_currency(sum(money(s.total) for s in sales_7d))
        w_bills = len(sales_7d)
        w_change = f" ({'+' if kpis.get('week_change', 0) >= 0 else ''}{kpis.get('week_change')}%)" if kpis.get("week_change") is not None else ""

        if is_tamil:
            answer = f"கடந்த 7 நாட்களின் விற்பனை: {w_rev} ({w_bills} பில்கள்){w_change}."
        elif is_tanglish:
            answer = f"Last 7 days sales {w_rev} from {w_bills} bills{w_change}."
        else:
            answer = f"Past 7 days revenue is {w_rev} from {w_bills} transaction(s){w_change}."
        return {"answer": answer, "intent": "weekly_sales", "language": detected_lang, "data": {"revenue": w_rev, "bills": w_bills}}

    # 9. Today's sales & revenue
    if any(word in q for word in ["today", "inniku", "innikku", "indru", "இன்று", "earn", "revenue", "sales", "வியாபாரம்"]):
        t_rev = format_currency(kpis["today_sales"])
        t_bills = kpis["today_transactions"]
        t_items = kpis["today_items"]
        avg_b = format_currency(kpis["average_bill"])

        if is_tamil:
            answer = f"இன்றைய விற்பனை {t_rev}. {t_bills} பில்கள் மூலம் {t_items} பொருட்கள் விற்றுள்ளன (சராசரி பில்: {avg_b})."
        elif is_tanglish:
            answer = f"Innikku sales {t_rev} vandhurukku, {t_bills} bills and {t_items} items billed so far. Average bill: {avg_b}."
        else:
            answer = f"Today's recorded sales are {t_rev} from {t_bills} bill(s), covering {t_items} item(s). Average bill value is {avg_b}."
        return {"answer": answer, "intent": "today_sales", "language": detected_lang, "data": kpis}

    # 10. Billing history and search
    bill_match = re.search(r"b-\d{8}-[a-z0-9]+|b-\d+", q)
    if bill_match or any(w in q for w in ["recent bills", "billing history", "kadaisi bill", "bill search", "பில்"]):
        if bill_match:
            b_num = bill_match.group(0).upper()
            found_sale = db.query(Sale).filter(Sale.store_id == store.id, func.upper(Sale.bill_number).contains(b_num)).first()
            if found_sale:
                dt_str = found_sale.created_at.strftime("%d %b %Y, %I:%M %p")
                tot = format_currency(found_sale.total)
                if is_tamil:
                    answer = f"பில் எண் {found_sale.bill_number}: மொத்தம் {tot}, செலுத்தும் முறை {found_sale.payment_method}, நிலை {found_sale.status} ({dt_str})."
                elif is_tanglish:
                    answer = f"Bill {found_sale.bill_number}: Total {tot}, Payment: {found_sale.payment_method}, Status: {found_sale.status} on {dt_str}."
                else:
                    answer = f"Bill {found_sale.bill_number}: Total {tot} paid via {found_sale.payment_method} on {dt_str} (Status: {found_sale.status})."
                return {"answer": answer, "intent": "bill_details", "language": detected_lang, "data": sale_dict(found_sale)}

        recent = dashboard["recent_sales"]
        if recent:
            sample = ", ".join(f"{s['bill_number']} ({format_currency(s['total'])})" for s in recent[:3])
            if is_tamil:
                answer = f"சமீபத்திய பில்கள்: {sample}. விவரங்களை Sales திரையில் முழுமையாகப் பார்க்கலாம்."
            elif is_tanglish:
                answer = f"Recent bills: {sample}. Full list Sales page-la irukku."
            else:
                answer = f"Recent transactions include: {sample}. You can reprint receipts or issue refunds from the Sales module."
        else:
            answer = "No bills have been completed yet."
        return {"answer": answer, "intent": "billing_history", "language": detected_lang, "data": {"recent": recent}}

    # 11. Inventory valuation & total stock
    if any(word in q for word in ["stock value", "valuation", "total stock", "mottha stock", "மதிப்பு", "மொத்த இருப்பு"]):
        units = dashboard["kpis"]["total_stock_units"]
        val = format_currency(dashboard["kpis"]["stock_valuation"])
        prod_count = dashboard["kpis"]["total_products"]
        if is_tamil:
            answer = f"உங்கள் கடையில் {prod_count} தயாரிப்புகளில் மொத்தம் {units} யூனிட்கள் இருப்பில் உள்ளன. அவற்றின் கொள்முதல் மதிப்பு {val}."
        elif is_tanglish:
            answer = f"Unga kadaila total {prod_count} products-la {units} units stock irukku. Overall inventory valuation {val}."
        else:
            answer = f"You have {units} total units across {prod_count} products in stock, with an inventory cost valuation of {val}."
        return {"answer": answer, "intent": "inventory_valuation", "language": detected_lang, "data": {"units": units, "valuation": val}}

    # 12. Forecast / Future predictions
    if any(word in q for word in ["forecast", "next week", "predict", "varum", "adutha", "எதிர்கால", "மதிப்பீடு"]):
        forecast = forecast_data(db, store)
        if not forecast["sufficient"]:
            answer = forecast["message"]
        else:
            period = forecast["periods"][0]
            amt = format_currency(period["amount"])
            low = format_currency(period["lower"])
            high = format_currency(period["upper"])
            if is_tamil:
                answer = f"அடுத்த 7 நாட்களுக்கான வருவாய் மதிப்பீடு {amt} (வரம்பு: {low} முதல் {high} வரை). நம்பகத்தன்மை: {forecast['confidence']}."
            elif is_tanglish:
                answer = f"Next 7 days forecast {amt} (Range: {low} to {high}). Based on {forecast['active_days']} active sales days."
            else:
                answer = f"The 7-day revenue estimate is {amt} (range: {low} to {high}) with {forecast['confidence'].lower()} confidence, based on {forecast['active_days']} active sales days."
        return {"answer": answer, "intent": "forecast", "language": detected_lang, "data": forecast}

    # 13. Default conversational guide
    if is_tamil:
        answer = "வணக்கம்! இன்றைய விற்பனை, அதிகம் விற்ற பொருட்கள், குறைந்த இருப்பு, சரக்கு மதிப்பு அல்லது 7 நாள் மதிப்பீடு பற்றி கேளுங்கள். (எ.கா: 'இன்றைய விற்பனை என்ன?', 'பாஸ்மதி அரிசி இருப்பு எவ்வளவு?')"
    elif is_tanglish:
        answer = "Vanakkam! Innikku sales, top-selling items, kammiya irukra stock, or specific product pathi kelunga. (Eg: 'Innikku sales evlo?', 'Enna stock kammiya irukku?')"
    else:
        answer = "Hello! I can answer from your shop records about today's sales, best sellers, low stock alerts, product inventory, or revenue forecasts. Try asking: 'How much did I earn today?' or 'How much Basmati Rice is left?'"

    return {"answer": answer, "intent": "help", "language": detected_lang, "data": None}
