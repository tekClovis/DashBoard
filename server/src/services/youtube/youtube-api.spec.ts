import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FetchContext } from '../../catalog/widget-definition.js';
import { FetchError } from '../../timer/fetch-error.js';
import { fixedMessage, youtubeClient } from './youtube-api.js';

const TOKEN = 'ya29.SECRETtoken';
const FRESH = 'ya29.FRESHtoken';
const ctx: FetchContext = { userId: 'u1', accessToken: TOKEN };

/** Stubs global fetch with one response per call, in order. */
function stubFetch(...responses: (() => Response)[]) {
  const fetchMock = vi.fn(async (_input: string, _init?: RequestInit) => {
    const next = responses.shift();
    if (!next) throw new Error('unexpected fetch');
    return next();
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function auth(fetchMock: ReturnType<typeof stubFetch>, i: number): string | null {
  return new Headers(fetchMock.mock.calls[i][1]?.headers).get('authorization');
}

const makeRefresh = () => vi.fn(async (_userId: string) => FRESH);
const unauthorized = () => Response.json({ error: { code: 401 } }, { status: 401 });
/** Google's error body; the message echoes the token, and nothing of it may reach the thrown message. */
const googleError = (reason?: string) => ({ error: { message: `Invalid credentials ${TOKEN}`, errors: [{ domain: 'youtube', reason }] } });

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('fixedMessage', () => {
  it('rethrows a FetchError as is', () => {
    const original = new FetchError('RATE_LIMITED', 'slow down');

    expect(() => fixedMessage('fixed')(original)).toThrow(original);
  });

  it('replaces any other error with UPSTREAM_ERROR and the fixed text only', () => {
    const handler = fixedMessage('YouTube returned an invalid response.');

    expect(() => handler(new TypeError(`cannot read token ${TOKEN}`))).toThrow(
      expect.objectContaining({ name: 'FetchError', code: 'UPSTREAM_ERROR', message: 'YouTube returned an invalid response.' }),
    );
  });
});

describe('youtubeClient', () => {
  it('GETs the v3 path with the query stringified and Bearer auth', async () => {
    const fetchMock = stubFetch(() => Response.json({ items: [] }));
    const refresh = makeRefresh();

    await youtubeClient(ctx, refresh)('/videos', { part: 'snippet,statistics', chart: 'mostPopular', maxResults: 5 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [input, init] = fetchMock.mock.calls[0];
    const url = new URL(input);
    expect(url.origin + url.pathname).toBe('https://www.googleapis.com/youtube/v3/videos');
    expect([...url.searchParams]).toEqual([
      ['part', 'snippet,statistics'],
      ['chart', 'mostPopular'],
      ['maxResults', '5'],
    ]);
    const headers = new Headers(init?.headers);
    expect(headers.get('authorization')).toBe(`Bearer ${TOKEN}`);
    expect(headers.get('accept')).toBe('application/json');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('returns the parsed body of a 2xx response as is, optional fields included', async () => {
    const body = {
      items: [
        { id: 'a', snippet: { title: 'A' }, statistics: { viewCount: '12', hiddenSubscriberCount: true } },
        { id: 'b', snippet: { title: 'B' } },
      ],
    };
    stubFetch(() => Response.json(body));

    await expect(youtubeClient(ctx, makeRefresh())('/channels', { id: 'UC_x5' })).resolves.toEqual(body);
  });

  describe('token refresh', () => {
    it('refreshes for the context user when there is no access token, before any request', async () => {
      const fetchMock = stubFetch(() => Response.json({}));
      const refresh = makeRefresh();

      await youtubeClient({ userId: 'user-42' }, refresh)('/channels', {});

      expect(refresh).toHaveBeenCalledExactlyOnceWith('user-42');
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(auth(fetchMock, 0)).toBe(`Bearer ${FRESH}`);
    });

    it.each([
      ['already passed', -1_000, FRESH],
      ['exactly 60 s ahead', 60_000, FRESH],
      ['just over 60 s ahead', 60_001, TOKEN],
    ])('with an expiry %s, sends the expected token', async (_, offsetMs, expected) => {
      vi.useFakeTimers({ now: new Date('2026-01-01T00:00:00Z') });
      const fetchMock = stubFetch(() => Response.json({}));
      const refresh = makeRefresh();

      await youtubeClient({ ...ctx, expiresAt: new Date(Date.now() + offsetMs) }, refresh)('/channels', {});

      expect(auth(fetchMock, 0)).toBe(`Bearer ${expected}`);
      expect(refresh).toHaveBeenCalledTimes(expected === FRESH ? 1 : 0);
    });

    it('on a 401, refreshes once and retries the same request with the new token', async () => {
      const fetchMock = stubFetch(unauthorized, () => Response.json({ ok: true }));
      const refresh = makeRefresh();

      await expect(youtubeClient(ctx, refresh)('/videos', { id: 'x' })).resolves.toEqual({ ok: true });

      expect(refresh).toHaveBeenCalledExactlyOnceWith('u1');
      expect(fetchMock.mock.calls.map(([input]) => input)).toEqual([
        'https://www.googleapis.com/youtube/v3/videos?id=x',
        'https://www.googleapis.com/youtube/v3/videos?id=x',
      ]);
      expect([auth(fetchMock, 0), auth(fetchMock, 1)]).toEqual([`Bearer ${TOKEN}`, `Bearer ${FRESH}`]);
    });

    it('is REAUTH_REQUIRED when the retried request is rejected too', async () => {
      const fetchMock = stubFetch(unauthorized, unauthorized);
      const refresh = makeRefresh();

      await expect(youtubeClient(ctx, refresh)('/videos', {})).rejects.toMatchObject({
        name: 'FetchError',
        code: 'REAUTH_REQUIRED',
        message: 'YouTube rejected the access token.',
      });
      expect(refresh).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('does not retry a 401 on a token it refreshed up front', async () => {
      const fetchMock = stubFetch(unauthorized);
      const refresh = makeRefresh();

      await expect(youtubeClient({ userId: 'u1' }, refresh)('/videos', {})).rejects.toMatchObject({ code: 'REAUTH_REQUIRED' });
      expect(refresh).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('keeps the refreshed token for later requests of the same client, and never refreshes twice', async () => {
      const fetchMock = stubFetch(
        unauthorized,
        () => Response.json({}),
        () => Response.json({}),
        unauthorized,
      );
      const refresh = makeRefresh();
      const get = youtubeClient(ctx, refresh);

      await get('/channels', {});
      await get('/playlistItems', {});
      await expect(get('/videos', {})).rejects.toMatchObject({ code: 'REAUTH_REQUIRED' });

      expect(auth(fetchMock, 2)).toBe(`Bearer ${FRESH}`);
      expect(refresh).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });

    it('propagates a failed refresh unchanged, without retrying the request', async () => {
      const fetchMock = stubFetch(unauthorized);
      const failure = new FetchError('REAUTH_REQUIRED', 'Google refused the refresh token.');

      await expect(youtubeClient(ctx, () => Promise.reject(failure))('/videos', {})).rejects.toBe(failure);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('error mapping', () => {
    it.each<[number, unknown, string, string]>([
      [429, {}, 'RATE_LIMITED', 'YouTube quota or rate limit exceeded.'],
      [403, googleError('quotaExceeded'), 'RATE_LIMITED', 'YouTube quota or rate limit exceeded.'],
      [403, googleError('rateLimitExceeded'), 'RATE_LIMITED', 'YouTube quota or rate limit exceeded.'],
      [403, googleError('userRateLimitExceeded'), 'RATE_LIMITED', 'YouTube quota or rate limit exceeded.'],
      [403, googleError('dailyLimitExceeded'), 'RATE_LIMITED', 'YouTube quota or rate limit exceeded.'],
      [403, googleError('forbidden'), 'UPSTREAM_ERROR', 'YouTube responded with HTTP 403.'],
      [403, googleError(undefined), 'UPSTREAM_ERROR', 'YouTube responded with HTTP 403.'],
      [403, { error: { errors: [] } }, 'UPSTREAM_ERROR', 'YouTube responded with HTTP 403.'],
      [403, { error: {} }, 'UPSTREAM_ERROR', 'YouTube responded with HTTP 403.'],
      [403, null, 'UPSTREAM_ERROR', 'YouTube responded with HTTP 403.'],
      // Only a 403/429 is a rate limit: a quota reason on another status is not.
      [500, googleError('quotaExceeded'), 'UPSTREAM_ERROR', 'YouTube responded with HTTP 500.'],
      [400, googleError('invalidRegionCode'), 'INVALID_PARAMS', 'YouTube rejected the widget parameters.'],
      [404, googleError('playlistNotFound'), 'INVALID_PARAMS', 'YouTube rejected the widget parameters.'],
      [503, {}, 'UPSTREAM_ERROR', 'YouTube responded with HTTP 503.'],
    ])('maps HTTP %i %j to %s, with a fixed message', async (status, body, code, message) => {
      stubFetch(() => Response.json(body, { status }));

      await expect(youtubeClient(ctx, makeRefresh())('/videos', {})).rejects.toMatchObject({ name: 'FetchError', code, message });
    });

    it('maps an error response with a non-JSON body by its status alone', async () => {
      stubFetch(() => new Response('<html>Forbidden</html>', { status: 403 }));

      await expect(youtubeClient(ctx, makeRefresh())('/videos', {})).rejects.toMatchObject({
        name: 'FetchError',
        code: 'UPSTREAM_ERROR',
        message: 'YouTube responded with HTTP 403.',
      });
    });

    it('maps a 2xx body that is not JSON to UPSTREAM_ERROR with a fixed message', async () => {
      stubFetch(() => new Response('<html>proxy</html>', { status: 200 }));

      await expect(youtubeClient(ctx, makeRefresh())('/videos', {})).rejects.toMatchObject({
        name: 'FetchError',
        code: 'UPSTREAM_ERROR',
        message: 'YouTube returned an invalid response.',
      });
    });

    it('maps a network failure to UPSTREAM_ERROR, keeping the access token out of the message', async () => {
      // What Node's fetch throws for a token with a character that is illegal in a header.
      stubFetch(() => {
        throw new TypeError(`Headers.append: "Bearer ${TOKEN}" is an invalid header value.`);
      });

      await expect(youtubeClient(ctx, makeRefresh())('/videos', {})).rejects.toMatchObject({
        name: 'FetchError',
        code: 'UPSTREAM_ERROR',
        message: 'YouTube request failed.',
      });
    });
  });
});
