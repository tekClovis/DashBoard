import type { WidgetDataMap } from '@dashboard/shared';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils.js';
import type { WidgetViewProps } from './registry.js';

const BADGE_TONES: Record<string, string> = {
  open: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  closed: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  critical: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  high: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
};

/** Text label always present, so color is never the only signal. */
function Badge({ label }: { label: string }) {
  return (
    <span className={cn('shrink-0 rounded-full px-2 text-xs', BADGE_TONES[label] ?? 'bg-muted text-muted-foreground')}>
      {label}
    </span>
  );
}

function Rows<T>({ items, empty, render }: { items: T[]; empty: string; render: (item: T) => ReactNode }) {
  if (items.length === 0) return <p className="text-muted-foreground">{empty}</p>;
  return <ul className="divide-y">{items.map(render)}</ul>;
}

function Row({ href, title, children }: { href: string; title: string; children: ReactNode }) {
  return (
    <li className="flex items-center justify-between gap-2 py-2">
      <a href={href} target="_blank" rel="noreferrer" className="truncate hover:underline">
        {title}
      </a>
      {children}
    </li>
  );
}

export function RecentCommitsView({ data }: WidgetViewProps) {
  const { commits } = data as WidgetDataMap['github.recent_commits'];
  return (
    <Rows
      items={commits}
      empty="No commits."
      render={(c) => (
        <Row key={c.sha} href={c.url} title={c.message}>
          <span className="text-muted-foreground shrink-0 font-mono text-xs">{c.sha.slice(0, 7)}</span>
        </Row>
      )}
    />
  );
}

export function PullRequestsView({ data }: WidgetViewProps) {
  const { pulls } = data as WidgetDataMap['github.pull_requests'];
  return (
    <Rows
      items={pulls}
      empty="No pull requests."
      render={(p) => (
        <Row key={p.number} href={p.url} title={p.title}>
          <Badge label={p.state} />
        </Row>
      )}
    />
  );
}

export function SecurityAlertsView({ data }: WidgetViewProps) {
  const { alerts } = data as WidgetDataMap['github.security_alerts'];
  return (
    <Rows
      items={alerts}
      empty="No open alerts."
      render={(a) => (
        <Row key={a.number} href={a.url} title={a.summary}>
          <Badge label={a.severity} />
        </Row>
      )}
    />
  );
}
