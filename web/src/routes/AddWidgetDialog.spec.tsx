import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { calls, openMenuItem, renderPage, setupPage } from './dashboard-test-utils.js';

beforeEach(setupPage);

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Add widget dialog', () => {
  it('waits for the catalog when configuring instead of showing a blank step', async () => {
    const ok = vi.mocked(fetch).getMockImplementation()!;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    vi.mocked(fetch).mockImplementation((url, init) =>
      url === '/api/catalog' ? gate.then(() => ok(url, init)) : ok(url, init),
    );
    renderPage();
    await openMenuItem('Configure');
    expect(await screen.findByText('Loading…')).toBeTruthy();
    release();
    expect(((await screen.findByLabelText('city')) as HTMLInputElement).value).toBe('Paris');
  });

  it('adds a widget through the 4-step dialog and disables unconnected services', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Add widget' }));

    expect(await screen.findByRole('heading', { name: 'github' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Connect' }).getAttribute('href')).toBe('/services');
    expect((screen.getByRole('button', { name: /commits/ }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /forecast/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    fireEvent.change(screen.getByLabelText('city'), { target: { value: 'Lyon1' } });
    expect(screen.getByText(/Must match/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('city'), { target: { value: 'Lyon' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    const refresh = screen.getByLabelText('Refresh rate (seconds)') as HTMLInputElement;
    expect(refresh.value).toBe('60');
    fireEvent.change(refresh, { target: { value: '10' } });
    expect((screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(refresh, { target: { value: '90' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    fireEvent.click(screen.getByRole('button', { name: 'Add widget', hidden: false }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    expect(calls.find((c) => c.method === 'POST')).toMatchObject({
      url: '/api/dashboards/dash-1/widgets',
      body: { service: 'weather', widget: 'forecast', params: { city: 'Lyon' }, refreshRate: 90, x: 0, y: 5 },
    });
  });
});
