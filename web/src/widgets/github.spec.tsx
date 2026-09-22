import type { WidgetDataMap } from '@dashboard/shared';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { getView } from './registry.js';

afterEach(cleanup);

function renderView(widget: string, data: unknown) {
  const View = getView('github', widget);
  return render(<View data={data} />);
}

describe('github widget views', () => {
  it('recent_commits lists commit messages with short SHAs linking to GitHub', () => {
    const data: WidgetDataMap['github.recent_commits'] = {
      repo: 'octocat/hello-world',
      commits: [{ sha: 'a1b2c3d4e5f6', message: 'Fix flaky test', author: 'Ada', date: '2026-01-02', url: 'https://x/c1' }],
    };
    renderView('recent_commits', data);

    expect(screen.getByRole('link', { name: 'Fix flaky test' }).getAttribute('href')).toBe('https://x/c1');
    expect(screen.getByText('a1b2c3d')).toBeTruthy();
  });

  it('pull_requests shows a text state badge per PR', () => {
    const data: WidgetDataMap['github.pull_requests'] = {
      repo: 'octocat/hello-world',
      state: 'all',
      pulls: [
        { number: 1, title: 'Improve README', state: 'open', author: 'a', url: 'p1' },
        { number: 2, title: 'Refactor timer loop', state: 'closed', author: 'b', url: 'p2' },
      ],
    };
    renderView('pull_requests', data);

    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Improve READMEopen',
      'Refactor timer loopclosed',
    ]);
  });

  it('security_alerts shows severity badges, and an empty state when there are none', () => {
    const data: WidgetDataMap['github.security_alerts'] = {
      repo: 'octocat/hello-world',
      alerts: [{ number: 3, summary: 'Prototype pollution in lodash', severity: 'high', package: 'lodash', url: 'a3' }],
    };
    renderView('security_alerts', data);
    expect(screen.getByRole('listitem').textContent).toBe('Prototype pollution in lodashhigh');

    cleanup();
    renderView('security_alerts', { ...data, alerts: [] });
    expect(screen.getByText('No open alerts.')).toBeTruthy();
  });
});
