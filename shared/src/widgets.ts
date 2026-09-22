// Per-widget data shapes — see docs/Architecture.md §3.
//
// Each `services/<name>` module augments this interface with its own widget
// keys ('service.widget' → data shape) via `declare module`, so a view and
// its server fetch() cannot drift apart.

// oxlint-disable-next-line no-empty-object-type
export interface WidgetDataMap {}

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

declare module './widgets.js' {
  interface WidgetDataMap {
    'github.recent_commits': { repo: string; commits: GithubCommit[] };
    'github.pull_requests': { repo: string; state: 'open' | 'closed' | 'all'; pulls: GithubPullRequest[] };
    'github.security_alerts': { repo: string; alerts: GithubSecurityAlert[] };
  }
}
