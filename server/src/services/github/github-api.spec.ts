import { afterEach, describe, expect, it, vi } from 'vitest';
import { githubGet, parseRepo } from './github-api.js';

const TOKEN = 'gho_SECRETtoken123';

/** Stubs global fetch with one canned response. */
function stubFetch(respond: () => Response) {
  const fetchMock = vi.fn(async (_input: string, _init?: RequestInit) => respond());
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parseRepo', () => {
  it('returns a well-formed owner/name unchanged', () => {
    expect(parseRepo('my-org/repo.name_2')).toBe('my-org/repo.name_2');
  });

  it.each([42, 'octocat', 'a/b/c', 'owner/.', 'owner/..', 'own_er/repo'])('rejects %o with INVALID_PARAMS', (repo) => {
    expect(() => parseRepo(repo)).toThrow(expect.objectContaining({ name: 'FetchError', code: 'INVALID_PARAMS' }));
  });

  it('names an absent repo as the empty string, not "undefined"', () => {
    expect(() => parseRepo(undefined)).toThrow("'' is not an owner/name repository.");
  });
});

describe('githubGet', () => {
  it('GETs /repos/{repo}{path} with the query stringified and GitHub auth/version headers', async () => {
    const fetchMock = stubFetch(() => Response.json([]));

    await githubGet('octocat/hello-world', '/pulls', { state: 'open', per_page: 30 }, TOKEN);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [input, init] = fetchMock.mock.calls[0];
    const url = new URL(input);
    expect(url.origin + url.pathname).toBe('https://api.github.com/repos/octocat/hello-world/pulls');
    expect([...url.searchParams]).toEqual([
      ['state', 'open'],
      ['per_page', '30'],
    ]);
    const headers = new Headers(init?.headers);
    expect(headers.get('authorization')).toBe(`Bearer ${TOKEN}`);
    expect(headers.get('accept')).toBe('application/vnd.github+json');
    expect(headers.get('x-github-api-version')).toBe('2022-11-28');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('URL-encodes query values', async () => {
    const fetchMock = stubFetch(() => Response.json([]));

    await githubGet('o/r', '/commits', { sha: 'feat/a&b=c d' }, TOKEN);

    const [input] = fetchMock.mock.calls[0];
    expect(input).not.toContain('a&b=c d');
    expect(new URL(input).searchParams.get('sha')).toBe('feat/a&b=c d');
  });

  it('returns the parsed body of a 2xx response as is, optional fields included', async () => {
    const commits = [
      { sha: 'abc123', commit: { message: 'fix: x', author: { name: 'Ada', date: '2026-01-01T00:00:00Z' } }, author: null },
      { sha: 'def456', commit: { message: 'feat: y', author: null } },
    ];
    stubFetch(() => Response.json(commits, { status: 200 }));

    await expect(githubGet('o/r', '/commits', {}, TOKEN)).resolves.toEqual(commits);
  });

  it.each([undefined, ''])('is REAUTH_REQUIRED for the token %o, without calling GitHub', async (token) => {
    const fetchMock = stubFetch(() => Response.json([]));

    await expect(githubGet('o/r', '/commits', {}, token)).rejects.toMatchObject({
      name: 'FetchError',
      code: 'REAUTH_REQUIRED',
      message: 'No GitHub token for this connection.',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each<[number, Record<string, string>, string, string]>([
    [401, {}, 'REAUTH_REQUIRED', 'GitHub rejected the access token.'],
    [429, {}, 'RATE_LIMITED', 'GitHub rate limit exceeded.'],
    [403, { 'x-ratelimit-remaining': '0' }, 'RATE_LIMITED', 'GitHub rate limit exceeded.'],
    [403, { 'retry-after': '60' }, 'RATE_LIMITED', 'GitHub rate limit exceeded.'],
    [403, { 'x-ratelimit-remaining': '12' }, 'UPSTREAM_ERROR', 'GitHub responded with HTTP 403.'],
    [403, {}, 'UPSTREAM_ERROR', 'GitHub responded with HTTP 403.'],
    // Only a 403/429 is a rate limit: an exhausted quota header on another status is not.
    [404, { 'x-ratelimit-remaining': '0' }, 'INVALID_PARAMS', 'Repository not found or not accessible.'],
    [500, { 'retry-after': '5' }, 'UPSTREAM_ERROR', 'GitHub responded with HTTP 500.'],
    [503, {}, 'UPSTREAM_ERROR', 'GitHub responded with HTTP 503.'],
  ])('maps HTTP %i with headers %o to %s, with a fixed message', async (status, headers, code, message) => {
    // The body echoes the token: nothing of it may reach the message.
    stubFetch(() => Response.json({ message: `Bad credentials: ${TOKEN}` }, { status, headers }));

    await expect(githubGet('o/r', '/commits', {}, TOKEN)).rejects.toMatchObject({ name: 'FetchError', code, message });
  });

  it('releases the unread body of an error response', async () => {
    const res = Response.json({ message: 'Not Found' }, { status: 404 });
    stubFetch(() => res);

    await expect(githubGet('o/r', '/commits', {}, TOKEN)).rejects.toMatchObject({ code: 'INVALID_PARAMS' });
    expect(res.bodyUsed).toBe(true);
  });

  it('maps a network failure to UPSTREAM_ERROR carrying the cause', async () => {
    stubFetch(() => {
      throw new TypeError('fetch failed');
    });

    await expect(githubGet('o/r', '/commits', {}, TOKEN)).rejects.toMatchObject({
      name: 'FetchError',
      code: 'UPSTREAM_ERROR',
      message: 'GitHub request failed: fetch failed',
    });
  });

  it('maps a non-Error rejection to UPSTREAM_ERROR', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject('socket hang up')),
    );

    await expect(githubGet('o/r', '/commits', {}, TOKEN)).rejects.toMatchObject({
      code: 'UPSTREAM_ERROR',
      message: 'GitHub request failed: socket hang up',
    });
  });

  // Not wrapped in a FetchError: the Timer reports any other thrown error as UPSTREAM_ERROR.
  it('rejects with a SyntaxError when a 2xx body is not JSON', async () => {
    stubFetch(() => new Response('<html>proxy</html>', { status: 200 }));

    await expect(githubGet('o/r', '/commits', {}, TOKEN)).rejects.toBeInstanceOf(SyntaxError);
  });

  // BUG (github-api.ts:44): the fetch error's text is copied into the message the Timer sends to
  // the client, and Node quotes an invalid Authorization header — token included — in that text.
  it.fails('keeps the access token out of a transport error message', async () => {
    // What Node's fetch throws for a token with a character that is illegal in a header.
    stubFetch(() => {
      throw new TypeError(`Headers.append: "Bearer ${TOKEN}" is an invalid header value.`);
    });

    const err = await githubGet('o/r', '/commits', {}, TOKEN).catch((e: unknown) => e);

    expect(err).toMatchObject({ name: 'FetchError', code: 'UPSTREAM_ERROR' });
    expect((err as Error).message).not.toContain(TOKEN);
  });
});
