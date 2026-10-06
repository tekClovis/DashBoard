// Channel-name search for the add-widget dialog's channel picker — see features/big-youtube-search/spec.md.

import type { ChannelCandidate } from '@dashboard/shared';
import type { YoutubeGet } from './youtube-api.js';

const MAX_RESULTS = 8;

interface RawChannelResult {
  id: { channelId: string };
  snippet: { title: string; thumbnails?: { default?: { url?: string } } };
}

/** YouTube Data API search (type=channel): id, title and avatar of the channels matching `query`. */
export async function searchChannels(get: YoutubeGet, query: string): Promise<ChannelCandidate[]> {
  const { items = [] } = await get<{ items?: RawChannelResult[] }>('/search', {
    part: 'snippet',
    type: 'channel',
    q: query,
    maxResults: MAX_RESULTS,
  });
  return items.map(({ id, snippet }) => ({
    id: id.channelId,
    title: snippet.title,
    ...(snippet.thumbnails?.default?.url ? { thumbnail: snippet.thumbnails.default.url } : {}),
  }));
}
