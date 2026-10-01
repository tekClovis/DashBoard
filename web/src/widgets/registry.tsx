import {
  CalendarDays,
  CloudSun,
  Gamepad2,
  GitCommitHorizontal,
  GitPullRequest,
  LayoutGrid,
  Newspaper,
  Play,
  ShieldAlert,
  type LucideIcon,
} from 'lucide-react';
import type { ComponentType } from 'react';
import type { WidgetPush } from '@/realtime/useWidgetData.js';
import { GameNewsView, RecentlyPlayedView } from './steam.js';
import { PullRequestsView, RecentCommitsView, SecurityAlertsView } from './github.js';
import { CurrentWeatherView, ForecastView } from './weather.js';
import { ChannelStatsView, LatestVideosView, TrendingVideosView } from './youtube.js';

export interface WidgetViewProps {
  data: unknown;
  /** When this payload arrived (ISO), for client-side history such as sparklines and deltas. */
  fetchedAt?: string | null;
  /** Recent pushes from the query cache, oldest first, so trends survive a remount. */
  history?: WidgetPush[];
  /** Shown under an error band: channel + detail only, no stat. */
  compact?: boolean;
}

/** Generic fallback: prints the raw `widget:data` payload. */
function JsonView({ data }: WidgetViewProps) {
  return <pre className="overflow-auto text-xs">{JSON.stringify(data, null, 2)}</pre>;
}

interface WidgetEntry {
  View: ComponentType<WidgetViewProps>;
  label: string;
  icon: LucideIcon;
}

const SERVICE_LABELS: Record<string, string> = {
  github: 'GitHub',
  steam: 'Steam',
  weather: 'Weather',
  youtube: 'YouTube',
};

/** Real views with their display label and icon, keyed by `service.widget`. */
const widgets: Record<string, WidgetEntry> = {
  'steam.recently_played': { View: RecentlyPlayedView, label: 'Recently played', icon: Gamepad2 },
  'steam.game_news': { View: GameNewsView, label: 'Game news', icon: Newspaper },
  'github.recent_commits': { View: RecentCommitsView, label: 'Recent commits', icon: GitCommitHorizontal },
  'github.pull_requests': { View: PullRequestsView, label: 'Pull requests', icon: GitPullRequest },
  'github.security_alerts': { View: SecurityAlertsView, label: 'Security alerts', icon: ShieldAlert },
  'weather.current_weather': { View: CurrentWeatherView, label: 'Current weather', icon: CloudSun },
  'weather.forecast': { View: ForecastView, label: 'Forecast', icon: CalendarDays },
  'youtube.channel_stats': { View: ChannelStatsView, label: 'Channel stats', icon: Play },
  'youtube.latest_videos': { View: LatestVideosView, label: 'Latest videos', icon: Play },
  'youtube.trending_videos': { View: TrendingVideosView, label: 'Trending videos', icon: Play },
};

export function getView(service: string, widget: string): ComponentType<WidgetViewProps> {
  return widgets[`${service}.${widget}`]?.View ?? JsonView;
}

/** Display names and icon for a panel header; unknown widgets fall back to their raw names. */
export function getWidgetMeta(service: string, widget: string) {
  const entry = widgets[`${service}.${widget}`];
  return {
    serviceLabel: SERVICE_LABELS[service] ?? service,
    label: entry?.label ?? widget,
    icon: entry?.icon ?? LayoutGrid,
  };
}
