import type { WidgetDataMap } from '@dashboard/shared';
import { ago } from '@/lib/time.js';
import { Channel, Empty, Row, RowId, RowMeta, Rows, RowTitle, Stat, Thumb } from './parts.js';
import type { WidgetViewProps } from './registry.js';

const COMPACT = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

const STAT_NAMES = { subscribers: 'Subscribers', views: 'Views', videos: 'Videos' } as const;

export function ChannelStatsView({ data, compact }: WidgetViewProps) {
  const stats = data as WidgetDataMap['youtube.channel_stats'];
  const { channelId, title, subscribers } = stats;
  // Lead with subscribers unless the channel hides them.
  const lead = subscribers === null ? 'views' : 'subscribers';
  const rest = (Object.keys(STAT_NAMES) as (keyof typeof STAT_NAMES)[]).filter((k) => compact || k !== lead);
  return (
    <>
      <Channel>
        <span>{title}</span>
        <span className="font-mono">{channelId}</span>
      </Channel>
      <Thumb src={stats.imageUrl} width={40} height={40} round />
      {!compact && <Stat value={COMPACT.format(stats[lead] ?? 0)} label={lead} />}
      <ul role="list" className="grid">
        {rest.map((k) => {
          const value = stats[k];
          return (
            <li key={k} className="flex justify-between gap-2.5 border-t py-1.5 text-[0.8125rem] first:border-t-0">
              <span>{STAT_NAMES[k]}</span>
              {value === null ? (
                <span className="text-muted-foreground">hidden by the channel</span>
              ) : (
                <span className="font-mono">{COMPACT.format(value)}</span>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

export function LatestVideosView({ data, compact }: WidgetViewProps) {
  const { channelId, videos } = data as WidgetDataMap['youtube.latest_videos'];
  const now = Date.now();
  return (
    <>
      <Channel>
        <span className="font-mono">{channelId}</span>
      </Channel>
      {!compact && videos.length > 0 && (
        <Stat value={ago(now - Date.parse(videos[0].publishedAt))} label="since the last upload" />
      )}
      {videos.length === 0 ? (
        <Empty>No videos.</Empty>
      ) : (
        <Rows>
          {videos.map((v) => (
            <Row key={v.id}>
              <Thumb src={v.imageUrl} width={80} height={45} />
              <RowTitle href={v.url}>{v.title}</RowTitle>
              <RowMeta mono>
                <time dateTime={v.publishedAt}>{ago(now - Date.parse(v.publishedAt))}</time>
              </RowMeta>
            </Row>
          ))}
        </Rows>
      )}
    </>
  );
}

export function TrendingVideosView({ data }: WidgetViewProps) {
  const { region, videos } = data as WidgetDataMap['youtube.trending_videos'];
  return (
    <>
      <Channel>
        <span>Trending</span>
        <span className="font-mono">region={region}</span>
      </Channel>
      {videos.length === 0 ? (
        <Empty>No videos.</Empty>
      ) : (
        <Rows>
          {videos.map((v, i) => (
            <Row key={v.id}>
              <RowId>#{i + 1}</RowId>
              <Thumb src={v.imageUrl} width={i === 0 ? 144 : 64} height={i === 0 ? 81 : 36} className={i === 0 ? undefined : '@max-[340px]:hidden'} />
              <RowTitle href={v.url}>{v.title}</RowTitle>
              <RowMeta>{v.channel}</RowMeta>
            </Row>
          ))}
        </Rows>
      )}
    </>
  );
}
