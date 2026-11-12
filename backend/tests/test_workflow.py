import io
import os
import uuid
from pathlib import Path

os.environ["DATABASE_URL"] = "sqlite:///./test_retailiq.db"
os.environ["SEED_DEMO"] = "false"
Path("test_retailiq.db").unlink(missing_ok=True)

from fastapi.testclient import TestClient
from app.main import app
from app.database import SessionLocal
from app.seed import DEMO_EMAIL, DEMO_PASSWORD, seed_demo


def register(client, prefix="owner"):
    email = f"{prefix}-{uuid.uuid4().hex[:10]}@example.com"
    response = client.post("/api/auth/register", json={
        "full_name": "Test Owner", "email": email, "password": "testing123",
        "shop_name": f"Test Shop {prefix}", "shop_address": "Chennai",
        "contact": "1234567890", "business_category": "Grocery",
    })
    assert response.status_code == 201, response.text
    body = response.json()
    return {"Authorization": f"Bearer {body['token']}"}


def test_complete_retail_workflow_and_store_isolation():
    with TestClient(app) as client:
        headers = register(client)
        other_shop = register(client, "other")
        empty = client.get("/api/dashboard", headers=headers).json()
        assert empty["kpis"]["today_sales"] == 0

        created = client.post("/api/products", headers=headers, json={
            "name": "Test Rice", "sku": "TEST001", "category": "Grocery",
            "selling_price": 100, "cost_price": 70, "initial_stock": 5,
            "reorder_threshold": 3,
        })
        assert created.status_code == 201, created.text
        product = created.json()
        assert client.get("/api/products/scan?reference=RETAILIQ:TEST001", headers=headers).status_code == 200
        assert client.get("/api/products/scan?reference=UNKNOWN", headers=headers).status_code == 404

        csv_file = ("supplier.csv", io.BytesIO(b"product_id,product_name,quantity,unit_cost\nTEST001,Test Rice,7,72\n"), "text/csv")
        preview = client.post("/api/imports/purchases/preview", headers=headers, files={"file": csv_file})
        assert preview.status_code == 200, preview.text
        assert preview.json()["valid_count"] == 1

        purchase_payload = {
            "supplier_name": "Test Supplier", "invoice_number": "INV-001",
            "source": "CSV Import", "original_filename": "supplier.csv",
            "items": [{"product_id": product["id"], "quantity": 7, "unit_cost": 72}],
        }
        purchase = client.post("/api/purchases", headers=headers, json=purchase_payload)
        assert purchase.status_code == 201, purchase.text
        assert client.post("/api/purchases", headers=headers, json=purchase_payload).status_code == 409
        assert client.get("/api/inventory", headers=headers).json()["products"][0]["stock"] == 12

        sale_payload = {
            "client_token": uuid.uuid4().hex,
            "items": [{"product_id": product["id"], "quantity": 2}],
            "payment_method": "UPI", "discount": 10,
        }
        sale = client.post("/api/sales", headers=headers, json=sale_payload)
        assert sale.status_code == 201, sale.text
        repeated = client.post("/api/sales", headers=headers, json=sale_payload)
        assert repeated.json()["bill_number"] == sale.json()["bill_number"]
        assert client.get("/api/inventory", headers=headers).json()["products"][0]["stock"] == 10

        refund = client.post(f"/api/sales/{sale.json()['id']}/refund", headers=headers, json={})
        assert refund.status_code == 200
        assert client.get("/api/inventory", headers=headers).json()["products"][0]["stock"] == 12

        forecast = client.get("/api/forecast", headers=headers).json()
        assert forecast["sufficient"] is False
        assert "no forecast has been invented" in forecast["message"]
        reply = client.post("/api/vihzi/query", headers=headers, json={"query": "How much did I earn today?", "language": "English"})
        assert reply.status_code == 200
        assert "₹0" in reply.json()["answer"]

        # Another authenticated shop cannot mutate this shop's product.
        forbidden = client.patch(f"/api/products/{product['id']}", headers=other_shop, json={"name": "Not allowed"})
        assert forbidden.status_code == 404


