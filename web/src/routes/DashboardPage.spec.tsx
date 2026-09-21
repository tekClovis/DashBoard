import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { calls, openMenuItem, renderPage, setupPage } from './dashboard-test-utils.js';

beforeEach(setupPage);

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('DashboardPage', () => {
  it('renders widgets stacked below md (jsdom has no md match)', async () => {
    renderPage();
    expect(await screen.findByText('weather.forecast')).toBeTruthy();
  });

  // One render: Radix menus in jsdom don't reopen reliably across separate renders.
  it('runs Move, Delete and Configure from the widget menu', async () => {
    renderPage();

    await openMenuItem('Move down');
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('/layout'))).toBe(true));
    expect(calls.find((c) => c.url.endsWith('/layout'))).toMatchObject({
      method: 'PATCH',
      url: '/api/dashboards/dash-1/layout',
      body: [{ id: 'i1', x: 4, y: 3, w: 4, h: 3 }],
    });

    await openMenuItem('Delete');
    await waitFor(() =>
      expect(calls).toContainEqual(expect.objectContaining({ url: '/api/widgets/i1', method: 'DELETE' })),
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
  });
});
