# RetailIQ architecture and workflow

## 1. Runtime architecture

```text
React / Tailwind / Recharts
        │ same-origin /api, bearer session
        ▼
FastAPI REST application
        ├── Authentication + shop authorisation
        ├── Product and QR references
        ├── Atomic billing + payment + return workflows
        ├── Supplier purchase + file-validation pipeline
        ├── Inventory movements + analytics
        ├── Transparent forecasting
        └── Vihzi intent + grounded response service
        ▼
SQLAlchemy unit of work
        ▼
PostgreSQL (production) / SQLite (local default)
```

The frontend uses relative API URLs. Vite proxies them in development; the production FastAPI process serves the compiled React application. Browser-facing code never calls a sandbox-only `localhost` backend.

## 2. Tenancy and record ownership

`Users` belongs to one `Stores` record. Products, sales, purchases and stock movements carry a `store_id`. API dependencies resolve the user from a signed token, and every business query includes that user’s store. QR references are resolved only inside the current store, so identical Product IDs in two independent shops do not leak data.

There is deliberately no cross-shop Admin Portal.

## 3. Primary records

| Record | Responsibility |
| --- | --- |
| Store | Shop identity, tax, receipt and language preferences |
| User | Owner identity and salted password hash |
| Product | Catalogue data, current selling/cost price, stock and reorder threshold |
| Sale | Bill totals, source, status and idempotency token |
| SaleItem | Immutable product name/ID/price snapshot for each billed line |
| Payment | Payment method, amount and completion/refund state |
| Purchase | Supplier, invoice, source filename and total purchase cost |
| PurchaseItem | Received product, quantity and unit cost |
| StockMovement | Signed quantity, resulting balance, source and reason |
| ImportRecord | File import type, row count, status and purchase reference |

Uploaded file contents are processed in memory in this implementation. Production deployments can archive originals in an S3 bucket using a `store_id/import_id` prefix without changing the purchase-confirmation pipeline.

## 4. Atomic customer checkout

1. The frontend sends product IDs, quantities, discount, payment method and a random client token.
2. An existing token returns the original bill instead of creating a duplicate.
3. The backend loads active products belonging to the current store and requests row locks where PostgreSQL supports them.
4. Quantities are aggregated, stock is checked, and prices are read from Product records. Client-provided prices are never accepted.
5. Discount is bounded by subtotal; tax is calculated from the store configuration.
6. Sale, sale items, payment, signed stock movements and product balances are written in one database commit.
7. Any validation failure prevents the commit. A printer error occurs outside this transaction and cannot invalidate a paid bill.
8. A return changes sale/payment status and adds positive `return` movements. It does not erase the original sale.

Bill numbers incorporate the unique client token, avoiding a count-based race during concurrent checkout.

## 5. Supplier stock intake

The shopkeeper can type a supplier bill or upload CSV/XLSX/PDF evidence. Uploading does **not** directly change inventory.

```text
File type + 6 MB size check
        ▼
Header/text extraction
        ▼
Product ownership + numeric quantity/cost validation
        ▼
Preview with per-row errors and editable valid values
        ▼
Shopkeeper confirmation
        ▼
Duplicate supplier/invoice check
        ▼
Purchase + items + positive stock movements + latest cost update
```

Only confirmed valid rows enter the purchase endpoint. Invalid rows are excluded and identified to the user. The backend repeats all ownership and numeric validation; frontend validation is not trusted.

Customer sales always create negative `sale` movements. Supplier purchases create positive `purchase` movements. Manual corrections require a reason and create an `adjustment` movement. This keeps stock provenance explicit.

## 6. Analytics and forecasts

Dashboard metrics are aggregated from non-refunded sales and current Product records. Product performance requires sufficient history and is based on units in the selected period. Category contributions use stored sale-line values.

Forecasting uses a damped least-squares trend over a recent 28-day revenue window, with residual-based uncertainty. A shop needs at least seven active sales days; 21 or more yields medium confidence. The response includes method, period, upper/lower ranges and limitations. No missing series is replaced with synthetic shop data.

Demand signals compare recent product quantities with earlier activity. Restocking suggestions combine recent sales velocity, current stock and configured reorder thresholds. They are recommendations, not automatic supplier orders.

## 7. Vihzi trust boundary

Vihzi’s character and conversational interface live in React. Voice input/output uses browser speech APIs. The backend determines intent and calls the same authorised dashboard/forecast functions as the visual application. The response includes an intent marker for transparency.

A future LLM can rephrase grounded responses, but it should receive a typed analytics result rather than unrestricted database access. Numeric answers must continue to come from RetailIQ services.

## 8. Security and deployment checklist

Implemented: salted PBKDF2 hashes, signed expiring sessions, store-scoped queries, backend validation, idempotency, upload type/size limits, safe filename handling, transaction history, and parameterised SQLAlchemy queries.

Before a public deployment:

- Use HTTPS and a strong randomly generated `SECRET_KEY`.
- Use managed PostgreSQL, encrypted backups and migration tooling such as Alembic.
- Disable demo seeding and configure explicit CORS origins.
- Add login/upload rate limiting, monitoring and structured audit logs.
- Add email-based password recovery and optional MFA.
- Archive imports/reports in private S3 storage with malware scanning if required.
- Add a local POS bridge only when unattended thermal printing is necessary.
