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
  'github.recent_commits': { repo: string; commits: GithubCommit[] };
  'github.pull_requests': { repo: string; state: 'open' | 'closed' | 'all'; pulls: GithubPullRequest[] };
  'github.security_alerts': { repo: string; alerts: GithubSecurityAlert[] };
  'weather.current_weather': CurrentWeatherData;
  'weather.forecast': ForecastData;
}

// --- github (server/src/services/github) ---

export interface GithubCommit {
  sha: string;
  /** First line of the commit message. */
  message: string;
  author: string;
  date: string;
  url: string;
}

export interface GithubPullRequest {
  number: number;
  title: string;
  state: 'open' | 'closed';
  author: string;
  url: string;
}

export interface GithubSecurityAlert {
  number: number;
  summary: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  package: string;
  url: string;

// weather — server/src/services/weather/
export interface CurrentWeatherData {
  /** Resolved place name, e.g. "Paris, France". */
  location: string;
  temperature: number;
  unit: '°C' | '°F';
  condition: string;
}

export interface ForecastDay {
  /** ISO date (YYYY-MM-DD), local to the location. Temperatures are °C. */
  date: string;
  min: number;
  max: number;
  condition: string;
}

export interface ForecastData {
  location: string;
  days: ForecastDay[];
}
