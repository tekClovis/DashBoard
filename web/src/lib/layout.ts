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

type Box = { x: number; y: number; w: number; h: number };

const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * One-cell keyboard move of `id`, clamped to the grid. Items the moved one lands on are pushed
 * down below it (cascading), so no two items overlap. Returns only the entries whose geometry
 * changed — empty when the move is a no-op.
 */
export function moveEntry(items: WidgetInstanceEntry[], id: string, dir: MoveDirection): LayoutUpdateEntry[] {
  const item = items.find((i) => i.id === id);
  if (!item) return [];
  const dx = dir === 'left' ? -1 : dir === 'right' ? 1 : 0;
  const dy = dir === 'up' ? -1 : dir === 'down' ? 1 : 0;
  const x = Math.min(Math.max(item.x + dx, 0), GRID_COLS - item.w);
  const y = Math.max(item.y + dy, 0);
  if (x === item.x && y === item.y) return [];

  const boxes = new Map<string, Box>(items.map((i) => [i.id, { x: i.x, y: i.y, w: i.w, h: i.h }]));
  boxes.set(id, { x, y, w: item.w, h: item.h });

  // Resolve overlaps: the moved item stays put, otherwise the lower/later item is pushed below
  // the other. y only grows, so this terminates.
  let changed = true;
  while (changed) {
    changed = false;
    for (const [aId, a] of boxes) {
      for (const [bId, b] of boxes) {
        if (aId >= bId || !overlaps(a, b)) continue;
        const bFirst = aId === id ? false : bId === id ? true : b.y < a.y || (b.y === a.y && b.x < a.x);
        const [top, bottom] = bFirst ? [b, a] : [a, b];
        bottom.y = top.y + top.h;
        changed = true;
      }
    }
  }

  return items.flatMap((i) => {
    const b = boxes.get(i.id)!;
    return b.x !== i.x || b.y !== i.y ? [{ id: i.id, x: b.x, y: b.y, w: b.w, h: b.h }] : [];
  });
}
