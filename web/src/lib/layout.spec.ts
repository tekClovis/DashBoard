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
    expect(moveEntry([item({})], 'w', 'up')).toEqual([{ id: 'w', x: 4, y: 1, w: 4, h: 3 }]);
    expect(moveEntry([item({})], 'w', 'right')).toEqual([{ id: 'w', x: 5, y: 2, w: 4, h: 3 }]);
  });

  it('clamps at the grid edges', () => {
    expect(moveEntry([item({ y: 0 })], 'w', 'up')).toEqual([]);
    expect(moveEntry([item({ x: 0 })], 'w', 'left')).toEqual([]);
    expect(moveEntry([item({ x: 8 })], 'w', 'right')).toEqual([]);
  });

  it('pushes displaced items down so nothing overlaps', () => {
    const w1 = item({ id: 'w1', x: 0, y: 0, w: 4, h: 3 });
    const w2 = item({ id: 'w2', x: 0, y: 3, w: 4, h: 3 });
    const w3 = item({ id: 'w3', x: 0, y: 6, w: 4, h: 3 });
    // w1 moves down onto w2, which is pushed below it and in turn onto w3.
    const result = moveEntry([w1, w2, w3], 'w1', 'down');
    expect(result).toEqual([
      { id: 'w1', x: 0, y: 1, w: 4, h: 3 },
      { id: 'w2', x: 0, y: 4, w: 4, h: 3 },
      { id: 'w3', x: 0, y: 7, w: 4, h: 3 },
    ]);
  });

  it('places new widgets below existing ones', () => {
    expect(nextSlot([])).toMatchObject({ x: 0, y: 0 });
    expect(nextSlot([{ y: 2, h: 3 }])).toMatchObject({ x: 0, y: 5 });
  });
});
