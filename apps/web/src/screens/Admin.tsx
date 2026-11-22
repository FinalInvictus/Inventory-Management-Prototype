import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../context';
import {
  Barcode,
  DemoBanner,
  Empty,
  ErrorBox,
  fmtDate,
  LabelPreviewModal,
  Modal,
  PriceSourceTag,
  Spinner,
  StatusTag,
  Tag,
  timeAgo,
} from '../components/ui';
import { get, getCached, post, put } from '../api';
import type { Batch, Category, DashboardSummary, Garment, Sale } from '../types';

export function AdminShell({ children, title }: { children: React.ReactNode; title: string }) {
  const { user, login, logout, settings, refreshMeta, bumpDataVersion, toast } = useApp();
  const loc = useLocation();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  // Ensure admin privileges if user switched straight to /admin
  useEffect(() => {
    if (user && user.role !== 'admin') {
      login({ role: 'admin' }).then(u => {
        bumpDataVersion();
        toast(`Switched to ${u.name} (admin)`);
      });
    }
  }, [user, login, bumpDataVersion, toast]);

  if (user && user.role !== 'admin') {
    return <div className="page-center"><Spinner label="Switching to Admin session…" /></div>;
  }

  const switchToEmployee = async () => {
    setBusy(true);
    try {
      const u = await login({ role: 'employee' });
      toast(`Switched to ${u.name} (${u.role})`);
      nav('/m');
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async () => {
    setBusy(true);
    try {
      await post('/api/v1/demo/reset');
      await refreshMeta();
      bumpDataVersion();
      setConfirmReset(false);
      toast('Demo data restored to seeded state');
    } finally {
      setBusy(false);
    }
  };

  const navItems = [
    { to: '/admin', label: 'Overview', icon: '📊', testId: 'admin-nav-overview' },
    { to: '/admin/inventory', label: 'Inventory', icon: '🏷️', testId: 'admin-nav-inventory' },
    { to: '/admin/categories', label: 'Categories', icon: '🗂️', testId: 'admin-nav-categories' },
    { to: '/admin/pricing', label: 'Pricing Rules', icon: '₹', testId: 'admin-nav-pricing' },
    { to: '/admin/sales', label: 'Sales & Receipts', icon: '🧾', testId: 'admin-nav-sales' },
    { to: '/admin/settings', label: 'Settings & Reset', icon: '⚙️', testId: 'admin-nav-settings' },
  ];

  const isActive = (p: string) => (p === '/admin' ? loc.pathname === '/admin' : loc.pathname.startsWith(p));

  return (
    <div className="admin-outer">
      <DemoBanner />
      <div className="admin-layout">
        <aside className="admin-sidebar">
          <div className="admin-brand">
            <div className="brand-logo">RW</div>
            <div>
              <b>{settings?.store_name ?? 'ReWear Store'}</b>
              <div className="muted tiny">Admin Console · {user?.name}</div>
            </div>
          </div>

          <nav className="admin-nav">
            {navItems.map(it => (
              <Link
                key={it.to}
                to={it.to}
                data-testid={it.testId}
                className={`admin-nav-link ${isActive(it.to) ? 'active' : ''}`}
              >
                <span>{it.icon}</span>
                <span>{it.label}</span>
              </Link>
            ))}
          </nav>

          <div className="admin-sidebar-foot">
            <button
              type="button"
              data-testid="switch-to-employee"
              className="btn secondary full sm"
              disabled={busy}
              onClick={switchToEmployee}
            >
              📱 Switch to Employee POS
            </button>
            <div className="row between mt-xs">
              <button
                type="button"
                data-testid="admin-sidebar-reset"
                className="btn xs ghost"
                disabled={busy}
                onClick={() => setConfirmReset(true)}
              >
                ↺ Reset Demo Data
              </button>
              <button type="button" className="btn xs ghost" onClick={() => { logout(); nav('/login'); }}>
                Sign out
              </button>
            </div>
          </div>
        </aside>

        {confirmReset && (
          <Modal title="Restore Seeded Demo Dataset?" onClose={() => setConfirmReset(false)}>
            <p className="muted small">
              Restores the canonical 14 sample garments, 7 categories, 2 batches, and 3 completed demo sales.
            </p>
            <div className="row end gap mt-sm">
              <button type="button" className="btn ghost" onClick={() => setConfirmReset(false)}>Cancel</button>
              <button
                type="button"
                data-testid="admin-confirm-reset-btn"
                className="btn danger"
                disabled={busy}
                onClick={handleReset}
              >
                {busy ? 'Restoring…' : 'Restore Seeded Data'}
              </button>
            </div>
          </Modal>
        )}

        <div className="admin-content">
          <header className="admin-header">
            <h1>{title}</h1>
            <div className="row gap-xs center-v">
              <Tag kind="info">Admin View</Tag>
              <button
                type="button"
                className="btn xs secondary"
                disabled={busy}
                onClick={switchToEmployee}
              >
                📱 Open Employee Mobile
              </button>
            </div>
          </header>
          <main className="admin-main">{children}</main>
        </div>
      </div>
    </div>
  );
}

// 1. OVERVIEW SCREEN
export function AdminOverviewScreen() {
  const { money, dataVersion } = useApp();
  const [sum, setSum] = useState<DashboardSummary | null>(() => getCached<DashboardSummary>('/api/v1/dashboard/summary') ?? null);
  const [loading, setLoading] = useState(!sum);
  const [err, setErr] = useState('');
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);

  const load = async () => {
    if (!sum) setLoading(true);
    setErr('');
    try {
      setSum(await get<DashboardSummary>('/api/v1/dashboard/summary'));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [dataVersion]);

  return (
    <AdminShell title="Store Overview">
      {err && <ErrorBox message={err} onRetry={load} />}
      {loading && !sum ? <Spinner label="Loading dashboard metrics…" /> : sum && (
        <div className="stack">
          <div className="kpi-grid-4">
            <div className="kpi-card" data-testid="admin-kpi-sales-today">
              <span className="muted small">Demo Sales Today</span>
              <div className="kpi-val">{money(sum.sales_today.revenue)}</div>
              <span className="muted tiny">{sum.sales_today.count} completed sale(s) today</span>
            </div>
            <div className="kpi-card" data-testid="admin-kpi-items-sold">
              <span className="muted small">Items Sold Today</span>
              <div className="kpi-val">{sum.items_sold_today}</div>
              <span className="muted tiny">{sum.sold_total} total sold all-time</span>
            </div>
            <div className="kpi-card" data-testid="admin-kpi-available-stock">
              <span className="muted small">Available Stock</span>
              <div className="kpi-val" data-testid="admin-available-count">{sum.available_stock.count}</div>
              <span className="muted tiny">Stock value: {money(sum.available_stock.value)}</span>
            </div>
            <div className="kpi-card" data-testid="admin-kpi-total-revenue">
              <span className="muted small">All-Time Demo Revenue</span>
              <div className="kpi-val">{money(sum.revenue_all_time)}</div>
              <span className="muted tiny">{sum.total_garments} total registered garments</span>
            </div>
          </div>

          <div className="admin-grid-2">
            <div className="card">
              <div className="row between center-v mb-sm">
                <h3>Category Stock Distribution</h3>
                <Link to="/admin/categories" className="link small">Manage taxonomy →</Link>
              </div>
              <table className="table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Group</th>
                    <th className="num">Available</th>
                    <th className="num">Sold</th>
                    <th className="num">Stock Value</th>
                  </tr>
                </thead>
                <tbody>
                  {sum.category_distribution.map(row => (
                    <tr key={row.category_id}>
                      <td><b>{row.name}</b></td>
                      <td className="muted">{row.parent || '—'}</td>
                      <td className="num"><Tag kind={row.available > 0 ? 'ok' : 'muted'}>{row.available}</Tag></td>
                      <td className="num">{row.sold}</td>
                      <td className="num"><b>{money(row.stock_value)}</b></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="card">
              <div className="row between center-v mb-sm">
                <h3>Recent Demo Sales</h3>
                <Link to="/admin/sales" className="link small">All sales →</Link>
              </div>
              {(!sum.recent_sales || sum.recent_sales.length === 0) ? <Empty title="No sales yet" /> : (
                <table className="table" data-testid="admin-recent-sales-table">
                  <thead>
                    <tr>
                      <th>Sale #</th>
                      <th>Items</th>
                      <th>Method</th>
                      <th className="num">Total</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sum.recent_sales.map(s => (
                      <tr key={s.id} data-testid={`admin-sale-row-${s.number}`}>
                        <td><b>{s.number}</b><div className="muted tiny">{timeAgo(s.completed_at || s.created_at)}</div></td>
                        <td>{s.items.length} item(s)</td>
                        <td><Tag kind="info">{s.payment_method.toUpperCase()}</Tag></td>
                        <td className="num"><b>{money(s.total)}</b></td>
                        <td className="num">
                          <button className="btn xs ghost" onClick={() => setSelectedSale(s)}>Receipt</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="card">
            <h3>Recent Store Audit Events</h3>
            <div className="event-list mt-xs">
              {sum.recent_activity.map(ev => (
                <div key={ev.id} className="event-item">
                  <span className="event-dot" />
                  <div className="grow row between">
                    <span>{ev.description}</span>
                    <span className="muted tiny">{fmtDate(ev.timestamp)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {selectedSale && (
            <Modal title={`Sale Receipt ${selectedSale.number}`} onClose={() => setSelectedSale(null)}>
              <div className="stack-sm">
                <div className="row between">
                  <span className="muted small">{selectedSale.store_name} · {selectedSale.branch_name}</span>
                  <Tag kind="info">{selectedSale.payment_method.toUpperCase()}</Tag>
                </div>
                <table className="table compact">
                  <thead><tr><th>Barcode</th><th>Description</th><th className="num">Price</th></tr></thead>
                  <tbody>
                    {selectedSale.items.map(it => (
                      <tr key={it.garment_id}>
                        <td><code>{it.barcode}</code></td>
                        <td>{it.description}</td>
                        <td className="num">{money(it.price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="bill-box">
                  <div className="row between"><span>Subtotal</span><span>{money(selectedSale.subtotal)}</span></div>
                  {selectedSale.discount > 0 && <div className="row between"><span>Discount</span><span>− {money(selectedSale.discount)}</span></div>}
                  <div className="row between"><span>{selectedSale.tax_label} ({selectedSale.tax_rate}%)</span><span>{money(selectedSale.tax)}</span></div>
                  <div className="row between bill-total"><b>Total</b><b>{money(selectedSale.total)}</b></div>
                </div>
              </div>
            </Modal>
          )}
        </div>
      )}
    </AdminShell>
  );
}

// 2. ADMIN INVENTORY SCREEN
export function AdminInventoryScreen() {
  const { categories, money, catName, dataVersion } = useApp();
  const [items, setItems] = useState<Garment[]>(() => getCached<{ items: Garment[] }>('/api/v1/garments?')?.items ?? []);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [categoryId, setCategoryId] = useState('');
  const [loading, setLoading] = useState(items.length === 0);
  const [selected, setSelected] = useState<Garment | null>(null);
  const [labelGarment, setLabelGarment] = useState<Garment | null>(null);

  const load = async () => {
    if (items.length === 0) setLoading(true);
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (status !== 'all') params.set('status', status);
    if (categoryId) params.set('category_id', categoryId);
    const r = await get<{ items: Garment[] }>(`/api/v1/garments?${params.toString()}`);
    setItems(r.items);
    setLoading(false);
  };

  useEffect(() => { load(); }, [status, categoryId, dataVersion]);

  useEffect(() => {
    const t = setTimeout(() => { load(); }, 150);
    return () => clearTimeout(t);
  }, [q]);

  const openDetail = async (id: string) => {
    const g = await get<Garment>(`/api/v1/garments/${id}`);
    setSelected(g);
  };

  return (
    <AdminShell title="Inventory Management">
      <div className="stack">
        <div className="card row between wrap gap">
          <form onSubmit={e => { e.preventDefault(); load(); }} className="row gap-xs grow">
            <input
              data-testid="admin-inv-search"
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Filter by barcode, category, brand, colour…"
              className="grow"
            />
            <button type="submit" className="btn primary">Filter</button>
          </form>
          <div className="row gap-xs">
            <select value={status} onChange={e => setStatus(e.target.value)}>
              <option value="all">All statuses</option>
              <option value="available">Available</option>
              <option value="sold">Sold</option>
            </select>
            <select value={categoryId} onChange={e => setCategoryId(e.target.value)}>
              <option value="">All categories</option>
              {categories.filter(c => c.is_leaf).map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="card">
          {loading ? <Spinner label="Loading inventory table…" /> : items.length === 0 ? (
            <Empty title="No garments match filters" />
          ) : (
            <table className="table" data-testid="admin-inventory-table">
              <thead>
                <tr>
                  <th>Photo</th>
                  <th>Barcode</th>
                  <th>Category</th>
                  <th>Attributes</th>
                  <th>Batch</th>
                  <th>Price Source</th>
                  <th className="num">Price</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map(g => (
                  <tr key={g.id} data-testid={`admin-inv-row-${g.barcode}`}>
                    <td><img src={g.image_url} alt={g.description} className="thumb-sm" /></td>
                    <td><code>{g.barcode}</code></td>
                    <td><b>{g.category_name}</b></td>
                    <td className="muted small">
                      {[g.attributes.size, g.attributes.color, g.attributes.brand].filter(Boolean).join(' · ') || '—'}
                    </td>
                    <td className="muted small">{g.batch_name}</td>
                    <td><PriceSourceTag source={g.price_source} /></td>
                    <td className="num"><b>{money(g.price)}</b></td>
                    <td><StatusTag status={g.status} /></td>
                    <td className="num">
                      <div className="row gap-xs end">
                        <button className="btn xs ghost" onClick={() => setLabelGarment(g)}>Label</button>
                        <button className="btn xs secondary" onClick={() => openDetail(g.id)}>Inspect</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {selected && (
          <Modal title={`Garment ${selected.barcode}`} onClose={() => setSelected(null)} wide>
            <div className="stack-sm">
              <div className="row gap center-v">
                <img src={selected.image_url} alt={selected.description} className="detail-img" />
                <div className="grow">
                  <div className="row gap-xs">
                    <StatusTag status={selected.status} />
                    <PriceSourceTag source={selected.price_source} />
                  </div>
                  <h3 className="mt-xs">{selected.description}</h3>
                  <div className="price-xl">{money(selected.price)}</div>
                  <div className="muted small">Batch: {selected.batch_name} · Registered by {selected.created_by_name}</div>
                </div>
                <Barcode code={selected.barcode} height={60} />
              </div>

              {selected.ai && (
                <div className="ai-notice">
                  AI Suggested: <b data-testid="admin-detail-ai-suggested">{selected.ai.suggested_name || catName(selected.ai.suggested)}</b> ({Math.round(selected.ai.confidence * 100)}% est., {selected.ai.source}) —{' '}
                  <b>{selected.ai.accepted ? 'Accepted by employee' : 'Corrected by employee'}</b>
                </div>
              )}

              <h4>Audit History</h4>
              <div className="event-list">
                {(selected.events ?? []).map(ev => (
                  <div key={ev.id} className="event-item">
                    <span className="event-dot" />
                    <div className="grow row between">
                      <span>{ev.description}</span>
                      <span className="muted tiny">{fmtDate(ev.timestamp)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Modal>
        )}

        {labelGarment && <LabelPreviewModal garment={labelGarment} onClose={() => setLabelGarment(null)} />}
      </div>
    </AdminShell>
  );
}

// 3. ADMIN CATEGORIES SCREEN
export function AdminCategoriesScreen() {
  const { categories, refreshMeta, money, toast } = useApp();
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState('tops');
  const [defaultPrice, setDefaultPrice] = useState('499');
  const [subcats, setSubcats] = useState('');
  const [saving, setSaving] = useState(false);

  const parents = categories.filter(c => !c.parent_id && !c.is_leaf);
  const leaves = categories.filter(c => c.is_leaf);

  const toggleActive = async (c: Category) => {
    try {
      await put(`/api/v1/categories/${c.id}`, { active: !c.active });
      await refreshMeta();
      toast(`${c.name} ${!c.active ? 'activated' : 'deactivated'}`);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const createCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await post('/api/v1/categories', {
        name: name.trim(),
        parent_id: parentId,
        default_price: Number(defaultPrice) || 0,
        subcategories: subcats.split(',').map(s => s.trim()).filter(Boolean),
      });
      await refreshMeta();
      setName('');
      setSubcats('');
      toast('Category added to store taxonomy');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminShell title="Category Taxonomy">
      <div className="admin-grid-2">
        <div className="card">
          <h3>Approved Garment Categories</h3>
          <p className="muted small">AI classification only recommends active leaf categories from this approved store taxonomy.</p>
          <table className="table mt-sm" data-testid="admin-categories-table">
            <thead>
              <tr>
                <th>Category</th>
                <th>Parent Group</th>
                <th>Subcategories</th>
                <th className="num">Default Price</th>
                <th className="num">In Stock</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {leaves.map(c => (
                <tr key={c.id}>
                  <td><b>{c.name}</b><div className="muted tiny"><code>{c.id}</code></div></td>
                  <td>{parents.find(p => p.id === c.parent_id)?.name ?? '—'}</td>
                  <td className="muted small">{(c.subcategories ?? []).join(', ') || '—'}</td>
                  <td className="num"><b>{money(c.default_price)}</b></td>
                  <td className="num">{c.available_count}</td>
                  <td>
                    <button
                      type="button"
                      data-testid={`toggle-cat-${c.id}`}
                      className={`btn xs ${c.active ? 'secondary' : 'ghost'}`}
                      onClick={() => toggleActive(c)}
                    >
                      {c.active ? '✓ Active' : 'Inactive'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <form onSubmit={createCategory} className="card">
          <h3>Add Demo Category</h3>
          <div className="stack-sm mt-xs">
            <label className="field">
              <span>Category Name *</span>
              <input
                data-testid="new-cat-name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Sweater"
              />
            </label>
            <label className="field">
              <span>Parent Group</span>
              <select value={parentId} onChange={e => setParentId(e.target.value)}>
                {parents.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Default Category Price</span>
              <input
                data-testid="new-cat-price"
                type="number"
                min="0"
                value={defaultPrice}
                onChange={e => setDefaultPrice(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Subcategories (comma-separated)</span>
              <input
                value={subcats}
                onChange={e => setSubcats(e.target.value)}
                placeholder="Cardigan, Pullover, Knit"
              />
            </label>
            <button type="submit" data-testid="create-cat-btn" className="btn primary" disabled={saving || !name.trim()}>
              {saving ? 'Adding…' : '+ Add Category'}
            </button>
          </div>
        </form>
      </div>
    </AdminShell>
  );
}

// 4. ADMIN PRICING SCREEN
export function AdminPricingScreen() {
  const { categories, refreshMeta, money, toast, dataVersion } = useApp();
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [batches, setBatches] = useState<Batch[]>([]);

  useEffect(() => {
    setEdits({});
    get<{ batches: Batch[] }>('/api/v1/batches').then(r => setBatches(r.batches));
  }, [dataVersion]);

  const savePrice = async (c: Category) => {
    const raw = edits[c.id];
    if (raw === undefined) return;
    const val = Number(raw);
    if (Number.isNaN(val) || val < 0) {
      toast('Enter a valid price', 'error');
      return;
    }
    try {
      await put(`/api/v1/categories/${c.id}`, { default_price: val });
      await refreshMeta();
      toast(`Updated ${c.name} default price to ${money(val)} (existing garments keep their committed price)`);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  return (
    <AdminShell title="Pricing Configuration & Rules">
      <div className="stack">
        <div className="card">
          <h3>How Prototype Pricing Works (SRS §9)</h3>
          <div className="kpi-grid-3 mt-sm">
            <div className="rule-box">
              <PriceSourceTag source="category" />
              <p className="muted small mt-xs">
                <b>1. Category Default</b> — Admin sets a default price per garment category below. New items inherit it automatically.
              </p>
            </div>
            <div className="rule-box">
              <PriceSourceTag source="batch" />
              <p className="muted small mt-xs">
                <b>2. Batch Default</b> — Employee enters a default price for a registration batch; items in that batch inherit it unless overridden.
              </p>
            </div>
            <div className="rule-box">
              <PriceSourceTag source="individual" />
              <p className="muted small mt-xs">
                <b>3. Individual Override</b> — Employee overrides the price for one specific garment. Saved garments keep a committed snapshot price.
              </p>
            </div>
          </div>
        </div>

        <div className="admin-grid-2">
          <div className="card">
            <h3>Category Default Price List</h3>
            <p className="muted small">Editing a default price affects newly registered garments; previously saved garments retain their snapshot price.</p>
            <table className="table mt-sm">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Current Default</th>
                  <th>New Default Price</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {categories.filter(c => c.is_leaf).map(c => (
                  <tr key={c.id}>
                    <td><b>{c.name}</b></td>
                    <td><b>{money(c.default_price)}</b></td>
                    <td>
                      <input
                        data-testid={`edit-cat-price-${c.id}`}
                        type="number"
                        min="0"
                        className="input-sm"
                        value={edits[c.id] ?? String(c.default_price)}
                        onChange={e => setEdits(prev => ({ ...prev, [c.id]: e.target.value }))}
                      />
                    </td>
                    <td className="num">
                      <button
                        type="button"
                        data-testid={`save-cat-price-${c.id}`}
                        className="btn xs primary"
                        onClick={() => savePrice(c)}
                      >
                        Save
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h3>Registration Batches</h3>
            <table className="table mt-sm">
              <thead>
                <tr>
                  <th>Batch</th>
                  <th>Reference</th>
                  <th>Batch Default</th>
                  <th className="num">Garments</th>
                </tr>
              </thead>
              <tbody>
                {batches.map(b => (
                  <tr key={b.id}>
                    <td><b>{b.name}</b></td>
                    <td className="muted">{b.reference || '—'}</td>
                    <td>{b.default_price != null ? <Tag kind="info">{money(b.default_price)}</Tag> : <Tag kind="muted">Category default</Tag>}</td>
                    <td className="num">{b.garment_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}

// 5. ADMIN SALES SCREEN
export function AdminSalesScreen() {
  const { money, dataVersion } = useApp();
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Sale | null>(null);

  useEffect(() => {
    setLoading(true);
    get<{ sales: Sale[] }>('/api/v1/sales')
      .then(r => setSales(r.sales))
      .finally(() => setLoading(false));
  }, [dataVersion]);

  return (
    <AdminShell title="Demo Sales & Receipts">
      <div className="card">
        {loading ? <Spinner label="Loading sales…" /> : sales.length === 0 ? (
          <Empty title="No completed sales" />
        ) : (
          <table className="table" data-testid="admin-sales-table">
            <thead>
              <tr>
                <th>Sale #</th>
                <th>Completed At</th>
                <th>Cashier</th>
                <th>Customer</th>
                <th>Items</th>
                <th>Payment</th>
                <th className="num">Subtotal</th>
                <th className="num">Tax</th>
                <th className="num">Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sales.map(s => (
                <tr key={s.id} data-testid={`sales-row-${s.number}`}>
                  <td><b>{s.number}</b></td>
                  <td className="muted small">{fmtDate(s.completed_at || s.created_at)}</td>
                  <td>{s.created_by_name}</td>
                  <td className="muted small">{s.customer_name || 'Walk-in'}</td>
                  <td>{s.items.map(i => i.barcode).join(', ')}</td>
                  <td><Tag kind="info">{s.payment_method.toUpperCase()}</Tag></td>
                  <td className="num">{money(s.subtotal)}</td>
                  <td className="num">{money(s.tax)}</td>
                  <td className="num"><b>{money(s.total)}</b></td>
                  <td className="num">
                    <button className="btn xs secondary" onClick={() => setSelected(s)}>View Receipt</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selected && (
        <Modal title={`Receipt ${selected.number}`} onClose={() => setSelected(null)}>
          <div className="stack-sm">
            <div className="row between">
              <div>
                <b>{selected.store_name}</b>
                <div className="muted tiny">{fmtDate(selected.completed_at || selected.created_at)}</div>
              </div>
              <Tag kind="ok">{selected.payment_method.toUpperCase()}</Tag>
            </div>
            <table className="table compact">
              <thead><tr><th>Barcode</th><th>Item</th><th className="num">Price</th></tr></thead>
              <tbody>
                {selected.items.map(it => (
                  <tr key={it.garment_id}>
                    <td><code>{it.barcode}</code></td>
                    <td>{it.description}</td>
                    <td className="num">{money(it.price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="bill-box">
              <div className="row between"><span>Subtotal</span><span>{money(selected.subtotal)}</span></div>
              {selected.discount > 0 && <div className="row between"><span>Discount</span><span>− {money(selected.discount)}</span></div>}
              <div className="row between"><span>{selected.tax_label} ({selected.tax_rate}%)</span><span>{money(selected.tax)}</span></div>
              <div className="row between bill-total"><b>Total</b><b>{money(selected.total)}</b></div>
            </div>
          </div>
        </Modal>
      )}
    </AdminShell>
  );
}

// 6. ADMIN SETTINGS & RESET SCREEN
export function AdminSettingsScreen() {
  const { settings, branchName: initialBranchName, refreshMeta, bumpDataVersion, aiMode, toast } = useApp();
  const [storeName, setStoreName] = useState(settings?.store_name ?? '');
  const [branchName, setBranchName] = useState(initialBranchName);
  const [currency, setCurrency] = useState(settings?.currency ?? 'INR');
  const [symbol, setSymbol] = useState(settings?.currency_symbol ?? '₹');
  const [taxEnabled, setTaxEnabled] = useState(settings?.tax_enabled ?? true);
  const [taxRate, setTaxRate] = useState(String(settings?.tax_rate ?? 5));
  const [showPriceOnLabel, setShowPriceOnLabel] = useState(settings?.show_price_on_label ?? true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    if (settings) {
      setStoreName(settings.store_name);
      setBranchName(initialBranchName);
      setCurrency(settings.currency);
      setSymbol(settings.currency_symbol);
      setTaxEnabled(settings.tax_enabled);
      setTaxRate(String(settings.tax_rate));
      setShowPriceOnLabel(settings.show_price_on_label);
    }
  }, [settings, initialBranchName]);

  const saveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await put('/api/v1/settings', {
        store_name: storeName,
        branch_name: branchName,
        currency,
        currency_symbol: symbol,
        tax_enabled: taxEnabled,
        tax_rate: Number(taxRate) || 0,
        show_price_on_label: showPriceOnLabel,
      });
      await refreshMeta();
      toast('Demo settings saved');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const resetDemoData = async () => {
    setResetting(true);
    try {
      await post('/api/v1/demo/reset');
      await refreshMeta();
      bumpDataVersion();
      toast('Demo data restored to original seeded state');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setResetting(false);
    }
  };

  return (
    <AdminShell title="Demo Settings & Reset">
      <div className="admin-grid-2">
        <form onSubmit={saveSettings} className="card">
          <h3>Store, Currency &amp; Tax Settings</h3>
          <div className="stack-sm mt-xs">
            <label className="field">
              <span>Store Name</span>
              <input data-testid="settings-store-name" value={storeName} onChange={e => setStoreName(e.target.value)} />
            </label>
            <label className="field">
              <span>Demo Branch Name</span>
              <input value={branchName} onChange={e => setBranchName(e.target.value)} />
            </label>
            <div className="grid-2">
              <label className="field">
                <span>Currency Code</span>
                <input value={currency} onChange={e => setCurrency(e.target.value)} />
              </label>
              <label className="field">
                <span>Currency Symbol</span>
                <input value={symbol} onChange={e => setSymbol(e.target.value)} />
              </label>
            </div>
            <div className="grid-2">
              <label className="field row gap-xs center-v">
                <input
                  data-testid="settings-tax-toggle"
                  type="checkbox"
                  checked={taxEnabled}
                  onChange={e => setTaxEnabled(e.target.checked)}
                />
                <span>Enable Tax ({settings?.tax_label ?? 'GST'})</span>
              </label>
              <label className="field">
                <span>Tax Rate (%)</span>
                <input
                  type="number"
                  min="0"
                  max="50"
                  step="0.5"
                  value={taxRate}
                  onChange={e => setTaxRate(e.target.value)}
                />
              </label>
            </div>
            <label className="field row gap-xs center-v">
              <input
                type="checkbox"
                checked={showPriceOnLabel}
                onChange={e => setShowPriceOnLabel(e.target.checked)}
              />
              <span>Print price on barcode sticker preview</span>
            </label>
            <button type="submit" data-testid="save-settings-btn" className="btn primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save Demo Settings'}
            </button>
          </div>
        </form>

        <div className="stack">
          <div className="card">
            <h3>Reset Demo Dataset (PT-012)</h3>
            <p className="muted small">
              Restores the canonical seeded dataset (14 garments across 7 categories, 2 batches, 3 completed sales, default category prices, and store settings) so the pitch can run repeatedly without manual database repair.
            </p>
            <button
              type="button"
              data-testid="settings-reset-demo-btn"
              className="btn danger mt-sm"
              disabled={resetting}
              onClick={resetDemoData}
            >
              {resetting ? 'Restoring Seeded Data…' : '↺ Restore Seeded Demo Data Now'}
            </button>
          </div>

          <div className="card">
            <h3>Pitch Disclosure Summary (PT-013)</h3>
            <ul className="disclosure-list muted small">
              <li><b>AI Mode:</b> <code>{aiMode}</code> — suggestions are model estimates, not guarantees; employee always has final control.</li>
              <li><b>Barcode &amp; Printing:</b> Real Code 128 symbols generated per garment; physical sticker printing is simulated via preview &amp; system print dialog.</li>
              <li><b>Checkout &amp; Payments:</b> Real inventory status transitions (available → sold); payment capture is simulated.</li>
              <li><b>Data Safety:</b> 100% synthetic garment illustrations and sample records; no customer personal data.</li>
            </ul>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
