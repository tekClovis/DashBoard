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
  return {
    x: 0,
    y: items.reduce((max, i) => Math.max(max, i.y + i.h), 0),
    ...DEFAULT_SIZE,
  };
}

type Box = { x: number; y: number; w: number; h: number };
type Item = Box & { id: string };

const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * The one layout rule, used for drag/resize and keyboard moves: place items in (y, x) order
 * (`pinnedId` wins ties, so the item just moved keeps its spot), each at the lowest y where it
 * doesn't overlap an already-placed item. That resolves every collision (with cascade) and packs
 * gaps upward. Pure and idempotent; returns items in input order.
 */
export function normalize<T extends Item>(items: T[], pinnedId?: string): T[] {
  const order = [...items].sort(
    (a, b) => a.y - b.y || Number(b.id === pinnedId) - Number(a.id === pinnedId) || a.x - b.x,
  );
  const placed: Box[] = [];
  const result = new Map<string, T>();
  for (const item of order) {
    const box = { ...item, y: 0 };
    while (placed.some((p) => overlaps(box, p))) box.y++;
    placed.push(box);
    result.set(item.id, { ...item, y: box.y });
  }
  return items.map((i) => result.get(i.id)!);
}

/** Entries of `next` whose geometry differs from `prev` (matched by id). */
export function changedEntries(prev: Item[], next: Item[]): LayoutUpdateEntry[] {
  return next
    .filter((n) => {
      const p = prev.find((i) => i.id === n.id);
      return p && (p.x !== n.x || p.y !== n.y || p.w !== n.w || p.h !== n.h);
    })
    .map(({ id, x, y, w, h }) => ({ id, x, y, w, h }));
}

/**
 * Keyboard move of `id`, then normalized. Left/right shift one column (clamped). Up/down swap
 * places with the nearest widget above/below in the same columns (a packed grid has no free
 * row to step into); with none there, they are no-ops. Empty when nothing changes.
 */
export function moveEntry(items: WidgetInstanceEntry[], id: string, dir: MoveDirection): LayoutUpdateEntry[] {
  const item = items.find((i) => i.id === id);
  if (!item) return [];
  let { x, y } = item;
  if (dir === 'left' || dir === 'right') {
    x = Math.min(Math.max(x + (dir === 'left' ? -1 : 1), 0), GRID_COLS - item.w);
  } else {
    const inColumns = items.filter((o) => o.id !== id && o.x < item.x + item.w && item.x < o.x + o.w);
    if (dir === 'down') {
      const below = inColumns.filter((o) => o.y > item.y).sort((a, b) => a.y - b.y)[0];
      if (!below) return [];
      y = below.y + 1;
    } else {
      const above = inColumns.filter((o) => o.y < item.y).sort((a, b) => b.y - a.y)[0];
      if (!above) return [];
      y = Math.max(above.y - 1, 0);
    }
  }
  const moved = items.map((i) => (i.id === id ? { ...i, x, y } : i));
  return changedEntries(items, normalize(moved, id));
}

export type ResizeDirection = 'wider' | 'narrower' | 'taller' | 'shorter';
const MIN_SIZE = 2;

/**
 * Keyboard alternative to drag-resize (WCAG 2.5.7): one column or row per step, clamped to
 * 2×2 and to the grid's right edge, then normalized. Empty when nothing changes.
 */
export function resizeEntry(items: WidgetInstanceEntry[], id: string, dir: ResizeDirection): LayoutUpdateEntry[] {
  const item = items.find((i) => i.id === id);
  if (!item) return [];
  let { w, h } = item;
  if (dir === 'wider') w = Math.min(w + 1, GRID_COLS - item.x);
  else if (dir === 'narrower') w = Math.max(w - 1, MIN_SIZE);
  else if (dir === 'taller') h += 1;
  else h = Math.max(h - 1, MIN_SIZE);
  const resized = items.map((i) => (i.id === id ? { ...i, w, h } : i));
  return changedEntries(items, normalize(resized, id));
}
