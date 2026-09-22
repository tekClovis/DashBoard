import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FetchContext, WidgetDefinition } from '../../catalog/widget-definition.js';
import { WidgetRegistryService } from '../../catalog/widget-registry.service.js';
import { validateParams } from '../../catalog/param-validator.js';
import { GithubModule } from './github.module.js';
import { githubWidgets } from './github-widgets.js';

const ctx: FetchContext = { userId: 'u1', accessToken: 'tok' };

function widget(name: string): WidgetDefinition {
  const def = githubWidgets.find((d) => d.name === name);
  if (!def) throw new Error(`no widget ${name}`);
  return def as WidgetDefinition;
}

function stubFetch(body: unknown, init: ResponseInit = {}) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status: 200, ...init }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function requestedUrl(fetchMock: ReturnType<typeof stubFetch>): URL {
  return new URL((fetchMock.mock.calls[0] as unknown as [string])[0]);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GithubModule', () => {
  it('registers the github oauth service with its three connection-scoped widgets', () => {
    const registry = new WidgetRegistryService();
    new GithubModule(registry).onModuleInit();

    const [service] = registry.services();
    expect(service).toMatchObject({ name: 'github', connection: 'oauth' });
    expect(service.widgets.map((w) => [w.name, w.minRefreshSec])).toEqual([
      ['recent_commits', 60],
      ['pull_requests', 60],
      ['security_alerts', 300],
    ]);
    expect(githubWidgets.every((d) => d.auth === 'connection')).toBe(true);
  });
});

describe('repo param pattern', () => {
  it.each(['octocat/hello-world', 'my-org/repo.name_2'])('accepts %s', (repo) => {
    expect(validateParams(widget('security_alerts').params, { repo }).ok).toBe(true);
  });

  it.each(['octocat', 'a/b/c', 'owner/..', '../x', 'owner/na me', 'owner/repo?x=1'])('rejects %s', (repo) => {
    expect(validateParams(widget('security_alerts').params, { repo }).ok).toBe(false);
  });
});

describe('github widgets fetch()', () => {
  it('recent_commits requests `number` commits with Bearer auth and maps them, most recent first', async () => {
    const fetchMock = stubFetch([
      { sha: 'a1b2c3d', html_url: 'u1', commit: { message: 'Fix flaky test\n\nbody', author: { name: 'Ada', date: '2026-01-02' } } },
      { sha: 'e4f5a6b', html_url: 'u2', commit: { message: 'Bump deps', author: null } },
    ]);

    const data = await widget('recent_commits').fetch({ repo: 'octocat/hello-world', number: 2 }, ctx);

    const url = requestedUrl(fetchMock);
    expect(url.pathname).toBe('/repos/octocat/hello-world/commits');
    expect(url.searchParams.get('per_page')).toBe('2');
    const headers = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer tok');
    expect(data).toEqual({
      repo: 'octocat/hello-world',
      commits: [
        { sha: 'a1b2c3d', message: 'Fix flaky test', author: 'Ada', date: '2026-01-02', url: 'u1' },
        { sha: 'e4f5a6b', message: 'Bump deps', author: '', date: '', url: 'u2' },
      ],
    });
  });

  it('pull_requests passes the state filter through and maps PRs', async () => {
    const fetchMock = stubFetch([
      { number: 7, title: 'Improve README', state: 'closed', html_url: 'p7', user: { login: 'octocat' } },
    ]);

    const data = await widget('pull_requests').fetch({ repo: 'octocat/hello-world', state: 'closed' }, ctx);

    const url = requestedUrl(fetchMock);
    expect(url.pathname).toBe('/repos/octocat/hello-world/pulls');
    expect(url.searchParams.get('state')).toBe('closed');
    expect(data).toEqual({
      repo: 'octocat/hello-world',
      state: 'closed',
      pulls: [{ number: 7, title: 'Improve README', state: 'closed', author: 'octocat', url: 'p7' }],
    });
  });

  it('security_alerts maps open Dependabot alerts, and an empty list is valid', async () => {
    const fetchMock = stubFetch([
      {
        number: 3,
        html_url: 'a3',
        security_advisory: { summary: 'Prototype pollution in lodash', severity: 'high' },
        dependency: { package: { name: 'lodash' } },
      },
    ]);

    const data = await widget('security_alerts').fetch({ repo: 'octocat/hello-world' }, ctx);

    const url = requestedUrl(fetchMock);
    expect(url.pathname).toBe('/repos/octocat/hello-world/dependabot/alerts');
    expect(url.searchParams.get('state')).toBe('open');
    expect(data).toEqual({
      repo: 'octocat/hello-world',
      alerts: [{ number: 3, summary: 'Prototype pollution in lodash', severity: 'high', package: 'lodash', url: 'a3' }],
    });

    stubFetch([]);
    await expect(widget('security_alerts').fetch({ repo: 'octocat/hello-world' }, ctx)).resolves.toEqual({
      repo: 'octocat/hello-world',
      alerts: [],
    });
  });

  it.each([
    [401, {}, 'REAUTH_REQUIRED'],
    [403, { 'x-ratelimit-remaining': '0' }, 'RATE_LIMITED'],
    [403, { 'retry-after': '60' }, 'RATE_LIMITED'],
    [429, {}, 'RATE_LIMITED'],
    [404, {}, 'INVALID_PARAMS'],
    [403, {}, 'UPSTREAM_ERROR'],
    [500, {}, 'UPSTREAM_ERROR'],
  ])('maps HTTP %i %o to %s', async (status, headers, code) => {
    stubFetch({ message: 'nope' }, { status, headers });

    await expect(widget('recent_commits').fetch({ repo: 'octocat/hello-world', number: 5 }, ctx)).rejects.toMatchObject({
      name: 'FetchError',
      code,
    });
  });

  it('maps a network failure to UPSTREAM_ERROR', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      }),
    );

    await expect(widget('pull_requests').fetch({ repo: 'octocat/hello-world', state: 'open' }, ctx)).rejects.toMatchObject({
      code: 'UPSTREAM_ERROR',
    });
  });

  it('rejects a malformed repo with INVALID_PARAMS without calling GitHub', async () => {
    const fetchMock = stubFetch([]);

    await expect(widget('security_alerts').fetch({ repo: 'owner/..' }, ctx)).rejects.toMatchObject({ code: 'INVALID_PARAMS' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('treats a connection without a token as REAUTH_REQUIRED', async () => {
    const fetchMock = stubFetch([]);

    await expect(widget('security_alerts').fetch({ repo: 'octocat/hello-world' }, { userId: 'u1' })).rejects.toMatchObject({
      code: 'REAUTH_REQUIRED',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
