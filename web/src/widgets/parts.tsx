import { useState, type ReactNode } from 'react';
import { hhmm } from '@/lib/time.js';
import { cn } from '@/lib/utils.js';
import type { WidgetPush } from '@/realtime/useWidgetData.js';

/* Shared anatomy of every widget view (design-reference §5): channel line → stat → detail. */

/** Upstream data never reaches `href` unless it is an http(s) URL. */
export function isHttpUrl(url: string): boolean {
  const protocol = URL.parse(url)?.protocol;
  return protocol === 'http:' || protocol === 'https:';
}

/** What the widget watches, 11px muted; children are the left and optional right parts. */
export function Channel({ children }: { children: ReactNode }) {
  return (
    <div data-slot="widget-channel" className="text-muted-foreground flex justify-between gap-2 text-[0.6875rem]">
      {children}
    </div>
  );
}

/** The one number, its sentence-case label, and an optional delta or mini visual on the right. */
export function Stat({ value, unit, label, aside }: { value: ReactNode; unit?: string; label: ReactNode; aside?: ReactNode }) {
  return (
    <div data-slot="widget-stat" className="flex items-end justify-between gap-3">
      <div>
        <div className="font-mono text-[clamp(1.75rem,12cqi,2.75rem)] leading-[0.95] font-medium tracking-[-0.045em] whitespace-nowrap">
          {value}
          {unit && <span className="text-muted-foreground ml-0.75 text-[0.42em] font-normal tracking-normal">{unit}</span>}
        </div>
        <div className="text-muted-foreground mt-1.5 text-xs">{label}</div>
      </div>
      {aside}
    </div>
  );
}

/** Neutral change readout: up isn't good or bad. */
export function Delta({ children }: { children: ReactNode }) {
  return <span className="text-muted-foreground font-mono text-[0.6875rem]">{children}</span>;
}

export function Empty({ children }: { children: string }) {
  return <p className="text-muted-foreground">{children}</p>;
}

