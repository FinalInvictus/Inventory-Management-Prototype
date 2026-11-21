# Garment Management & Retail Inventory Platform — Demo Runbook

**Document Version:** 1.0  
**Purpose:** One-page operational runbook for launching, rehearsing, and presenting the Garment Management & Retail Inventory Prototype pitch.

---

## 1. Starting the Prototype

### Option A — Single-Binary Full Stack (Recommended for Live Pitch)
From the repository root:
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-demo.ps1
```
Then open **http://localhost:8080** in any desktop or mobile browser.
- Employee Mobile POS: **http://localhost:8080/m**
- Admin Store Dashboard: **http://localhost:8080/admin**

### Option B — Optional Live Vision API (Gemini Sandbox)
By default, the server runs in deterministic `demo_mock` mode (zero external network dependency). To enable live Gemini Vision classification for camera/uploaded photos while keeping API keys strictly server-side:
```powershell
$env:GEMINI_API_KEY = "your-api-key"
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-demo.ps1
```

---

## 2. Demo Credentials & One-Click Role Switcher

| Role | Username | Password | Capabilities |
| :--- | :--- | :--- | :--- |
| **Employee** (Priya Sharma) | `employee` | `demo123` | Register garments, AI suggestion & manual override, batch/individual pricing, barcode label preview, inventory lookup, POS checkout |
| **Admin** (Arjun Mehta) | `admin` | `admin123` | Store KPIs, category stock distribution, inventory & audit drawer, editable taxonomy, category default prices, sales receipts, settings & demo reset |

> **Tip:** The Login page and top navigation bars include a **One-Click Role Switcher** (`📱 Employee` ↔ `📊 Admin`) and a **↺ Reset** button so you never have to type credentials during a live presentation.

---

## 3. Guided 13-Step End-to-End Pitch Script (2–3 Minutes)

1. **Sign In as Employee (`PT-001`):** Open `/login` and click **Employee (Mobile POS)**. Point out the top disclosure banner (`DEMO ENVIRONMENT`) and click **What's real?** (`PT-013`) to transparently show which parts are real vs. simulated.
2. **Open Add Garment & Setup Batch:** Tap **Add Garment**. Select an existing batch (e.g., *November donations* with ₹399 batch default) or create a new batch (*Weekend Rack*, ref `WK-01`, default price `₹350`).
3. **Select or Capture Garment Photo (`PT-002`):** Tap one of the 7 prepared sample garment illustrations (e.g., *Blue formal shirt*) or capture/upload a photo.
4. **Show AI Category Suggestion (`PT-003`):** Point out the short processing state followed by the **AI Suggestion** card showing the recommended category (*Formal Shirt*, Est. 82%) and top 2 alternatives (*Casual Shirt*, *T-Shirt*). Emphasize: *"The AI removes repetitive category selection without taking control away from the employee."*
5. **Change Category Once (`PT-004`):** Tap **Casual Shirt** (or choose from the manual dropdown) to demonstrate immediate employee control. Notice the badge updates to **Overridden by employee**.
6. **Demonstrate All 3 Pricing Modes (`PT-005`):**
   - Tap **1. Category Default** → shows **₹449** (`Category price`).
   - Tap **2. Batch Default** → shows **₹350** (`Batch price`).
   - Enter **₹525** in **3. Individual Override** → final effective price updates to **₹525** (`Individual price`).
7. **Save Garment & Generate Code 128 Barcode (`PT-006`):** Tap **✓ Create Garment**. Show the generated collision-safe code (`GM-YYMMDD-NNNN`) and scannable Code 128 barcode.
8. **Open Physical Sticker Preview (`PT-007`):** Tap **🏷️ Preview Label / Demo Print** to display the 50 × 30 mm thermal label with store name, Code 128 barcode, garment code, category/size, and price.
9. **Verify in Inventory (`PT-008`):** Tap **View in Inventory →** (or search by barcode in the Inventory tab) to show the item detail card, attributes, AI provenance, and audit event timeline.
10. **Scan/Enter Code in Checkout (`PT-009`):** Tap **🛒 Add to Checkout** (or enter/scan the barcode on the Checkout tab) to add the garment to the cart.
11. **Configure Bill & Payment Method:** Optionally enter a demo discount, verify the 5% GST calculation, and select **Cash**, **Card**, or **UPI**.
12. **Complete Demo Checkout (`PT-010`):** Tap **✓ Complete Demo Checkout**. Show the generated demo receipt (`S-0004`) confirming the garment's inventory status has transitioned to **Sold**.
13. **Switch to Admin Dashboard & Reset (`PT-011`, `PT-012`):** Tap **📊 View Sale & Stock Change in Admin Dashboard →**. Highlight the updated **Demo Sales Today**, **Available Stock**, and **Recent Demo Sales** table. Finally, open **Settings & Reset** and click **↺ Restore Seeded Demo Data Now** to reset the environment for the next run.

---

## 4. Client Decisions to Capture During the Pitch (SRS §21)

- **Categories:** Which garment classes and subcategories are actually used in the store?
- **Pricing:** Are prices fixed by category, varied by brand/quality/size, or entered per item?
- **Barcode Label:** What sticker size is used, what fields should appear, and where is it attached?
- **Printer:** Does the store already own a thermal printer (exact make/model and Bluetooth/USB connection)?
- **Checkout:** Which payment methods, taxes, discounts, receipts, and return rules are required?
- **Branches & Users:** How many store locations and employees will operate the production system?
- **Customer Records:** Is customer identity required at checkout, optional, or not needed?
- **AI Expectation:** Which suggestion mistakes are acceptable and which categories require mandatory confirmation?
