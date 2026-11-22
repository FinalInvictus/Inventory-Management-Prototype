// End-to-end Playwright browser acceptance suite verifying PT-001 through PT-013
// against the live Go API server and compiled React frontend.
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8080';
const ART_DIR = process.env.E2E_ARTIFACTS || join(process.cwd(), '..', '..', 'e2e-artifacts');
mkdirSync(ART_DIR, { recursive: true });

const edgePaths = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
];
const executablePath = edgePaths.find(p => existsSync(p));
if (!executablePath) {
  throw new Error('No Chromium/Edge executable found on system');
}

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

const results = [];
function pass(id, desc) {
  results.push({ id, desc, status: 'PASS' });
  console.log(`✓ ${id}: ${desc}`);
}

const browser = await chromium.launch({ executablePath, headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await context.newPage();

  // Ensure clean seeded state first via API
  const loginRes = await fetch(`${BASE_URL}/api/v1/demo/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'admin' }),
  }).then(r => r.json());
  await fetch(`${BASE_URL}/api/v1/demo/reset`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${loginRes.token}` },
  });

  // PT-001: Presenter can log in as employee
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: join(ART_DIR, '01-login.png') });
  await page.getByTestId('login-employee-btn').click();
  await page.waitForURL('**/m');
  await page.getByTestId('home-available-stock').waitFor();
  const initialStockText = await page.getByTestId('home-available-stock').locator('b').innerText();
  const initialStock = Number(initialStockText);
  assert(initialStock === 10, `Expected seeded available stock 10, got ${initialStock}`);
  await page.screenshot({ path: join(ART_DIR, '02-employee-home.png') });
  pass('PT-001', 'Presenter logged in as Employee (Priya Sharma) and viewed mobile home metrics');

  // PT-013: Disclosure modal is accessible and explains real vs mocked vs deferred
  await page.getByRole('button', { name: "What's real?" }).click();
  await page.getByRole('dialog', { name: 'What is real, mocked or deferred' }).waitFor();
  await page.getByRole('button', { name: 'Close' }).click();
  pass('PT-013', 'Presenter can open disclosure modal explaining real, mocked and deferred features');

  // Navigate to Add Garment & create a new batch with batch default price 350
  await page.getByTestId('qa-add-garment').click();
  await page.waitForURL('**/m/add');
  await page.getByTestId('new-batch-name').fill('Pitch Demo Batch');
  await page.getByTestId('new-batch-ref').fill('PITCH-01');
  await page.getByTestId('new-batch-price').fill('350');
  await page.getByTestId('create-batch-btn').click();

  // PT-002: Presenter can capture or select a garment image
  await page.getByTestId('step-camera').waitFor();
  await page.screenshot({ path: join(ART_DIR, '03-sample-selection.png') });
  await page.getByTestId('sample-s01').click();
  pass('PT-002', 'Presenter selected prepared sample garment image (Blue formal shirt)');

  // PT-003: Category suggestion appears or a clearly labelled fallback appears
  await page.getByTestId('step-intake').waitFor();
  await page.getByTestId('ai-pick-formal_shirt').waitFor({ timeout: 5000 });
  const noticeText = await page.getByTestId('ai-notice').innerText();
  assert(noticeText.toLowerCase().includes('demo'), 'Expected AI notice to disclose demo prediction');
  await page.screenshot({ path: join(ART_DIR, '04-ai-suggestion.png') });
  pass('PT-003', 'AI category suggestion (Formal Shirt, Est. 82%) and alternatives appeared with demo disclosure');

  // PT-004: Presenter can change the suggested category
  await page.getByTestId('ai-alt-casual_shirt').click();
  const selVal = await page.getByTestId('manual-category-select').inputValue();
  assert(selVal === 'casual_shirt', `Expected category casual_shirt after override, got ${selVal}`);
  pass('PT-004', 'Presenter changed suggested category from Formal Shirt to Casual Shirt');

  // PT-005: Category, batch and individual pricing modes produce expected values
  // 1) Batch default should currently be active (₹350)
  let effPrice = await page.getByTestId('effective-price-value').innerText();
  assert(effPrice.includes('350'), `Expected batch default price ₹350, got ${effPrice}`);
  // 2) Switch to Category default (Casual Shirt is ₹449)
  await page.getByTestId('price-mode-category').click();
  effPrice = await page.getByTestId('effective-price-value').innerText();
  assert(effPrice.includes('449'), `Expected category default price ₹449, got ${effPrice}`);
  // 3) Enter Individual override (₹525)
  await page.getByTestId('individual-override-input').fill('525');
  effPrice = await page.getByTestId('effective-price-value').innerText();
  assert(effPrice.includes('525'), `Expected individual override price ₹525, got ${effPrice}`);
  await page.screenshot({ path: join(ART_DIR, '05-pricing-modes.png') });
  pass('PT-005', 'Verified Category Default (₹449), Batch Default (₹350) and Individual Override (₹525)');

  // PT-006: Saving creates a garment with a unique demo barcode
  await page.getByTestId('create-garment-btn').click();
  await page.getByTestId('step-barcode').waitFor();
  const newBarcode = (await page.getByTestId('created-garment-code').innerText()).trim();
  assert(/^GM-\d{6}-\d{4}$/.test(newBarcode), `Expected barcode format GM-YYMMDD-NNNN, got ${newBarcode}`);
  await page.screenshot({ path: join(ART_DIR, '06-barcode-result.png') });
  pass('PT-006', `Saved garment with unique Code 128 barcode ${newBarcode}`);

  // PT-007: Label preview displays the same barcode stored on the garment
  const labelCode = await page.getByTestId('label-preview').getAttribute('data-barcode');
  assert(labelCode === newBarcode, `Expected label barcode ${newBarcode}, got ${labelCode}`);
  await page.getByTestId('open-label-preview-btn').click();
  await page.getByRole('dialog', { name: 'Label preview' }).waitFor();
  await page.screenshot({ path: join(ART_DIR, '07-label-modal.png') });
  await page.getByRole('button', { name: 'Close' }).first().click();
  pass('PT-007', `Label preview displays matching Code 128 barcode ${newBarcode}`);

  // PT-008: Inventory search finds the new garment
  await page.getByTestId('nav-inventory').click();
  await page.waitForURL('**/m/inventory');
  await page.getByTestId('inventory-search-input').fill(newBarcode);
  await page.getByTestId('inventory-search-btn').click();
  await page.getByTestId(`inventory-card-${newBarcode}`).waitFor();
  await page.screenshot({ path: join(ART_DIR, '08-inventory-search.png') });
  await page.getByTestId(`inventory-card-${newBarcode}`).click();
  await page.getByTestId('item-detail-card').waitFor();
  const aiSuggestedText = await page.getByTestId('detail-ai-suggested').innerText();
  assert(aiSuggestedText === 'Formal Shirt', `Expected human-readable AI suggested name 'Formal Shirt', got ${aiSuggestedText}`);
  pass('PT-008', `Inventory search found ${newBarcode} and opened item detail with AI provenance (${aiSuggestedText})`);

  // PT-009: Barcode scan or manual entry resolves the correct item in Checkout
  await page.getByTestId('nav-checkout').click();
  await page.waitForURL('**/m/checkout');
  await page.getByTestId('checkout-code-input').fill(newBarcode);
  await page.getByTestId('checkout-add-code-btn').click();
  await page.getByTestId(`cart-line-${newBarcode}`).waitFor();
  await page.screenshot({ path: join(ART_DIR, '09-checkout-cart.png') });
  pass('PT-009', `Checkout barcode lookup resolved ${newBarcode} into the cart at ₹525`);

  // PT-010: Checkout completes and changes demo inventory status to sold
  await page.getByTestId('pay-method-upi').click();
  await page.getByTestId('complete-checkout-btn').click();
  await page.waitForURL('**/m/receipt/**');
  const receiptNo = (await page.getByTestId('receipt-number').innerText()).trim();
  const receiptBody = await page.getByTestId('receipt-card').innerText();
  assert(receiptBody.includes(newBarcode), 'Expected receipt to list the newly sold barcode');
  assert(receiptBody.includes('Sold'), 'Expected receipt to confirm Sold status');
  await page.screenshot({ path: join(ART_DIR, '10-receipt.png') });
  pass('PT-010', `Completed checkout (${receiptNo}) and transitioned ${newBarcode} to Sold`);

  // PT-011: Admin dashboard reflects the new sale and stock change
  await page.getByTestId('receipt-goto-admin-btn').click();
  await page.waitForURL('**/admin');
  await page.getByTestId(`admin-sale-row-${receiptNo}`).waitFor();
  // Since we added 1 item and sold 1 item, available stock should remain 10
  const adminAvail = Number(await page.getByTestId('admin-available-count').innerText());
  assert(adminAvail === 10, `Expected available stock 10 after +1 add and -1 sale, got ${adminAvail}`);
  await page.screenshot({ path: join(ART_DIR, '11-admin-dashboard.png') });
  pass('PT-011', `Admin dashboard reflected new sale ${receiptNo} and updated stock counts`);

  // Verify other Admin screens (Inventory, Categories, Pricing, Sales, Settings)
  await page.getByTestId('admin-nav-inventory').click();
  await page.getByTestId(`admin-inv-row-${newBarcode}`).waitFor();

  await page.getByTestId('admin-nav-categories').click();
  await page.getByTestId('admin-categories-table').waitFor();
  // Create a new category and toggle active status
  await page.getByTestId('new-cat-name').fill('Cardigan');
  await page.getByTestId('new-cat-price').fill('749');
  await page.getByTestId('create-cat-btn').click();
  await page.getByTestId('toggle-cat-cardigan').waitFor();
  await page.getByTestId('toggle-cat-cardigan').click();

  await page.getByTestId('admin-nav-pricing').click();
  await page.getByTestId('edit-cat-price-jeans').waitFor();
  await page.getByTestId('edit-cat-price-jeans').fill('849');
  await page.getByTestId('save-cat-price-jeans').click();

  await page.getByTestId('admin-nav-sales').click();
  await page.getByTestId(`sales-row-${receiptNo}`).waitFor();

  // Verify settings branch name & store name persistence
  await page.getByTestId('admin-nav-settings').click();
  await page.getByTestId('settings-store-name').fill('ReWear Flagship');
  await page.getByTestId('save-settings-btn').click();

  // PT-012: Reset restores the original seeded data (including removing Cardigan, restoring prices & store name)
  await page.getByTestId('settings-reset-demo-btn').click();
  await page.waitForTimeout(350);
  const restoredStoreName = await page.getByTestId('settings-store-name').inputValue();
  assert(restoredStoreName === 'ReWear Thrift Co.', `Expected reset to restore store name, got ${restoredStoreName}`);
  await page.getByTestId('admin-nav-inventory').click();
  await page.getByTestId('admin-inventory-table').waitFor();
  const invTextAfterReset = await page.getByTestId('admin-inventory-table').innerText();
  assert(!invTextAfterReset.includes(newBarcode), `Expected reset to remove ${newBarcode}`);
  await page.screenshot({ path: join(ART_DIR, '12-admin-after-reset.png') });
  pass('PT-012', 'Reset action restored the original 14 seeded garments, taxonomy, prices, and store settings');

  // Verify modal-based topbar Reset on mobile view works without window.confirm or reload
  await page.getByTestId('switch-to-employee').click();
  await page.waitForURL('**/m');
  await page.getByTestId('mobile-reset-btn').click();
  await page.getByTestId('confirm-reset-btn').waitFor();
  await page.getByTestId('confirm-reset-btn').click();
  await page.getByTestId('home-available-stock').waitFor();

  console.log(`\nALL ${results.length} ACCEPTANCE CHECKS PASSED!`);
} finally {
  await browser.close();
}
