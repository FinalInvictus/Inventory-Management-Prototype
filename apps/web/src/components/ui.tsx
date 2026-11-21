import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useApp } from '../context';
import type { Garment, PriceSource } from '../types';

export function DemoBanner() {
  const [open, setOpen] = useState(false);
  const { aiMode } = useApp();
  return (
    <>
      <div className="demo-banner" role="note">
        <span><b>DEMO ENVIRONMENT</b> · sample data · simulated payments &amp; printing</span>
        <button className="link" onClick={() => setOpen(true)}>What's real?</button>
      </div>
      {open && (
        <Modal title="What is real, mocked or deferred" onClose={() => setOpen(false)}>
          <table className="table compact">
            <thead><tr><th>Feature</th><th>Status in this prototype</th></tr></thead>
            <tbody>
              <tr><td>Garment records, barcodes, inventory, sales</td><td><Tag kind="ok">Real</Tag> stored by the Go demo API (resettable)</td></tr>
              <tr><td>Code 128 barcodes</td><td><Tag kind="ok">Real</Tag> scannable symbols, unique per garment</td></tr>
              <tr><td>AI category suggestion</td><td>{aiMode === 'vision_api'
                ? <><Tag kind="ok">Live sandbox API</Tag> for camera photos; sample images use mocked predictions</>
                : <><Tag kind="warn">Mocked</Tag> deterministic predictions for sample images; heuristic fallback for photos</>}
                <div className="muted small">No accuracy claim is made — accuracy will be measured on real store images.</div></td></tr>
              <tr><td>Pricing rules (category / batch / individual)</td><td><Tag kind="ok">Real</Tag> enforced by the backend</td></tr>
              <tr><td>Label printing</td><td><Tag kind="warn">Simulated</Tag> preview + system print dialog; no printer integrated</td></tr>
              <tr><td>Camera barcode scanning</td><td><Tag kind="info">Browser dependent</Tag> uses BarcodeDetector where supported; manual entry always available</td></tr>
              <tr><td>Payments</td><td><Tag kind="warn">Simulated</Tag> no gateway, no money is captured</td></tr>
              <tr><td>Login &amp; roles</td><td><Tag kind="warn">Demo only</Tag> fixed credentials / role switcher</td></tr>
              <tr><td>Offline sync, multi-branch, MFA, refunds, tax receipts</td><td><Tag kind="muted">Deferred</Tag> production roadmap</td></tr>
            </tbody>
          </table>
        </Modal>
      )}
    </>
  );
}

export function Modal({ title, children, onClose, wide }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-label={title} onClick={e => e.stopPropagation()}>
        <div className="modal-head"><h3>{title}</h3><button className="icon-btn" aria-label="Close" onClick={onClose}>✕</button></div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Tag({ kind = 'muted', children }: { kind?: 'ok' | 'warn' | 'info' | 'muted' | 'danger'; children: ReactNode }) {
  return <span className={`tag tag-${kind}`}>{children}</span>;
}

export function StatusTag({ status }: { status: string }) {
  return status === 'available' ? <Tag kind="ok">Available</Tag> : status === 'sold' ? <Tag kind="muted">Sold</Tag> : <Tag>{status}</Tag>;
}

const sourceLabel: Record<PriceSource, string> = { category: 'Category price', batch: 'Batch price', individual: 'Individual price' };
export function PriceSourceTag({ source }: { source: PriceSource }) {
  return <span className={`price-src src-${source}`}>{sourceLabel[source] ?? source}</span>;
}

export function Spinner({ label }: { label?: string }) {
  return <div className="spinner-wrap"><div className="spinner" />{label && <span>{label}</span>}</div>;
}

export function Empty({ icon = '📦', title, children }: { icon?: string; title: string; children?: ReactNode }) {
  return <div className="empty"><div className="empty-icon">{icon}</div><b>{title}</b>{children && <div className="muted">{children}</div>}</div>;
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div className="error-box"><span>⚠ {message}</span>{onRetry && <button className="btn sm" onClick={onRetry}>Retry</button>}</div>;
}

export function Barcode({ code, height = 64 }: { code: string; height?: number }) {
  return <img className="barcode-img" src={`/api/v1/barcodes/${encodeURIComponent(code)}/svg`} alt={`Barcode ${code}`} style={{ height }} />;
}

/** Physical sticker preview (SRS §10): store name, barcode, code, category, optional price. */
export function Label({ garment }: { garment: Garment }) {
  const { settings, money } = useApp();
  return (
    <div className="label" data-testid="label-preview" data-barcode={garment.barcode}>
      <div className="label-store">{settings?.store_name ?? 'Store'}</div>
      <img src={`/api/v1/barcodes/${encodeURIComponent(garment.barcode)}/svg?text=0`} alt={`Barcode ${garment.barcode}`} />
      <div className="label-code">{garment.barcode}</div>
      <div className="label-row">
        <span>{garment.category_name}{garment.attributes.size ? ` · ${garment.attributes.size}` : ''}</span>
        {settings?.show_price_on_label && <b>{money(garment.price)}</b>}
      </div>
    </div>
  );
}

export function LabelPreviewModal({ garment, onClose }: { garment: Garment; onClose: () => void }) {
  const print = () => {
    document.body.classList.add('printing-label');
    const done = () => { document.body.classList.remove('printing-label'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    window.print();
    setTimeout(done, 1500);
  };
  return (
    <Modal title="Label preview" onClose={onClose}>
      <p className="muted small">Approx. 50 × 30 mm thermal sticker. Printing uses the system print dialog (save as PDF supported) — no printer has been integrated in this prototype.</p>
      <div className="label-stage print-area"><Label garment={garment} /></div>
      <div className="row gap end">
        <button className="btn ghost" onClick={onClose}>Close</button>
        <button className="btn primary" onClick={print}>🖨 Demo print / Save PDF</button>
      </div>
    </Modal>
  );
}

declare global {
  interface Window { BarcodeDetector?: any }
}

export const scanSupported = () => typeof window !== 'undefined' && 'BarcodeDetector' in window && !!navigator.mediaDevices?.getUserMedia;

/** Camera barcode scanner using the BarcodeDetector API (where supported). */
export function CameraScanner({ onCode, onClose }: { onCode: (c: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let stream: MediaStream | null = null;
    let stop = false;
    (async () => {
      try {
        const formats = await window.BarcodeDetector.getSupportedFormats?.() ?? [];
        if (formats.length && !formats.includes('code_128')) throw new Error('This device cannot decode Code 128 barcodes.');
        const det = new window.BarcodeDetector({ formats: ['code_128'] });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (!video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        while (!stop) {
          const found = await det.detect(video.current).catch(() => []);
          if (found.length) { onCode(found[0].rawValue); return; }
          await new Promise(r => setTimeout(r, 250));
        }
      } catch (e) {
        setErr((e as Error).message || 'Camera unavailable');
      }
    })();
    return () => { stop = true; stream?.getTracks().forEach(t => t.stop()); };
  }, [onCode]);
  return (
    <Modal title="Scan garment barcode" onClose={onClose}>
      {err ? <ErrorBox message={`${err} Use manual entry instead.`} /> : (
        <div className="scanner"><video ref={video} muted playsInline /><div className="scan-line" /></div>
      )}
      <p className="muted small center">Point the camera at the label barcode.</p>
    </Modal>
  );
}

export function timeAgo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

export function fmtDate(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function Toasts() {
  const { toasts } = useApp();
  return <div className="toasts" aria-live="polite">{toasts.map(t => <div key={t.id} className={`toast toast-${t.kind}`}>{t.text}</div>)}</div>;
}

export const titleCase = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
