import type { ComponentType } from 'react';
import { PullRequestsView, RecentCommitsView, SecurityAlertsView } from './github.js';
import { CurrentWeatherView, ForecastView } from './weather.js';
import { ChannelStatsView, LatestVideosView, TrendingVideosView } from './youtube.js';

export interface WidgetViewProps {
  data: unknown;
}

/** Generic fallback: prints the raw `widget:data` payload. */
function JsonView({ data }: WidgetViewProps) {
  return <pre className="overflow-auto text-xs">{JSON.stringify(data, null, 2)}</pre>;
}

/** Real views, keyed by `service.widget`. */
export const views: Record<string, ComponentType<WidgetViewProps>> = {
  'github.recent_commits': RecentCommitsView,
  'github.pull_requests': PullRequestsView,
  'github.security_alerts': SecurityAlertsView,
  'weather.current_weather': CurrentWeatherView,
  'weather.forecast': ForecastView,
  'youtube.channel_stats': ChannelStatsView,
  'youtube.latest_videos': LatestVideosView,
  'youtube.trending_videos': TrendingVideosView,
};

export function getView(service: string, widget: string): ComponentType<WidgetViewProps> {
  return views[`${service}.${widget}`] ?? JsonView;
}
