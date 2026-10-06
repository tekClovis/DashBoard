import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FetchContext } from '../../catalog/widget-definition.js';
import { createSteamWidgets } from './steam.widgets.js';

const header = (appId: number) => `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg`;
const ctx: FetchContext = { userId: 'user-1', externalAccountId: '76561198000000001' };

function stubSteam(status: number, body: unknown): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function requestedUrl(fetchMock: ReturnType<typeof vi.fn>): URL {
  return new URL(fetchMock.mock.calls[0]![0] as string);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('steam widgets', () => {
  const [recentlyPlayed, gameNews] = createSteamWidgets('test-key');

  it('declares the catalog params and refresh floors from Architecture §3', () => {
    expect(recentlyPlayed).toMatchObject({ service: 'steam', name: 'recently_played', auth: 'connection', minRefreshSec: 600 });
    expect(recentlyPlayed.params).toEqual([
      { name: 'number', type: 'integer', required: true, default: 5, min: 1, max: 10, label: 'Number' },
    ]);
    expect(gameNews).toMatchObject({ service: 'steam', name: 'game_news', auth: 'connection', minRefreshSec: 900 });
    expect(gameNews.params.map((p) => [p.name, p.type, p.required])).toEqual([
      ['app_id', 'integer', true],
      ['number', 'integer', true],
    ]);
  });

  describe('recently_played', () => {
    it('queries with the server key and the connection SteamID64, and maps up to `number` games', async () => {
      const fetchMock = stubSteam(200, {
        response: {
          total_count: 3,
          games: [
            { appid: 220, name: 'Half-Life 2', playtime_2weeks: 192, playtime_forever: 900 },
            { appid: 620, name: 'Portal 2', playtime_2weeks: 90, playtime_forever: 300 },
            { appid: 413150, name: 'Stardew Valley', playtime_forever: 50 },
          ],
        },
      });

      const data = await recentlyPlayed.fetch({ number: 2 }, ctx);

      const url = requestedUrl(fetchMock);
      expect(url.pathname).toBe('/IPlayerService/GetRecentlyPlayedGames/v1/');
      expect(url.searchParams.get('key')).toBe('test-key');
      expect(url.searchParams.get('steamid')).toBe('76561198000000001');
      expect(url.searchParams.get('count')).toBe('2');
      expect(data).toEqual({
        games: [
          { appId: 220, name: 'Half-Life 2', playtime2Weeks: 192, playtimeForever: 900, imageUrl: header(220) },
          { appId: 620, name: 'Portal 2', playtime2Weeks: 90, playtimeForever: 300, imageUrl: header(620) },
        ],
      });
    });

    it('returns an empty list for a private profile (`response: {}`)', async () => {
      stubSteam(200, { response: {} });
      await expect(recentlyPlayed.fetch({ number: 5 }, ctx)).resolves.toEqual({ games: [] });
    });

    it('maps a non-2xx response to UPSTREAM_ERROR', async () => {
      stubSteam(403, '<html>Forbidden</html>');
      await expect(recentlyPlayed.fetch({ number: 5 }, ctx)).rejects.toMatchObject({ code: 'UPSTREAM_ERROR' });
    });

    it('maps a malformed body to UPSTREAM_ERROR', async () => {
      stubSteam(200, { nope: true });
      await expect(recentlyPlayed.fetch({ number: 5 }, ctx)).rejects.toMatchObject({ code: 'UPSTREAM_ERROR' });
    });

    it('maps a non-JSON body to UPSTREAM_ERROR', async () => {
      stubSteam(200, 'not json');
      await expect(recentlyPlayed.fetch({ number: 5 }, ctx)).rejects.toMatchObject({ code: 'UPSTREAM_ERROR' });
    });

    it('throws NOT_CONNECTED without a SteamID64', async () => {
      const fetchMock = stubSteam(200, { response: {} });
      await expect(recentlyPlayed.fetch({ number: 5 }, { userId: 'user-1' })).rejects.toMatchObject({
        code: 'NOT_CONNECTED',
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('game_news', () => {
    it('maps up to `number` news items for the app', async () => {
      const fetchMock = stubSteam(200, {
        appnews: {
          appid: 620,
          count: 800,
          newsitems: [
            { gid: '1', title: 'Community update', url: 'https://x/1', feedlabel: 'Community Announcements', date: 1_700_000_000 },
            { gid: '2', title: 'Patch notes 1.12', url: 'https://x/2', feedlabel: 'PC Gamer', date: 1_699_000_000 },
          ],
        },
      });

      const data = await gameNews.fetch({ app_id: 620, number: 1 }, ctx);

      const url = requestedUrl(fetchMock);
      expect(url.pathname).toBe('/ISteamNews/GetNewsForApp/v2/');
      expect(url.searchParams.get('appid')).toBe('620');
      expect(url.searchParams.get('count')).toBe('1');
      expect(data).toEqual({
        appId: 620,
        items: [
          {
            id: '1',
            title: 'Community update',
            url: 'https://x/1',
            feedLabel: 'Community Announcements',
            date: new Date(1_700_000_000 * 1000).toISOString(),
            imageUrl: header(620),
          },
        ],
      });
    });

    it('drops items whose url is not http(s)', async () => {
      stubSteam(200, {
        appnews: {
          newsitems: [
            { gid: '1', title: 'js', url: 'javascript:alert(document.domain)', feedlabel: 'x', date: 1_700_000_000 },
            { gid: '2', title: 'data', url: 'data:text/html,<script>alert(1)</script>', feedlabel: 'x', date: 1_700_000_000 },
            { gid: '3', title: 'malformed', url: 'not a url', feedlabel: 'x', date: 1_700_000_000 },
            { gid: '4', title: 'http', url: 'http://x/4', feedlabel: 'x', date: 1_700_000_000 },
            { gid: '5', title: 'https', url: 'https://x/5', feedlabel: 'x', date: 1_700_000_000 },
          ],
        },
      });

      const data = await gameNews.fetch({ app_id: 620, number: 2 }, ctx);

      expect(data.items.map((item) => item.url)).toEqual(['http://x/4', 'https://x/5']);
    });

    it('maps Steam\'s 403 for an unknown app_id to INVALID_PARAMS', async () => {
      stubSteam(403, {});
      await expect(gameNews.fetch({ app_id: 999_999_999, number: 5 }, ctx)).rejects.toMatchObject({
        code: 'INVALID_PARAMS',
      });
    });

    it('maps other non-2xx responses to UPSTREAM_ERROR', async () => {
      stubSteam(500, {});
      await expect(gameNews.fetch({ app_id: 620, number: 5 }, ctx)).rejects.toMatchObject({ code: 'UPSTREAM_ERROR' });
    });

    it('maps a malformed body to UPSTREAM_ERROR', async () => {
      stubSteam(200, { appnews: {} });
      await expect(gameNews.fetch({ app_id: 620, number: 5 }, ctx)).rejects.toMatchObject({ code: 'UPSTREAM_ERROR' });
    });
  });

  it('fails every fetch fast with UPSTREAM_ERROR when STEAM_API_KEY is not configured', async () => {
    const fetchMock = stubSteam(200, {});
    const unconfigured = createSteamWidgets(undefined);

    for (const def of unconfigured) {
      await expect(def.fetch({ app_id: 620, number: 5 }, ctx)).rejects.toMatchObject({
        code: 'UPSTREAM_ERROR',
        message: 'Steam API not configured',
      });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
