import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { Compactor, Layout } from 'react-grid-layout';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { calls, failWhen, instance, openMenuItem, renderPage, respondWhen, setupPage } from './dashboard-test-utils.js';

type DragCallback = (layout: readonly unknown[], old: unknown, item: unknown, placeholder: unknown) => void;
const gridProps = vi.hoisted(() => ({ current: undefined as Record<string, unknown> | undefined }));

vi.mock('react-grid-layout', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-grid-layout')>()),
  ResponsiveGridLayout: (props: Record<string, unknown>) => {
    gridProps.current = props;
    return <div>{props.children as ReactNode}</div>;
  },
}));

beforeEach(() => {
  setupPage();
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const layoutCalls = () => calls.filter((c) => c.url === '/api/dashboards/dash-1/layout');
const callback = (name: string) => gridProps.current?.[name] as DragCallback;
const announced = () => document.querySelector('[data-slot="announcer"]')?.textContent;

describe('DashboardPage grid (md+)', () => {
  // A vertical compactor would draw a lone widget's Move down (y+1) in place, diverging from the stored y.
  it('renders the stored layout without compaction, on the design-reference geometry', async () => {
    renderPage();
    await vi.waitFor(() => expect(gridProps.current?.layouts).toBeTruthy());
    expect(gridProps.current).toMatchObject({ rowHeight: 60, margin: [8, 8], containerPadding: [0, 0] });
    const compactor = gridProps.current?.compactor as Compactor;
    expect(compactor).toMatchObject({ type: null, allowOverlap: false });
    const stored = [{ i: 'i1', x: 4, y: 2, w: 4, h: 3 }];
    expect(compactor.compact(stored, 12)).toMatchObject(stored);
    expect(screen.queryByText('Couldn’t load your widgets')).toBeNull();
  });

  // The grid is mounted while widgets load and unmounted for the empty state; a measured node that
  // is removed reports width 0 (a ~2px first widget) and the node mounted later is never observed.
  it('keeps the measured grid container observed and attached when the dashboard is empty', async () => {
    const observed = new Set<Element>();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe = (el: Element) => void observed.add(el);
        disconnect = () => observed.clear();
        unobserve = () => undefined;
      },
    );
    respondWhen(
      (url) => url.endsWith('/widgets'),
      () => new Response(JSON.stringify({ widgets: [] }), { status: 200 }),
    );
    renderPage();
    await screen.findByText('Add your first widget');
    expect(observed.size).toBe(1);
    for (const el of observed) expect(el.isConnected).toBe(true);
  });

  // One render: Radix menus in jsdom don't reopen reliably across separate renders.
  it('moves and resizes from the widget menu through the layout save, with a dismissible alert on failure', async () => {
    renderPage();

    await openMenuItem('Move right');
    await waitFor(() => expect(layoutCalls()).toHaveLength(1));
    expect(layoutCalls()[0]).toMatchObject({ method: 'PATCH', body: [{ id: 'i1', x: 5, y: 0, w: 4, h: 3 }] });
    await waitFor(() => expect(announced()).toBe('Moved right. Now at column 6, row 1.'));

    await openMenuItem('Wider');
    await waitFor(() => expect(layoutCalls()).toHaveLength(2));
    expect(layoutCalls()[1].body).toEqual([expect.objectContaining({ id: 'i1', w: 5, h: 3 })]);
    await waitFor(() => expect(announced()).toBe('Resized to 5 columns by 3 rows.'));
    expect(screen.queryByRole('alert')).toBeNull();

    failWhen((url) => url.endsWith('/layout'));
    await openMenuItem('Taller');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Couldn’t save the layout');
    expect(alert.textContent).toContain('The grid was put back to the last saved layout.');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    await waitFor(() => expect(screen.queryByText('Couldn’t save the layout')).toBeNull());
  });

  it('shows column guides and an x/y w×h readout while dragging, cleared on drop', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Weather Forecast' });
    const placeholder = { i: 'i1', x: 8, y: 5, w: 4, h: 5 };

    act(() => callback('onDrag')([placeholder], null, placeholder, placeholder));
    const readout = document.querySelector('[data-slot="grid-readout"]')!;
    expect(readout.textContent).toBe('x8 y54×5');
    expect(document.querySelector('[data-slot="grid-guides"]')!.hasAttribute('data-active')).toBe(true);

    act(() => callback('onDragStop')([placeholder], null, placeholder, placeholder));
    expect(document.querySelector('[data-slot="grid-readout"]')).toBeNull();
    await waitFor(() => expect(announced()).toBe('Moved to column 9, row 1, 4 by 5.'));
    expect(document.querySelector('[data-slot="grid-guides"]')!.hasAttribute('data-active')).toBe(false);
  });

  // mock.html INITIAL layout and its live normalize (react-grid-layout alone pushes one item and overlaps).
  describe('live cascade, as the mock does', () => {
    const MOCK: [string, number, number, number, number][] = [
      ['w-cw', 0, 0, 3, 5],
      ['w-cm', 3, 0, 5, 5],
      ['w-pr', 8, 0, 4, 5],
      ['w-fc', 0, 5, 3, 5],
      ['w-sa', 3, 5, 4, 5],
      ['w-rp', 7, 5, 5, 5],
      ['w-gn', 0, 10, 12, 3],
    ];
    const stored: Layout = MOCK.map(([i, x, y, w, h]) => ({ i, x, y, w, h }));
    const geometry = (layout: Layout) => Object.fromEntries(layout.map(({ i, x, y, w, h }) => [i, [x, y, w, h]]));
    const with_ = (layout: Layout, over: Record<string, Partial<Layout[number]>>) =>
      layout.map((l) => ({ ...l, ...over[l.i] }));

    beforeEach(() => {
      respondWhen(
        (url, method) => url.endsWith('/widgets') && method === 'GET',
        () =>
          new Response(
            JSON.stringify({ widgets: MOCK.map(([id, x, y, w, h]) => ({ ...instance, id, x, y, w, h })) }),
            { status: 200 },
          ),
      );
    });

    async function ready() {
      renderPage();
      await vi.waitFor(() => expect((gridProps.current?.layouts as { lg: Layout } | undefined)?.lg).toHaveLength(7));
      return gridProps.current!.compactor as Compactor;
    }
    const readout = () => document.querySelector('[data-slot="grid-readout"]');

    it('drag: Security alerts to x8 y5 cascades Recently played to y10 and Game news to y15, live and on drop', async () => {
      const compactor = await ready();
      const sa = { ...stored[4] };
      act(() => callback('onDragStart')(stored, sa, sa, null));
      // What react-grid-layout hands the compactor: the dragged item moved, Recently played pushed onto Game news.
      const raw = with_(stored, { 'w-sa': { x: 8, y: 5, moved: true }, 'w-rp': { y: 10 } });
      const live = compactor.compact(raw, 12);
      expect(geometry(live)).toEqual({
        'w-cw': [0, 0, 3, 5],
        'w-cm': [3, 0, 5, 5],
        'w-pr': [8, 0, 4, 5],
        'w-fc': [0, 5, 3, 5],
        'w-sa': [8, 5, 4, 5],
        'w-rp': [7, 10, 5, 5],
        'w-gn': [0, 15, 12, 3],
      });

      const moved = raw.find((l) => l.i === 'w-sa')!;
      act(() => callback('onDrag')(raw, sa, moved, sa));
      expect(readout()?.textContent).toBe('x8 y54×5');

      act(() => callback('onDragStop')(live, sa, live.find((l) => l.i === 'w-sa'), null));
      await waitFor(() => expect(layoutCalls()).toHaveLength(1));
      expect(layoutCalls()[0].body).toEqual([
        { id: 'w-sa', x: 8, y: 5, w: 4, h: 5 },
        { id: 'w-rp', x: 7, y: 10, w: 5, h: 5 },
        { id: 'w-gn', x: 0, y: 15, w: 12, h: 3 },
      ]);
      // Once dropped, the compactor is idle again: the stored layout renders as-is.
      expect(compactor.compact(stored, 12)).toMatchObject(stored);
    });

    it('resize: Recently played to 5×6 cascades Game news to y11, with the readout above the resizing panel', async () => {
      const compactor = await ready();
      const rp = { ...stored[5] };
      act(() => callback('onResizeStart')(stored, rp, rp, null));
      const raw = with_(stored, { 'w-rp': { h: 6, moved: true } });
      const live = compactor.compact(raw, 12);
      expect(geometry(live)).toMatchObject({ 'w-rp': [7, 5, 5, 6], 'w-gn': [0, 11, 12, 3] });

      const resized = raw.find((l) => l.i === 'w-rp')!;
      act(() => callback('onResize')(raw, rp, resized, resized));
      expect(readout()?.textContent).toBe('x7 y55×6');
      // The resizing grid item sits at z-index 20; the readout must paint over it.
      expect(readout()?.className).toContain('z-30');

      act(() => callback('onResizeStop')(live, rp, live.find((l) => l.i === 'w-rp'), null));
      await waitFor(() => expect(layoutCalls()).toHaveLength(1));
      expect(layoutCalls()[0].body).toEqual([
        { id: 'w-rp', x: 7, y: 5, w: 5, h: 6 },
        { id: 'w-gn', x: 0, y: 11, w: 12, h: 3 },
      ]);
    });
  });
});
