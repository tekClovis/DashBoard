import type { LayoutUpdateEntry, WidgetInstanceEntry } from '@dashboard/shared';
import { useQueries } from '@tanstack/react-query';
import { OctagonX, Plus, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  noCompactor,
  ResponsiveGridLayout,
  useContainerWidth,
  type Compactor,
  type Layout,
  type LayoutItem,
} from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import { Link, useParams } from 'react-router';
import { useDeleteWidget, useUpdateLayout, useWidgets } from '@/api/widgets.js';
import { AddWidgetDialog } from '@/components/AddWidgetDialog.js';
import { frameState, type FrameState } from '@/components/frame-state.js';
import { PageHead } from '@/components/page-head.js';
import { Alert, AlertContent, AlertDescription, AlertTitle } from '@/components/ui/alert.js';
import { Button } from '@/components/ui/button.js';
import { Lamp, type LampState } from '@/components/ui/lamp.js';
import { useNow, WidgetFrame } from '@/components/WidgetFrame.js';
import {
  cascade,
  changedEntries,
  GRID_COLS,
  moveEntry,
  moveStacked,
  normalize,
  nextSlot,
  resizeEntry,
  sortStacked,
  type MoveDirection,
} from '@/lib/layout.js';
import { cn } from '@/lib/utils.js';
import { useSocket } from '@/realtime/SocketProvider.js';
import { widgetDataQuery } from '@/realtime/useWidgetData.js';
import { getWidgetMeta } from '@/widgets/registry.js';

const MD_QUERY = '(min-width: 768px)';
/** design-reference §2: grid margin [8, 8], rowHeight 60, no container padding. */
const GAP = 8;
const ROW_HEIGHT = 60;
/** Remove has no confirm: the DELETE is sent when this undo window closes. */
const UNDO_MS = 8000;

function useIsDesktop() {
  return useSyncExternalStore(
    (notify) => {
      const mql = window.matchMedia(MD_QUERY);
      mql.addEventListener('change', notify);
      return () => mql.removeEventListener('change', notify);
    },
    () => window.matchMedia(MD_QUERY).matches,
  );
}

/** Moves focus into a widget: its alert action if it has one, else its options button. */
function focusWidget(id: string) {
  const panel = document.querySelector(`[data-widget-id="${id}"]`);
  (
    panel?.querySelector<HTMLElement>('[role="alert"] a, [role="alert"] button') ??
    panel?.querySelector<HTMLElement>('button[aria-haspopup="menu"]')
  )?.focus();
}

const COUNTERS: { state: FrameState; lamp: LampState; label: string }[] = [
  { state: 'live', lamp: 'live', label: 'live' },
  { state: 'loading', lamp: 'waiting', label: 'waiting' },
  { state: 'stale', lamp: 'stale', label: 'stale' },
  { state: 'paused', lamp: 'paused', label: 'paused' },
];

const COUNT = 'text-foreground font-mono text-xs font-medium';

/** "7 widgets · 5 live · 1 stale · 1 needs attention", from the same frame states the panels show. */
function DashboardCounters({ widgets }: { widgets: WidgetInstanceEntry[] }) {
  const { connected } = useSocket();
  const now = useNow();
  const entries = useQueries({ queries: widgets.map((w) => widgetDataQuery(w.id)) });
  const states = widgets.map((w, i) => frameState(entries[i]?.data, connected, w.refreshRate, now));
  const tally: Partial<Record<FrameState, number>> = {};
  for (const s of states) tally[s] = (tally[s] ?? 0) + 1;
  const count = (state: FrameState) => tally[state] ?? 0;
  const attention = count('warn') + count('error');
  const firstAttention = widgets.find((_, i) => states[i] === 'warn' || states[i] === 'error');

  return (
    <span role="group" aria-label="Widget status" className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
      <span>
        <b className={COUNT}>{widgets.length}</b> {widgets.length === 1 ? 'widget' : 'widgets'}
      </span>
      {COUNTERS.filter(({ state }) => count(state) > 0).map(({ state, lamp, label }) => (
        <span key={state} className="inline-flex items-center gap-1.5">
          <Lamp state={lamp} />
          <span>
            <b className={COUNT}>{count(state)}</b> {label}
          </span>
        </span>
      ))}
      {firstAttention && (
        <span className="inline-flex items-center gap-1.5">
          <Lamp state={count('error') > 0 ? 'error' : 'warn'} />
          <button
            type="button"
            className="decoration-current/40 underline underline-offset-3"
            onClick={() => focusWidget(firstAttention.id)}
          >
            <b className={COUNT}>{attention}</b> need{attention === 1 ? 's' : ''} attention
          </button>
        </span>
      )}
    </span>
  );
}

