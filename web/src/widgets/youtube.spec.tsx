import type { WidgetDataMap, YoutubeVideo } from '@dashboard/shared';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getView } from './registry.js';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function renderView(widget: string, data: unknown) {
  const View = getView('youtube', widget);
  return render(<View data={data} />);
}

const video = (id: string, title: string, publishedAt: string, url = `https://www.youtube.com/watch?v=${id}`): YoutubeVideo => ({
  id,
  title,
  channel: 'Chan',
  publishedAt,
  url,
});

describe('youtube widget views', () => {
  it('channel_stats shows compact subscriber/view/video stat cards', () => {
    const data: WidgetDataMap['youtube.channel_stats'] = {
      channelId: 'UC_x5',
      title: 'Google for Developers',
      subscribers: 2_400_000,
      views: 180_000_000,
      videos: 412,
    };
    renderView('channel_stats', data);

    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['2.4Msubscribers', '180Mviews', '412videos']);
  });

  it('channel_stats says "hidden" when the channel hides its subscriber count', () => {
    renderView('channel_stats', { channelId: 'UC', title: 't', subscribers: null, views: 1, videos: 1 });

    expect(screen.getByText('hidden')).toBeTruthy();
  });

  it('latest_videos lists linked titles with how long ago they were published', () => {
    vi.useFakeTimers({ now: new Date('2026-09-23T12:00:00Z'), toFake: ['Date'] });
    const data: WidgetDataMap['youtube.latest_videos'] = {
      channelId: 'UC_x5',
      videos: [video('a', 'Building a Timer with Socket.IO', '2026-09-21T10:00:00Z'), video('b', 'Just out', '2026-09-23T07:00:00Z')],
    };
    renderView('latest_videos', data);

    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Building a Timer with Socket.IO2d ago', 'Just out5h ago']);
    expect(screen.getByRole('link', { name: 'Building a Timer with Socket.IO' }).getAttribute('href')).toBe(
      'https://www.youtube.com/watch?v=a',
    );
  });

  it('trending_videos ranks videos, and an empty list shows an empty state', () => {
    const data: WidgetDataMap['youtube.trending_videos'] = {
      region: 'FR',
      videos: [video('a', 'Top tech news this week', '2026-09-22T00:00:00Z'), video('b', 'Concert highlights', '2026-09-22T00:00:00Z')],
    };
    renderView('trending_videos', data);
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Top tech news this week#1', 'Concert highlights#2']);

    cleanup();
    renderView('trending_videos', { region: 'FR', videos: [] });
    expect(screen.getByText('No videos.')).toBeTruthy();
  });

  it.each(['javascript:alert(1)', 'data:text/html,x', 'not a url'])('renders %s as plain text, never as an href', (url) => {
    renderView('trending_videos', { region: 'FR', videos: [video('x', 'Sneaky', '2026-09-22T00:00:00Z', url)] });

    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('Sneaky')).toBeTruthy();
  });
});
