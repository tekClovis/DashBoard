// YouTube widget definitions — see docs/Architecture.md §3's widget catalog and
// features/youtube-widgets/spec.md. Data shapes live in shared/src/widgets.ts.

import type { ParamSpec, YoutubeVideo } from '@dashboard/shared';
import type { WidgetDefinition } from '../../catalog/widget-definition.js';
import { FetchError } from '../../timer/fetch-error.js';
import { fixedMessage, youtubeClient, type TokenRefresher, type YoutubeGet } from './youtube-api.js';

/** ISO 3166-1 alpha-2 country code, as YouTube's `regionCode` expects. */
const REGION_PATTERN = '^[A-Z]{2}$';

const channelParam: ParamSpec = { name: 'channel_id', type: 'string', required: true, label: 'Channel', search: 'youtube.channel' };
/** Set by the channel picker so the dialog can show the picked channel again; never rendered as fields. */
const channelPickParams: ParamSpec[] = [
  { name: 'channel_title', type: 'string', hidden: true },
  { name: 'channel_image', type: 'string', hidden: true, pattern: '^https://' },
];
const numberParam: ParamSpec = { name: 'number', type: 'integer', required: true, default: 5, min: 1, max: 10, label: 'Videos' };

interface RawChannel {
  snippet: { title: string; thumbnails?: RawVideoSnippet['thumbnails'] };
  statistics: { subscriberCount?: string; hiddenSubscriberCount: boolean; viewCount: string; videoCount: string };
  contentDetails?: { relatedPlaylists?: { uploads?: string } };
}

interface RawVideoSnippet {
  title: string;
  channelTitle: string;
  publishedAt: string;
  thumbnails?: Partial<Record<'default' | 'medium' | 'high', { url: string }>>;
}

interface RawPlaylistItem {
  snippet: RawVideoSnippet & { resourceId: { videoId: string } };
}

interface RawVideo {
  id: string;
  snippet: RawVideoSnippet;
}

async function getChannel(get: YoutubeGet, channelId: string, part: string): Promise<RawChannel> {
  const { items } = await get<{ items?: RawChannel[] }>('/channels', { part, id: channelId });
  const channel = items?.[0];
  if (!channel) throw new FetchError('INVALID_PARAMS', `Unknown YouTube channel '${channelId}'.`);
  return channel;
}

/** YouTube's 200 bodies are trusted in shape: a malformed one fails with a fixed message, not raw TypeError text. */
function guarded<A extends unknown[], R>(fetch: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
  return (...args) => fetch(...args).catch(fixedMessage('YouTube returned an invalid response.'));
}

function toVideo(id: string, snippet: RawVideoSnippet): YoutubeVideo {
  return {
    id,
    title: snippet.title,
    channel: snippet.channelTitle,
    publishedAt: snippet.publishedAt,
    url: `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`,
    imageUrl: (snippet.thumbnails?.medium ?? snippet.thumbnails?.high ?? snippet.thumbnails?.default)?.url ?? null,
  };
}

export function youtubeWidgets(refresh: TokenRefresher): [
  WidgetDefinition<'youtube.channel_stats'>,
  WidgetDefinition<'youtube.latest_videos'>,
  WidgetDefinition<'youtube.trending_videos'>,
] {
  const channelStats: WidgetDefinition<'youtube.channel_stats'> = {
    service: 'youtube',
    name: 'channel_stats',
    description: 'Subscriber, view and video counts of a channel.',
    params: [channelParam, ...channelPickParams],
    minRefreshSec: 600,
    auth: 'connection',
    fetch: guarded(async (params, ctx) => {
      const channelId = String(params['channel_id']);
      const { snippet, statistics } = await getChannel(youtubeClient(ctx, refresh), channelId, 'snippet,statistics');
      return {
        channelId,
        title: snippet.title,
        subscribers: statistics.subscriberCount === undefined ? null : Number(statistics.subscriberCount),
        views: Number(statistics.viewCount),
        videos: Number(statistics.videoCount),
        imageUrl: snippet.thumbnails?.default?.url ?? null,
      };
    }),
  };

  const latestVideos: WidgetDefinition<'youtube.latest_videos'> = {
    service: 'youtube',
    name: 'latest_videos',
    description: 'Most recent uploads of a channel.',
    params: [channelParam, ...channelPickParams, numberParam],
    minRefreshSec: 600,
    auth: 'connection',
    fetch: guarded(async (params, ctx) => {
      const get = youtubeClient(ctx, refresh);
      const channelId = String(params['channel_id']);
      const { contentDetails } = await getChannel(get, channelId, 'contentDetails');
      const uploads = contentDetails?.relatedPlaylists?.uploads;
      if (!uploads) throw new FetchError('UPSTREAM_ERROR', 'YouTube returned a channel without an uploads playlist.');
      const { items = [] } = await get<{ items?: RawPlaylistItem[] }>('/playlistItems', {
        part: 'snippet',
        playlistId: uploads,
        maxResults: params['number'],
      });
      const videos = items
        .map(({ snippet }) => toVideo(snippet.resourceId.videoId, snippet))
        .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
      return { channelId, videos };
    }),
  };

  const trendingVideos: WidgetDefinition<'youtube.trending_videos'> = {
    service: 'youtube',
    name: 'trending_videos',
    description: 'Most popular videos in a country right now.',
    params: [
      { name: 'region', type: 'string', required: true, pattern: REGION_PATTERN, label: 'Region (ISO 3166 code, e.g. FR)' },
      numberParam,
    ],
    minRefreshSec: 900,
    auth: 'connection',
    fetch: guarded(async (params, ctx) => {
      const region = String(params['region']);
      const { items = [] } = await youtubeClient(ctx, refresh)<{ items?: RawVideo[] }>('/videos', {
        part: 'snippet',
        chart: 'mostPopular',
        regionCode: region,
        maxResults: params['number'],
      });
      return { region, videos: items.map((v) => toVideo(v.id, v.snippet)) };
    }),
  };

  return [channelStats, latestVideos, trendingVideos];
}
