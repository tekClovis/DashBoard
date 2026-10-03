import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { calls, failWhen, openMenuItem, renderPage, respondWhen, setupPage } from './dashboard-test-utils.js';

beforeEach(setupPage);

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const deletes = () => calls.filter((c) => c.method === 'DELETE');

describe('DashboardPage', () => {
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
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect((screen.getByLabelText('Refresh rate (seconds)') as HTMLInputElement).value).toBe('120');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(calls.some((c) => c.method === 'PATCH' && c.url === '/api/widgets/i1')).toBe(true));
    expect(calls.find((c) => c.url === '/api/widgets/i1' && c.method === 'PATCH')).toMatchObject({
      body: { params: { city: 'Paris' }, refreshRate: 120 },
    });
    expect(deletes()).toHaveLength(0);
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
