import type { WidgetInstanceEntry } from '@dashboard/shared';
import { describe, expect, it } from 'vitest';
import { moveEntry, nextSlot, sortStacked } from './layout.js';

const item = (over: Partial<WidgetInstanceEntry>): WidgetInstanceEntry => ({
  id: 'w',
  dashboardId: 'd',
  service: 's',
  widget: 'w',
  params: {},
  refreshRate: 60,
  x: 4,
  y: 2,
  w: 4,
  h: 3,
  ...over,
});

describe('layout helpers', () => {
  it('orders the stacked column by (y, x)', () => {
    const sorted = sortStacked([
      { id: 'c', x: 0, y: 3 },
      { id: 'b', x: 6, y: 0 },
      { id: 'a', x: 0, y: 0 },
    ]);
    expect(sorted.map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });

  it('moves one cell and keeps size', () => {
    expect(moveEntry(item({}), 'up')).toEqual({ id: 'w', x: 4, y: 1, w: 4, h: 3 });
    expect(moveEntry(item({}), 'right')).toEqual({ id: 'w', x: 5, y: 2, w: 4, h: 3 });
  });

  it('clamps at the grid edges', () => {
    expect(moveEntry(item({ y: 0 }), 'up')).toBeNull();
    expect(moveEntry(item({ x: 0 }), 'left')).toBeNull();
    expect(moveEntry(item({ x: 8 }), 'right')).toBeNull();
  });

  it('places new widgets below existing ones', () => {
    expect(nextSlot([])).toMatchObject({ x: 0, y: 0 });
    expect(nextSlot([{ y: 2, h: 3 }])).toMatchObject({ x: 0, y: 5 });
  });
});
