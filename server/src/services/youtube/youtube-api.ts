// Minimal YouTube Data API v3 client for the youtube widgets — see features/youtube-widgets/spec.md.
// Maps YouTube's HTTP failures onto the Timer's error codes (docs/Architecture.md §6).

import type { FetchContext } from '../../catalog/widget-definition.js';
import { FetchError } from '../../timer/fetch-error.js';

const API_URL = 'https://www.googleapis.com/youtube/v3';
const TIMEOUT_MS = 10_000;
/** Refresh this long before the stored expiry, so a request never races the token's last seconds. */
const EXPIRY_SKEW_MS = 60_000;
const RATE_LIMIT_REASONS = new Set(['quotaExceeded', 'rateLimitExceeded', 'userRateLimitExceeded', 'dailyLimitExceeded']);

/** Exchanges the user's stored refresh token for a fresh access token (see GoogleTokenRefresher). */
export type TokenRefresher = (userId: string) => Promise<string>;

export type YoutubeGet = <T>(path: string, query: Record<string, string | number>) => Promise<T>;

/**
 * A GET client for one fetch() run. The access token is refreshed at most once per run — up
 * front when it is missing or (per the stored expiry) about to expire, otherwise on the first
 * 401, and the request retried; a second 401 is REAUTH_REQUIRED.
 */
export function youtubeClient(ctx: FetchContext, refresh: TokenRefresher): YoutubeGet {
  const expired = ctx.expiresAt !== undefined && ctx.expiresAt.getTime() <= Date.now() + EXPIRY_SKEW_MS;
  let token = expired ? undefined : ctx.accessToken;
  let refreshed = false;
  const refreshOnce = (): Promise<string> => {
    refreshed = true;
    return refresh(ctx.userId);
  };

  return async <T>(path: string, query: Record<string, string | number>): Promise<T> => {
    token ??= await refreshOnce();
    let res = await send(path, query, token);
    if (res.status === 401 && !refreshed) {
      await res.body?.cancel();
      token = await refreshOnce();
      res = await send(path, query, token);
    }
    if (res.ok) return (await res.json()) as T;
    throw await toFetchError(res);
  };
}

async function send(path: string, query: Record<string, string | number>, token: string): Promise<Response> {
  const search = new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)]));
  try {
    return await fetch(`${API_URL}${path}?${search}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new FetchError('UPSTREAM_ERROR', `YouTube request failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function toFetchError(res: Response): Promise<FetchError> {
  if (res.status === 401) return new FetchError('REAUTH_REQUIRED', 'YouTube rejected the access token.');
  // Google's error body: { error: { errors: [{ reason }] } }. A body that isn't JSON just has no reason.
  const body = (await res.json().catch(() => null)) as { error?: { errors?: { reason?: string }[] } } | null;
  const reason = body?.error?.errors?.[0]?.reason ?? '';
  if (res.status === 429 || (res.status === 403 && RATE_LIMIT_REASONS.has(reason))) {
    return new FetchError('RATE_LIMITED', 'YouTube quota or rate limit exceeded.');
  }
  if (res.status === 400 || res.status === 404) return new FetchError('INVALID_PARAMS', 'YouTube rejected the widget parameters.');
  return new FetchError('UPSTREAM_ERROR', `YouTube responded with HTTP ${res.status}.`);
}
