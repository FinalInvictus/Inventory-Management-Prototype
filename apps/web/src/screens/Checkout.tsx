import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useApp } from '../context';
import {
  CameraScanner,
  Empty,
  ErrorBox,
  fmtDate,
  PriceSourceTag,
  Spinner,
  Tag,
} from '../components/ui';
import { get, post } from '../api';
import { MobileShell } from './MobileHome';
import type { Garment, Sale } from '../types';

export function CheckoutScreen() {
  const { settings, money, refreshMeta, bumpDataVersion, dataVersion, toast } = useApp();
  const nav = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [codeInput, setCodeInput] = useState('');
  const [cart, setCart] = useState<Garment[]>([]);
  const [availableItems, setAvailableItems] = useState<Garment[]>([]);
  const [discountInput, setDiscountInput] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [tenderedInput, setTenderedInput] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [customers, setCustomers] = useState<{ id: string; name: string; phone: string }[]>([]);
  const [scanOpen, setScanOpen] = useState(false);
  const [err, setErr] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const draftRef = useRef<{ key: string; id: string } | null>(null);
  const prevDataVersion = useRef(dataVersion);

  const loadAvailable = async () => {
    const [g, c] = await Promise.all([
      get<{ items: Garment[] }>('/api/v1/garments?status=available'),
      get<{ customers: { id: string; name: string; phone: string }[] }>('/api/v1/customers'),
    ]);
    setAvailableItems(g.items);
    setCustomers(c.customers);
  };

  useEffect(() => {
    if (prevDataVersion.current !== dataVersion) {
      prevDataVersion.current = dataVersion;
      setCart([]);
      draftRef.current = null;
    }
    loadAvailable();
  }, [dataVersion]);

  const addByCode = async (rawCode: string) => {
    const code = rawCode.trim();
    if (!code) return;
    setErr('');
    try {
      const g = await get<Garment>(`/api/v1/barcodes/${encodeURIComponent(code)}`);
      if (g.status !== 'available') {
        setErr(`Garment ${g.barcode} is already sold.`);
        return;
      }
      setCart(prev => {
        if (prev.some(x => x.id === g.id)) {
          toast(`${g.barcode} is already in cart`, 'info');
          return prev;
        }
        toast(`Added ${g.barcode} (${g.category_name})`);
        return [...prev, g];
      });
      setCodeInput('');
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  // Support ?code=GM-... deep link from Barcode or Item Detail screen
  useEffect(() => {
    const preCode = searchParams.get('code');
    if (preCode) {
      addByCode(preCode);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams]);

  const removeItem = (id: string) => {
    setCart(prev => prev.filter(x => x.id !== id));
  };

  const subtotal = cart.reduce((acc, g) => acc + g.price, 0);
  const rawDiscount = Number(discountInput) || 0;
  const discount = Math.max(0, Math.min(subtotal, rawDiscount));
  const taxRate = settings?.tax_enabled ? settings.tax_rate : 0;
  const tax = Math.round((subtotal - discount) * taxRate) / 100;
  const total = Math.round((subtotal - discount + tax) * 100) / 100;
  const tendered = tenderedInput.trim() !== '' ? Number(tenderedInput) : total;
  const underTendered = paymentMethod === 'cash' && tenderedInput.trim() !== '' && tendered + 0.001 < total;
  const changeDue = paymentMethod === 'cash' ? Math.max(0, Math.round((tendered - total) * 100) / 100) : 0;

  const completeSale = async () => {
    if (cart.length === 0) return;
    setErr('');
    setSubmitting(true);
    try {
      const draftKey = JSON.stringify({
        items: cart.map(g => g.id),
        discount,
        customer_id: customerId || '',
      });
      let draftId = draftRef.current?.key === draftKey ? draftRef.current.id : '';
      if (!draftId) {
        const draft = await post<Sale>('/api/v1/sales', {
          items: cart.map(g => g.id),
          discount,
          customer_id: customerId || undefined,
        });
        draftId = draft.id;
        draftRef.current = { key: draftKey, id: draftId };
      }
      const completed = await post<Sale>(`/api/v1/sales/${draftId}/checkout`, {
        payment_method: paymentMethod,
        amount_tendered: paymentMethod === 'cash' ? tendered : undefined,
      });
      draftRef.current = null;
      bumpDataVersion();
      refreshMeta().catch(() => {});
      toast(`Sale ${completed.number} completed!`);
      nav(`/m/receipt/${completed.id}`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const unaddedAvailable = availableItems.filter(a => !cart.some(c => c.id === a.id));

  return (
    <MobileShell title="Checkout POS">
      <div className="stack">
        {/* Scan / Manual Barcode Entry */}
        <div className="card">
          <h3>Scan or Enter Garment Code</h3>
          <form
            onSubmit={e => {
              e.preventDefault();
              addByCode(codeInput);
            }}
            className="row gap-xs mt-xs"
          >
            <input
              data-testid="checkout-code-input"
              value={codeInput}
              onChange={e => setCodeInput(e.target.value)}
              placeholder="Enter barcode (e.g. GM-261121-0015)"
              className="grow"
            />
            <button type="submit" data-testid="checkout-add-code-btn" className="btn primary">
              + Add
            </button>
            <button
              type="button"
              data-testid="checkout-camera-scan-btn"
              className="btn secondary"
              onClick={() => setScanOpen(true)}
            >
              📷 Scan
            </button>
          </form>

          {/* Simulated Quick-Scan pills for demo reliability */}
          {unaddedAvailable.length > 0 && (
            <div className="mt-sm">
              <div className="muted tiny">SIMULATED BARCODE SCAN (TAP TO SCAN AVAILABLE ITEM)</div>
              <div className="row wrap gap-xs mt-xs">
                {unaddedAvailable.slice(0, 6).map(g => (
                  <button
                    type="button"
                    key={g.id}
                    data-testid={`sim-scan-${g.barcode}`}
                    className="chip"
                    onClick={() => addByCode(g.barcode)}
                  >
                    <code>{g.barcode}</code> · {g.category_name} ({money(g.price)})
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {err && <ErrorBox message={err} />}

        {/* Cart items */}
        <div className="card" data-testid="checkout-cart">
          <div className="row between center-v">
            <h3>Checkout Cart ({cart.length})</h3>
            {cart.length > 0 && (
              <button type="button" className="btn xs ghost" onClick={() => setCart([])}>
                Clear cart
              </button>
            )}
          </div>

          {cart.length === 0 ? (
            <Empty icon="🛒" title="Cart is empty">
              Scan a barcode label or tap a simulated scan pill above to add a garment.
            </Empty>
          ) : (
            <div className="stack-sm mt-xs">
              {cart.map(g => (
                <div key={g.id} data-testid={`cart-line-${g.barcode}`} className="cart-line">
                  <img src={g.image_url} alt={g.description} className="thumb" />
                  <div className="grow">
                    <div className="row between">
                      <b>{g.category_name}</b>
                      <b>{money(g.price)}</b>
                    </div>
                    <div className="row between center-v mt-xs">
                      <code className="code-pill">{g.barcode}</code>
                      <PriceSourceTag source={g.price_source} />
                    </div>
                  </div>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Remove ${g.barcode}`}
                    onClick={() => removeItem(g.id)}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Totals, Discount, Tax & Payment Method */}
        {cart.length > 0 && (
          <div className="card" data-testid="checkout-summary">
            <h3>Bill &amp; Demo Payment</h3>
            <div className="grid-2 mt-xs">
              <label className="field">
                <span>Demo Discount ({settings?.currency_symbol ?? '₹'})</span>
                <input
                  data-testid="checkout-discount-input"
                  type="number"
                  min="0"
                  max={subtotal}
                  value={discountInput}
                  onChange={e => setDiscountInput(e.target.value)}
                />
              </label>
              <label className="field">
                <span>Customer (optional)</span>
                <select value={customerId} onChange={e => setCustomerId(e.target.value)}>
                  <option value="">Walk-in Customer</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-sm">
              <span className="field-label">Payment Method (Simulated)</span>
              <div className="grid-3 mt-xs">
                {(settings?.payment_methods ?? ['cash', 'card', 'upi']).map(m => (
                  <button
                    type="button"
                    key={m}
                    data-testid={`pay-method-${m}`}
                    className={`pay-pill ${paymentMethod === m ? 'selected' : ''}`}
                    onClick={() => setPaymentMethod(m)}
                  >
                    {m === 'cash' ? '💵 Cash' : m === 'card' ? '💳 Card' : '📱 UPI'}
                  </button>
                ))}
              </div>
            </div>

            {paymentMethod === 'cash' && (
              <div className="grid-2 mt-xs">
                <label className="field">
                  <span>Cash Tendered (optional)</span>
                  <input
                    data-testid="checkout-tendered-input"
                    type="number"
                    min={total}
                    value={tenderedInput}
                    onChange={e => setTenderedInput(e.target.value)}
                    placeholder={String(total)}
                  />
                </label>
                <div className="field">
                  <span>Change Due</span>
                  <div className="change-box">{money(changeDue)}</div>
                </div>
              </div>
            )}

            <div className="bill-box mt-sm">
              <div className="row between"><span>Subtotal ({cart.length} item{cart.length > 1 ? 's' : ''})</span><span>{money(subtotal)}</span></div>
              {discount > 0 && <div className="row between"><span>Discount</span><span>− {money(discount)}</span></div>}
              <div className="row between">
                <span>{settings?.tax_label ?? 'Tax'} ({settings?.tax_enabled ? `${settings.tax_rate}%` : 'Off'})</span>
                <span data-testid="checkout-tax">{money(tax)}</span>
              </div>
              <div className="row between bill-total">
                <b>Total Payable</b>
                <b data-testid="checkout-total">{money(total)}</b>
              </div>
            </div>

            <button
              type="button"
              data-testid="complete-checkout-btn"
              className="btn primary full mt-sm"
              disabled={submitting || underTendered}
              onClick={completeSale}
            >
              {submitting ? 'Completing Demo Sale…' : underTendered ? 'Cash tendered is less than total' : `✓ Complete Demo Checkout · ${money(total)}`}
            </button>
            <div className="muted tiny center mt-xs">
              Simulated checkout — no real payment gateway is called.
            </div>
          </div>
        )}

        {scanOpen && (
          <CameraScanner
            onCode={c => {
              setScanOpen(false);
              addByCode(c);
            }}
            onClose={() => setScanOpen(false)}
          />
        )}
      </div>
    </MobileShell>
  );
}

export function ReceiptScreen() {
  const { id } = useParams<{ id: string }>();
  const { money } = useApp();
  const nav = useNavigate();
  const [sale, setSale] = useState<Sale | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!id) return;
    get<Sale>(`/api/v1/sales/${id}`)
      .then(setSale)
      .catch(e => setErr((e as Error).message))
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <MobileShell title={sale ? `Receipt ${sale.number}` : 'Demo Receipt'} backTo="/m/checkout">
      <div className="stack">
        {err && <ErrorBox message={err} />}
        {loading ? <Spinner label="Loading receipt…" /> : sale && (
          <>
            <div className="card receipt-card print-area" data-testid="receipt-card">
              <div className="center">
                <Tag kind="ok">DEMO RECEIPT — NOT A TAX INVOICE</Tag>
                <h2 className="mt-xs" data-testid="receipt-number">{sale.number}</h2>
                <div className="muted small">{sale.store_name} · {sale.branch_name}</div>
                <div className="muted tiny">{fmtDate(sale.completed_at || sale.created_at)} · Cashier: {sale.created_by_name}</div>
              </div>

              <div className="receipt-items mt-sm">
                {sale.items.map(it => (
                  <div key={it.garment_id} className="row between py-xs border-bottom">
                    <div>
                      <b>{it.description}</b>
                      <div className="muted tiny">Code: <code>{it.barcode}</code> · Status updated to <b>Sold</b></div>
                    </div>
                    <b>{money(it.price)}</b>
                  </div>
                ))}
              </div>

              <div className="bill-box mt-sm">
                <div className="row between"><span>Subtotal</span><span>{money(sale.subtotal)}</span></div>
                {sale.discount > 0 && <div className="row between"><span>Discount</span><span>− {money(sale.discount)}</span></div>}
                <div className="row between"><span>{sale.tax_label} ({sale.tax_rate}%)</span><span>{money(sale.tax)}</span></div>
                <div className="row between bill-total">
                  <b>Total Paid ({sale.payment_method.toUpperCase()})</b>
                  <b data-testid="receipt-total">{money(sale.total)}</b>
                </div>
                {sale.payment_method === 'cash' && sale.amount_tendered != null && (
                  <div className="row between muted tiny">
                    <span>Cash tendered: {money(sale.amount_tendered)}</span>
                    <span>Change: {money(sale.change_due ?? 0)}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="grid-2 gap">
              <button type="button" className="btn secondary" onClick={() => window.print()}>
                🖨️ Print / Share Receipt
              </button>
              <button
                type="button"
                data-testid="receipt-new-sale-btn"
                className="btn primary"
                onClick={() => nav('/m/checkout')}
              >
                + New Checkout
              </button>
            </div>
            <button
              type="button"
              data-testid="receipt-goto-admin-btn"
              className="btn ghost full"
              onClick={() => nav('/admin')}
            >
              📊 View Sale &amp; Stock Change in Admin Dashboard →
            </button>
          </>
        )}
      </div>
    </MobileShell>
  );
}
