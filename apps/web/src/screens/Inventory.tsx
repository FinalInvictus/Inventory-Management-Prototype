import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../context';
import {
  Barcode,
  CameraScanner,
  Empty,
  ErrorBox,
  fmtDate,
  LabelPreviewModal,
  PriceSourceTag,
  scanSupported,
  Spinner,
  StatusTag,
  Tag,
} from '../components/ui';
import { get } from '../api';
import { MobileShell } from './MobileHome';
import type { Garment } from '../types';

export function InventoryScreen() {
  const { categories, money } = useApp();
  const nav = useNavigate();

  const [items, setItems] = useState<Garment[]>([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'all' | 'available' | 'sold'>('all');
  const [categoryId, setCategoryId] = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [scanOpen, setScanOpen] = useState(false);

  const load = async (query = q, st = status, cat = categoryId) => {
    setLoading(true);
    setErr('');
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set('q', query.trim());
      if (st !== 'all') params.set('status', st);
      if (cat) params.set('category_id', cat);
      const r = await get<{ items: Garment[] }>(`/api/v1/garments?${params.toString()}`);
      setItems(r.items);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(q, status, categoryId);
  }, [status, categoryId]);

  const onSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    load(q, status, categoryId);
  };

  const handleScanCode = async (code: string) => {
    setScanOpen(false);
    setQ(code);
    try {
      const g = await get<Garment>(`/api/v1/barcodes/${encodeURIComponent(code)}`);
      nav(`/m/inventory/${g.id}`);
    } catch {
      load(code, status, categoryId);
    }
  };

  return (
    <MobileShell title="Inventory">
      <div className="stack">
        <div className="card">
          <form onSubmit={onSearchSubmit} className="row gap-xs">
            <input
              data-testid="inventory-search-input"
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search code (GM-…), category, brand, colour…"
              className="grow"
            />
            <button type="submit" data-testid="inventory-search-btn" className="btn primary">
              Search
            </button>
            {scanSupported() && (
              <button type="button" className="btn secondary" onClick={() => setScanOpen(true)} title="Scan barcode">
                📷
              </button>
            )}
          </form>

          <div className="row between wrap gap-xs mt-sm">
            <div className="row gap-xs">
              {(['all', 'available', 'sold'] as const).map(st => (
                <button
                  key={st}
                  type="button"
                  data-testid={`filter-status-${st}`}
                  className={`chip ${status === st ? 'selected' : ''}`}
                  onClick={() => setStatus(st)}
                >
                  {st === 'all' ? 'All' : st === 'available' ? 'Available' : 'Sold'}
                </button>
              ))}
            </div>
            <select
              data-testid="filter-category"
              value={categoryId}
              onChange={e => setCategoryId(e.target.value)}
              className="select-sm"
            >
              <option value="">All categories</option>
              {categories.filter(c => c.is_leaf).map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        {err && <ErrorBox message={err} onRetry={() => load()} />}
        {loading ? <Spinner label="Loading inventory…" /> : items.length === 0 ? (
          <Empty title="No matching garments">Try clearing filters or registering a new garment.</Empty>
        ) : (
          <div className="garment-list" data-testid="inventory-list">
            {items.map(g => (
              <Link
                to={`/m/inventory/${g.id}`}
                key={g.id}
                data-testid={`inventory-card-${g.barcode}`}
                className="card garment-card"
              >
                <img src={g.image_url} alt={g.description} className="thumb-lg" />
                <div className="grow">
                  <div className="row between center-v">
                    <b>{g.category_name}</b>
                    <b className="price-lg">{money(g.price)}</b>
                  </div>
                  <div className="muted small">{g.description}</div>
                  <div className="row between center-v mt-xs wrap gap-xs">
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

        {scanOpen && <CameraScanner onCode={handleScanCode} onClose={() => setScanOpen(false)} />}
      </div>
    </MobileShell>
  );
}

export function ItemDetailScreen() {
  const { id } = useParams<{ id: string }>();
  const { money } = useApp();
  const nav = useNavigate();

  const [garment, setGarment] = useState<Garment | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [showLabel, setShowLabel] = useState(false);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    setErr('');
    try {
      const g = await get<Garment>(`/api/v1/garments/${id}`);
      setGarment(g);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  return (
    <MobileShell title={garment?.barcode ?? 'Garment Detail'} backTo="/m/inventory">
      <div className="stack">
        {err && <ErrorBox message={err} onRetry={load} />}
        {loading ? <Spinner label="Loading garment…" /> : garment && (
          <>
            <div className="card" data-testid="item-detail-card">
              <div className="row gap center-v">
                <img src={garment.image_url} alt={garment.description} className="detail-img" />
                <div className="grow">
                  <div className="row between center-v">
                    <StatusTag status={garment.status} />
                    <PriceSourceTag source={garment.price_source} />
                  </div>
                  <h2 className="mt-xs">{garment.category_name}</h2>
                  <div className="price-xl">{money(garment.price)}</div>
                  <div className="muted small mt-xs">Batch: {garment.batch_name}</div>
                </div>
              </div>

              <div className="barcode-box mt-sm">
                <Barcode code={garment.barcode} height={68} />
              </div>

              <div className="row gap mt-sm">
                <button
                  type="button"
                  data-testid="detail-preview-label-btn"
                  className="btn secondary grow"
                  onClick={() => setShowLabel(true)}
                >
                  🏷️ Preview Label / Print
                </button>
                {garment.status === 'available' && (
                  <button
                    type="button"
                    data-testid="detail-add-to-checkout-btn"
                    className="btn primary grow"
                    onClick={() => nav(`/m/checkout?code=${encodeURIComponent(garment.barcode)}`)}
                  >
                    🛒 Add to Checkout
                  </button>
                )}
              </div>
            </div>

            <div className="card">
              <h3>Attributes &amp; Provenance</h3>
              <div className="kv-grid mt-xs">
                <div><span className="muted tiny">Garment Code</span><div><code>{garment.barcode}</code></div></div>
                <div><span className="muted tiny">Category</span><div>{garment.category_name}</div></div>
                <div><span className="muted tiny">Size</span><div>{garment.attributes.size || '—'}</div></div>
                <div><span className="muted tiny">Colour</span><div>{garment.attributes.color || '—'}</div></div>
                <div><span className="muted tiny">Brand</span><div>{garment.attributes.brand || '—'}</div></div>
                <div><span className="muted tiny">Subcategory</span><div>{garment.attributes.subcategory || '—'}</div></div>
                <div><span className="muted tiny">Registered By</span><div>{garment.created_by_name}</div></div>
                <div><span className="muted tiny">Created At</span><div>{fmtDate(garment.created_at)}</div></div>
              </div>
              {garment.attributes.notes && (
                <div className="mt-xs muted small">Notes: {garment.attributes.notes}</div>
              )}
              {garment.ai && (
                <div className="mt-sm pt-sm border-top row between center-v">
                  <span className="muted small">
                    AI Suggestion: <b>{garment.ai.suggested}</b> ({Math.round(garment.ai.confidence * 100)}% est. · {garment.ai.source})
                  </span>
                  <Tag kind={garment.ai.accepted ? 'ok' : 'warn'}>
                    {garment.ai.accepted ? 'Accepted' : 'Employee Corrected'}
                  </Tag>
                </div>
              )}
            </div>

            <div className="card">
              <h3>Demo Event History</h3>
              <div className="event-list mt-xs">
                {(garment.events ?? []).map(ev => (
                  <div key={ev.id} className="event-item">
                    <span className="event-dot" />
                    <div className="grow">
                      <div>{ev.description}</div>
                      <div className="muted tiny">{fmtDate(ev.timestamp)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {showLabel && <LabelPreviewModal garment={garment} onClose={() => setShowLabel(false)} />}
          </>
        )}
      </div>
    </MobileShell>
  );
}
