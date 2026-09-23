// Minimal GitHub REST client for the github widgets — see features/github-widgets/spec.md.
// Maps GitHub's HTTP failures onto the Timer's error codes (docs/Architecture.md §6).

import type { Params } from '../../catalog/widget-definition.js';
import { FetchError } from '../../timer/fetch-error.js';

const API_URL = 'https://api.github.com';
const TIMEOUT_MS = 10_000;

/** `owner/name`; the lookahead rejects `.`/`..` as a repo name so it can't collapse the URL path. */
export const REPO_PATTERN = '^[A-Za-z0-9-]+/(?!\\.\\.?$)[A-Za-z0-9._-]+$';
const REPO_RE = new RegExp(REPO_PATTERN);

/** The `repo` param as `owner/name`; INVALID_PARAMS otherwise. REPO_RE's charset needs no URL encoding. */
export function parseRepo(repo: Params[string] | undefined): string {
  const value = String(repo ?? '');
  if (!REPO_RE.test(value)) {
    throw new FetchError('INVALID_PARAMS', `'${value}' is not an owner/name repository.`);
  }
  return value;
}

/** GET `/repos/{repo}{path}?{query}`. */
export async function githubGet<T>(
  repo: string,
  path: string,
  query: Record<string, string | number>,
  accessToken: string | undefined,
): Promise<T> {
  if (!accessToken) throw new FetchError('REAUTH_REQUIRED', 'No GitHub token for this connection.');

  const search = new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)]));
  let res: Response;
  try {
    res = await fetch(`${API_URL}/repos/${repo}${path}?${search}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new FetchError('UPSTREAM_ERROR', `GitHub request failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (res.ok) return (await res.json()) as T;
  // Release the unread body so undici can return the socket to its keep-alive pool.
  await res.body?.cancel();
  throw toFetchError(res);
}

function toFetchError(res: Response): FetchError {
  if (res.status === 401) return new FetchError('REAUTH_REQUIRED', 'GitHub rejected the access token.');
  const rateLimited =
    res.status === 429 ||
    (res.status === 403 && (res.headers.get('x-ratelimit-remaining') === '0' || res.headers.has('retry-after')));
  if (rateLimited) return new FetchError('RATE_LIMITED', 'GitHub rate limit exceeded.');
  if (res.status === 404) return new FetchError('INVALID_PARAMS', 'Repository not found or not accessible.');
  return new FetchError('UPSTREAM_ERROR', `GitHub responded with HTTP ${res.status}.`);
}
