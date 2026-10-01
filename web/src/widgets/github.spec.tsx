import type { WidgetDataMap } from '@dashboard/shared';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getView } from './registry.js';

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-10-01T14:00:00Z'), toFake: ['Date'] });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function renderView(widget: string, data: unknown, extra: { compact?: boolean; fetchedAt?: string } = {}) {
  const View = getView('github', widget);
  return render(<View data={data} {...extra} />);
}

const stat = (c: HTMLElement) => c.querySelector('[data-slot="widget-stat"]');
const channel = (c: HTMLElement) => c.querySelector('[data-slot="widget-channel"]');

const commits: WidgetDataMap['github.recent_commits'] = {
  repo: 'acme/telemetry',
  commits: [
    { sha: 'a3f9c21ffff', message: 'fix(grid): clamp resize', author: 'ada', date: '2026-10-01T12:00:00Z', url: 'https://x/c1' },
    { sha: '9e1b07dffff', message: 'feat: range bars', author: 'lin', date: '2026-09-28T14:00:00Z', url: 'https://x/c2' },
  ],
};

describe('github widget views', () => {
  it('recent_commits: repo channel, time since the last commit, and sha/message/author/age rows', () => {
    const { container } = renderView('recent_commits', commits);

    expect(channel(container)?.textContent).toBe('acme/telemetry');
    expect(stat(container)?.textContent).toContain('2h');
    expect(stat(container)?.textContent).toContain('since the last commit');
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'a3f9c21fix(grid): clamp resizeada2h',
      '9e1b07dfeat: range barslin3d',
    ]);
    const link = screen.getByRole('link', { name: 'fix(grid): clamp resize' });
    expect(link.getAttribute('href')).toBe('https://x/c1');
    expect(link.getAttribute('title')).toBe('fix(grid): clamp resize');
    expect(screen.getByText('a3f9c21').className).toContain('font-mono');
  });

  it('recent_commits: compact drops the stat, an empty list says so', () => {
    const { container } = renderView('recent_commits', commits, { compact: true });
    expect(stat(container)).toBeNull();

    cleanup();
    const empty = renderView('recent_commits', { ...commits, commits: [] });
    expect(stat(empty.container)).toBeNull();
    expect(screen.getByText('No commits.')).toBeTruthy();
  });

  it('pull_requests: repo and state= channel, count stat, #number/title/author rows', () => {
    const data: WidgetDataMap['github.pull_requests'] = {
      repo: 'acme/telemetry',
      state: 'open',
      pulls: [
        { number: 12, title: 'Improve README', state: 'open', author: 'ada', url: 'https://x/p1' },
        { number: 9, title: 'Refactor timer loop', state: 'open', author: 'lin', url: 'https://x/p2' },
      ],
    };
    const { container } = renderView('pull_requests', data);

    expect(channel(container)?.textContent).toBe('acme/telemetrystate=open');
    expect(stat(container)?.textContent).toBe('2open pull requests');
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      '#12Improve READMEada',
      '#9Refactor timer looplin',
    ]);
  });

  it('pull_requests: shows a neutral delta since the previous push', () => {
    const pr = (n: number) => ({ number: n, title: `t${n}`, state: 'open' as const, author: 'a', url: 'https://x' });
    const base = { repo: 'acme/telemetry', state: 'open' as const };
    const View = getView('github', 'pull_requests');
    const first = new Date(2026, 9, 1, 13, 40).toISOString();
    const firstPush = { data: { ...base, pulls: [pr(1)] }, fetchedAt: first };
    const { container, rerender } = render(<View {...firstPush} history={[firstPush]} />);
    expect(container.textContent).not.toContain('since');

    const second = { data: { ...base, pulls: [pr(1), pr(2)] }, fetchedAt: new Date(2026, 9, 1, 13, 41).toISOString() };
    rerender(<View {...second} history={[firstPush, second]} />);
    expect(stat(container)?.textContent).toContain('↑1 since 13:40');
  });

  it('security_alerts: count stat, severity bar with every count, swatch/summary/package rows', () => {
    const data: WidgetDataMap['github.security_alerts'] = {
      repo: 'acme/telemetry',
      alerts: [
        { number: 3, summary: 'Prototype pollution', severity: 'critical', package: 'minimist', url: 'https://x/a3' },
        { number: 4, summary: 'ReDoS', severity: 'high', package: 'path-to-regexp', url: 'https://x/a4' },
      ],
    };
    const { container } = renderView('security_alerts', data);

    expect(channel(container)?.textContent).toBe('acme/telemetryDependabot');
    expect(stat(container)?.textContent).toBe('2open alerts');
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe('1 critical, 1 high, 0 medium, 0 low');
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'critical: Prototype pollutionminimist',
      'high: ReDoSpath-to-regexp',
    ]);
  });

  it('security_alerts: an empty list shows the empty state', () => {
    renderView('security_alerts', { repo: 'acme/telemetry', alerts: [] });
    expect(screen.getByText('No open alerts.')).toBeTruthy();
  });

  it('never puts a non-http(s) url in an href', () => {
    renderView('recent_commits', { ...commits, commits: [{ ...commits.commits[0], url: 'javascript:alert(1)' }] });
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('fix(grid): clamp resize')).toBeTruthy();
  });
});
