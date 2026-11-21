# Garment Management & Retail Inventory Platform — Prototype

A demo-ready retail inventory and garment registration prototype built to the **Prototype SRS & Pitch Build Specification (v1.0)**.

## Key Capabilities

- **Employee Mobile POS (`/m`):**
  - Demo login & one-click role switcher (`employee` / `admin`) with persistent disclosure banner (**What's real?** modal).
  - Registration batch setup with optional batch default price.
  - Camera capture, file upload (via presigned upload flow), or 7 prepared synthetic garment sample illustrations.
  - AI category suggestion with confidence estimate, top 2 alternatives, and immediate manual category override (delayed AI results never overwrite employee selections).
  - Three distinguishable pricing modes: **Category Default**, **Batch Default**, and **Individual Override**, saved as an immutable price snapshot on the garment.
  - Collision-safe garment identifier (`GM-YYMMDD-NNNN`) and scannable **Code 128B** barcode generation.
  - Physical thermal sticker preview (`50 × 30 mm`) and system print / save-to-PDF preview.
  - Inventory search, status/category filters, barcode lookup, and item detail with audit event timeline.
  - POS Checkout cart with camera barcode scanning (`BarcodeDetector`), manual barcode entry, simulated quick-scan chips, discount, configurable GST, payment method selection (`Cash`, `Card`, `UPI`), and demo receipt.
- **Admin Store Dashboard (`/admin`):**
  - **Overview:** Demo sales today, items sold, available stock & value, category stock distribution table, recent sales, and audit log.
  - **Inventory:** Searchable/filterable table with item detail & audit inspection modal and label preview.
  - **Categories:** Editable store taxonomy with active status toggle and new category creation.
  - **Pricing Rules:** Category default price editor, batch summary, and 3-tier pricing rule reference.
  - **Sales & Receipts:** Completed sales table and receipt viewer.
  - **Settings & Reset:** Store name, branch, currency, tax toggle/rate, label price toggle, and one-click **Restore Seeded Demo Data**.

## Quick Start

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-demo.ps1
```

Then open **http://localhost:8080** in your browser:
- **Employee Mobile POS:** `http://localhost:8080/m` (`employee` / `demo123`)
- **Admin Dashboard:** `http://localhost:8080/admin` (`admin` / `admin123`)

See [docs/DEMO_RUNBOOK.md](docs/DEMO_RUNBOOK.md) for the guided 13-step pitch script and [docs/PROTOTYPE_SRS.md](docs/PROTOTYPE_SRS.md) for the architecture and acceptance traceability.
