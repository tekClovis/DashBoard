/** Thrown by {@link apiFetch} on a non-2xx response; `code` is the server's `error` field. */
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

/**
 * Fetch JSON from the API under `/api`, sending the session cookie.
 * @param path - Path relative to `/api`, with a leading slash.
 * @returns The parsed JSON body, or `undefined` for a 204.
 * @throws {@link ApiError} when the response is not ok; `code` is `UNKNOWN_ERROR` if the body has no `error` field.
 */
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
