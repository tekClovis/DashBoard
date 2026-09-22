import type { ComponentType } from 'react';
import { PullRequestsView, RecentCommitsView, SecurityAlertsView } from './github.js';

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
};

export function getView(service: string, widget: string): ComponentType<WidgetViewProps> {
  return views[`${service}.${widget}`] ?? JsonView;
}