/** Detail rows with hairlines between them. */
export function Rows({ children }: { children: ReactNode }) {
  return (
    <ul role="list" className="grid">
      {children}
    </ul>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return <li className="flex min-w-0 items-baseline gap-2.5 border-t py-1.5 text-[0.8125rem]">{children}</li>;
}

/** Row title: truncated with a tooltip, linked only to http(s) URLs. */
export function RowTitle({ href, children, prefix }: { href?: string; children: string; prefix?: ReactNode }) {
  const className = 'min-w-0 flex-1 truncate';
  return href && isHttpUrl(href) ? (
    <a href={href} target="_blank" rel="noreferrer" title={children} className={cn(className, 'hover:underline')}>
      {prefix}
      {children}
    </a>
  ) : (
    <span title={children} className={className}>
      {prefix}
      {children}
    </span>
  );
}

/** Fixed-size image slot: the box is kept when the src is missing, unsafe or fails to load. */
export function Thumb({ src, width, height }: { src?: string | null; width: number; height: number }) {
  const [failed, setFailed] = useState(false);
  const show = !!src && isHttpUrl(src) && !failed;
  return (
    <span
      data-slot="thumb"
      data-state={show ? undefined : 'failed'}
      aria-hidden="true"
      style={{ width, height }}
      className="bg-muted relative inline-block flex-none self-center overflow-hidden rounded-sm after:absolute after:inset-0 after:rounded-sm after:shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--foreground)_12%,transparent)]"
    >
      {show && (
        <img
          src={src}
          alt=""
          width={width}
          height={height}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="block size-full object-cover"
        />
      )}
    </span>
  );
}

/** Left-hand mono ID (sha, #number, rank). */
export function RowId({ children }: { children: ReactNode }) {
  return <span className="text-muted-foreground min-w-[5.5ch] flex-none font-mono">{children}</span>;
}

/** Right-hand meta: sans for names, `mono` for times and values. */
export function RowMeta({ children, mono, className }: { children: ReactNode; mono?: boolean; className?: string }) {
  return <span className={cn('text-muted-foreground flex-none text-xs', mono && 'font-mono', className)}>{children}</span>;
}

/** Horizontal share bar, one hue for magnitude. */
export function Meter({ share, className }: { share: number; className?: string }) {
  return (
    <span data-slot="meter" aria-hidden="true" className={cn('bg-muted relative h-1 flex-none self-center overflow-hidden rounded-xs', className)}>
      <i className="bg-foreground/55 absolute inset-y-0 left-0 rounded-xs" style={{ width: `${share * 100}%` }} />
    </span>
  );
}

export interface TrailPoint<T> {
  at: string | null | undefined;
  value: T;
}

/**
 * One point per cached push (oldest first), always ending on the payload being shown. Only the
 * trailing pushes whose `identity` (city, repo + filter…) matches the shown payload count, so a
 * Configure change never mixes two cities or two repos in one trend.
 */
export function pushTrail<D, T>(
  { data, fetchedAt, history = [] }: { data: unknown; fetchedAt?: string | null; history?: WidgetPush[] },
  identity: (data: D) => string,
  pick: (data: D) => T,
): TrailPoint<T>[] {
  const pushes = history.at(-1)?.fetchedAt === fetchedAt ? history : [...history, { data, fetchedAt: fetchedAt ?? null }];
  const id = identity(data as D);
  let start = pushes.length - 1;
  while (start > 0 && identity(pushes[start - 1].data as D) === id) start--;
  return pushes.slice(start).map((p) => ({ at: p.fetchedAt, value: pick(p.data as D) }));
}

const SPARK_H = 40;

/** Inline SVG trend of numeric pushes; the latest point is the live dot. Screen readers get a table. */
export function Sparkline({ points, label, unit }: { points: TrailPoint<number>[]; label: string; unit: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  const xy = values.map((v, i) => [(i / (values.length - 1)) * 100, SPARK_H - 4 - ((v - min) / span) * (SPARK_H - 10)]);
  const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join('');
  const time = (p: TrailPoint<number>) => (p.at ? hhmm(p.at) : '');
  const endY = xy[xy.length - 1][1];

  return (
    <div
      className="relative"
      onPointerMove={(e) => {
        const box = e.currentTarget.getBoundingClientRect();
        setHover(Math.round(((e.clientX - box.left) / box.width) * (values.length - 1)));
      }}
      onPointerLeave={() => setHover(null)}
    >
      <svg
        role="img"
        aria-label={label}
        viewBox={`0 0 100 ${SPARK_H}`}
        preserveAspectRatio="none"
        className="block h-[clamp(40px,20cqi,64px)] w-full overflow-visible"
      >
        <path d={`${line}L100 ${SPARK_H}L0 ${SPARK_H}Z`} className="fill-foreground/6" />
        <path
          d={line}
          vectorEffect="non-scaling-stroke"
          className="stroke-muted-foreground fill-none [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.5]"
        />
        {hover !== null && (
          <line
            x1={xy[hover][0]}
            x2={xy[hover][0]}
            y1={0}
            y2={SPARK_H}
            vectorEffect="non-scaling-stroke"
            className="stroke-muted-foreground"
          />
        )}
      </svg>
      <span
        aria-hidden="true"
        className="bg-live absolute -right-1 -mt-1 size-2 rounded-full shadow-[0_0_0_2px_var(--card)]"
        style={{ top: `${(endY / SPARK_H) * 100}%` }}
      />
      {hover !== null && (
        <span
          aria-hidden="true"
          className="bg-popover absolute -top-5.5 -translate-x-1/2 rounded-sm border px-1.25 py-0.5 font-mono text-[0.6875rem] whitespace-nowrap"
          style={{ left: `${xy[hover][0]}%` }}
        >
          {time(points[hover])} {values[hover]}
          {unit}
        </span>
      )}
      <table className="sr-only">
        <caption>{label}</caption>
        <thead>
          <tr>
            <th scope="col">Time</th>
            <th scope="col">Value</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p, i) => (
            <tr key={i}>
              <td>{time(p)}</td>
              <td>
                {p.value}
                {unit}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
