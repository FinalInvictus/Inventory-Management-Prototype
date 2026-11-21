import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { clearApiCache, get, post, setUnauthorizedHandler, tokenStore } from './api';
import type { Category, Settings, User } from './types';

interface Toast { id: number; kind: 'success' | 'error' | 'info'; text: string }

interface BootstrapPayload {
  user: User;
  settings: Settings;
  branch_name: string;
  ai_mode: string;
  categories: Category[];
}

interface AppCtx {
  user: User | null;
  ready: boolean;
  settings: Settings | null;
  branchName: string;
  categories: Category[];
  aiMode: string;
  dataVersion: number;
  bumpDataVersion: () => void;
  login: (u: { username?: string; password?: string; role?: string }) => Promise<User>;
  logout: () => void;
  refreshMeta: () => Promise<void>;
  money: (v: number | null | undefined) => string;
  catName: (id: string) => string;
  toast: (text: string, kind?: Toast['kind']) => void;
  toasts: Toast[];
}

const Ctx = createContext<AppCtx>(null as unknown as AppCtx);
export const useApp = () => useContext(Ctx);

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [branchName, setBranchName] = useState('Main Street Store');
  const [categories, setCategories] = useState<Category[]>([]);
  const [aiMode, setAiMode] = useState('demo_mock');
  const [dataVersion, setDataVersion] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  const bumpDataVersion = useCallback(() => {
    clearApiCache();
    setDataVersion(v => v + 1);
  }, []);

  const toast = useCallback((text: string, kind: Toast['kind'] = 'success') => {
    const id = ++seq.current;
    setToasts(t => [...t, { id, kind, text }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), kind === 'error' ? 4500 : 2600);
  }, []);

  const refreshMeta = useCallback(async () => {
    const b = await get<BootstrapPayload>('/api/v1/demo/bootstrap');
    setUser(b.user);
    setSettings(b.settings);
    if (b.branch_name) setBranchName(b.branch_name);
    setAiMode(b.ai_mode);
    setCategories(b.categories);
  }, []);

  const logout = useCallback(() => {
    post('/api/v1/demo/logout').catch(() => {});
    tokenStore.clear();
    clearApiCache();
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => { tokenStore.clear(); clearApiCache(); setUser(null); });
    if (!tokenStore.get()) { setReady(true); return; }
    refreshMeta()
      .catch(() => tokenStore.clear())
      .finally(() => setReady(true));
  }, [refreshMeta]);

  const login = useCallback(async (body: { username?: string; password?: string; role?: string }) => {
    const r = await post<{ token: string; user: User }>('/api/v1/demo/login', body);
    tokenStore.set(r.token);
    clearApiCache();
    await refreshMeta();
    return r.user;
  }, [refreshMeta]);

  const value = useMemo<AppCtx>(() => ({
    user, ready, settings, branchName, categories, aiMode, dataVersion, bumpDataVersion,
    login, logout, refreshMeta, toast, toasts,
    money: (v) => {
      if (v === null || v === undefined || Number.isNaN(v)) return '—';
      const sym = settings?.currency_symbol ?? '₹';
      return sym + v.toLocaleString('en-IN', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 });
    },
    catName: (id) => categories.find(c => c.id === id)?.name ?? id,
  }), [user, ready, settings, branchName, categories, aiMode, dataVersion, bumpDataVersion, login, logout, refreshMeta, toast, toasts]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
