// Per-widget data shapes — see docs/Architecture.md §3.
//
// 'service.widget' → data shape, shared by each server fetch() and its client
// view so the two cannot drift apart. Test-only widgets augment this interface
// via `declare module` instead.

export interface WidgetDataMap {
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
}

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
