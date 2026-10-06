import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RequestUser } from '../../auth/types.js';
import type { TokenCipherService } from '../../connections/token-cipher.service.js';
import type { PrismaService } from '../../core/prisma/prisma.service.js';
import type { GoogleTokenRefresher } from './google-token-refresher.js';
import { YoutubeSearchController } from './youtube-search.controller.js';
import { youtubeWidgets } from './youtube-widgets.js';

const user = { id: 'u1' } as RequestUser;

function stubFetch(response: () => Response) {
  const fetchMock = vi.fn(async () => response());
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function controller(connection: object | null = { accessTokenEnc: 'enc', expiresAt: null, externalAccountId: 'x' }) {
  const prisma = { serviceConnection: { findUnique: vi.fn(async () => connection) } };
  const cipher = { decrypt: vi.fn(() => 'tok') };
  const refresher = { refresh: vi.fn(async () => 'fresh') };
  return new YoutubeSearchController(
    prisma as unknown as PrismaService,
    cipher as unknown as TokenCipherService,
    refresher as unknown as GoogleTokenRefresher,
  );
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const item = (id: string, title: string, url?: string) => ({
  id: { kind: 'youtube#channel', channelId: id },
  snippet: { title, thumbnails: url ? { default: { url } } : {} },
});

afterEach(() => vi.unstubAllGlobals());

describe('YoutubeSearchController', () => {
  it('searches type=channel and returns each channel id, title and thumbnail', async () => {
    const fetchMock = stubFetch(() =>
      json({ items: [item('UC1', 'Telemetry Labs', 'https://img/1.jpg'), item('UC2', 'Tele Two')] }),
    );

    const res = await controller().search('  telemetry ', user);

    expect(res).toEqual({
      results: [
        { id: 'UC1', title: 'Telemetry Labs', thumbnail: 'https://img/1.jpg' },
        { id: 'UC2', title: 'Tele Two' },
      ],
    });
    const [input, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const url = new URL(input);
    expect(url.pathname).toBe('/youtube/v3/search');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ type: 'channel', q: 'telemetry', part: 'snippet' });
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer tok');
  });

  it('returns an empty list when nothing matches', async () => {
    stubFetch(() => json({}));
    expect(await controller().search('zzqxv', user)).toEqual({ results: [] });
  });

  it.each([undefined, '', ' a ', 'x'.repeat(101), ['ab']])('rejects the query %j with INVALID_QUERY', async (q) => {
    await expect(controller().search(q, user)).rejects.toMatchObject({ response: { error: 'INVALID_QUERY' }, status: 400 });
  });

  it('answers 409 NOT_CONNECTED without a youtube connection', async () => {
    await expect(controller(null).search('tele', user)).rejects.toMatchObject({
      response: { error: 'NOT_CONNECTED' },
      status: 409,
    });
  });

  it.each([
    [429, 'RATE_LIMITED', 429],
    [500, 'UPSTREAM_ERROR', 502],
    [400, 'INVALID_PARAMS', 502],
  ])('maps a YouTube HTTP %i to %s / %i', async (upstream, error, status) => {
    stubFetch(() => json({}, upstream));
    await expect(controller().search('tele', user)).rejects.toMatchObject({ response: { error }, status });
  });

  it('answers 502 UPSTREAM_ERROR on a malformed body, without leaking its text', async () => {
    stubFetch(() => json({ items: [{ id: null }] }));
    await expect(controller().search('tele', user)).rejects.toMatchObject({
      response: { error: 'UPSTREAM_ERROR' },
      status: 502,
    });
  });
});

describe('channel param', () => {
  it('is a youtube.channel search param with hidden title and image companions, not a raw id field', () => {
    for (const def of youtubeWidgets(vi.fn()).filter((d) => d.name !== 'trending_videos')) {
      expect(def.params.find((p) => p.name === 'channel_id')).toMatchObject({ search: 'youtube.channel', label: 'Channel' });
      expect(def.params.filter((p) => p.hidden).map((p) => p.name)).toEqual(['channel_title', 'channel_image']);
    }
  });
});
