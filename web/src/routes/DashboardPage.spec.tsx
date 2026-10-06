import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { calls, failWhen, instance, openMenuItem, renderPage, respondWhen, setupPage } from './dashboard-test-utils.js';

beforeEach(setupPage);

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const deletes = () => calls.filter((c) => c.method === 'DELETE');

describe('DashboardPage', () => {
  it('shows "Dashboard not found" with a link to the first dashboard when the id is unknown', async () => {
    respondWhen(
      (url) => url === '/api/dashboards',
      () => new Response(JSON.stringify({ dashboards: [{ id: 'other', name: 'Home', position: 0 }] }), { status: 200 }),
    );
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Dashboard not found' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Go to Home' }).getAttribute('href')).toBe('/d/other');
    expect(screen.queryByRole('button', { name: 'Add widget' })).toBeNull();
  });

  it('shows an error with a working retry when the widgets fail to load', async () => {
    const recover = failWhen((url) => url.endsWith('/widgets'));
    renderPage();
    expect(await screen.findByText('Couldn’t load your widgets')).toBeTruthy();
    expect(screen.getByText('Widgets couldn’t be loaded.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add widget' })).toBeNull();
    recover();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('heading', { name: 'Weather Forecast' })).toBeTruthy();
  });

  it('renders widgets stacked below md with the title, counters and Add widget (jsdom has no md match)', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Weather Forecast' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Widget status' }).textContent).toBe('1 widget1 waiting');
    expect(screen.getByRole('button', { name: 'Add widget' })).toBeTruthy();
  });

  it('shows the empty canvas with Add widget and Connect services when there are no widgets', async () => {
    respondWhen((url) => url.endsWith('/widgets'), () => Response.json({ widgets: [] }));
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Add your first widget' })).toBeTruthy();
    expect(screen.getByText('No widgets on this dashboard.')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Add widget' })).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Connect services' }).getAttribute('href')).toBe('/services');
  });

  // One render: Radix menus in jsdom don't reopen reliably across separate renders.
  it('removes with an undo bar that Undo restores without a DELETE, and runs Configure', async () => {
    renderPage();

    await openMenuItem('Remove from dashboard');
    const status = await screen.findByRole('status');
    expect(status.textContent).toContain('Removed Forecast.');
    expect(screen.queryByRole('heading', { name: 'Weather Forecast' })).toBeNull();
    // The menu unmounted with its widget: the page must stay clickable.
    await waitFor(() => expect(document.body.style.pointerEvents).toBe(''));
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(await screen.findByRole('heading', { name: 'Weather Forecast' })).toBeTruthy();
    expect(screen.queryByText(/Removed/)).toBeNull();
    expect(deletes()).toHaveLength(0);
    await waitFor(() =>
      expect(document.querySelector('[data-slot="announcer"]')?.textContent).toBe('Widget restored. Nothing was deleted.'),
    );

    await openMenuItem('Configure');
    const city = (await screen.findByLabelText('city')) as HTMLInputElement;
    expect(city.value).toBe('Paris');
    expect(screen.getByText('Step 2 of 4: Settings')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect((screen.getByLabelText('Refresh every') as HTMLInputElement).value).toBe('120');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(calls.some((c) => c.method === 'PATCH' && c.url === '/api/widgets/i1')).toBe(true));
    expect(calls.find((c) => c.url === '/api/widgets/i1' && c.method === 'PATCH')).toMatchObject({
      body: { params: { city: 'Paris' }, refreshRate: 120 },
    });
    expect(deletes()).toHaveLength(0);
  });

  // Below md, Move up/down follow the stacked reading order (the mock), not the desktop grid move.
  it('Move up below md swaps Forecast with the panel just above it in the stack and saves the layout', async () => {
    const MOCK = [
      ['w-cw', 0, 0, 3, 5],
      ['w-cm', 3, 0, 5, 5],
      ['w-pr', 8, 0, 4, 5],
      ['w-fc', 0, 5, 3, 5],
      ['w-sa', 3, 5, 4, 5],
      ['w-rp', 7, 5, 5, 5],
      ['w-gn', 0, 10, 12, 3],
    ] as const;
    respondWhen(
      (url, method) => url.endsWith('/widgets') && method === 'GET',
      () => Response.json({ widgets: MOCK.map(([id, x, y, w, h]) => ({ ...instance, id, x, y, w, h })) }),
    );
    renderPage();
    // Stacked order cw / cm / pr / fc / …: Forecast is the fourth panel.
    const trigger = (await screen.findAllByRole('button', { name: 'Weather Forecast options' }))[3];
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Move up' }));

    const layout = () => calls.filter((c) => c.method === 'PATCH' && c.url === '/api/dashboards/dash-1/layout');
    await waitFor(() => expect(layout()).toHaveLength(1));
    expect(layout()[0].body).toEqual(
      expect.arrayContaining([
        { id: 'w-fc', x: 8, y: 0, w: 3, h: 5 },
        { id: 'w-pr', x: 0, y: 5, w: 4, h: 5 },
      ]),
    );
    await waitFor(() =>
      expect(document.querySelector('[data-slot="announcer"]')?.textContent).toBe('Moved up. Now at column 9, row 1.'),
    );
  });

  it('sends the DELETE once the 8 s undo window closes', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Weather Forecast' });
    vi.useFakeTimers({ shouldAdvanceTime: true });

    await openMenuItem('Remove from dashboard');
    expect(await screen.findByText(/Removed/)).toBeTruthy();
    await vi.advanceTimersByTimeAsync(7900);
    expect(deletes()).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(200);
    await waitFor(() => expect(deletes()).toEqual([expect.objectContaining({ url: '/api/widgets/i1' })]));
    expect(screen.queryByText(/Removed/)).toBeNull();
  });
});
