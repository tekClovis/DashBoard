import type { WidgetInstanceEntry } from '@dashboard/shared';
import { describe, expect, it } from 'vitest';
import { moveEntry, nextSlot, normalize, sortStacked } from './layout.js';

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

  it('moves left/right one column and packs upward', () => {
    expect(moveEntry([item({ y: 0 })], 'w', 'right')).toEqual([{ id: 'w', x: 5, y: 0, w: 4, h: 3 }]);
    expect(moveEntry([item({})], 'w', 'right')).toEqual([{ id: 'w', x: 5, y: 0, w: 4, h: 3 }]);
  });

  it('clamps at the edges; up/down with no neighbour is a no-op (lone widget PATCHes nothing)', () => {
    expect(moveEntry([item({ x: 0, y: 0 })], 'w', 'left')).toEqual([]);
    expect(moveEntry([item({ x: 8, y: 0 })], 'w', 'right')).toEqual([]);
    expect(moveEntry([item({ x: 0, y: 0 })], 'w', 'down')).toEqual([]);
    expect(moveEntry([item({ x: 0, y: 0 })], 'w', 'up')).toEqual([]);
  });

  it('down/up swap with the neighbour and persist everything displaced', () => {
    const w1 = item({ id: 'w1', x: 0, y: 0 });
    const w2 = item({ id: 'w2', x: 0, y: 3 });
    const w3 = item({ id: 'w3', x: 0, y: 6 });
    expect(moveEntry([w1, w2, w3], 'w1', 'down')).toEqual([
      { id: 'w1', x: 0, y: 3, w: 4, h: 3 },
      { id: 'w2', x: 0, y: 0, w: 4, h: 3 },
    ]);
    expect(moveEntry([w1, w2, w3], 'w3', 'up')).toEqual([
      { id: 'w2', x: 0, y: 6, w: 4, h: 3 },
      { id: 'w3', x: 0, y: 3, w: 4, h: 3 },
    ]);
  });

  describe('normalize', () => {
    const b = (id: string, x: number, y: number) => ({ id, x, y, w: 4, h: 3 });

    it('cascades a drop through a stack (w10 onto w11 with w12 below)', () => {
      const out = normalize(
        [b('w10', 0, 1), b('w11', 0, 4), b('w12', 0, 7), b('w13', 0, 10)].map((i) =>
          i.id === 'w10' ? { ...i, y: 5 } : i,
        ),
        'w10',
      );
      expect(out.map((i) => [i.id, i.y])).toEqual([
        ['w10', 3],
        ['w11', 0],
        ['w12', 6],
        ['w13', 9],
      ]);
    });

    it('packs gaps upward', () => {
      expect(normalize([b('a', 0, 5), b('b', 4, 9)]).map((i) => i.y)).toEqual([0, 0]);
    });

    it('is idempotent and leaves no overlaps', () => {
      const once = normalize([b('a', 0, 2), b('b', 0, 2), b('c', 2, 3), b('d', 0, 4)], 'c');
      expect(normalize(once)).toEqual(once);
      for (const p of once)
        for (const q of once)
          if (p.id < q.id) expect(p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h).toBe(false);
    });
  });

  it('places new widgets below existing ones', () => {
    expect(nextSlot([])).toMatchObject({ x: 0, y: 0 });
    expect(nextSlot([{ y: 2, h: 3 }])).toMatchObject({ x: 0, y: 5 });
  });
});
