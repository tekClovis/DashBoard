import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FetchContext, WidgetDefinition } from '../../catalog/widget-definition.js';
import { WidgetRegistryService } from '../../catalog/widget-registry.service.js';
import { validateParams } from '../../catalog/param-validator.js';
import { FetchError } from '../../timer/fetch-error.js';
import { YoutubeModule } from './youtube.module.js';
import type { GoogleTokenRefresher } from './google-token-refresher.js';
import { youtubeWidgets } from './youtube-widgets.js';

const ctx: FetchContext = { userId: 'u1', accessToken: 'tok' };

function widget(name: string, refresh = vi.fn(async () => 'fresh')): WidgetDefinition {
  const def = youtubeWidgets(refresh).find((d) => d.name === name);
  if (!def) throw new Error(`no widget ${name}`);
  return def as WidgetDefinition;
}

/** Stubs global fetch with one response per call, in order. */
function stubFetch(...responses: (() => Response)[]) {
  const fetchMock = vi.fn(async () => {
    const next = responses.shift();
    if (!next) throw new Error('unexpected fetch');
    return next();
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function call(fetchMock: ReturnType<typeof stubFetch>, i: number): { url: URL; auth: string | null } {
  const [input, init] = fetchMock.mock.calls[i] as unknown as [string, RequestInit];
  return { url: new URL(input), auth: new Headers(init.headers).get('authorization') };
}

const CHANNEL = {
  snippet: { title: 'Google for Developers', thumbnails: { default: { url: 'https://yt3.ggpht.com/avatar=s88' } } },
  statistics: { subscriberCount: '2400000', hiddenSubscriberCount: false, viewCount: '180000000', videoCount: '412' },
  contentDetails: { relatedPlaylists: { uploads: 'UUuploads' } },
};

const thumbnails = {
  default: { url: 'https://i.ytimg.com/vi/x/default.jpg' },
  medium: { url: 'https://i.ytimg.com/vi/x/mqdefault.jpg' },
  high: { url: 'https://i.ytimg.com/vi/x/hqdefault.jpg' },
};
const snippet = (title: string, publishedAt: string) => ({ title, channelTitle: 'Chan', publishedAt, thumbnails });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('YoutubeModule', () => {
  it('registers the youtube oauth service with its three connection-scoped widgets', () => {
    const registry = new WidgetRegistryService();
    new YoutubeModule(registry, {} as GoogleTokenRefresher).onModuleInit();

    const [service] = registry.services();
    expect(service).toMatchObject({ name: 'youtube', connection: 'oauth' });
    expect(service.widgets.map((w) => [w.name, w.minRefreshSec])).toEqual([
      ['channel_stats', 600],
      ['latest_videos', 600],
      ['trending_videos', 900],
    ]);
    expect(youtubeWidgets(vi.fn()).every((d) => d.auth === 'connection')).toBe(true);
  });
});

describe('youtube param specs', () => {
  it.each(['FR', 'US'])('accepts region %s', (region) => {
    expect(validateParams(widget('trending_videos').params, { region, number: 3 }).ok).toBe(true);
  });

  it.each(['fr', 'FRA', 'F', '1A', 'FR&x=1'])('rejects region %s', (region) => {
    expect(validateParams(widget('trending_videos').params, { region, number: 3 }).ok).toBe(false);
  });

  it.each([0, 11])('rejects number %i outside 1–10', (number) => {
    expect(validateParams(widget('latest_videos').params, { channel_id: 'UC1', number }).ok).toBe(false);
  });
});

describe('youtube widgets fetch()', () => {
  it('channel_stats requests the channel with Bearer auth and returns its counts', async () => {
    const fetchMock = stubFetch(() => Response.json({ items: [CHANNEL] }));

    const data = await widget('channel_stats').fetch({ channel_id: 'UC_x5' }, ctx);

    const { url, auth } = call(fetchMock, 0);
    expect(url.origin + url.pathname).toBe('https://www.googleapis.com/youtube/v3/channels');
    expect(url.searchParams.get('id')).toBe('UC_x5');
    expect(auth).toBe('Bearer tok');
    expect(data).toEqual({ channelId: 'UC_x5', title: 'Google for Developers', subscribers: 2400000, views: 180000000, videos: 412, imageUrl: 'https://yt3.ggpht.com/avatar=s88' });
  });

  it('channel_stats reports a missing subscriber count as null, not NaN', async () => {
    const missing = { ...CHANNEL, statistics: { ...CHANNEL.statistics, subscriberCount: undefined } };
    stubFetch(() => Response.json({ items: [missing] }));

    await expect(widget('channel_stats').fetch({ channel_id: 'UC_x5' }, ctx)).resolves.toMatchObject({ subscribers: null });
  });

  it('channel_stats reports a hidden subscriber count as null', async () => {
    const hidden = { ...CHANNEL, statistics: { ...CHANNEL.statistics, subscriberCount: undefined, hiddenSubscriberCount: true } };
    stubFetch(() => Response.json({ items: [hidden] }));

    await expect(widget('channel_stats').fetch({ channel_id: 'UC_x5' }, ctx)).resolves.toMatchObject({ subscribers: null });
  });

  it('channel_stats reports a missing avatar as a null imageUrl', async () => {
    const bare = { ...CHANNEL, snippet: { title: 'Google for Developers' } };
    stubFetch(() => Response.json({ items: [bare] }));

    await expect(widget('channel_stats').fetch({ channel_id: 'UC_x5' }, ctx)).resolves.toMatchObject({ imageUrl: null });
  });

  it('an unknown channel_id is INVALID_PARAMS', async () => {
    stubFetch(() => Response.json({ items: [] }));

    await expect(widget('channel_stats').fetch({ channel_id: 'nope' }, ctx)).rejects.toMatchObject({ code: 'INVALID_PARAMS' });
  });

  it('latest_videos reads `number` items of the uploads playlist, most recent first, with built watch URLs', async () => {
    const fetchMock = stubFetch(
      () => Response.json({ items: [CHANNEL] }),
      () =>
        Response.json({
          items: [
            { snippet: { ...snippet('Older', '2026-09-10T00:00:00Z'), resourceId: { videoId: 'v1' } } },
            { snippet: { ...snippet('Newer', '2026-09-20T00:00:00Z'), resourceId: { videoId: 'v2' } } },
          ],
        }),
    );

    const data = await widget('latest_videos').fetch({ channel_id: 'UC_x5', number: 2 }, ctx);

    const { url } = call(fetchMock, 1);
    expect(url.pathname).toBe('/youtube/v3/playlistItems');
    expect(url.searchParams.get('playlistId')).toBe('UUuploads');
    expect(url.searchParams.get('maxResults')).toBe('2');
    expect(data).toEqual({
      channelId: 'UC_x5',
      videos: [
        { id: 'v2', title: 'Newer', channel: 'Chan', publishedAt: '2026-09-20T00:00:00Z', url: 'https://www.youtube.com/watch?v=v2', imageUrl: thumbnails.medium.url },
        { id: 'v1', title: 'Older', channel: 'Chan', publishedAt: '2026-09-10T00:00:00Z', url: 'https://www.youtube.com/watch?v=v1', imageUrl: thumbnails.medium.url },
      ],
    });
  });

  it('maps the best available snippet.thumbnails size to imageUrl, null when there are none', async () => {
    stubFetch(() =>
      Response.json({
        items: [
          { id: 'a', snippet: { ...snippet('a', '2026-01-01T00:00:00Z'), thumbnails: { default: thumbnails.default, high: thumbnails.high } } },
          { id: 'b', snippet: { ...snippet('b', '2026-01-01T00:00:00Z'), thumbnails: undefined } },
        ],
      }),
    );

    const data = await widget('trending_videos').fetch({ region: 'FR', number: 2 }, ctx);

    expect(data).toMatchObject({ videos: [{ imageUrl: thumbnails.high.url }, { imageUrl: null }] });
  });

  it('trending_videos asks for the mostPopular chart of the region', async () => {
    const fetchMock = stubFetch(() => Response.json({ items: [{ id: 't1', snippet: snippet('Top tech news', '2026-09-22T00:00:00Z') }] }));

    const data = await widget('trending_videos').fetch({ region: 'FR', number: 1 }, ctx);

    const { url } = call(fetchMock, 0);
    expect(url.pathname).toBe('/youtube/v3/videos');
    expect(url.searchParams.get('chart')).toBe('mostPopular');
    expect(url.searchParams.get('regionCode')).toBe('FR');
    expect(url.searchParams.get('maxResults')).toBe('1');
    expect(data).toMatchObject({ region: 'FR', videos: [{ id: 't1', title: 'Top tech news', url: 'https://www.youtube.com/watch?v=t1' }] });
  });

  it('on a 401, refreshes the token once and retries the request with it', async () => {
    const refresh = vi.fn(async () => 'fresh');
    const fetchMock = stubFetch(
      () => Response.json({}, { status: 401 }),
      () => Response.json({ items: [CHANNEL] }),
    );

    await expect(widget('channel_stats', refresh).fetch({ channel_id: 'UC_x5' }, ctx)).resolves.toMatchObject({ videos: 412 });

    expect(refresh).toHaveBeenCalledExactlyOnceWith('u1');
    expect(call(fetchMock, 1).auth).toBe('Bearer fresh');
  });

  it('keeps the refreshed token for later requests of the same run, and refreshes only once', async () => {
    const refresh = vi.fn(async () => 'fresh');
    const fetchMock = stubFetch(
      () => Response.json({}, { status: 401 }),
      () => Response.json({ items: [CHANNEL] }),
      () => Response.json({}, { status: 401 }),
    );

    await expect(widget('latest_videos', refresh).fetch({ channel_id: 'UC_x5', number: 1 }, ctx)).rejects.toMatchObject({
      code: 'REAUTH_REQUIRED',
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(call(fetchMock, 2).auth).toBe('Bearer fresh');
  });

  it('a 401 after a successful refresh is REAUTH_REQUIRED', async () => {
    stubFetch(
      () => Response.json({}, { status: 401 }),
      () => Response.json({}, { status: 401 }),
    );

    await expect(widget('channel_stats').fetch({ channel_id: 'UC_x5' }, ctx)).rejects.toMatchObject({ code: 'REAUTH_REQUIRED' });
  });

  it('propagates a failed refresh unchanged, without retrying the request', async () => {
    const refused = new FetchError('REAUTH_REQUIRED', 'Google refused to refresh the access token.');
    const refresh = vi.fn(async () => {
      throw refused;
    });
    const fetchMock = stubFetch(() => Response.json({}, { status: 401 }));

    await expect(widget('channel_stats', refresh).fetch({ channel_id: 'UC_x5' }, ctx)).rejects.toBe(refused);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refreshes up front when the connection has no access token', async () => {
    const refresh = vi.fn(async () => 'fresh');
    const fetchMock = stubFetch(() => Response.json({ items: [CHANNEL] }));

    await widget('channel_stats', refresh).fetch({ channel_id: 'UC_x5' }, { userId: 'u1' });

    expect(call(fetchMock, 0).auth).toBe('Bearer fresh');
  });

  it('refreshes up front when the stored expiry has passed, without a doomed request', async () => {
    const refresh = vi.fn(async () => 'fresh');
    const fetchMock = stubFetch(() => Response.json({ items: [CHANNEL] }));

    await widget('channel_stats', refresh).fetch({ channel_id: 'UC_x5' }, { ...ctx, expiresAt: new Date(Date.now() - 1000) });

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(call(fetchMock, 0).auth).toBe('Bearer fresh');
  });

  it('uses the stored token while its expiry is still ahead', async () => {
    const refresh = vi.fn(async () => 'fresh');
    const fetchMock = stubFetch(() => Response.json({ items: [CHANNEL] }));

    await widget('channel_stats', refresh).fetch({ channel_id: 'UC_x5' }, { ...ctx, expiresAt: new Date(Date.now() + 3_600_000) });

    expect(refresh).not.toHaveBeenCalled();
    expect(call(fetchMock, 0).auth).toBe('Bearer tok');
  });

  const googleError = (reason: string) => ({ error: { errors: [{ reason }] } });
  it.each([
    [403, googleError('quotaExceeded'), 'RATE_LIMITED'],
    [403, googleError('rateLimitExceeded'), 'RATE_LIMITED'],
    [429, {}, 'RATE_LIMITED'],
    [400, googleError('invalidRegionCode'), 'INVALID_PARAMS'],
    [404, googleError('playlistNotFound'), 'INVALID_PARAMS'],
    [403, googleError('forbidden'), 'UPSTREAM_ERROR'],
    [500, {}, 'UPSTREAM_ERROR'],
  ])('maps HTTP %i %o to %s', async (status, body, code) => {
    stubFetch(() => Response.json(body, { status }));

    await expect(widget('trending_videos').fetch({ region: 'FR', number: 5 }, ctx)).rejects.toMatchObject({ name: 'FetchError', code });
  });

  const channelParams = { channel_id: 'UC_x5', number: 5 };
  const regionParams = { region: 'FR', number: 5 };
  it.each([
    ['trending_videos', regionParams, 'a non-JSON body', [() => new Response('<html>proxy</html>', { status: 200 })]],
    ['channel_stats', channelParams, 'a null body', [() => Response.json(null)]],
    ['channel_stats', channelParams, 'a channel without statistics', [() => Response.json({ items: [{ ...CHANNEL, statistics: undefined }] })]],
    ['trending_videos', regionParams, 'items that are not an array', [() => Response.json({ items: 'nope' })]],
    [
      'latest_videos',
      channelParams,
      'a playlist item without resourceId',
      [() => Response.json({ items: [CHANNEL] }), () => Response.json({ items: [{ snippet: snippet('a', '2026-01-01T00:00:00Z') }] })],
    ],
  ])('%s maps a 200 with %s to UPSTREAM_ERROR with a fixed message', async (name, params, _, responses) => {
    stubFetch(...responses);

    await expect(widget(name).fetch(params, ctx)).rejects.toMatchObject({
      name: 'FetchError',
      code: 'UPSTREAM_ERROR',
      message: 'YouTube returned an invalid response.',
    });
  });

  it('latest_videos maps a channel without contentDetails to UPSTREAM_ERROR, without requesting a playlist', async () => {
    const fetchMock = stubFetch(() => Response.json({ items: [{ ...CHANNEL, contentDetails: undefined }] }));

    await expect(widget('latest_videos').fetch({ channel_id: 'UC_x5', number: 1 }, ctx)).rejects.toMatchObject({
      name: 'FetchError',
      code: 'UPSTREAM_ERROR',
      message: 'YouTube returned a channel without an uploads playlist.',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('maps a network failure to UPSTREAM_ERROR', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      }),
    );

    await expect(widget('channel_stats').fetch({ channel_id: 'UC_x5' }, ctx)).rejects.toMatchObject({ code: 'UPSTREAM_ERROR' });
  });

  it('never puts a fetch error\'s text (which can quote the Authorization header) in the client message', async () => {
    const token = 'tok-SECRET\nX-Injected: 1';
    // Real fetch, not a stub: Node rejects the header before any network I/O and quotes it in the error.
    const err = await widget('channel_stats')
      .fetch({ channel_id: 'UC_x5' }, { ...ctx, accessToken: token })
      .catch((e: unknown) => e);

    expect(err).toMatchObject({ name: 'FetchError', code: 'UPSTREAM_ERROR', message: 'YouTube request failed.' });
    expect((err as Error).message).not.toContain('SECRET');
  });
});
