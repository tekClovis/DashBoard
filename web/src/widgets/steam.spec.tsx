import type { WidgetDataMap } from '@dashboard/shared';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getView } from './registry.js';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const stat = (c: HTMLElement) => c.querySelector('[data-slot="widget-stat"]');
const channel = (c: HTMLElement) => c.querySelector('[data-slot="widget-channel"]');

describe('steam views', () => {
  it('recently_played: "Last 2 weeks" channel, total hours stat, game/meter/hours rows', () => {
    const data: WidgetDataMap['steam.recently_played'] = {
      games: [
        { appId: 220, name: 'Half-Life 2', playtime2Weeks: 192, playtimeForever: 900 },
        { appId: 620, name: 'Portal 2', playtime2Weeks: 90, playtimeForever: 300 },
      ],
    };
    const View = getView('steam', 'recently_played');
    const { container } = render(<View data={data} />);

    expect(channel(container)?.textContent).toBe('Last 2 weeks');
    expect(stat(container)?.textContent).toBe('4.7hplayed in total');
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Half-Life 23.2 h', 'Portal 21.5 h']);
    const meters = container.querySelectorAll<HTMLElement>('[data-slot="meter"] > i');
    expect([...meters].map((m) => m.style.width)).toEqual(['100%', '46.875%']);
  });

  it('game_news: app_id channel, posts in the last 7 days, title/feed/age rows', () => {
    vi.useFakeTimers({ now: new Date('2026-09-10T12:00:00Z'), toFake: ['Date'] });
    const data: WidgetDataMap['steam.game_news'] = {
      appId: 620,
      items: [
        { id: 'n1', title: 'Patch notes 1.12', url: 'https://x/n1', feedLabel: 'Community', date: '2026-09-01T12:00:00Z' },
        { id: 'n2', title: 'Sale', url: 'https://x/n2', feedLabel: 'Steam', date: '2026-09-10T07:00:00Z' },
      ],
    };
    const View = getView('steam', 'game_news');
    const { container } = render(<View data={data} />);

    expect(channel(container)?.textContent).toBe('app_id=620');
    expect(stat(container)?.textContent).toBe('1posts in the last 7 days');
    expect(screen.getByRole('link', { name: 'Patch notes 1.12' }).getAttribute('href')).toBe('https://x/n1');
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Patch notes 1.12Community9d',
      'SaleSteam5h',
    ]);
  });

  it('renders a non-http(s) news url as plain text, not a link', () => {
    const data: WidgetDataMap['steam.game_news'] = {
      appId: 620,
      items: [
        { id: 'n1', title: 'Evil', url: 'javascript:alert(1)', feedLabel: 'Community', date: '2026-09-01T12:00:00Z' },
      ],
    };
    const View = getView('steam', 'game_news');
    const { container } = render(<View data={data} />);

    expect(screen.getByText('Evil')).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
    expect(container.querySelector('[href]')).toBeNull();
  });

  it('shows an empty state instead of an empty list', () => {
    const View = getView('steam', 'recently_played');
    render(<View data={{ games: [] }} />);
    expect(screen.getByText('No games played in the last 2 weeks.')).toBeTruthy();
  });
});
