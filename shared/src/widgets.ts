// Per-widget data shapes — see docs/Architecture.md §3.
//
// 'service.widget' → data shape, shared by each server fetch() and its client
// view so the two cannot drift apart. Test-only widgets augment this interface
// via `declare module` instead.

export interface WidgetDataMap {
  'github.recent_commits': { repo: string; commits: GithubCommit[] };
  'github.pull_requests': { repo: string; state: 'open' | 'closed' | 'all'; pulls: GithubPullRequest[] };
  'github.security_alerts': { repo: string; alerts: GithubSecurityAlert[] };
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
