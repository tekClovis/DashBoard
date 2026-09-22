// Per-widget data shapes — see docs/Architecture.md §3.
//
// Each `services/<name>` module adds its own widget keys ('service.widget' →
// data shape) here, so a view and its server fetch() cannot drift apart.

export interface SteamRecentGame {
  appId: number;
  name: string;
  /** Minutes played in the last two weeks. */
  playtime2Weeks: number;
  /** Minutes played in total. */
  playtimeForever: number;
}

export interface SteamNewsItem {
  id: string;
  title: string;
  url: string;
  feedLabel: string;
  /** ISO-8601 publication date. */
  date: string;
}

export interface WidgetDataMap {
  'steam.recently_played': { games: SteamRecentGame[] };
  'steam.game_news': { appId: number; items: SteamNewsItem[] };
}
