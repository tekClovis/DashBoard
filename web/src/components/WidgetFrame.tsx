import type { WidgetInstanceEntry } from '@dashboard/shared';
import { Ellipsis, GripVertical, OctagonX, RefreshCw, SlidersHorizontal, TriangleAlert } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Alert, AlertContent, AlertDescription, AlertTitle } from '@/components/ui/alert.js';
import { Button } from '@/components/ui/button.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.js';
import { Lamp, type LampState } from '@/components/ui/lamp.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import type { MoveDirection } from '@/lib/layout.js';
import { ago, every, hhmm } from '@/lib/time.js';
import { cn } from '@/lib/utils.js';
import { useSocket } from '@/realtime/SocketProvider.js';
import { useWidgetData } from '@/realtime/useWidgetData.js';
import { getView, getWidgetMeta } from '@/widgets/registry.js';
import { errorCopy, frameState, type FrameState } from './frame-state.js';

const MOVES: { dir: MoveDirection; label: string }[] = [
  { dir: 'up', label: 'Move up' },
  { dir: 'down', label: 'Move down' },
  { dir: 'left', label: 'Move left' },
  { dir: 'right', label: 'Move right' },
];

const LAMPS: Record<FrameState, { lamp: LampState; label: string }> = {
  live: { lamp: 'live', label: 'Live' },
  stale: { lamp: 'stale', label: 'Stale' },
  paused: { lamp: 'paused', label: 'Paused' },
  loading: { lamp: 'waiting', label: 'Waiting for data' },
  warn: { lamp: 'warn', label: 'Needs attention' },
  error: { lamp: 'error', label: 'Error' },
};

const TONES: Partial<Record<FrameState, string>> = {
  stale: 'text-warning',
  paused: 'text-warning',
  warn: 'text-warning',
  error: 'text-destructive',
};

/** Skeleton rows shaped like each view: stat block, then a visual or rows. */
const STAT_SKELETON = (
  <div className="grid gap-2">
    <Skeleton className="h-7 w-[38%]" />
    <Skeleton className="h-2 w-[52%]" />
  </div>
);
const ROW_WIDTHS = ['w-[92%]', 'w-[76%]', 'w-[84%]', 'w-[64%]', 'w-[80%]'];
function SkeletonRows({ n }: { n: number }) {
  return (
    <div className="grid gap-2.5">
      {ROW_WIDTHS.slice(0, n).map((w) => (
        <Skeleton key={w} className={cn('h-2.5', w)} />
      ))}
    </div>
  );
}
function ViewSkeleton({ kind }: { kind: string }) {
  if (kind === 'weather.current_weather')
    return (
      <>
        {STAT_SKELETON}
        <Skeleton className="h-9 w-full" />
      </>
    );
  if (kind === 'weather.forecast' || kind === 'youtube.trending_videos')
    return (
      <>
        <Skeleton className="h-2 w-[45%]" />
        <SkeletonRows n={kind === 'weather.forecast' ? 5 : 4} />
      </>
    );
  return (
    <>
      {STAT_SKELETON}
      <SkeletonRows n={kind === 'steam.game_news' ? 3 : 4} />
    </>
  );
}

/** Re-renders every `ms` so "updated 9s ago" and the stale check keep moving. */
function useNow(ms = 1000): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

const PULSE_MS = 900; // --dur-pulse

/**
 * Live pulse (design-reference §5): on each `widget:data` (a new `fetchedAt` in the cache, even
 * when the values are unchanged), set `data-pulse` on the panel for 900 ms; index.css animates
 * the lamp ping and header sweep. Restarts on back-to-back pushes; never fires for data already
 * cached at mount or for an error.
 */
