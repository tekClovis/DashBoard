import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { calls, renderPage, setupPage } from './dashboard-test-utils.js';

beforeEach(setupPage);

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const PORTALS = [
  { appId: 400, name: 'Portal', image: 'https://cdn.example/400.jpg' },
  { appId: 620, name: 'Portal 2', image: 'https://cdn.example/620.jpg' },
];

/** Serves the real game_news ParamSpecs (game picker + hidden companions) and a canned store search. */
function serveGameSearch(respond: () => Response = () => new Response(JSON.stringify({ results: PORTALS }))) {
  const fallback = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation(async (url, init) => {
    if (url === '/api/catalog') {
      const spec = {
        service: 'steam',
        name: 'game_news',
        description: 'Game news',
        minRefreshSec: 60,
        params: [
          { name: 'app_id', type: 'integer', required: true, min: 1, label: 'Game', search: 'steam.game' },
          { name: 'game_name', type: 'string', hidden: true },
          { name: 'game_image', type: 'string', hidden: true },
          { name: 'number', type: 'integer', required: true, default: 5, min: 1, max: 10, label: 'Number' },
        ],
      };
      return new Response(JSON.stringify({ services: [{ name: 'steam', connection: 'openid', connected: true, status: 'OK', widgets: [spec] }] }));
    }
    if (typeof url === 'string' && url.startsWith('/api/steam/search')) {
      calls.push({ url, method: 'GET' });
      return respond();
    }
    return fallback(url, init);
  });
}

async function openSettings() {
  fireEvent.click(await screen.findByRole('button', { name: 'Add widget' }));
  fireEvent.click(await screen.findByRole('radio', { name: /Game news/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  return screen.findByRole('combobox');
}

describe('Add widget dialog, game search', () => {
  it('shows a search input and no numeric app id field', async () => {
    serveGameSearch();
    renderPage();
    const input = await openSettings();

    expect(input.getAttribute('type')).toBe('search');
    expect(screen.queryByRole('spinbutton', { name: /app/i })).toBeNull();
    expect(screen.queryByLabelText(/app id/i)).toBeNull();
  });

  it('lists matching games with name and image', async () => {
    serveGameSearch();
    renderPage();
    const input = await openSettings();

    fireEvent.change(input, { target: { value: 'portal' } });

    const options = await screen.findAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['PortalApp 400', 'Portal 2App 620']);
    expect(options[1].querySelector('img')?.getAttribute('src')).toBe('https://cdn.example/620.jpg');
    expect(calls.map((c) => c.url)).toContain('/api/steam/search?q=portal');
  });

  it('saves the picked game’s app id on the widget', async () => {
    serveGameSearch();
    renderPage();
    const input = await openSettings();
    fireEvent.change(input, { target: { value: 'portal' } });

    fireEvent.click((await screen.findAllByRole('option'))[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('app_id=620')).toBeTruthy();
    expect(screen.queryByText(/game_image/)).toBeNull();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add widget' }));

    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    expect(calls.find((c) => c.method === 'POST')?.body).toMatchObject({
      widget: 'game_news',
      params: { app_id: 620, game_name: 'Portal 2', game_image: 'https://cdn.example/620.jpg', number: 5 },
    });
  });

  it('says so when no game matches', async () => {
    serveGameSearch(() => new Response(JSON.stringify({ results: [] })));
    renderPage();
    const input = await openSettings();

    fireEvent.change(input, { target: { value: 'zzzz' } });

    expect(await screen.findByText(/No games match/)).toBeTruthy();
  });

  it('shows an error message when the search fails', async () => {
    serveGameSearch(() => new Response('{}', { status: 502 }));
    renderPage();
    const input = await openSettings();

    fireEvent.change(input, { target: { value: 'portal' } });

    expect((await screen.findByRole('alert')).textContent).toContain('Game search is unavailable');
  });

  it('blocks Next until a game is picked, saying so', async () => {
    serveGameSearch();
    renderPage();
    await openSettings();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByText('Pick a game from the results.')).toBeTruthy();
    expect(screen.getByText('Step 2 of 4: Settings')).toBeTruthy();
  });
});
