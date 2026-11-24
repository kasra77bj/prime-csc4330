import { useAuth } from "../store/auth";

export const API_BASE = import.meta.env.VITE_API_BASE ?? "/api/v1";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details: Record<string, unknown> = {}) {
    super(message);
  }
}

let refreshing: Promise<string | null> | null = null;

async function refreshToken(): Promise<string | null> {
  if (!refreshing) {
    refreshing = fetch(`${API_BASE}/auth/refresh`, { method: "POST", credentials: "include" })
      .then(async (r) => (r.ok ? ((await r.json()) as { access_token: string }).access_token : null))
      .catch(() => null)
      .finally(() => setTimeout(() => (refreshing = null), 0));
  }
  const token = await refreshing;
  useAuth.getState().setToken(token);
  return token;
}

/** Restores a session from the httpOnly refresh cookie (page reload). */
export async function restoreSession(): Promise<boolean> {
  const token = await refreshToken();
  return token !== null;
}

export async function api<T>(path: string, init: { method?: string; body?: unknown; retry?: boolean } = {}): Promise<T> {
  const { method = "GET", body, retry = true } = init;
  const token = useAuth.getState().token;
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    credentials: "include",
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && retry && !path.startsWith("/auth/")) {
    const fresh = await refreshToken();
    if (fresh) return api<T>(path, { ...init, retry: false });
    useAuth.getState().signOut();
  }
  if (!res.ok) {
    let payload: { error?: { code: string; message: string; details?: Record<string, unknown> } } = {};
    try {
      payload = await res.json();
    } catch {
      /* not JSON */
    }
    const e = payload.error;
    throw new ApiError(res.status, e?.code ?? "HTTP_ERROR", e?.message ?? res.statusText, e?.details ?? {});
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export const get = <T,>(p: string) => api<T>(p);
export const post = <T,>(p: string, body?: unknown) => api<T>(p, { method: "POST", body: body ?? {} });
export const patch = <T,>(p: string, body: unknown) => api<T>(p, { method: "PATCH", body });
