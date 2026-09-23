import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FetchContext, WidgetDefinition } from '../../catalog/widget-definition.js';
import { WidgetRegistryService } from '../../catalog/widget-registry.service.js';
import { validateParams } from '../../catalog/param-validator.js';
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
  snippet: { title: 'Google for Developers' },
  statistics: { subscriberCount: '2400000', hiddenSubscriberCount: false, viewCount: '180000000', videoCount: '412' },
  contentDetails: { relatedPlaylists: { uploads: 'UUuploads' } },
};

const snippet = (title: string, publishedAt: string) => ({ title, channelTitle: 'Chan', publishedAt });

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
    expect(data).toEqual({ channelId: 'UC_x5', title: 'Google for Developers', subscribers: 2400000, views: 180000000, videos: 412 });
  });

  it('channel_stats reports a hidden subscriber count as null', async () => {
    const hidden = { ...CHANNEL, statistics: { ...CHANNEL.statistics, subscriberCount: undefined, hiddenSubscriberCount: true } };
    stubFetch(() => Response.json({ items: [hidden] }));

    await expect(widget('channel_stats').fetch({ channel_id: 'UC_x5' }, ctx)).resolves.toMatchObject({ subscribers: null });
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
        { id: 'v2', title: 'Newer', channel: 'Chan', publishedAt: '2026-09-20T00:00:00Z', url: 'https://www.youtube.com/watch?v=v2' },
        { id: 'v1', title: 'Older', channel: 'Chan', publishedAt: '2026-09-10T00:00:00Z', url: 'https://www.youtube.com/watch?v=v1' },
      ],
    });
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

  it('propagates a failed refresh without retrying the request', async () => {
    const refresh = vi.fn(async () => {
      throw new Error('refresh failed');
    });
    const fetchMock = stubFetch(() => Response.json({}, { status: 401 }));

    await expect(widget('channel_stats', refresh).fetch({ channel_id: 'UC_x5' }, ctx)).rejects.toThrow('refresh failed');
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

  it('maps a network failure to UPSTREAM_ERROR', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      }),
    );

    await expect(widget('channel_stats').fetch({ channel_id: 'UC_x5' }, ctx)).rejects.toMatchObject({ code: 'UPSTREAM_ERROR' });
  });
});
