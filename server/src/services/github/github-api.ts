// Minimal GitHub REST client for the github widgets — see features/github-widgets/spec.md.
// Maps GitHub's HTTP failures onto the Timer's error codes (docs/Architecture.md §6).

import type { Params } from '../../catalog/widget-definition.js';
import { FetchError } from '../../timer/fetch-error.js';

const API_URL = 'https://api.github.com';
const TIMEOUT_MS = 10_000;

/** `owner/name`; the lookahead rejects `.`/`..` as a repo name so it can't collapse the URL path. */
export const REPO_PATTERN = '^[A-Za-z0-9-]+/(?!\\.\\.?$)[A-Za-z0-9._-]+$';
const REPO_RE = new RegExp(REPO_PATTERN);

/** `/repos/{owner}/{name}` for a validated `repo` param; INVALID_PARAMS otherwise. */
export function repoPath(repo: Params[string] | undefined): string {
  const value = String(repo ?? '');
  if (!REPO_RE.test(value)) {
    throw new FetchError('INVALID_PARAMS', `'${value}' is not an owner/name repository.`);
  }
  const [owner, name] = value.split('/');
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
}

export async function githubGet<T>(path: string, accessToken: string | undefined): Promise<T> {
  if (!accessToken) throw new FetchError('REAUTH_REQUIRED', 'No GitHub token for this connection.');

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
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
