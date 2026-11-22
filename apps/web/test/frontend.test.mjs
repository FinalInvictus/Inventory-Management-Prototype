import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

describe('Frontend Build & Contract Verification', () => {
  it('compiled production bundle exists and contains all required routes and test IDs', () => {
    const indexHtmlPath = join(rootDir, 'dist', 'index.html');
    assert.ok(existsSync(indexHtmlPath), 'dist/index.html must exist');
    const html = readFileSync(indexHtmlPath, 'utf8');
    assert.ok(html.includes('<div id="root"></div>'), 'index.html must contain root mount node');

    const jsMatch = html.match(/\/assets\/(index-[^"]+\.js)/);
    const cssMatch = html.match(/\/assets\/(index-[^"]+\.css)/);
    assert.ok(jsMatch, 'index.html must reference compiled JS asset');
    assert.ok(cssMatch, 'index.html must reference compiled CSS asset');

    const jsBundle = readFileSync(join(rootDir, 'dist', 'assets', jsMatch[1]), 'utf8');
    const requiredMarkers = [
      '/api/v1/demo/bootstrap',
      '/api/v1/demo/login',
      '/api/v1/demo/reset',
      '/api/v1/garments/classify',
      '/api/v1/images/presign',
      'detail-ai-suggested',
      'admin-detail-ai-suggested',
      'effective-price-value',
      'complete-checkout-btn',
      'settings-reset-demo-btn',
    ];
    for (const marker of requiredMarkers) {
      assert.ok(jsBundle.includes(marker), `Bundle missing required marker: ${marker}`);
    }
  });

  it('print stylesheet properly isolates print-area inside modals', () => {
    const cssSource = readFileSync(join(rootDir, 'src', 'styles.css'), 'utf8');
    assert.ok(cssSource.includes('@media print'), 'styles.css must define @media print rules');
    assert.ok(cssSource.includes('position: fixed'), '@media print must use position: fixed for .print-area');
  });

  it('screens subscribe to dataVersion for live demo reset consistency', () => {
    const adminSrc = readFileSync(join(rootDir, 'src', 'screens', 'Admin.tsx'), 'utf8');
    const checkoutSrc = readFileSync(join(rootDir, 'src', 'screens', 'Checkout.tsx'), 'utf8');
    const addGarmentSrc = readFileSync(join(rootDir, 'src', 'screens', 'AddGarment.tsx'), 'utf8');

    assert.ok(adminSrc.includes('setEdits({})'), 'AdminPricingScreen must reset edits on dataVersion change');
    assert.ok(checkoutSrc.includes('draftRef'), 'CheckoutScreen must reuse draft sale reference on retry');
    assert.ok(addGarmentSrc.includes('userEditedPriceMode'), 'AddGarmentScreen must protect user-selected priceMode from delayed AI');
  });
});
