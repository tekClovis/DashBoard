import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderPage, respondWhen, setupPage } from './dashboard-test-utils.js';

beforeEach(setupPage);

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const catalog = {
  services: [
    {
      name: 'github',
      connection: 'oauth',
      connected: true,
      status: 'OK',
      widgets: [{ service: 'github', name: 'commits', description: 'Commits', minRefreshSec: 300, params: [] }],
    },
  ],
};

async function submitCommitsWidget() {
  fireEvent.click(await screen.findByRole('button', { name: 'Add widget' }));
  fireEvent.click(await screen.findByRole('radio', { name: /Commits/ }));
  for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add widget' }));
}

describe('Add widget dialog, NOT_CONNECTED', () => {
  it('shows a Connect link to the widget’s service when the server answers 409 NOT_CONNECTED', async () => {
    respondWhen((url) => url === '/api/catalog', () => Response.json(catalog));
    respondWhen(
      (url, method) => method === 'POST' && url.endsWith('/widgets'),
      () => Response.json({ error: 'NOT_CONNECTED', service: 'github' }, { status: 409 }),
    );
    renderPage();

    await submitCommitsWidget();

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(/isn’t connected/)).toBeTruthy();
    const link = within(alert).getByRole('link', { name: /^Connect / });
    expect(link.getAttribute('href')).toBe('/api/oauth/github/start?intent=connect');
    expect(screen.queryByText('Could not save the widget.')).toBeNull();
  });

  it('keeps the generic message for any other failure', async () => {
    respondWhen((url) => url === '/api/catalog', () => Response.json(catalog));
    respondWhen(
      (url, method) => method === 'POST' && url.endsWith('/widgets'),
      () => Response.json({ error: 'INVALID_PARAMS' }, { status: 400 }),
    );
    renderPage();

    await submitCommitsWidget();

    expect(await screen.findByText('Could not save the widget.')).toBeTruthy();
    expect(screen.queryByRole('link', { name: /^Connect / })).toBeNull();
  });
});
