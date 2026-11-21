import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context';
import { DemoBanner, ErrorBox, Tag } from '../components/ui';
import { post } from '../api';

export function LoginScreen() {
  const { login, user, toast } = useApp();
  const nav = useNavigate();
  const [username, setUsername] = useState('employee');
  const [password, setPassword] = useState('demo123');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const quickLogin = async (role: 'employee' | 'admin') => {
    setErr('');
    setBusy(true);
    try {
      const u = await login({ role });
      toast(`Signed in as ${u.name} (${u.role})`);
      nav(u.role === 'admin' ? '/admin' : '/m');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const u = await login({ username, password });
      toast(`Signed in as ${u.name} (${u.role})`);
      nav(u.role === 'admin' ? '/admin' : '/m');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const resetDemo = async () => {
    setBusy(true);
    try {
      const u = await login({ role: 'admin' });
      await post('/api/v1/demo/reset');
      toast('Demo data restored to seeded state');
      nav(u.role === 'admin' ? '/admin' : '/m');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      <DemoBanner />
      <div className="login-wrap">
        <div className="login-card">
          <div className="brand-row">
            <div className="brand-logo">RW</div>
            <div>
              <div className="eyebrow">GARMENT MANAGEMENT &amp; RETAIL INVENTORY</div>
              <h1>ReWear Store Prototype</h1>
            </div>
          </div>
          <p className="muted">
            Demo environment using seeded sample data, deterministic AI category suggestions, Code 128 barcode generation, and simulated checkout &amp; label printing.
          </p>

          <div className="role-switcher">
            <div className="section-label">One-Click Demo Role Switcher</div>
            <div className="role-grid">
              <button
                type="button"
                data-testid="login-employee-btn"
                className="role-card"
                disabled={busy}
                onClick={() => quickLogin('employee')}
              >
                <div className="role-icon">📱</div>
                <div className="role-info">
                  <div className="row between">
                    <b>Employee (Mobile POS)</b>
                    <Tag kind="ok">Primary Pitch Flow</Tag>
                  </div>
                  <span className="muted small">Priya Sharma · Intake, AI category suggestion, pricing, barcode label, inventory &amp; checkout</span>
                </div>
              </button>

              <button
                type="button"
                data-testid="login-admin-btn"
                className="role-card"
                disabled={busy}
                onClick={() => quickLogin('admin')}
              >
                <div className="role-icon">📊</div>
                <div className="role-info">
                  <div className="row between">
                    <b>Admin (Store Dashboard)</b>
                    <Tag kind="info">Management View</Tag>
                  </div>
                  <span className="muted small">Arjun Mehta · KPIs, stock &amp; sales tables, category taxonomy, default prices &amp; demo reset</span>
                </div>
              </button>
            </div>
          </div>

          <form onSubmit={onSubmit} className="login-form">
            <div className="section-label">Or sign in with fixed demo credentials</div>
            {err && <ErrorBox message={err} />}
            <div className="grid-2">
              <label className="field">
                <span>Username</span>
                <input
                  data-testid="login-username"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="employee or admin"
                />
              </label>
              <label className="field">
                <span>Password</span>
                <input
                  data-testid="login-password"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="demo123"
                />
              </label>
            </div>
            <div className="row between wrap gap">
              <div className="muted small">
                Credentials: <code>employee / demo123</code> or <code>admin / admin123</code>
              </div>
              <div className="row gap">
                <button type="button" className="btn ghost sm" disabled={busy} onClick={resetDemo}>
                  ↺ Reset &amp; Open Admin
                </button>
                <button type="submit" data-testid="login-submit" className="btn primary" disabled={busy}>
                  {busy ? 'Signing in…' : 'Enter Demo Session →'}
                </button>
              </div>
            </div>
          </form>

          {user && (
            <div className="active-session-bar">
              <span>Active session: <b>{user.name}</b> ({user.role})</span>
              <div className="row gap">
                <button className="btn sm" onClick={() => nav('/m')}>Open Mobile View</button>
                <button className="btn sm" onClick={() => nav('/admin')}>Open Admin Dashboard</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
