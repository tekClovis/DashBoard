import type { WidgetDataMap, YoutubeVideo } from '@dashboard/shared';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getView } from './registry.js';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function renderView(widget: string, data: unknown, compact = false) {
  const View = getView('youtube', widget);
  return render(<View data={data} compact={compact} />);
}

const stat = (c: HTMLElement) => c.querySelector('[data-slot="widget-stat"]');
const channel = (c: HTMLElement) => c.querySelector('[data-slot="widget-channel"]');

const video = (id: string, title: string, publishedAt: string, url = `https://www.youtube.com/watch?v=${id}`): YoutubeVideo => ({
  id,
  title,
  channel: 'Chan',
  publishedAt,
  url,
  imageUrl: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
});

describe('youtube widget views', () => {
  it('channel_stats: title (not the id) channel, subscribers stat, views and videos rows', () => {
    const data: WidgetDataMap['youtube.channel_stats'] = {
      channelId: 'UC_x5',
      title: 'Google for Developers',
      subscribers: 2_400_000,
      views: 180_000_000,
      videos: 412,
      imageUrl: 'https://yt3/a.jpg',
    };
    const { container } = renderView('channel_stats', data);

    expect(channel(container)?.textContent).toBe('Google for Developers');
    expect(stat(container)?.textContent).toBe('2.4Msubscribers');
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Views180M', 'Videos412']);
  });

  it('channel_stats: falls back to the channel id when there is no title', () => {
    const { container } = renderView('channel_stats', { channelId: 'UC_x5', title: '', subscribers: 1, views: 2, videos: 3, imageUrl: null });
    expect(channel(container)?.textContent).toBe('UC_x5');
  });

  it('channel_stats: leads with views when subscribers are hidden, and says so', () => {
    const { container } = renderView('channel_stats', { channelId: 'UC', title: 't', subscribers: null, views: 1500, videos: 1, imageUrl: null }, true);

    expect(stat(container)).toBeNull();
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Subscribershidden by the channel',
      'Views1.5K',
      'Videos1',
    ]);
  });

  it('latest_videos: channel title, time since the last upload, linked title/age rows', () => {
    vi.useFakeTimers({ now: new Date('2026-09-23T12:00:00Z'), toFake: ['Date'] });
    const data: WidgetDataMap['youtube.latest_videos'] = {
      channelId: 'UC_x5',
      channelTitle: 'Google for Developers',
      videos: [video('b', 'Just out', '2026-09-23T07:00:00Z'), video('a', 'Building a Timer', '2026-09-21T10:00:00Z')],
    };
    const { container } = renderView('latest_videos', data);

    expect(channel(container)?.textContent).toBe('Google for Developers');
    expect(stat(container)?.textContent).toBe('5hsince the last upload');
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Just out5h', 'Building a Timer2d']);
    expect(screen.getByRole('link', { name: 'Building a Timer' }).getAttribute('href')).toBe('https://www.youtube.com/watch?v=a');
  });

  it('latest_videos: falls back to the channel id when there is no title', () => {
    const { container } = renderView('latest_videos', { channelId: 'UC_x5', channelTitle: null, videos: [] });
    expect(channel(container)?.textContent).toBe('UC_x5');
  });

  it('trending_videos: region channel, ranked rows, and an empty state', () => {
    const data: WidgetDataMap['youtube.trending_videos'] = {
      region: 'FR',
      videos: [video('a', 'Top tech news', '2026-09-22T00:00:00Z'), video('b', 'Concert', '2026-09-22T00:00:00Z')],
    };
    const { container } = renderView('trending_videos', data);
    expect(channel(container)?.textContent).toBe('Trendingregion=FR');
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['#1Top tech newsChan', '#2ConcertChan']);

    cleanup();
    renderView('trending_videos', { region: 'FR', videos: [] });
    expect(screen.getByText('No videos.')).toBeTruthy();
  });

  it.each(['javascript:alert(1)', 'data:text/html,x', 'not a url'])('renders %s as plain text, never as an href', (url) => {
    renderView('trending_videos', { region: 'FR', videos: [video('x', 'Sneaky', '2026-09-22T00:00:00Z', url)] });

    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('Sneaky')).toBeTruthy();
  });

  it('latest_videos and trending_videos: every row shows its thumbnail', () => {
    const videos = [video('a', 'A', '2026-09-21T10:00:00Z'), video('b', 'B', '2026-09-20T10:00:00Z')];
    for (const [widget, data] of [
      ['latest_videos', { channelId: 'UC', channelTitle: null, videos }],
      ['trending_videos', { region: 'FR', videos }],
    ] as const) {
      const { container, unmount } = renderView(widget, data);
      expect([...container.querySelectorAll('li img')].map((i) => i.getAttribute('src'))).toEqual(videos.map((v) => v.imageUrl));
      unmount();
    }
  });

  it('a thumbnail that fails to load or is missing leaves the row text', () => {
    const videos = [video('a', 'Broken', '2026-09-21T10:00:00Z'), { ...video('b', 'None', '2026-09-20T10:00:00Z'), imageUrl: null }];
    const { container } = renderView('latest_videos', { channelId: 'UC', channelTitle: null, videos });
    expect(container.querySelectorAll('li img')).toHaveLength(1);
    fireEvent.error(container.querySelector('li img')!);
    expect(container.querySelectorAll('li img')).toHaveLength(0);
    expect(screen.getByText('Broken')).toBeTruthy();
    expect(screen.getByText('None')).toBeTruthy();
  });

  it('channel_stats: shows a 40x40 round channel avatar that falls back when it fails', () => {
    const data = { channelId: 'UC', title: 't', subscribers: 1, views: 2, videos: 3, imageUrl: 'https://yt3/a.jpg' };
    const { container } = renderView('channel_stats', data);
    const slot = container.querySelector<HTMLElement>('[data-slot="thumb"]')!;
    expect([slot.style.width, slot.style.height]).toEqual(['40px', '40px']);
    expect(slot.className).toContain('rounded-full');
    fireEvent.error(slot.querySelector('img')!);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('t')).toBeTruthy();
  });

  it('trending_videos: thumbnails of ranked rows (#2 and below) hide in narrow panels, #1 keeps its own', () => {
    const videos = [video('a', 'A', '2026-09-21T10:00:00Z'), video('b', 'B', '2026-09-20T10:00:00Z')];
    const { container } = renderView('trending_videos', { region: 'FR', videos });
    const hidden = [...container.querySelectorAll('[data-slot="thumb"]')].map((t) => t.className.includes('@max-[340px]:hidden'));
    expect(hidden).toEqual([false, true]);
  });

  it('trending_videos: #1 has a larger thumbnail than the ranked rows', () => {
    const videos = [video('a', 'A', '2026-09-21T10:00:00Z'), video('b', 'B', '2026-09-20T10:00:00Z')];
    const { container } = renderView('trending_videos', { region: 'FR', videos });
    const widths = [...container.querySelectorAll('[data-slot="thumb"]')].map((t) => (t as HTMLElement).style.width);
    expect(widths).toEqual(['144px', '64px']);
  });
});