function usePulse(fetchedAt: string | null | undefined) {
  const ref = useRef<HTMLElement>(null);
  const seen = useRef(fetchedAt);
  useEffect(() => {
    const panel = ref.current;
    if (!panel || fetchedAt === seen.current) return;
    seen.current = fetchedAt;
    panel.removeAttribute('data-pulse');
    void panel.offsetWidth; // restart the animation if a pulse is already running
    panel.setAttribute('data-pulse', '');
    const id = setTimeout(() => panel.removeAttribute('data-pulse'), PULSE_MS);
    return () => clearTimeout(id);
  }, [fetchedAt]);
  return ref;
}

/** One quiet line at the bottom of the body: waiting or stale. */
function BodyNote({ lamp, children }: { lamp: LampState; children: string }) {
  return (
    <p className="text-muted-foreground mt-auto flex items-center gap-1.5 text-[0.6875rem]">
      <Lamp state={lamp} />
      {children}
    </p>
  );
}

/** Wide panels (720px+): channel across, stat on the left, detail on the right. */
const WIDE_VIEW =
  '@min-[720px]:grid-cols-[minmax(220px,1fr)_3fr] @min-[720px]:gap-x-6 @min-[720px]:[&>[data-slot=widget-channel]]:col-span-full @min-[720px]:[&>[data-slot=widget-stat]]:col-start-1 @min-[720px]:[&>[data-slot=widget-stat]]:row-span-4 @min-[720px]:[&>[data-slot=widget-stat]]:self-start @min-[720px]:[&>:not([data-slot=widget-channel],[data-slot=widget-stat])]:col-start-2';

interface WidgetFrameProps {
  instance: WidgetInstanceEntry;
  onConfigure: () => void;
  onDelete: () => void;
  onMove: (dir: MoveDirection) => void;
}