type Box = { id: string; x: number; y: number; w: number; h: number };
const toBox = ({ i, x, y, w, h }: LayoutItem): Box => ({ id: i, x, y, w, h });

/** Where react-grid-layout will drop the item being dragged or resized. */
interface Preview {
  mode: 'drag' | 'resize';
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Dashboard grid — docs/Architecture.md §9. Drag/resize on md+, single stacked column below. */
export function DashboardPage() {
  const { dashboardId = '' } = useParams();
  const { data, isError, refetch } = useWidgets(dashboardId);
  const updateLayout = useUpdateLayout(dashboardId);
  const deleteWidget = useDeleteWidget(dashboardId);
  const isDesktop = useIsDesktop();
  const { width, containerRef } = useContainerWidth();

  // RGL keeps its own dropped position when the normalized `layouts` prop is unchanged, and a
  // remount would resubscribe every widget. So on drag/resize stop we hand it its own dropped
  // layout for one commit; the next commit's normalized layout then differs and resyncs it.
  const [dropped, setDropped] = useState<Layout | null>(null);
  useEffect(() => {
    if (dropped) setDropped(null);
  }, [dropped]);
  const [preview, setPreview] = useState<Preview | null>(null);
  // The item being dragged/resized and the layout it started from (a copy: the grid mutates its own).
  const active = useRef<{ id: string; stored: Box[] } | null>(null);
  // While dragging/resizing, lay out every other item as the mock does: cascade() from the stored
  // layout, not react-grid-layout's own push (which moves one item and overlaps the next). Idle,
  // it leaves the stored layout as-is, like noCompactor.
  const compactor = useMemo<Compactor>(
    () => ({
      type: null,
      allowOverlap: false,
      compact(layout, cols) {
        const start = active.current;
        const item = start && layout.find((l) => l.i === start.id);
        if (!start || !item) return noCompactor.compact(layout, cols);
        const placed = new Map(cascade(start.stored, toBox(item)).map((b) => [b.id, b]));
        return layout.map((l) => {
          const b = placed.get(l.i);
          return b ? { ...l, x: b.x, y: b.y, w: b.w, h: b.h } : l;
        });
      },
    }),
    [],
  );
  // Screen-reader feedback for menu moves/resizes, drops and Undo (the grid itself is silent).
  const [announcement, setAnnouncement] = useState('');
  const [dialog, setDialog] = useState<{
    open: boolean;
    instance?: WidgetInstanceEntry;
  }>({ open: false });
  const addRef = useRef<HTMLButtonElement>(null);
  // Set by a create, read when the dialog closes: focus goes to Add widget and the new panel scrolls into view.
  const createdId = useRef<string | null>(null);

  // Removed but not yet deleted: hidden until Undo, or deleted when the window closes.
  const [removed, setRemoved] = useState<WidgetInstanceEntry | null>(null);
  const pendingRemove = useRef<{ id: string; timer: ReturnType<typeof setTimeout> } | null>(null);
  const restoredId = useRef<string | null>(null);
  const { mutate: deleteMutate } = deleteWidget;
  /** Stops the undo window and returns the widget it was holding, if any. */
  function takePending() {
    const pending = pendingRemove.current;
    if (pending) clearTimeout(pending.timer);
    pendingRemove.current = null;
    return pending?.id;
  }
  function commitRemove() {
    const id = takePending();
    if (id) deleteMutate(id);
  }
  // Leaving the page doesn't cancel a removal: send its DELETE now.
  const commitRef = useRef(commitRemove);
  commitRef.current = commitRemove;
  useEffect(() => () => commitRef.current(), []);
  useEffect(() => {
    if (removed || !restoredId.current) return;
    focusWidget(restoredId.current);
    restoredId.current = null;
  }, [removed]);

  const widgets = (data?.widgets ?? []).filter((w) => w.id !== removed?.id);

  function remove(w: WidgetInstanceEntry) {
    commitRemove();
    pendingRemove.current = {
      id: w.id,
      timer: setTimeout(() => {
        commitRemove();
        setRemoved(null);
      }, UNDO_MS),
    };
    setRemoved(w);
  }

  function undo() {
    takePending();
    restoredId.current = removed?.id ?? null;
    setRemoved(null);
    setAnnouncement('Widget restored. Nothing was deleted.');
  }

  /** Persists `entries` and returns where widget `id` ends up. */
  function save(entries: LayoutUpdateEntry[], id?: string) {
    if (entries.length > 0) updateLayout.mutate(entries);
    return entries.find((e) => e.id === id) ?? widgets.find((w) => w.id === id);
  }

  function renderFrame(w: WidgetInstanceEntry) {
    return (
      <WidgetFrame
        instance={w}
        onConfigure={() => setDialog({ open: true, instance: w })}
        onDelete={() => remove(w)}
        onMove={(dir: MoveDirection) => {
          const entries =
            !isDesktop && (dir === 'up' || dir === 'down')
              ? moveStacked(widgets, w.id, dir)
              : moveEntry(widgets, w.id, dir);
          const at = save(entries, w.id);
          if (at) setAnnouncement(`Moved ${dir}. Now at column ${at.x + 1}, row ${at.y + 1}.`);
        }}
        onResize={
          isDesktop
            ? (dir) => {
                const at = save(resizeEntry(widgets, w.id, dir), w.id);
                if (at) setAnnouncement(`Resized to ${at.w} columns by ${at.h} rows.`);
              }
            : undefined
        }
      />
    );
  }

  /** Drag/resize stop: normalize the whole layout and persist every item whose geometry changed. */
  function persist(layout: Layout, _old: unknown, moved: { i: string } | null) {
    active.current = null;
    setPreview(null);
    const entries = layout.map(({ i, x, y, w, h }) => ({ id: i, x, y, w, h }));
    const next = normalize(entries, moved?.i);
    const changed = changedEntries(widgets, next);
    if (changed.length > 0 || changedEntries(next, entries).length > 0) setDropped(layout);
    const at = save(changed, moved?.i);
    if (at) setAnnouncement(`Moved to column ${at.x + 1}, row ${at.y + 1}, ${at.w} by ${at.h}.`);
  }

  /** onDragStart/onResizeStart: remember the item and the layout the cascade starts from. */
  function begin(layout: Layout, item: LayoutItem | null) {
    active.current = item && { id: item.i, stored: layout.map(toBox) };
  }

  /** onDrag/onResize: track where the item lands (after the cascade) for the guides and the x/y w×h readout. */
  const track =
    (mode: Preview['mode']) => (_layout: Layout, _old: unknown, item: LayoutItem | null) => {
      if (!item) return;
      const start = active.current;
      const { x, y, w, h } = (start && cascade(start.stored, toBox(item)).find((b) => b.id === item.i)) ?? item;
      setPreview((p) =>
        p?.mode === mode && p.x === x && p.y === y && p.w === w && p.h === h ? p : { mode, x, y, w, h },
      );
    };

  const openAdd = () => setDialog({ open: true });
  const empty = data !== undefined && widgets.length === 0;
  const saveError = deleteWidget.isError
    ? { title: 'Couldn’t remove the widget', body: 'It’s back on the dashboard. Try again.' }
    : updateLayout.isError
      ? { title: 'Couldn’t save the layout', body: 'The grid was put back to the last saved layout.' }
      : null;

  if (isError) {
    return (
      <>
        <PageHead title="Dashboard" sub="Widgets couldn’t be loaded." className="items-center" />
        <Alert tone="destructive">
          <OctagonX />
          <AlertContent>
            <AlertTitle>Couldn’t load your widgets</AlertTitle>
            <AlertDescription>The server didn’t answer. Your dashboard is unchanged.</AlertDescription>
            <Button variant="outline" size="sm" className="mt-1.5 justify-self-start" onClick={() => void refetch()}>
              Retry
            </Button>
          </AlertContent>
        </Alert>
      </>
    );
  }

  const col = (width - GAP * (GRID_COLS - 1)) / GRID_COLS;

  return (
    <>
      <PageHead
        title="Dashboard"
        className="items-center"
        sub={empty ? 'No widgets on this dashboard.' : data && <DashboardCounters widgets={widgets} />}
      >
        {!empty && (
          <Button ref={addRef} onClick={openAdd}>
            <Plus />
            Add <span className="max-md:hidden">widget</span>
          </Button>
        )}
      </PageHead>

      {saveError && (
        <Alert tone="destructive" className="mb-3">
          <OctagonX />
          <AlertContent>
            <AlertTitle>{saveError.title}</AlertTitle>
            <AlertDescription>{saveError.body}</AlertDescription>
          </AlertContent>
          <Button
            variant="ghost"
            size="icon-sm"
            className="-my-1"
            aria-label="Dismiss"
            onClick={() => {
              deleteWidget.reset();
              updateLayout.reset();
            }}
          >
            <X />
          </Button>
        </Alert>
      )}

      {removed && (
        <div
          role="status"
          className="bg-card mb-3 flex w-fit items-center gap-3 rounded-md border py-1.5 pr-1.5 pl-3 text-[0.8125rem] max-md:w-full"
        >
          <span>
            Removed <b className="font-semibold">{getWidgetMeta(removed.service, removed.widget).label}</b>.
          </span>
          <Button variant="outline" size="sm" autoFocus onClick={undo}>
            Undo
          </Button>
        </div>
      )}

      {empty ? (
        <section
          aria-labelledby="empty-title"
          className="grid min-h-105 place-items-center rounded-lg border border-dashed bg-[linear-gradient(to_right,color-mix(in_oklch,var(--border)_60%,transparent)_1px,transparent_1px)] bg-size-[calc((100%_+_8px)/12)_100%] px-4 py-8 text-center"
        >
          <div className="bg-background grid max-w-95 justify-items-center gap-3 rounded-lg p-5">
            <h2 id="empty-title" className="text-base font-semibold">
              Add your first widget
            </h2>
            <p className="text-muted-foreground text-[0.8125rem] text-pretty">
              Widgets update on their own once added. Weather works right away. GitHub and Steam need a connected
              account first.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={openAdd}>
                <Plus />
                Add widget
              </Button>
              <Button asChild variant="outline">
                <Link to="/services">Connect services</Link>
              </Button>
            </div>
          </div>
        </section>
      ) : isDesktop ? (
        <div ref={containerRef} className="relative">
          <div
            aria-hidden="true"
            data-slot="grid-guides"
            data-active={preview ? '' : undefined}
            className="pointer-events-none absolute inset-0 grid grid-cols-12 gap-2 opacity-0 transition-opacity duration-(--dur) data-active:opacity-100"
          >
            {Array.from({ length: GRID_COLS }, (_, i) => (
              <span key={i} className="border-muted-foreground/30 border-x border-dashed" />
            ))}
          </div>
          <ResponsiveGridLayout
            width={width}
            breakpoints={{ lg: 768 }}
            cols={{ lg: GRID_COLS }}
            layouts={{
              lg:
                dropped ??
                normalize(widgets).map((w) => ({
                  i: w.id,
                  x: w.x,
                  y: w.y,
                  w: w.w,
                  h: w.h,
                })),
            }}
            rowHeight={ROW_HEIGHT}
            margin={[GAP, GAP]}
            containerPadding={[0, 0]}
            // normalize() already packs; rendered layout must equal the stored one.
            compactor={compactor}
            dragConfig={{ handle: '.widget-drag-handle' }}
            onDragStart={begin}
            onResizeStart={begin}
            onDrag={track('drag')}
            onResize={track('resize')}
            onDragStop={persist}
            onResizeStop={persist}
          >
            {widgets.map((w) => (
              <div key={w.id} data-widget-id={w.id}>
                {renderFrame(w)}
              </div>
            ))}
          </ResponsiveGridLayout>
          {preview && (
            <div
              aria-hidden="true"
              data-slot="grid-readout"
              // Over the resizing panel (z-index 20), whose corner covers the readout.
              className={cn('pointer-events-none absolute', preview.mode === 'resize' ? 'z-30' : 'z-2')}
              style={{
                left: preview.x * (col + GAP),
                top: preview.y * (ROW_HEIGHT + GAP),
                width: preview.w * col + (preview.w - 1) * GAP,
                height: preview.h * ROW_HEIGHT + (preview.h - 1) * GAP,
              }}
            >
              <span
                className={cn(
                  'bg-background absolute right-2 inline-flex gap-2.5 rounded-sm border px-1.5 py-0.75 font-mono text-xs',
                  preview.mode === 'drag' ? 'top-2' : 'bottom-2',
                )}
              >
                <span>{`x${preview.x} y${preview.y}`}</span>
                <span>{`${preview.w}×${preview.h}`}</span>
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-2">
          {sortStacked(widgets).map((w) => (
            <div key={w.id} data-widget-id={w.id} className="grid min-h-49">
              {renderFrame(w)}
            </div>
          ))}
        </div>
      )}

      <p aria-live="polite" data-slot="announcer" className="sr-only">
        {announcement}
      </p>

      <AddWidgetDialog
        dashboardId={dashboardId}
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        slot={nextSlot(widgets)}
        instance={dialog.instance}
        onCreated={(w) => {
          createdId.current = w.id;
          setAnnouncement(`${getWidgetMeta(w.service, w.widget).label} added. Waiting for the first update.`);
        }}
        onCloseAutoFocus={(e) => {
          const id = createdId.current;
          if (!id) return;
          createdId.current = null;
          e.preventDefault();
          addRef.current?.focus();
          const panel = document.querySelector(`[data-widget-id="${id}"]`);
          if (panel)
            window.scrollTo({
              top: panel.getBoundingClientRect().top + window.scrollY - 80,
              behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
            });
        }}
      />
    </>
  );
}
