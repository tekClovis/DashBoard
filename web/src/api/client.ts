export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(code);
  }
}

/** Same origin in prod; dev-proxied to :8080 by vite.config.ts. */
const BASE_URL = '/api';

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });

  if (!res.ok) {
    const body: unknown = await res.json().catch(() => ({}));
    const code = typeof body === 'object' && body && 'error' in body ? String(body.error) : 'UNKNOWN_ERROR';
    throw new ApiError(res.status, code);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
