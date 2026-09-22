// GitHub widget definitions — see docs/Architecture.md §3's widget catalog and
// features/github-widgets/spec.md. Data shapes live in shared/src/widgets.ts.

import type { GithubSecurityAlert, ParamSpec } from '@dashboard/shared';
import type { WidgetDefinition } from '../../catalog/widget-definition.js';
import { githubGet, REPO_PATTERN, repoPath } from './github-api.js';

const PAGE_SIZE = 20;

const repoParam: ParamSpec = { name: 'repo', type: 'string', required: true, pattern: REPO_PATTERN, label: 'Repository (owner/name)' };

interface RawCommit {
  sha: string;
  html_url: string;
  commit: { message: string; author: { name?: string; date?: string } | null };
}

interface RawPull {
  number: number;
  title: string;
  state: 'open' | 'closed';
  html_url: string;
  user: { login: string } | null;
}

interface RawAlert {
  number: number;
  html_url: string;
  security_advisory: { summary: string; severity: GithubSecurityAlert['severity'] };
  dependency: { package: { name: string } };
}

const recentCommits: WidgetDefinition<'github.recent_commits'> = {
  service: 'github',
  name: 'recent_commits',
  description: 'Latest commits on the default branch of a repository.',
  params: [repoParam, { name: 'number', type: 'integer', required: true, default: 5, min: 1, max: 20, label: 'Commits' }],
  minRefreshSec: 60,
  auth: 'connection',
  fetch: async (params, ctx) => {
    const raw = await githubGet<RawCommit[]>(`${repoPath(params['repo'])}/commits?per_page=${Number(params['number'])}`, ctx.accessToken);
    return {
      repo: String(params['repo']),
      commits: raw.map((c) => ({
        sha: c.sha,
        message: c.commit.message.split('\n', 1)[0],
        author: c.commit.author?.name ?? '',
        date: c.commit.author?.date ?? '',
        url: c.html_url,
      })),
    };
  },
};

const pullRequests: WidgetDefinition<'github.pull_requests'> = {
  service: 'github',
  name: 'pull_requests',
  description: 'Pull requests of a repository, filtered by state.',
  params: [repoParam, { name: 'state', type: 'string', required: true, default: 'open', enum: ['open', 'closed', 'all'], label: 'State' }],
  minRefreshSec: 60,
  auth: 'connection',
  fetch: async (params, ctx) => {
    const state = String(params['state']) as 'open' | 'closed' | 'all';
    const query = new URLSearchParams({ state, per_page: String(PAGE_SIZE) });
    const raw = await githubGet<RawPull[]>(`${repoPath(params['repo'])}/pulls?${query}`, ctx.accessToken);
    return {
      repo: String(params['repo']),
      state,
      pulls: raw.map((p) => ({
        number: p.number,
        title: p.title,
        state: p.state,
        author: p.user?.login ?? '',
        url: p.html_url,
      })),
    };
  },
};

const securityAlerts: WidgetDefinition<'github.security_alerts'> = {
  service: 'github',
  name: 'security_alerts',
  description: 'Open Dependabot security alerts of a repository.',
  params: [repoParam],
  minRefreshSec: 300,
  auth: 'connection',
  fetch: async (params, ctx) => {
    const raw = await githubGet<RawAlert[]>(`${repoPath(params['repo'])}/dependabot/alerts?state=open&per_page=${PAGE_SIZE}`, ctx.accessToken);
    return {
      repo: String(params['repo']),
      alerts: raw.map((a) => ({
        number: a.number,
        summary: a.security_advisory.summary,
        severity: a.security_advisory.severity,
        package: a.dependency.package.name,
        url: a.html_url,
      })),
    };
  },
};

export const githubWidgets = [recentCommits, pullRequests, securityAlerts];
