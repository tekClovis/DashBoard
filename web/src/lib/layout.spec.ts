import type { WidgetInstanceEntry } from '@dashboard/shared';
import { describe, expect, it } from 'vitest';
import { cascade, moveEntry, moveStacked, nextSlot, normalize, resizeEntry, sortStacked } from './layout.js';

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

  // mock.html INITIAL layout; expected positions are the mock's live normalize during drag/resize.
  describe('cascade (live drag/resize preview)', () => {
    const MOCK = [
      { id: 'w-cw', x: 0, y: 0, w: 3, h: 5 },
      { id: 'w-cm', x: 3, y: 0, w: 5, h: 5 },
      { id: 'w-pr', x: 8, y: 0, w: 4, h: 5 },
      { id: 'w-fc', x: 0, y: 5, w: 3, h: 5 },
      { id: 'w-sa', x: 3, y: 5, w: 4, h: 5 },
      { id: 'w-rp', x: 7, y: 5, w: 5, h: 5 },
      { id: 'w-gn', x: 0, y: 10, w: 12, h: 3 },
    ];
    const at = (items: typeof MOCK) => Object.fromEntries(items.map(({ id, x, y, w, h }) => [id, [x, y, w, h]]));

    it('Security alerts dragged to x8 y5 pushes Recently played to y10 and Game news to y15', () => {
      expect(at(cascade(MOCK, { id: 'w-sa', x: 8, y: 5, w: 4, h: 5 }))).toEqual({
        'w-cw': [0, 0, 3, 5],
        'w-cm': [3, 0, 5, 5],
        'w-pr': [8, 0, 4, 5],
        'w-fc': [0, 5, 3, 5],
        'w-sa': [8, 5, 4, 5],
        'w-rp': [7, 10, 5, 5],
        'w-gn': [0, 15, 12, 3],
      });
    });

    it('Recently played resized to 5×6 pushes Game news to y11', () => {
      expect(at(cascade(MOCK, { id: 'w-rp', x: 7, y: 5, w: 5, h: 6 }))).toMatchObject({
        'w-rp': [7, 5, 5, 6],
        'w-gn': [0, 11, 12, 3],
      });
    });
  });

  // Below md the menu moves along the stacked reading order: swap with the neighbour, then normalize (the mock).
  describe('moveStacked', () => {
    const MOCK = (
      [
        ['w-cw', 0, 0, 3, 5],
        ['w-cm', 3, 0, 5, 5],
        ['w-pr', 8, 0, 4, 5],
        ['w-fc', 0, 5, 3, 5],
        ['w-sa', 3, 5, 4, 5],
        ['w-rp', 7, 5, 5, 5],
        ['w-gn', 0, 10, 12, 3],
      ] as const
    ).map(([id, x, y, w, h]) => item({ id, x, y, w, h }));
    const stackAfter = (entries: { id: string; x: number; y: number }[]) =>
      sortStacked(MOCK.map((i) => ({ ...i, ...entries.find((e) => e.id === i.id) }))).map((i) => i.id);

    it('Move up on Forecast swaps it with the panel just above it: cw / cm / fc / pr / …', () => {
      const entries = moveStacked(MOCK, 'w-fc', 'up');
      expect(stackAfter(entries)).toEqual(['w-cw', 'w-cm', 'w-fc', 'w-pr', 'w-rp', 'w-sa', 'w-gn']);
      expect(entries).toContainEqual({ id: 'w-fc', x: 8, y: 0, w: 3, h: 5 });
      expect(entries).toContainEqual({ id: 'w-pr', x: 0, y: 5, w: 4, h: 5 });
    });

    it('Move down on Forecast takes the place of the panel just below it', () => {
      const entries = moveStacked(MOCK, 'w-fc', 'down');
      expect(entries).toContainEqual({ id: 'w-fc', x: 3, y: 5, w: 3, h: 5 });
      expect(entries).toContainEqual({ id: 'w-sa', x: 0, y: 10, w: 4, h: 5 });
      expect(stackAfter(entries)).toEqual(['w-cw', 'w-cm', 'w-pr', 'w-fc', 'w-rp', 'w-sa', 'w-gn']);
    });

    it('is a no-op at either end of the stack', () => {
      expect(moveStacked(MOCK, 'w-cw', 'up')).toEqual([]);
      expect(moveStacked(MOCK, 'w-gn', 'down')).toEqual([]);
    });
  });

  describe('resizeEntry', () => {
    it('grows and shrinks one step per axis', () => {
      expect(resizeEntry([item({ y: 0 })], 'w', 'wider')).toEqual([{ id: 'w', x: 4, y: 0, w: 5, h: 3 }]);
      expect(resizeEntry([item({ y: 0 })], 'w', 'narrower')).toEqual([{ id: 'w', x: 4, y: 0, w: 3, h: 3 }]);
      expect(resizeEntry([item({ y: 0 })], 'w', 'taller')).toEqual([{ id: 'w', x: 4, y: 0, w: 4, h: 4 }]);
      expect(resizeEntry([item({ y: 0 })], 'w', 'shorter')).toEqual([{ id: 'w', x: 4, y: 0, w: 4, h: 2 }]);
    });

    it('clamps to 2×2 and to the right edge of the grid', () => {
      expect(resizeEntry([item({ y: 0, w: 2, h: 2 })], 'w', 'narrower')).toEqual([]);
      expect(resizeEntry([item({ y: 0, w: 2, h: 2 })], 'w', 'shorter')).toEqual([]);
      expect(resizeEntry([item({ y: 0, x: 8 })], 'w', 'wider')).toEqual([]);
    });

    it('pushes the widgets it now overlaps down', () => {
      const items = [item({ id: 'a', x: 0, y: 0, w: 4, h: 2 }), item({ id: 'b', x: 4, y: 0, w: 4, h: 2 })];
      expect(resizeEntry(items, 'a', 'wider')).toEqual([
        { id: 'a', x: 0, y: 0, w: 5, h: 2 },
        { id: 'b', x: 4, y: 2, w: 4, h: 2 },
      ]);
    });
  });

  it('places new widgets below existing ones', () => {
    expect(nextSlot([])).toMatchObject({ x: 0, y: 0 });
    expect(nextSlot([{ y: 2, h: 3 }])).toMatchObject({ x: 0, y: 5 });
  });
});
