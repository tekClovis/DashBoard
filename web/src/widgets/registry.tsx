import type { ComponentType } from 'react';
import { GameNewsView, RecentlyPlayedView } from './steam.js';

export interface WidgetViewProps {
  data: unknown;
}

/** Generic fallback: prints the raw `widget:data` payload. */
function JsonView({ data }: WidgetViewProps) {
  return <pre className="overflow-auto text-xs">{JSON.stringify(data, null, 2)}</pre>;
}

/** Real views register here as `views['github.recent_commits'] = RecentCommitsView`. */
export const views: Record<string, ComponentType<WidgetViewProps>> = {
  'steam.recently_played': RecentlyPlayedView,
  'steam.game_news': GameNewsView,
};

export function getView(service: string, widget: string): ComponentType<WidgetViewProps> {
  return views[`${service}.${widget}`] ?? JsonView;
}
