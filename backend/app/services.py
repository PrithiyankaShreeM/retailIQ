from collections import defaultdict
from datetime import datetime, timedelta, time
from decimal import Decimal, ROUND_HALF_UP
from statistics import mean, pstdev
from sqlalchemy import func
from .models import Product, Sale, SaleItem, Purchase, StockMovement


def money(value):
    return float(Decimal(str(value or 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def day_start(value=None):
    value = value or datetime.utcnow()
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
    days = min(max(int(days), 7), 365)
    now = datetime.utcnow()
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

    this_week = sum_period(-7, None)
    previous_week = sum_period(-14, -7) if days >= 14 else 0
    change = ((this_week - previous_week) / previous_week * 100) if previous_week else None
    best = None
    if product_sales:
        best_id = max(product_sales, key=lambda key: product_sales[key]["quantity"])
        best = next((p for p in products if p.id == best_id), None)

    top_products = sorted(
        [p for p in products if p.id in product_sales],
        key=lambda p: product_sales[p.id]["quantity"], reverse=True,
    )
    top_payload = []
    max_sold = product_sales[top_products[0].id]["quantity"] if top_products else 0
    active_days = len({s.created_at.date() for s in sales})
    for product in top_products[:8]:
        stat = product_sales[product.id]
        sold = stat["quantity"]
        performance = "Insufficient history" if active_days < 7 else (
            "Selling well" if sold >= max_sold * 0.55 else "Average" if sold >= max_sold * 0.2 else "Slow moving"
        )
        top_payload.append({**product_dict(product, sold, stat["revenue"]), "performance": performance})

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
    insights = []
    if change is not None:
        insights.append(f"Your sales are {'up' if change >= 0 else 'down'} {abs(change):.1f}% compared with the previous 7 days.")
    elif this_week:
        insights.append("A full previous-week comparison will appear once more sales history is available.")
    if best:
        insights.append(f"{best.name} is your best-selling product in this period, with {product_sales[best.id]['quantity']} units sold.")
    if alerts:
        insights.append(f"{len(alerts)} product{'s need' if len(alerts) != 1 else ' needs'} attention: {', '.join(p['name'] for p in alerts[:3])}.")
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
            "week_change": round(change, 1) if change is not None else None,
        },
        "trend": trend,
        "categories": categories,
        "top_products": top_payload,
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
    # A damped least-squares trend avoids projecting extreme exponential growth.
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


def assistant_reply(db, store, query, language="English"):
    q = query.lower().strip()
    data = dashboard_data(db, store, 30)
    kpis = data["kpis"]
    rupees = lambda value: f"₹{value:,.0f}"
    is_tamil = language == "Tamil" or any(word in q for word in ["enna", "kammiya", "inniku", "indru", "ஸ்டாக்", "இன்று"])

    if any(word in q for word in ["stock", "kammi", "low", "ஸ்டாக்", "invent"]):
        alerts = data["alerts"]
        if not alerts:
            answer = "All products are above their reorder thresholds." if not is_tamil else "எல்லா பொருட்களும் போதுமான இருப்பில் உள்ளன."
        else:
            names = ", ".join(f"{p['name']} ({p['stock']} left)" for p in alerts[:5])
            answer = f"{names} need restocking. These values come from your current stock records."
            if is_tamil:
                answer = f"குறைந்த இருப்பில் உள்ளவை: {names}. உங்கள் தற்போதைய இருப்பு பதிவுகளின்படி தெரிவிக்கிறேன்."
        return {"answer": answer, "intent": "low_stock", "data": {"alerts": alerts}}

    if any(word in q for word in ["best", "most", "top", "athigam", "அதிக"]):
        if not data["top_products"]:
            answer = "There are no completed sales yet, so I cannot name a best seller."
        else:
            top = data["top_products"][0]
            answer = f"{top['name']} is your best-selling product in the last 30 days, with {top['sold_30']} units sold."
            if is_tamil:
                answer = f"கடந்த 30 நாட்களில் அதிகம் விற்ற பொருள் {top['name']}. மொத்தம் {top['sold_30']} யூனிட்கள் விற்றுள்ளன."
        return {"answer": answer, "intent": "best_seller", "data": {"product": data["top_products"][0] if data["top_products"] else None}}

    if any(word in q for word in ["forecast", "next", "predict", "varum", "எதிர்கால"]):
        forecast = forecast_data(db, store)
        if not forecast["sufficient"]:
            answer = forecast["message"]
        else:
            amount = forecast["periods"][0]
            answer = f"The 7-day estimate is {rupees(amount['amount'])}, with an uncertainty range of {rupees(amount['lower'])} to {rupees(amount['upper'])}. Confidence is {forecast['confidence'].lower()}, based on {forecast['active_days']} active sales days."
        return {"answer": answer, "intent": "forecast", "data": {"sufficient": forecast["sufficient"]}}

    if any(word in q for word in ["average", "bill", "transaction"]):
        answer = f"Your average bill is {rupees(kpis['average_bill'])} across the last 30 days. Today has {kpis['today_transactions']} recorded transaction(s)."
        return {"answer": answer, "intent": "transactions", "data": kpis}

    if any(word in q for word in ["today", "earn", "sales", "revenue", "inniku", "indru", "இன்று", "விற்பனை"]):
        answer = f"Your recorded sales today are {rupees(kpis['today_sales'])} from {kpis['today_transactions']} bill(s), covering {kpis['today_items']} item(s)."
        if is_tamil:
            answer = f"இன்றைய விற்பனை {rupees(kpis['today_sales'])}. {kpis['today_transactions']} பில்கள் மூலம் {kpis['today_items']} பொருட்கள் விற்றுள்ளன."
        return {"answer": answer, "intent": "today_sales", "data": kpis}

    answer = "I can answer from your records about today’s sales, best sellers, low stock, average bills and the 7-day forecast. Try ‘Enna stock kammiya irukku?’"
    if is_tamil:
        answer = "இன்றைய விற்பனை, அதிகம் விற்ற பொருள், குறைந்த இருப்பு, சராசரி பில் மற்றும் 7 நாள் மதிப்பீடு பற்றி கேளுங்கள்."
    return {"answer": answer, "intent": "help", "data": None}