def test_legacy_demo_password_is_migrated():
    with TestClient(app) as client:
        response = client.post("/api/auth/register", json={
            "full_name": "Demo Owner", "email": DEMO_EMAIL, "password": "demo1234",
            "shop_name": "Legacy Demo", "shop_address": "", "contact": "",
            "business_category": "Grocery",
        })
        assert response.status_code == 201
        db = SessionLocal()
        try:
            seed_demo(db)
        finally:
            db.close()
        assert client.post("/api/auth/login", json={"email": DEMO_EMAIL, "password": "demo1234"}).status_code == 401
        login = client.post("/api/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD})
        assert login.status_code == 200
        assert "retailiq_session" in login.cookies
        # No Authorization header: the browser cookie must preserve the session.
        assert client.get("/api/dashboard").status_code == 200
        # A stale proxy/extension Authorization header must not veto the fresh runtime token.
        client.cookies.clear()
        runtime_headers = {"X-RetailIQ-Token": login.json()["token"], "Authorization": "Bearer stale.invalid.token"}
        assert client.get("/api/dashboard", headers=runtime_headers).status_code == 200
        os.environ["SEED_DEMO"] = "true"
        assert client.post("/api/auth/demo").status_code == 200
        assert client.get("/api/auth/me").status_code == 200
        assert client.post("/api/auth/logout").status_code == 200
        assert client.get("/api/auth/me").status_code == 401
        os.environ["SEED_DEMO"] = "false"


def test_multilingual_vizhi_intelligence_and_pos_extensions():
    with TestClient(app) as client:
        headers = register(client, "vizhi")
        # 1. Register a product
        created = client.post("/api/products", headers=headers, json={
            "name": "Ponni Rice 5kg", "sku": "PONNI001", "category": "Grocery",
            "selling_price": 320, "cost_price": 260, "initial_stock": 25,
            "reorder_threshold": 10,
        })
        assert created.status_code == 201
        product = created.json()

        # 2. Test scanning by raw SKU, QR reference, and case-insensitive
        assert client.get("/api/products/scan?reference=PONNI001", headers=headers).status_code == 200
        assert client.get("/api/products/scan?reference=ponni001", headers=headers).status_code == 200
        assert client.get("/api/products/scan?reference=RETAILIQ:PONNI001", headers=headers).status_code == 200

        # 3. Test Sarvam status endpoint
        status_res = client.get("/api/vihzi/status")
        assert status_res.status_code == 200
        assert "sarvam_configured" in status_res.json()
        assert "languages" in status_res.json()

        # 4. Test English queries
        q_en = client.post("/api/vihzi/query", headers=headers, json={"query": "How much did I earn today?"})
        assert q_en.status_code == 200
        assert "₹0" in q_en.json()["answer"]
        assert q_en.json()["language"] == "English"

        # 5. Test specific product stock query
        q_prod = client.post("/api/vihzi/query", headers=headers, json={"query": "What is the stock for Ponni Rice?"})
        assert q_prod.status_code == 200
        assert "25 unit" in q_prod.json()["answer"]
        assert q_prod.json()["intent"] == "product_stock"

        # 6. Test Tamil query
        q_ta = client.post("/api/vihzi/query", headers=headers, json={"query": "இன்றைய விற்பனை என்ன?"})
        assert q_ta.status_code == 200
        assert q_ta.json()["language"] == "Tamil"
        assert "விற்பனை" in q_ta.json()["answer"]

        # 7. Test Tanglish query
        q_tanglish = client.post("/api/vihzi/query", headers=headers, json={"query": "Innikku sales evlo aachu?"})
        assert q_tanglish.status_code == 200
        assert q_tanglish.json()["language"] == "Tanglish"
        assert "sales" in q_tanglish.json()["answer"].lower()

        # 8. Test Tanglish stock query
        q_tanglish_stock = client.post("/api/vihzi/query", headers=headers, json={"query": "Enna stock kammiya irukku?"})
        assert q_tanglish_stock.status_code == 200
        assert q_tanglish_stock.json()["language"] == "Tanglish"

        # 9. Test Action Proposal & Confirmation workflow
        # User proposes stock addition:
        proposal = client.post("/api/vihzi/query", headers=headers, json={"query": "Add 5 units to Ponni Rice"})
        assert proposal.status_code == 200
        p_data = proposal.json()
        assert p_data.get("requires_confirmation") is True
        action_payload = p_data.get("action_payload")
        assert action_payload is not None
        assert action_payload["product_id"] == product["id"]
        assert action_payload["quantity"] == 5

        # User confirms the proposed action:
        confirmation = client.post("/api/vihzi/query", headers=headers, json={
            "query": "Yes, confirm",
            "confirm_action": True,
            "action_payload": action_payload,
        })
        assert confirmation.status_code == 200
        assert confirmation.json()["intent"] == "action_executed"

        # Verify product stock increased from 25 to 30:
        inv_check = client.get("/api/inventory", headers=headers).json()
        ponni_prod = next(p for p in inv_check["products"] if p["id"] == product["id"])
        assert ponni_prod["stock"] == 30

        # 10. Test Dashboard upgraded fields (valuation, least selling)
        dash = client.get("/api/dashboard?days=30", headers=headers).json()
        assert "stock_valuation" in dash["kpis"]
        assert dash["kpis"]["stock_valuation"] == 30 * 260
        assert "least_products" in dash

