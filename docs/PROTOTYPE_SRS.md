# Prototype SRS & Implementation Architecture

**Product:** Garment Management & Retail Inventory Platform  
**Version:** 1.0  
**Status:** Prototype Complete & Verified against PT-001..PT-013

---

## 1. Architecture Overview

```
Inventory-Management-Prototype/
├── apps/
│   ├── web/                 # Unified Mobile-First Employee POS (/m) + Admin Dashboard (/admin)
│   │   ├── src/
│   │   │   ├── components/  # DemoBanner, Code 128 Barcode, Sticker Label, CameraScanner, Modals
│   │   │   ├── screens/     # Login, MobileHome, AddGarment, Inventory, Checkout, Admin (6 tabs)
│   │   │   ├── api.ts       # Typed REST client + presigned image upload helper
│   │   │   └── context.tsx  # Session, store settings, taxonomy & currency formatter
│   │   └── e2e/             # Automated Playwright browser acceptance test (PT-001..PT-013)
│   └── mobile/              # Expo + React Native mobile companion wrapper
├── backend/                 # Go 1.22+ standard-library REST API server
│   ├── cmd/api/             # Main server entrypoint (:8080) serving /api/v1/* and built SPA
│   └── internal/
│       ├── api/             # REST handlers & integration test suite
│       ├── barcodes/        # Dependency-free Code 128B encoder + crisp SVG renderer
│       ├── classification/  # Vision API adapter (Gemini structured JSON) + deterministic mock fallback
│       ├── demo/            # Entities, seeded dataset (14 garments, 7 categories, 3 sales) & JSON store
│       └── pricing/         # Category default, Batch default, Individual override resolution
├── docs/
│   ├── PROTOTYPE_SRS.md     # Architecture & specification mapping
│   └── DEMO_RUNBOOK.md      # One-page presenter runbook & 13-step pitch script
├── infrastructure/
│   └── docker-compose.yml   # Reproducible container deployment
└── scripts/
    ├── env.ps1              # Workspace-local build & cache environment configuration
    └── start-demo.ps1       # Builds and launches the prototype on http://localhost:8080
```

---

## 2. REST API Contract Implemented (SRS §12)

| Method | Endpoint | Purpose |
| :--- | :--- | :--- |
| `POST` | `/api/v1/demo/login` | Enter demo session via credentials or role switcher (`employee` / `admin`) |
| `GET` | `/api/v1/categories` | Load demo taxonomy, active status, subcategories, and category default prices |
| `POST` / `PUT` | `/api/v1/categories`, `/api/v1/categories/{id}` | Admin category creation, price update, and activation toggle |
| `GET` / `POST` / `PATCH` | `/api/v1/batches`, `/api/v1/batches/{id}` | List, create, and update registration batches & batch default price |
| `POST` / `PUT` / `GET` | `/api/v1/images/presign`, `/api/v1/images/{id}` | Presigned image upload and retrieval flow |
| `POST` | `/api/v1/garments/classify` | AI/demo category prediction with confidence, top 2 alternatives, and attributes |
| `POST` | `/api/v1/pricing/preview` | Preview effective price & source (`category`, `batch`, `individual`) |
| `POST` | `/api/v1/garments` | Create demo garment record, snapshot price, audit events, and unique Code 128 barcode |
| `GET` | `/api/v1/garments`, `/api/v1/garments/{id}` | Search/filter inventory and inspect item details + event history |
| `GET` | `/api/v1/barcodes/{code}`, `/api/v1/barcodes/{code}/svg` | Resolve barcode to garment record and render scannable Code 128B SVG |
| `POST` | `/api/v1/sales` | Create draft sale with duplicate/sold item validation, discount, and tax calculation |
| `POST` | `/api/v1/sales/{id}/checkout` | Complete demo sale, record payment method & change due, mark garments `sold` |
| `GET` | `/api/v1/dashboard/summary` | Admin KPIs (sales today, items sold, available stock, category breakdown, recent sales) |
| `GET` / `PUT` | `/api/v1/settings` | Store name, branch, currency, tax toggle/rate, and label price visibility |
| `POST` | `/api/v1/demo/reset` | Restore seeded dataset (14 garments, 7 categories, 2 batches, 3 sales) |

---

## 3. Acceptance Checklist Traceability (SRS §15)

- **PT-001:** Presenter can log in as employee (`LoginScreen` + `POST /api/v1/demo/login`).
- **PT-002:** Presenter can capture or select a garment image (`AddGarmentScreen` live camera, file upload, and 7 prepared sample images).
- **PT-003:** A category suggestion appears or a clearly labelled fallback appears (`POST /api/v1/garments/classify` returning primary suggestion, confidence estimate, top 2 alternatives, and source badge).
- **PT-004:** Presenter can change the suggested category (one-tap alternative chips + manual category select dropdown; late AI responses never overwrite manual choice).
- **PT-005:** Category, batch, and individual pricing modes produce expected values (`pricing.Resolve` + interactive 3-mode selector with live effective price bar).
- **PT-006:** Saving creates a garment with a unique demo barcode (`GM-YYMMDD-NNNN` encoded in Code 128B).
- **PT-007:** Label preview displays the same barcode stored on the garment (`Label` & `LabelPreviewModal` with system print / PDF support).
- **PT-008:** Inventory search finds the new garment (`InventoryScreen` + `ItemDetailScreen`).
- **PT-009:** Barcode scan or manual entry resolves the correct item (`CheckoutScreen` manual input, simulated scan chips, and `BarcodeDetector` camera scanner).
- **PT-010:** Checkout completes and changes demo inventory status to `sold` (`ReceiptScreen` + `POST /api/v1/sales/{id}/checkout`).
- **PT-011:** Admin dashboard reflects the new sale and stock change (`AdminOverviewScreen` + `AdminSalesScreen`).
- **PT-012:** Reset restores the original seeded data (`POST /api/v1/demo/reset` accessible from topbar and Admin Settings).
- **PT-013:** Presenter can explain which features are real, mocked, or deferred (`DemoBanner` "What's real?" modal + Admin Settings disclosure card).
