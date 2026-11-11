# RetailIQ

**Your business, made simpler.**

RetailIQ is a connected retail management and sales analytics application for independent shop owners. It combines QR-based checkout, printable receipts, product and supplier-stock management, sales analytics, transparent forecasts, and **Vihzi**, a voice/text business assistant with an original character identity.

This repository contains a working React + FastAPI implementation of the supplied **My Shop** dashboard design. Business figures come from backend records; they are not calculated from browser-only sample arrays.

## What is implemented

- **Independent shop accounts** — registration, login, hashed passwords, expiring bearer sessions, and store-scoped backend queries.
- **My Shop dashboard** — daily/monthly KPIs, revenue trends, category contribution, product performance, inventory alerts, recent transactions, and data-grounded insights.
- **Integrated POS billing** — camera QR scanning, manual Product ID entry, product search, quantity controls, discounts, tax, Cash/UPI/Card payment, and 58/80 mm printable receipts.
- **Atomic transactions** — current database prices, stock validation, bill/payment/sale-item creation, and inventory deduction in one transaction. Client tokens make retries idempotent.
- **My Products** — registration, editing, opening stock, reorder thresholds, performance classification, catalogue export, and downloadable/printable QR labels.
- **Sales analytics** — period filters, revenue comparisons, transaction search, CSV export, full bill details, receipt reprints, and audited returns/refunds.
- **My Stock** — current quantities, cost value, sales velocity, days of cover, restocking suggestions, and complete movement history.
- **Shopkeeper stock intake** — manual supplier purchase bills plus **CSV, XLSX and PDF upload → validation → editable preview → explicit confirmation**. Valid rows create a purchase, update stock/cost price, and write movement records. Supplier + invoice duplicate checks prevent accidental repeat imports.
- **What’s Next?** — 7/15/30-day revenue estimates, uncertainty ranges, demand direction, and restocking suggestions. Shops with fewer than seven active sales days receive an explanation instead of a prediction.
- **Vihzi** — original South Asian cartoon character, English/Tamil/Tanglish intent handling, browser voice input, optional spoken responses, quick chat, and full assistant workspace. Answers use only authorised backend analytics.
- **Settings** — shop profile, contact/receipt details, tax rate, printer width, language, stock notifications, and password change.
- **No Admin Portal**, by design.

## Technology

| Layer | Implementation |
| --- | --- |
| Frontend | React 18, Vite, Tailwind CSS, Recharts, Lucide icons |
| QR | `html5-qrcode` camera scanning, `qrcode.react` printable labels |
| Backend | Python 3.11, FastAPI, SQLAlchemy 2, Pydantic 2 |
| Database | PostgreSQL in production; zero-configuration SQLite for local development |
| Documents | CSV parser, OpenPyXL for XLSX, pypdf for PDF text extraction |
| Auth | PBKDF2-SHA256 salted password hashes, HS256 bearer tokens |
| Testing | Pytest + FastAPI TestClient end-to-end workflow test |
| Deployment | Multi-stage Dockerfile serving the React build and API from one origin |

## Quick start

### 1. Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The first startup creates the local database and an optional, clearly labelled demo shop.

### 2. Frontend

In another terminal:

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**. Vite proxies `/api` to FastAPI, so browser code never needs a hardcoded backend host.

### Demo account

```text
Email:    demo@retailiq.in
Password: Vihzi$Lakshmi#2026
```

The demo dashboard is computed from persisted demo products, purchases, sales, and stock movements. Registering a new shop creates a genuinely empty workspace.

API documentation: **http://localhost:8000/docs**

## Supplier stock files

Use **My Stock → Upload stock file**. CSV and XLSX headers are case-insensitive and ignore spaces/underscores:

```csv
product_id,product_name,quantity,unit_cost
PRD001,Basmati Rice 1kg,80,82
PRD002,Milk 500ml,120,22
PRD005,Tea Powder 250g,40,72
```

- `product_id` (or `sku`) and `quantity` are required.
- `product_name` can be used instead of Product ID when it exactly matches a catalogue product.
- `unit_cost` is optional but recommended; it updates the product’s latest cost price.
- Unknown products and invalid quantities are shown as errors and are never posted.
- Valid quantities/costs can be corrected in the preview before confirmation.
- PDF extraction accepts text rows such as `PRD001, 80, 82` (comma, pipe, or tab separated). PDF layouts vary, so explicit confirmation is mandatory.
- Files are validated in memory and capped at 6 MB. Only import metadata is stored in this implementation; an S3 raw-file adapter can be added for production archival.

Every confirmed import follows the same pipeline as a typed supplier bill:

```text
Supplier evidence → Row validation → Shopkeeper confirmation
→ Purchase + purchase items → Product stock/cost update → Stock movement audit
```

## Tests

```bash
cd backend
source .venv/bin/activate
pip install -r requirements-dev.txt
pytest -q

cd ../frontend
npm run build
```

The API test covers registration, empty dashboards, product/QR lookup, CSV preview, purchase confirmation, duplicate invoice blocking, idempotent checkout, stock deduction, refunds, insufficient-history forecasting, Vihzi, and cross-store isolation.

## PostgreSQL configuration

Start PostgreSQL locally:

```bash
docker compose up -d postgres
export DATABASE_URL='postgresql+psycopg2://retailiq:retailiq_dev_password@localhost:5432/retailiq'
export SECRET_KEY='replace-with-a-long-random-secret'
```

See `backend/.env.example`. Environment variables are read from the process environment (not automatically from `.env`). Set `SEED_DEMO=false` for a production deployment without demo records and configure `CORS_ORIGINS` if the API and frontend are hosted separately.

## Production build

```bash
cd frontend && npm run build
cd ../backend && uvicorn app.main:app --host 0.0.0.0 --port 8000
```

FastAPI serves `frontend/dist` and the API from the same origin. Alternatively:

```bash
docker build -t retailiq .
docker run -p 8000:8000 \
  -e DATABASE_URL='postgresql+psycopg2://user:password@host:5432/retailiq' \
  -e SECRET_KEY='your-production-secret' \
  -e SEED_DEMO=false retailiq
```

For real production use, put the app behind HTTPS, configure managed PostgreSQL backups, add rate limiting and email-based password recovery, and use a local POS printer bridge where unattended thermal printing is required.

## Project map

```text
backend/
  app/
    main.py          API routes, atomic billing and stock intake
    models.py        Store-isolated relational data model
    services.py      Dashboard, forecasts and grounded Vihzi answers
    security.py      Password hashing and session authentication
    seed.py          Persisted demo records
  tests/             End-to-end backend workflow test
frontend/
  public/vihzi.png   Original Vihzi character
  src/components/   Layout, POS scanner, receipts, stock intake, Vihzi chat
  src/pages/        Auth, dashboard, billing, products, sales, stock, forecast, settings
  src/api.js        Same-origin authenticated API client
docs/
  ARCHITECTURE.md   Data flow, consistency and deployment notes
```

## Important boundaries

- Forecasts are guides, not guarantees. They exclude weather, festivals, promotions, and future supplier delays.
- Vihzi’s business intent engine is deterministic and record-grounded; it does not let a generative model invent values. A future Gemini integration can improve phrasing while retaining this backend analytics boundary.
- Browser speech recognition depends on browser support. Text chat remains available everywhere.
- Browser printing opens the operating system print dialog. Printer failure never deletes a saved transaction; receipts can always be reprinted from Sales.
- Refunds currently operate on the complete bill and create separate return movements rather than deleting sales history.

**One platform. One connected data system. Smarter retail decisions.**