/** Panel around one widget instance: header strip, then the body for its derived state (design-reference §5). */
export function WidgetFrame({ instance, onConfigure, onDelete, onMove }: WidgetFrameProps) {
  const { data: entry } = useWidgetData(instance.id, instance.params);
  const panelRef = usePulse(entry?.fetchedAt);
  const { connected } = useSocket();
  const now = useNow();
  const { serviceLabel, label, icon: Icon } = getWidgetMeta(instance.service, instance.widget);
  const View = getView(instance.service, instance.widget);
  const state = frameState(entry, connected, instance.refreshRate, now);
  const error = entry?.error;
  const city = instance.service === 'weather' ? instance.params.city : undefined;
  const copy = error && errorCopy(error, { service: serviceLabel, city: city === undefined ? undefined : String(city), now });
  const since = entry?.fetchedAt ? ago(now - Date.parse(entry.fetchedAt)) : '';
  const name = `${serviceLabel} ${label}`;

  let status;
  if (state === 'live')
    status = (
      <span>
        <span className="@max-[440px]:sr-only">updated </span>
        <time dateTime={entry?.fetchedAt ?? undefined}>{since}</time>
        <span className="@max-[440px]:sr-only"> ago</span>
      </span>
    );
  else if (state === 'stale' || state === 'paused')
    status = (
      <span>
        {state} <time dateTime={entry?.fetchedAt ?? undefined}>{since}</time>
      </span>
    );
  else status = <span>{copy ? copy.meta : 'waiting'}</span>;

  let body;
  if (state === 'loading') {
    body = (
      <div aria-busy="true" className="flex flex-1 flex-col gap-2.5">
        <ViewSkeleton kind={`${instance.service}.${instance.widget}`} />
        <BodyNote lamp="waiting">{`Waiting for the first update from ${serviceLabel}.`}</BodyNote>
      </div>
    );
  } else if (copy) {
    const hasPrev = Boolean(entry?.fetchedAt);
    body = (
      <div className={cn('grid content-start gap-2.5', hasPrev && '@min-[720px]:grid-cols-[minmax(220px,1fr)_3fr] @min-[720px]:gap-x-6')}>
        <Alert
          tone={state === 'warn' ? 'warning' : 'destructive'}
          role="alert"
          className="border-0 bg-transparent p-0"
        >
          {state === 'warn' ? <TriangleAlert /> : <OctagonX />}
          <AlertContent>
            <AlertTitle>{copy.title}</AlertTitle>
            <AlertDescription className="text-xs">{copy.body}</AlertDescription>
            {copy.action?.to === 'services' && (
              <Button asChild variant="outline" size="sm" className="mt-2 justify-self-start">
                <Link to="/services">{copy.action.label}</Link>
              </Button>
            )}
            {copy.action?.to === 'configure' && (
              <Button variant="outline" size="sm" className="mt-2 justify-self-start" onClick={onConfigure}>
                <SlidersHorizontal />
                {copy.action.label}
              </Button>
            )}
          </AlertContent>
        </Alert>
        {hasPrev && (
          <div className="grid content-start gap-2.5 border-t border-dashed pt-2.5 @min-[720px]:border-t-0 @min-[720px]:border-l @min-[720px]:pt-0 @min-[720px]:pl-6">
            <p className="text-muted-foreground font-mono text-[0.6875rem]">Last data from {hhmm(entry?.fetchedAt ?? now)}</p>
            <View data={entry?.data} fetchedAt={entry?.fetchedAt} history={entry?.history} compact />
          </div>
        )}
      </div>
    );
  } else {
    body = (
      <>
        {/* Persistent live region scoped to the view only, not the panel. */}
        <div aria-live="polite" className={cn('grid gap-2.5', WIDE_VIEW)}>
          <View data={entry?.data} fetchedAt={entry?.fetchedAt} history={entry?.history} />
        </div>
        {state === 'stale' && (
          <BodyNote lamp="stale">{`No update for ${since}. Expected every ${every(instance.refreshRate)}.`}</BodyNote>
        )}
      </>
    );
  }

  return (
    <article
      ref={panelRef}
      data-state={state}
      aria-label={name}
      className="bg-card text-card-foreground @container flex h-full flex-col overflow-hidden rounded-lg border forced-colors:border-[CanvasText]"
    >
      <div
        data-slot="widget-head"
        className={cn(
          'relative flex h-8 flex-none items-center gap-1.5 border-b px-1 text-xs max-md:pl-2.5',
          state === 'warn' && 'bg-warning/7',
          state === 'error' && 'bg-destructive/7',
        )}
      >
        <span
          aria-hidden="true"
          title="Drag to move"
          className="widget-drag-handle text-muted-foreground hover:bg-accent hover:text-foreground hidden h-6 w-5.5 cursor-grab touch-none place-items-center rounded-sm md:grid"
        >
          <GripVertical className="size-3.5" />
        </span>
        <Icon aria-hidden="true" className="text-muted-foreground ml-0.5 size-3.5 shrink-0" />
        <h2 className="flex min-w-0 flex-1 items-baseline gap-1.5 overflow-hidden whitespace-nowrap">
          <b className="font-semibold @max-[380px]:sr-only">{serviceLabel}</b>{' '}
          <span className="text-muted-foreground truncate @max-[380px]:text-foreground @max-[380px]:font-semibold">{label}</span>
        </h2>
        <div className="text-muted-foreground flex items-center gap-2.5 font-mono whitespace-nowrap">
          <span title="Refresh interval" className="inline-flex items-center gap-1 @max-[320px]:hidden">
            <RefreshCw aria-hidden="true" className="size-3.5" />
            {every(instance.refreshRate)}
          </span>
          <span className={cn('inline-flex items-center gap-1.5', TONES[state])}>
            <Lamp state={LAMPS[state].lamp} label={LAMPS[state].label} />
            {status}
          </span>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`${name} options`}>
              <Ellipsis />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onSelect={onConfigure}>Configure</DropdownMenuItem>
            {MOVES.map(({ dir, label: moveLabel }) => (
              <DropdownMenuItem key={dir} onSelect={() => onMove(dir)}>
                {moveLabel}
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem onSelect={onDelete}>Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-auto px-3 pt-2.5 pb-3 [scrollbar-width:thin]">{body}</div>
    </article>
  );
}
