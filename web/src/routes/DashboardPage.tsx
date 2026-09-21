import type { WidgetInstanceEntry } from '@dashboard/shared';
import { useState, useSyncExternalStore } from 'react';
import { noCompactor, ResponsiveGridLayout, useContainerWidth, type Layout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import { useParams } from 'react-router';
import { useDeleteWidget, useUpdateLayout, useWidgets } from '@/api/widgets.js';
import { AddWidgetDialog } from '@/components/AddWidgetDialog.js';
import { Button } from '@/components/ui/button.js';
import { WidgetFrame } from '@/components/WidgetFrame.js';
import {
  changedEntries,
  GRID_COLS,
  moveEntry,
  normalize,
  nextSlot,
  sortStacked,
  type MoveDirection,
} from '@/lib/layout.js';

const MD_QUERY = '(min-width: 768px)';

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

/** Dashboard grid — docs/Architecture.md §9. Drag/resize on md+, single stacked column below. */
export function DashboardPage() {
  const { dashboardId = '' } = useParams();
  const { data, isError, refetch } = useWidgets(dashboardId);
  const updateLayout = useUpdateLayout(dashboardId);
  const deleteWidget = useDeleteWidget(dashboardId);
  const isDesktop = useIsDesktop();
  const { width, containerRef } = useContainerWidth();

  // Bumped on every drag/resize stop: RGL keeps its own dropped position when the normalized
  // layout prop is unchanged, so remount it to make the render equal the stored layout.
  const [gridEpoch, setGridEpoch] = useState(0);
  const [dialog, setDialog] = useState<{
    open: boolean;
    instance?: WidgetInstanceEntry;
  }>({ open: false });
  const widgets = data?.widgets ?? [];

  function renderFrame(w: WidgetInstanceEntry) {
    return (
      <WidgetFrame
        instance={w}
        onConfigure={() => setDialog({ open: true, instance: w })}
        onDelete={() => deleteWidget.mutate(w.id)}
        onMove={(dir: MoveDirection) => {
          const entries = moveEntry(widgets, w.id, dir);
          if (entries.length > 0) updateLayout.mutate(entries);
        }}
      />
    );
  }

  /** Drag/resize stop: normalize the whole layout and persist every item whose geometry changed. */
  function persist(layout: Layout, _old: unknown, dropped: { i: string } | null) {
    const next = normalize(
      layout.map(({ i, x, y, w, h }) => ({ id: i, x, y, w, h })),
      dropped?.i,
    );
    setGridEpoch((n) => n + 1);
    const changed = changedEntries(widgets, next);
    if (changed.length > 0) updateLayout.mutate(changed);
  }

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Dashboard</h1>
        <Button onClick={() => setDialog({ open: true })}>Add widget</Button>
      </div>

      {(deleteWidget.isError || updateLayout.isError) && (
        <p role="alert" className="text-destructive mb-2 text-sm">
          {deleteWidget.isError ? 'Could not delete the widget.' : 'Could not save the layout.'}
        </p>
      )}

      {isError ? (
        <div role="alert" className="grid justify-items-start gap-2">
          <p className="text-destructive text-sm">Could not load your widgets.</p>
          <Button variant="outline" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      ) : isDesktop ? (
        <div ref={containerRef}>
          <ResponsiveGridLayout
            key={gridEpoch}
            width={width}
            breakpoints={{ lg: 768 }}
            cols={{ lg: GRID_COLS }}
            layouts={{
              lg: normalize(widgets).map((w) => ({
                i: w.id,
                x: w.x,
                y: w.y,
                w: w.w,
                h: w.h,
              })),
            }}
            rowHeight={60}
            // normalize() already packs; rendered layout must equal the stored one.
            compactor={noCompactor}
            dragConfig={{ handle: '.widget-drag-handle' }}
            onDragStop={persist}
            onResizeStop={persist}
          >
            {widgets.map((w) => (
              <div key={w.id}>{renderFrame(w)}</div>
            ))}
          </ResponsiveGridLayout>
        </div>
      ) : (
        <div className="grid gap-4">
          {sortStacked(widgets).map((w) => (
            <div key={w.id} className="h-48">
              {renderFrame(w)}
            </div>
          ))}
        </div>
      )}

      <AddWidgetDialog
        dashboardId={dashboardId}
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        slot={nextSlot(widgets)}
        instance={dialog.instance}
      />
    </div>
  );
}
