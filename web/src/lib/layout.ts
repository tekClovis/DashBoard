import type { LayoutUpdateEntry, WidgetInstanceEntry } from '@dashboard/shared';

export const GRID_COLS = 12;
export const DEFAULT_SIZE = { w: 4, h: 3 };

export type MoveDirection = 'up' | 'down' | 'left' | 'right';

/** Single-column order used below the `md` breakpoint. */
export function sortStacked<T extends { x: number; y: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.y - b.y || a.x - b.x);
}

/** New instances go below everything else, at the left edge. */
export function nextSlot(items: { y: number; h: number }[]) {
  return { x: 0, y: items.reduce((max, i) => Math.max(max, i.y + i.h), 0), ...DEFAULT_SIZE };
}

/** One-cell keyboard move, clamped to the grid. Returns null when nothing would change. */
export function moveEntry(item: WidgetInstanceEntry, dir: MoveDirection): LayoutUpdateEntry | null {
  const dx = dir === 'left' ? -1 : dir === 'right' ? 1 : 0;
  const dy = dir === 'up' ? -1 : dir === 'down' ? 1 : 0;
  const x = Math.min(Math.max(item.x + dx, 0), GRID_COLS - item.w);
  const y = Math.max(item.y + dy, 0);
  if (x === item.x && y === item.y) return null;
  return { id: item.id, x, y, w: item.w, h: item.h };
}
