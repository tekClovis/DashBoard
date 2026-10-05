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

  it('walks all 4 steps, keeping values across Back, and creates the widget with the chosen settings', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Add widget' }));

    // Step 1: radio cards, one native group (arrow keys), unconnected services flagged and disabled.
    const github = await screen.findByRole('group', { name: /GitHub/ });
    expect(github.textContent).toContain('Not connected');
    expect(screen.getByRole('link', { name: 'Connect GitHub' }).getAttribute('href')).toBe('/services');
    expect(screen.getByRole('group', { name: /Weather/ }).textContent).toContain('No account needed');
    const radios = screen.getAllByRole('radio') as HTMLInputElement[];
    expect(radios.every((r) => r.name === 'widget')).toBe(true);
    expect((screen.getByRole('radio', { name: /commits/ }) as HTMLInputElement).disabled).toBe(true);
    const forecast = screen.getByRole('radio', { name: /Forecast/ });

    // Next with nothing picked is blocked and focuses the first pickable card.
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Step 1 of 4: Widget')).toBeTruthy();
    expect(document.activeElement).toBe(forecast);

    fireEvent.click(forecast);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    // Step 2: invalid params block Next with an inline error and focus the field.
    expect(screen.getByText('Step 2 of 4: Settings')).toBeTruthy();
    expect(screen.getByText('Weather › Forecast')).toBeTruthy();
    const city = screen.getByLabelText('city');
    await waitFor(() => expect(document.activeElement).toBe(city));
    fireEvent.change(city, { target: { value: 'Lyon1' } });
    (document.activeElement as HTMLElement | null)?.blur();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('This value isn’t in the expected format.')).toBeTruthy();
    expect(document.activeElement).toBe(city);
    fireEvent.change(city, { target: { value: 'Lyon' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    // Step 3: presets, then an out-of-range value blocks Next.
    const refresh = screen.getByLabelText('Refresh every') as HTMLInputElement;
    expect(refresh.value).toBe('60');
    expect(screen.getByRole('button', { name: '1m' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('every minute')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '5m' }));
    expect(refresh.value).toBe('300');
    fireEvent.change(refresh, { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText(/Enter 60 to 86400 seconds\./)).toBeTruthy();
    expect(document.activeElement).toBe(refresh);

    // Back keeps what was entered.
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect((screen.getByLabelText('city') as HTMLInputElement).value).toBe('Lyon');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect((screen.getByLabelText('Refresh every') as HTMLInputElement).value).toBe('10');
    fireEvent.change(screen.getByLabelText('Refresh every'), { target: { value: '90' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    // Step 4: summary, then Add.
    expect(screen.getByText('Step 4 of 4: Confirm')).toBeTruthy();
    expect(screen.getByText('city=Lyon')).toBeTruthy();
    expect(screen.getByText('(every 1 min 30 s)')).toBeTruthy();
    expect(screen.getByText('Bottom of the dashboard, 4 columns wide')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add widget' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    expect(calls.find((c) => c.method === 'POST')).toMatchObject({
      url: '/api/dashboards/dash-1/widgets',
      body: { service: 'weather', widget: 'forecast', params: { city: 'Lyon' }, refreshRate: 90, x: 0, y: 5 },
    });
  });
});
