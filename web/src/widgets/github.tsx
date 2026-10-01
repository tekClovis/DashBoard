import type { GithubSecurityAlert, WidgetDataMap } from '@dashboard/shared';
import type { ReactNode } from 'react';
import { ago, hhmm } from '@/lib/time.js';
import { cn } from '@/lib/utils.js';
import { Channel, Delta, Empty, Row, RowId, RowMeta, Rows, RowTitle, Stat, usePushTrail } from './parts.js';
import type { WidgetViewProps } from './registry.js';

const WEEK_MS = 7 * 24 * 3_600_000;

function RepoChannel({ repo, right }: { repo: string; right?: ReactNode }) {
  return (
    <Channel>
      <span className="font-mono">{repo}</span>
      {right}
    </Channel>
  );
}

/** 7-day rug strip: one tick per commit, the latest one tallest. */
function Rug({ dates, now }: { dates: string[]; now: number }) {
  return (
    <div aria-hidden="true" className="w-[44%] max-w-65 min-w-30">
      <div className="relative h-4.5 border-b">
        {dates.map((d, i) => {
          const age = now - Date.parse(d);
          if (age > WEEK_MS) return null;
          return (
            <i
              key={i}
              className={cn('absolute bottom-0 w-0.5 rounded-t-[1px]', i === 0 ? 'bg-foreground h-4' : 'bg-foreground/45 h-3')}
              style={{ right: `${(Math.max(age, 0) / WEEK_MS) * 100}%` }}
            />
          );
        })}
      </div>
      <div className="text-muted-foreground mt-0.75 flex justify-between font-mono text-[0.625rem]">
        <span>7d</span>
        <span>now</span>
      </div>
    </div>
  );
}

export function RecentCommitsView({ data, compact }: WidgetViewProps) {
  const { repo, commits } = data as WidgetDataMap['github.recent_commits'];
  const now = Date.now();
  return (
    <>
      <RepoChannel repo={repo} />
      {!compact && commits.length > 0 && (
        <Stat
          value={ago(now - Date.parse(commits[0].date))}
          label="since the last commit"
          aside={<Rug dates={commits.map((c) => c.date)} now={now} />}
        />
      )}
      {commits.length === 0 ? (
        <Empty>No commits.</Empty>
      ) : (
        <Rows>
          {commits.map((c) => (
            <Row key={c.sha}>
              <RowId>{c.sha.slice(0, 7)}</RowId>
              <RowTitle href={c.url}>{c.message}</RowTitle>
              <RowMeta>{c.author}</RowMeta>
              <RowMeta mono>
                <time dateTime={c.date}>{ago(now - Date.parse(c.date))}</time>
              </RowMeta>
            </Row>
          ))}
        </Rows>
      )}
    </>
  );
}

export function PullRequestsView({ data, fetchedAt, compact }: WidgetViewProps) {
  const { repo, state, pulls } = data as WidgetDataMap['github.pull_requests'];
  const trail = usePushTrail(fetchedAt, pulls.length);
  const prev = trail.at(-2);
  const diff = prev ? pulls.length - prev.value : 0;
  return (
    <>
      <RepoChannel repo={repo} right={<span className="font-mono">state={state}</span>} />
      {!compact && (
        <Stat
          value={pulls.length}
          label={state === 'all' ? 'pull requests' : `${state} pull requests`}
          aside={
            prev?.at && diff !== 0 ? (
              <Delta>
                {diff > 0 ? '↑' : '↓'}
                {Math.abs(diff)} since {hhmm(prev.at)}
              </Delta>
            ) : null
          }
        />
      )}
      {pulls.length === 0 ? (
        <Empty>No pull requests.</Empty>
      ) : (
        <Rows>
          {pulls.map((p) => (
            <Row key={p.number}>
              <RowId>#{p.number}</RowId>
              <RowTitle href={p.url}>{p.title}</RowTitle>
              <RowMeta>{p.author}</RowMeta>
            </Row>
          ))}
        </Rows>
      )}
    </>
  );
}

const SEVERITIES: GithubSecurityAlert['severity'][] = ['critical', 'high', 'medium', 'low'];

/** critical = solid red, high = red hatch, medium = amber, low = neutral (design-reference §4). */
const SEV_FILL: Record<GithubSecurityAlert['severity'], string> = {
  critical: 'bg-destructive',
  high: 'bg-[repeating-linear-gradient(135deg,var(--destructive)_0_1.5px,transparent_1.5px_3.5px)] shadow-[inset_0_0_0_1px_var(--destructive)]',
  medium: 'bg-warning',
  low: 'bg-[color-mix(in_oklch,var(--muted-foreground)_55%,var(--card))]',
};

function Swatch({ severity }: { severity: GithubSecurityAlert['severity'] }) {
  return <i aria-hidden="true" className={cn('inline-block size-2 flex-none self-center rounded-[1px]', SEV_FILL[severity])} />;
}

export function SecurityAlertsView({ data, compact }: WidgetViewProps) {
  const { repo, alerts } = data as WidgetDataMap['github.security_alerts'];
  const counts = SEVERITIES.map((s) => [s, alerts.filter((a) => a.severity === s).length] as const);
  return (
    <>
      <RepoChannel repo={repo} right={<span>Dependabot</span>} />
      {!compact && <Stat value={alerts.length} label="open alerts" />}
      {alerts.length === 0 ? (
        <Empty>No open alerts.</Empty>
      ) : (
        <>
          <div className="grid gap-1.5">
            <div role="img" aria-label={counts.map(([s, n]) => `${n} ${s}`).join(', ')} className="flex h-2 gap-0.5">
              {counts.map(([s, n]) => n > 0 && <i key={s} className={cn('rounded-[1px]', SEV_FILL[s])} style={{ flex: n }} />)}
            </div>
            <div aria-hidden="true" className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-[0.6875rem]">
              {counts.map(([s, n]) => (
                <span key={s} className="inline-flex items-center gap-1.25">
                  <Swatch severity={s} />
                  {s[0].toUpperCase() + s.slice(1)} <b className="text-foreground font-mono font-medium">{n}</b>
                </span>
              ))}
            </div>
          </div>
          <Rows>
            {alerts.map((a) => (
              <Row key={a.number}>
                <Swatch severity={a.severity} />
                <RowTitle href={a.url} prefix={<span className="sr-only">{a.severity}: </span>}>
                  {a.summary}
                </RowTitle>
                <RowMeta mono>{a.package}</RowMeta>
              </Row>
            ))}
          </Rows>
        </>
      )}
    </>
  );
}
