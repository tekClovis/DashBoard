import type { WidgetDataMap } from '@dashboard/shared';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getView } from './registry.js';

afterEach(() => {
  cleanup();
});

describe('steam views', () => {
  it('renders recently_played as game rows with 2-week hours', () => {
    const data: WidgetDataMap['steam.recently_played'] = {
      games: [
        { appId: 220, name: 'Half-Life 2', playtime2Weeks: 192, playtimeForever: 900 },
        { appId: 620, name: 'Portal 2', playtime2Weeks: 90, playtimeForever: 300 },
      ],
    };
    const View = getView('steam', 'recently_played');
    render(<View data={data} />);

    const rows = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(rows).toEqual(['Half-Life 23.2 hrs', 'Portal 21.5 hrs']);
  });

  it('renders game_news as linked titles with a relative date', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-10T12:00:00Z'));
    const data: WidgetDataMap['steam.game_news'] = {
      appId: 620,
      items: [
        { id: 'n1', title: 'Patch notes 1.12', url: 'https://x/n1', feedLabel: 'Community', date: '2026-09-01T12:00:00Z' },
      ],
    };
    const View = getView('steam', 'game_news');
    render(<View data={data} />);

    expect(screen.getByRole('link', { name: 'Patch notes 1.12' }).getAttribute('href')).toBe('https://x/n1');
    expect(screen.getByText('9d ago')).toBeTruthy();
    vi.useRealTimers();
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
