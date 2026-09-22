// Steam widget definitions — see docs/Architecture.md §3's widget catalog and
// features/steam-widgets/spec.md.
//
// Steam stores only the SteamID64 on the ServiceConnection (no token — Architecture §5.2);
// the Web API key is server-side STEAM_API_KEY. A missing key still registers the widgets
// (Architecture §11: "still listed") but every fetch() fails fast.

import type { ParamSpec, SteamNewsItem, SteamRecentGame } from '@dashboard/shared';
import type { FetchContext, WidgetDefinition } from '../../catalog/widget-definition.js';
import { FetchError } from '../../timer/fetch-error.js';

const STEAM_API = 'https://api.steampowered.com';
const FETCH_TIMEOUT_MS = 10_000;
const NUMBER_PARAM: ParamSpec = { name: 'number', type: 'integer', required: true, default: 5, min: 1, max: 10, label: 'Number' };

interface RecentlyPlayedResponse {
  response?: {
    games?: { appid: number; name: string; playtime_2weeks?: number; playtime_forever: number }[];
  };
}

interface NewsResponse {
  appnews?: {
    newsitems?: { gid: string; title: string; url: string; feedlabel: string; date: number }[];
  };
}

export function createSteamWidgets(
  apiKey: string | undefined,
): [WidgetDefinition<'steam.recently_played'>, WidgetDefinition<'steam.game_news'>] {
  return [
    {
      service: 'steam',
      name: 'recently_played',
      description: 'Games you played on Steam in the last two weeks.',
      params: [NUMBER_PARAM],
      minRefreshSec: 600,
      auth: 'connection',
      fetch: async (params, ctx) => {
        const count = Number(params['number']);
        const body = await steamGet<RecentlyPlayedResponse>(apiKey, '/IPlayerService/GetRecentlyPlayedGames/v1/', {
          steamid: steamId(ctx),
          count: String(count),
        });
        if (!body.response) throw malformed();
        // A private profile answers `response: {}` with no `games` — an empty list, not an error.
        const games = body.response.games ?? [];
        if (!Array.isArray(games)) throw malformed();
        return {
          games: games.slice(0, count).map(
            (game): SteamRecentGame => ({
              appId: game.appid,
              name: game.name,
              playtime2Weeks: game.playtime_2weeks ?? 0,
              playtimeForever: game.playtime_forever,
            }),
          ),
        };
      },
    },
    {
      service: 'steam',
      name: 'game_news',
      description: 'Latest news for a Steam game.',
      params: [{ name: 'app_id', type: 'integer', required: true, min: 1, label: 'App ID' }, NUMBER_PARAM],
      minRefreshSec: 900,
      auth: 'connection',
      fetch: async (params) => {
        const appId = Number(params['app_id']);
        const count = Number(params['number']);
        // Steam answers 403 `{}` for an app id it doesn't know. `maxlength` trims the unused `contents` body.
        const body = await steamGet<NewsResponse>(
          apiKey,
          '/ISteamNews/GetNewsForApp/v2/',
          { appid: String(appId), count: String(count), maxlength: '1' },
          () => new FetchError('INVALID_PARAMS', `Unknown Steam app_id ${appId}`),
        );
        const items = body.appnews?.newsitems;
        if (!Array.isArray(items)) throw malformed();
        return {
          appId,
          items: items.slice(0, count).map(
            (item): SteamNewsItem => ({
              id: item.gid,
              title: item.title,
              url: item.url,
              feedLabel: item.feedlabel,
              date: new Date(item.date * 1000).toISOString(),
            }),
          ),
        };
      },
    },
  ];
}

function steamId(ctx: FetchContext): string {
  if (!ctx.externalAccountId) throw new FetchError('NOT_CONNECTED', 'No steam connection for this user.');
  return ctx.externalAccountId;
}

function malformed(): FetchError {
  return new FetchError('UPSTREAM_ERROR', 'Malformed Steam API response.');
}

async function steamGet<T>(
  apiKey: string | undefined,
  path: string,
  query: Record<string, string>,
  on403?: () => FetchError,
): Promise<T> {
  if (!apiKey) throw new FetchError('UPSTREAM_ERROR', 'Steam API not configured');
  const url = `${STEAM_API}${path}?${new URLSearchParams({ ...query, key: apiKey, format: 'json' })}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (res.status === 403 && on403) throw on403();
  if (!res.ok) throw new FetchError('UPSTREAM_ERROR', `Steam API responded ${res.status}.`);
  return (await res.json().catch(() => {
    throw malformed();
  })) as T;
}
