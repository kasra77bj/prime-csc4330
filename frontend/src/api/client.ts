// Minimal API client; T2.4 adds auth headers, refresh-on-401 and generated OpenAPI types.
export const API_BASE = import.meta.env.VITE_API_BASE ?? "/api/v1";

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { credentials: "include" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}
