import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { calls, catalog, instance, openMenuItem, renderPage, respondWhen, setupPage } from './dashboard-test-utils.js';

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

  it('opens Configure from the widget menu with focus on the first field, inside the dialog', async () => {
    renderPage();
    // Load the catalog first, so the dialog's fields exist the moment it mounts.
    fireEvent.click(await screen.findByRole('button', { name: 'Add widget' }));
    await screen.findByRole('radio', { name: /Forecast/ });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await openMenuItem('Configure');
    const city = await screen.findByLabelText('city');
    await waitFor(() => expect(document.activeElement).toBe(city));
    // The menu returns focus to its trigger on a later tick; the dialog must keep it.
    await new Promise((r) => setTimeout(r, 20));
    expect(document.activeElement).toBe(city);
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
  it('after Add widget, announces the new widget, returns focus to Add widget and scrolls the new panel into view', async () => {
    const added = { ...instance, id: 'i2', params: { city: 'Lyon' }, refreshRate: 60, x: 0, y: 5 };
    // Before the POST the dashboard lists `instance`; the POST returns `added`, and the refetch lists both.
    let method = 'GET';
    let posted = false;
    respondWhen(
      (url, m) => url === '/api/dashboards/dash-1/widgets' && ((method = m), true),
      () => {
        if (method === 'POST') posted = true;
        const body = method === 'POST' ? added : { widgets: posted ? [instance, added] : [instance] };
        return new Response(JSON.stringify(body), { status: 200 });
      },
    );
    const scrollTo = vi.fn();
    vi.stubGlobal('scrollTo', scrollTo);
    renderPage();
    const add = await screen.findByRole('button', { name: 'Add widget' });
    fireEvent.click(add);
    fireEvent.click(await screen.findByRole('radio', { name: /Forecast/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.change(screen.getByLabelText('city'), { target: { value: 'Lyon' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add widget' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() =>
      expect(document.querySelector('[data-slot="announcer"]')?.textContent).toBe(
        'Forecast added. Waiting for the first update.',
      ),
    );
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Add widget' })));
    // jsdom lays out nothing: the panel's top is 0, so the mock's `top + scrollY - 80` is -80.
    expect(document.querySelector('[data-widget-id="i2"]')).toBeTruthy();
    expect(scrollTo).toHaveBeenCalledWith({ top: -80, behavior: 'smooth' });
  });

  it('links to the service when saving fails with NOT_CONNECTED (stale catalog)', async () => {
    const stale = {
      services: catalog.services.map((s) => (s.name === 'github' ? { ...s, connected: true } : s)),
    };
    respondWhen(
      (url) => url === '/api/catalog',
      () => new Response(JSON.stringify(stale)),
    );
    respondWhen(
      (url, m) => url === '/api/dashboards/dash-1/widgets' && m === 'POST',
      () => new Response(JSON.stringify({ error: 'NOT_CONNECTED' }), { status: 409 }),
    );
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Add widget' }));
    fireEvent.click(await screen.findByRole('radio', { name: /commits/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add widget' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('GitHub is not connected.');
    expect(within(alert).getByRole('link', { name: 'Connect GitHub' }).getAttribute('href')).toBe('/services');
  });
});

describe('Add widget dialog, city search', () => {
  const candidate = (region: string, country: string, latitude: number, longitude: number) => ({
    name: 'Paris',
    region,
    country,
    latitude,
    longitude,
  });
  const PARIS = [candidate('Île-de-France', 'France', 48.8534, 2.3488), candidate('Texas', 'United States', 33.6609, -95.5555)];

  /** Serves the real weather ParamSpecs (city picker + hidden place params) and canned search results. */
  function serveCitySearch(results: unknown[] = PARIS) {
    const fallback = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      if (url === '/api/catalog') {
        const spec = {
          service: 'weather',
          name: 'forecast',
          description: 'Forecast',
          minRefreshSec: 60,
          params: [
            { name: 'city', type: 'string', required: true, label: 'City', search: 'weather.city' },
            { name: 'region', type: 'string', hidden: true },
            { name: 'country', type: 'string', hidden: true },
            { name: 'latitude', type: 'string', hidden: true },
            { name: 'longitude', type: 'string', hidden: true },
          ],
        };
        const body = { services: [{ name: 'weather', connection: 'none', connected: true, status: 'OK', widgets: [spec] }] };
        return new Response(JSON.stringify(body));
      }
      if (typeof url === 'string' && url.startsWith('/api/weather/search')) {
        calls.push({ url, method: 'GET' });
        return new Response(JSON.stringify({ results }));
      }
      return fallback(url, init);
    });
  }

  async function openSettings() {
    fireEvent.click(await screen.findByRole('button', { name: 'Add widget' }));
    fireEvent.click(await screen.findByRole('radio', { name: /Forecast/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    return screen.findByRole('combobox');
  }

  it('lists several candidates for "Paris" with region and country to tell them apart', async () => {
    serveCitySearch();
    renderPage();
    const input = await openSettings();

    fireEvent.change(input, { target: { value: 'Paris' } });

    const options = await screen.findAllByRole('option');
    expect(options).toHaveLength(2);
    expect(options[0].textContent).toContain('Île-de-France, France');
    expect(options[1].textContent).toContain('Texas, United States');
    expect(calls.map((c) => c.url)).toContain('/api/weather/search?q=Paris');
  });

  it('saves the picked candidate’s own coordinates on the widget', async () => {
    serveCitySearch();
    renderPage();
    const input = await openSettings();
    fireEvent.change(input, { target: { value: 'Paris' } });

    fireEvent.click((await screen.findAllByRole('option'))[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('city=Paris, Texas, United States')).toBeTruthy();
    expect(screen.getByText('latitude=33.6609')).toBeTruthy();
    expect(screen.getByText('longitude=-95.5555')).toBeTruthy();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add widget' }));

    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    expect(calls.find((c) => c.method === 'POST')?.body).toMatchObject({
      widget: 'forecast',
      params: { city: 'Paris', region: 'Texas', country: 'United States', latitude: '33.6609', longitude: '-95.5555' },
    });
  });

  it('shows an empty state, not an error, when nothing matches', async () => {
    serveCitySearch([]);
    renderPage();
    const input = await openSettings();

    fireEvent.change(input, { target: { value: 'Atlantis' } });

    expect(await screen.findByText(/No cities match/)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('blocks Next until a candidate is picked, saying so', async () => {
    serveCitySearch();
    renderPage();
    const input = await openSettings();
    fireEvent.change(input, { target: { value: 'Paris' } });

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByText('Pick a city from the results.')).toBeTruthy();
    expect(screen.getByText('Step 2 of 4: Settings')).toBeTruthy();
  });

  it('reconfigures from the saved choice, not a fresh search', async () => {
    serveCitySearch();
    const saved = { ...instance, params: { city: 'Paris', region: 'Texas', country: 'United States', latitude: '33.6609', longitude: '-95.5555' } };
    respondWhen(
      (url) => url === '/api/dashboards/dash-1/widgets',
      () => new Response(JSON.stringify({ widgets: [saved] })),
    );
    renderPage();

    await openMenuItem('Configure');

    expect(await screen.findByText('Texas, United States')).toBeTruthy();
    expect(screen.queryByRole('combobox')).toBeNull();
  });
});

describe('Add widget dialog, YouTube channel search', () => {
  const CHANNELS = [
    { id: 'UC1', title: 'Telemetry Labs', thumbnail: 'https://img/1.jpg' },
    { id: 'UC2', title: 'Tele Two' },
  ];

  function serveChannelSearch() {
    const fallback = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      if (url === '/api/catalog') {
        const spec = {
          service: 'youtube',
          name: 'channel_stats',
          description: 'Channel stats',
          minRefreshSec: 600,
          params: [
            { name: 'channel_id', type: 'string', required: true, label: 'Channel', search: 'youtube.channel' },
            { name: 'channel_title', type: 'string', hidden: true },
            { name: 'channel_image', type: 'string', hidden: true },
          ],
        };
        return new Response(JSON.stringify({ services: [{ name: 'youtube', connection: 'oauth', connected: true, status: 'OK', widgets: [spec] }] }));
      }
      if (typeof url === 'string' && url.startsWith('/api/youtube/channels/search')) {
        calls.push({ url, method: 'GET' });
        return new Response(JSON.stringify({ results: CHANNELS }));
      }
      return fallback(url, init);
    });
  }

  async function openSettings() {
    fireEvent.click(await screen.findByRole('button', { name: 'Add widget' }));
    fireEvent.click(await screen.findByRole('radio', { name: /Channel stats/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    return screen.findByRole('combobox');
  }

  it('picks a channel by name, shows its avatar after Back, and saves id, title and image', async () => {
    serveChannelSearch();
    renderPage();
    const input = await openSettings();
    expect(screen.queryByLabelText('channel_id')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Pick a channel from the results.')).toBeTruthy();

    fireEvent.change(input, { target: { value: 'tele' } });
    fireEvent.click((await screen.findAllByRole('option'))[0]);
    expect(document.querySelector('img[src="https://img/1.jpg"]')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('Telemetry Labs')).toBeTruthy();
    expect(document.querySelector('img[src="https://img/1.jpg"]')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Telemetry Labs channel_id=UC1')).toBeTruthy();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add widget' }));

    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    expect(calls.find((c) => c.method === 'POST')?.body).toMatchObject({
      widget: 'channel_stats',
      params: { channel_id: 'UC1', channel_title: 'Telemetry Labs', channel_image: 'https://img/1.jpg' },
    });
  });
});
