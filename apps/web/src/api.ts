const TOKEN_KEY = 'gm_demo_token';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

let onUnauthorized: () => void = () => {};
export function setUnauthorizedHandler(fn: () => void) { onUnauthorized = fn; }

// Fast in-memory GET cache for instant stale-while-revalidate screen transitions
const getCache = new Map<string, { data: unknown; ts: number }>();

export function clearApiCache() {
  getCache.clear();
}

export function getCached<T>(path: string): T | undefined {
  const entry = getCache.get(path);
  return entry ? (entry.data as T) : undefined;
}

interface Opts { signal?: AbortSignal; raw?: BodyInit; contentType?: string }

export async function api<T = unknown>(method: string, path: string, body?: unknown, opts: Opts = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const tok = tokenStore.get();
  if (tok) headers.Authorization = `Bearer ${tok}`;
  let payload: BodyInit | undefined;
  if (opts.raw !== undefined) {
    payload = opts.raw;
    if (opts.contentType) headers['Content-Type'] = opts.contentType;
  } else if (body !== undefined) {
    payload = JSON.stringify(body);
    headers['Content-Type'] = 'application/json';
  }
  let res: Response;
  try {
    res = await fetch(path, { method, headers, body: payload, signal: opts.signal });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError(0, 'network', 'Cannot reach the demo server. Check that the backend is running.');
  }
  const text = await res.text();
  let data: any = undefined;
  try { data = text ? JSON.parse(text) : undefined; } catch { /* non-JSON */ }
  if (!res.ok) {
    if (res.status === 401 && path !== '/api/v1/demo/login') onUnauthorized();
    throw new ApiError(res.status, data?.error?.code ?? 'error', data?.error?.message ?? `Request failed (${res.status})`);
  }
  if (method === 'GET') {
    getCache.set(path, { data, ts: Date.now() });
  } else {
    // Mutations invalidate cached GET snapshots
    getCache.clear();
  }
  return data as T;
}

export const get = <T,>(p: string, signal?: AbortSignal) => api<T>('GET', p, undefined, { signal });
export const post = <T,>(p: string, b?: unknown, signal?: AbortSignal) => api<T>('POST', p, b ?? {}, { signal });
export const put = <T,>(p: string, b: unknown) => api<T>('PUT', p, b);
export const patch = <T,>(p: string, b: unknown) => api<T>('PATCH', p, b);

/** Upload an image using the presign flow (SRS §12 POST /images/presign). */
export async function uploadImage(blob: Blob): Promise<{ image_ref: string; image_url: string }> {
  const type = ['image/jpeg', 'image/png', 'image/webp'].includes(blob.type) ? blob.type : 'image/jpeg';
  const pre = await post<{ upload_url: string; image_ref: string; image_url: string }>('/api/v1/images/presign', { content_type: type });
  await api('PUT', pre.upload_url, undefined, { raw: blob, contentType: type });
  return { image_ref: pre.image_ref, image_url: pre.image_url };
}
