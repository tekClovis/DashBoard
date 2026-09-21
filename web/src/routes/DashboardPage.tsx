import type { LayoutUpdateEntry, WidgetInstanceEntry } from '@dashboard/shared';
import { useState, useSyncExternalStore } from 'react';
import { ResponsiveGridLayout, useContainerWidth, type Layout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import { useParams } from 'react-router';
import { useDeleteWidget, useUpdateLayout, useWidgets } from '@/api/widgets.js';
import { AddWidgetDialog } from '@/components/AddWidgetDialog.js';
import { Button } from '@/components/ui/button.js';
import { WidgetFrame } from '@/components/WidgetFrame.js';
import { GRID_COLS, moveEntry, nextSlot, sortStacked, type MoveDirection } from '@/lib/layout.js';

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
  const { data } = useWidgets(dashboardId);
  const updateLayout = useUpdateLayout(dashboardId);
  const deleteWidget = useDeleteWidget(dashboardId);
  const isDesktop = useIsDesktop();
  const { width, containerRef } = useContainerWidth();

  const [dialog, setDialog] = useState<{ open: boolean; instance?: WidgetInstanceEntry }>({ open: false });
  const widgets = data?.widgets ?? [];

  function renderFrame(w: WidgetInstanceEntry) {
    return (
      <WidgetFrame
        instance={w}
        onConfigure={() => setDialog({ open: true, instance: w })}
        onDelete={() => deleteWidget.mutate(w.id)}
        onMove={(dir: MoveDirection) => {
          const entry = moveEntry(w, dir);
          if (entry) updateLayout.mutate([entry]);
        }}
      />
    );
  }

  /** Persist only the items whose geometry actually changed. */
  function persist(layout: Layout) {
    const changed: LayoutUpdateEntry[] = layout
      .map(({ i, x, y, w, h }) => ({ id: i, x, y, w, h }))
      .filter((e) => {
        const cur = widgets.find((w) => w.id === e.id);
        return cur && (cur.x !== e.x || cur.y !== e.y || cur.w !== e.w || cur.h !== e.h);
      });
    if (changed.length > 0) updateLayout.mutate(changed);
  }

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Dashboard</h1>
        <Button onClick={() => setDialog({ open: true })}>Add widget</Button>
      </div>

      {isDesktop ? (
        <div ref={containerRef}>
          <ResponsiveGridLayout
            width={width}
            breakpoints={{ lg: 768 }}
            cols={{ lg: GRID_COLS }}
            layouts={{ lg: widgets.map((w) => ({ i: w.id, x: w.x, y: w.y, w: w.w, h: w.h })) }}
            rowHeight={60}
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
