// Steam widget definitions — see docs/Architecture.md §3's widget catalog and
// features/steam-widgets/spec.md.
//
// Steam stores only the SteamID64 on the ServiceConnection (no token — Architecture §5.2);
// the Web API key is server-side STEAM_API_KEY. A missing key still registers the widgets
// (Architecture §11: "still listed") but every fetch() fails fast.

import type { GameCandidate, ParamSpec, SteamNewsItem, SteamRecentGame } from '@dashboard/shared';
import type { FetchContext, WidgetDefinition } from '../../catalog/widget-definition.js';
import { FetchError } from '../../timer/fetch-error.js';

const STEAM_API = 'https://api.steampowered.com';
const STEAM_STORE_DETAILS = 'https://store.steampowered.com/api/appdetails';
const STEAM_STORE_SEARCH = 'https://store.steampowered.com/api/storesearch/';
const FETCH_TIMEOUT_MS = 10_000;
const headerImage = (appId: number) => `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg`;
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

/**
 * Builds the Steam widget definitions, closing over the Web API key.
 * @param apiKey - `STEAM_API_KEY`; when absent the widgets still exist but every fetch fails with UPSTREAM_ERROR.
 */
export function createSteamWidgets(
  apiKey: string | undefined,
): [WidgetDefinition<'steam.recently_played'>, WidgetDefinition<'steam.game_news'>] {
  // Names of apps looked up in the store (widgets saved before the picker stored `game_name`). Only hits are cached.
  const names = new Map<number, string>();
  const resolveName = async (appId: number, stored: unknown): Promise<string> => {
    if (typeof stored === 'string' && stored.trim()) return stored;
    const cached = names.get(appId);
    if (cached) return cached;
    const name = await lookupGameName(appId);
    if (name) names.set(appId, name);
    return name ?? `App ${appId}`;
  };
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
              imageUrl: headerImage(game.appid),
            }),
          ),
        };
      },
    },
    {
      service: 'steam',
      name: 'game_news',
      description: 'Latest news for a Steam game.',
      params: [
        { name: 'app_id', type: 'integer', required: true, min: 1, label: 'Game', search: 'steam.game' },
        { name: 'game_name', type: 'string', hidden: true },
        { name: 'game_image', type: 'string', hidden: true, pattern: '^https://' },
        NUMBER_PARAM,
      ],
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
          gameName: await resolveName(appId, params['game_name']),
          // Drop items whose link isn't http(s): the url reaches an <a href> in the web view.
          items: items.filter((item) => isHttpUrl(item.url)).slice(0, count).map(
            (item): SteamNewsItem => ({
              id: item.gid,
              title: item.title,
              url: item.url,
              feedLabel: item.feedlabel,
              date: new Date(item.date * 1000).toISOString(),
              imageUrl: headerImage(appId),
            }),
          ),
        };
      },
    },
  ];
}

const SEARCH_COUNT = 10;
const MIN_QUERY_LENGTH = 2;

interface StoreSearchResponse {
  items?: { id: number; name: string; tiny_image?: string }[];
}

/** Games matching a free-text query, from the Steam store search. Queries under 2 characters match nothing. */
export async function searchGames(query: string): Promise<GameCandidate[]> {
  const term = query.trim();
  if (term.length < MIN_QUERY_LENGTH) return [];
  const url = `${STEAM_STORE_SEARCH}?${new URLSearchParams({ term, cc: 'us', l: 'english' })}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new FetchError('UPSTREAM_ERROR', `Steam store responded ${res.status}.`);
  const body = (await res.json().catch(() => {
    throw malformed();
  })) as StoreSearchResponse;
  if (!Array.isArray(body.items)) throw malformed();
  return body.items.slice(0, SEARCH_COUNT).map((item) => ({
    appId: item.id,
    name: item.name,
    image: item.tiny_image ?? `https://cdn.cloudflare.steamstatic.com/steam/apps/${item.id}/capsule_184x69.jpg`,
  }));
}

/** The store's name for an app, or undefined when it can't be resolved (never throws). */
async function lookupGameName(appId: number): Promise<string | undefined> {
  try {
    const url = `${STEAM_STORE_DETAILS}?${new URLSearchParams({ appids: String(appId), filters: 'basic' })}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return undefined;
    const body = (await res.json()) as Record<string, { success?: boolean; data?: { name?: unknown } } | undefined>;
    const name = body[String(appId)]?.data?.name;
    return typeof name === 'string' && name ? name : undefined;
  } catch {
    return undefined;
  }
}

function steamId(ctx: FetchContext): string {
  if (!ctx.externalAccountId) throw new FetchError('NOT_CONNECTED', 'No steam connection for this user.');
  return ctx.externalAccountId;
}

function isHttpUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

function malformed(): FetchError {
  return new FetchError('UPSTREAM_ERROR', 'Malformed Steam API response.');
}

/** GETs a Steam Web API path as JSON; `on403` supplies the error for a 403 (otherwise any non-2xx is UPSTREAM_ERROR). */
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
