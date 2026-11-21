import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../context';
import { DemoBanner, Empty, ErrorBox, PriceSourceTag, Spinner, StatusTag, Tag, timeAgo } from '../components/ui';
import { get, post } from '../api';
import type { DashboardSummary, Garment } from '../types';

export function MobileShell({ children, title, backTo }: { children: React.ReactNode; title?: string; backTo?: string }) {
  const { user, login, logout, settings, toast } = useApp();
  const loc = useLocation();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);

  const switchRole = async (role: 'employee' | 'admin') => {
    setBusy(true);
    try {
      const u = await login({ role });
      toast(`Switched to ${u.name} (${u.role})`);
      nav(role === 'admin' ? '/admin' : '/m');
    } finally {
      setBusy(false);
    }
  };

  const resetDemo = async () => {
    if (!window.confirm('Restore seeded demo inventory, categories and sales?')) return;
    setBusy(true);
    try {
      await post('/api/v1/demo/reset');
      toast('Demo data reset to seeded state');
      nav('/m');
      window.location.reload();
    } finally {
      setBusy(false);
    }
  };

  const tab = (p: string) => loc.pathname === p || (p !== '/m' && loc.pathname.startsWith(p));

  return (
    <div className="mobile-outer">
      <DemoBanner />
      <header className="m-topbar">
        <div className="row gap-sm center-v">
          {backTo ? (
            <button className="icon-btn" aria-label="Back" onClick={() => nav(backTo)}>←</button>
          ) : (
            <div className="brand-pill">RW</div>
          )}
          <div>
            <div className="m-title">{title || settings?.store_name || 'ReWear Store'}</div>
            <div className="m-sub">Employee Mobile · {user?.name} ({user?.role})</div>
          </div>
        </div>
        <div className="row gap-xs">
          <button
            className="btn xs ghost"
            data-testid="switch-to-admin"
            disabled={busy}
            onClick={() => switchRole('admin')}
            title="Switch to Admin Dashboard"
          >
            📊 Admin
          </button>
          <button className="btn xs ghost" data-testid="mobile-reset-btn" disabled={busy} onClick={resetDemo} title="Reset seeded demo data">
            ↺ Reset
          </button>
          <button className="btn xs ghost" onClick={() => { logout(); nav('/login'); }}>Exit</button>
        </div>
      </header>

      <main className="m-main">{children}</main>

      <nav className="m-tabbar" aria-label="Employee Navigation">
        <Link to="/m" className={`m-tab ${loc.pathname === '/m' ? 'active' : ''}`} data-testid="nav-home">
          <span className="m-tab-icon">🏠</span>
          <span>Home</span>
        </Link>
        <Link to="/m/add" className={`m-tab primary-tab ${tab('/m/add') ? 'active' : ''}`} data-testid="nav-add">
          <span className="m-tab-icon">📷</span>
          <span>Add Garment</span>
        </Link>
        <Link to="/m/inventory" className={`m-tab ${tab('/m/inventory') ? 'active' : ''}`} data-testid="nav-inventory">
          <span className="m-tab-icon">🏷️</span>
          <span>Inventory</span>
        </Link>
        <Link to="/m/checkout" className={`m-tab ${tab('/m/checkout') ? 'active' : ''}`} data-testid="nav-checkout">
          <span className="m-tab-icon">🛒</span>
          <span>Checkout</span>
        </Link>
      </nav>
    </div>
  );
}

export function MobileHomeScreen() {
  const { money, user } = useApp();
  const nav = useNavigate();
  const [sum, setSum] = useState<DashboardSummary | null>(null);
  const [recent, setRecent] = useState<Garment[]>([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setErr('');
    try {
      const [d, g] = await Promise.all([
        get<DashboardSummary>('/api/v1/dashboard/summary'),
        get<{ items: Garment[] }>('/api/v1/garments'),
      ]);
      setSum(d);
      setRecent(g.items.slice(0, 4));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <MobileShell>
      <div className="stack">
        <div className="hero-card">
          <div className="row between center-v">
            <div>
              <div className="eyebrow">STORE OPERATIONS</div>
              <h2>Hi, {user?.name.split(' ')[0]}</h2>
              <p className="muted small">Register incoming garments with AI category suggestions or scan tags at checkout.</p>
            </div>
            <Tag kind="ok">Demo Ready</Tag>
          </div>
          <div className="quick-actions">
            <button className="qa-primary" data-testid="qa-add-garment" onClick={() => nav('/m/add')}>
              <span className="qa-icon">📸</span>
              <div>
                <b>Add Garment</b>
                <span>Photo → AI suggestion → Price → Barcode</span>
              </div>
              <span className="qa-arrow">→</span>
            </button>
            <div className="grid-2">
              <button className="qa-secondary" data-testid="qa-inventory" onClick={() => nav('/m/inventory')}>
                <span>🏷️</span>
                <div>
                  <b>Inventory</b>
                  <span className="muted small">Search &amp; scan lookup</span>
                </div>
              </button>
              <button className="qa-secondary" data-testid="qa-checkout" onClick={() => nav('/m/checkout')}>
                <span>🛒</span>
                <div>
                  <b>Checkout</b>
                  <span className="muted small">Scan code &amp; bill</span>
                </div>
              </button>
            </div>
          </div>
        </div>

        {err && <ErrorBox message={err} onRetry={load} />}
        {loading && !sum ? <Spinner label="Loading store metrics…" /> : sum && (
          <>
            <div className="kpi-grid-3">
              <div className="kpi-mini" data-testid="home-available-stock">
                <span className="muted small">Available Stock</span>
                <b>{sum.available_stock.count}</b>
                <span className="muted tiny">{money(sum.available_stock.value)} value</span>
              </div>
              <div className="kpi-mini" data-testid="home-sales-today">
                <span className="muted small">Sales Today</span>
                <b>{sum.sales_today.count}</b>
                <span className="muted tiny">{sum.items_sold_today} items sold</span>
              </div>
              <div className="kpi-mini" data-testid="home-revenue-today">
                <span className="muted small">Today's Revenue</span>
                <b>{money(sum.sales_today.revenue)}</b>
                <span className="muted tiny">Demo totals</span>
              </div>
            </div>

            <div className="card">
              <div className="row between center-v mb-sm">
                <h3>Recently Registered Garments</h3>
                <Link to="/m/inventory" className="link small">View all ({sum.total_garments}) →</Link>
              </div>
              {recent.length === 0 ? <Empty title="No garments yet" /> : (
                <div className="garment-list">
                  {recent.map(g => (
                    <Link to={`/m/inventory/${g.id}`} key={g.id} className="garment-row">
                      <img src={g.image_url} alt={g.description} className="thumb" />
                      <div className="grow">
                        <div className="row between">
                          <b>{g.category_name}</b>
                          <b>{money(g.price)}</b>
                        </div>
                        <div className="row between center-v mt-xs">
                          <code className="code-pill">{g.barcode}</code>
                          <div className="row gap-xs">
                            <PriceSourceTag source={g.price_source} />
                            <StatusTag status={g.status} />
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <div className="card">
              <h3>Recent Activity</h3>
              <div className="event-list">
                {sum.recent_activity.slice(0, 5).map(ev => (
                  <div key={ev.id} className="event-item">
                    <span className="event-dot" />
                    <div className="grow">
                      <div>{ev.description}</div>
                      <div className="muted tiny">{timeAgo(ev.timestamp)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </MobileShell>
  );
}
