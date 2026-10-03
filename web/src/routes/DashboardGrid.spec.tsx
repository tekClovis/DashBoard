import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { noCompactor } from 'react-grid-layout';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { calls, failWhen, openMenuItem, renderPage, setupPage } from './dashboard-test-utils.js';

type DragCallback = (layout: unknown[], old: unknown, item: unknown, placeholder: unknown) => void;
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
    expect(gridProps.current?.compactor).toBe(noCompactor);
    expect(screen.queryByText('Couldn’t load your widgets')).toBeNull();
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
});
