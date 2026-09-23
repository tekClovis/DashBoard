import type { WidgetDataMap, YoutubeVideo } from '@dashboard/shared';
import type { WidgetViewProps } from './registry.js';

const COMPACT = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

/** "2026-09-21T…" → "2d ago" (or "5h ago" / "12m ago" when more recent). */
function ago(iso: string): string {
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / (60 * 24))}d ago`;
}

/** Upstream data never reaches `href` unless it is an http(s) URL. */
function isHttpUrl(url: string): boolean {
  const protocol = URL.parse(url)?.protocol;
  return protocol === 'http:' || protocol === 'https:';
}

function VideoRows({ videos, aside }: { videos: YoutubeVideo[]; aside: (video: YoutubeVideo, index: number) => string }) {
  if (videos.length === 0) return <p className="text-muted-foreground">No videos.</p>;
  return (
    <ul className="divide-y">
      {videos.map((video, i) => (
        <li key={video.id} className="flex items-center justify-between gap-2 py-2">
          {isHttpUrl(video.url) ? (
            <a href={video.url} target="_blank" rel="noreferrer" className="truncate hover:underline">
              {video.title}
            </a>
          ) : (
            <span className="truncate">{video.title}</span>
          )}
          <span className="text-muted-foreground shrink-0 text-xs">{aside(video, i)}</span>
        </li>
      ))}
    </ul>
  );
}

export function ChannelStatsView({ data }: WidgetViewProps) {
  const { subscribers, views, videos } = data as WidgetDataMap['youtube.channel_stats'];
  const stats = [
    { label: 'subscribers', value: subscribers === null ? 'hidden' : COMPACT.format(subscribers) },
    { label: 'views', value: COMPACT.format(views) },
    { label: 'videos', value: COMPACT.format(videos) },
  ];
  return (
    <ul className="flex gap-4">
      {stats.map((s) => (
        <li key={s.label} className="bg-accent flex-1 rounded-lg px-1 py-2.5 text-center">
          <div className="font-bold">{s.value}</div>
          <div className="text-muted-foreground text-xs">{s.label}</div>
        </li>
      ))}
    </ul>
  );
}

export function LatestVideosView({ data }: WidgetViewProps) {
  const { videos } = data as WidgetDataMap['youtube.latest_videos'];
  return <VideoRows videos={videos} aside={(v) => ago(v.publishedAt)} />;
}

export function TrendingVideosView({ data }: WidgetViewProps) {
  const { videos } = data as WidgetDataMap['youtube.trending_videos'];
  return <VideoRows videos={videos} aside={(_, i) => `#${i + 1}`} />;
}
