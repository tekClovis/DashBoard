import type { ConnectionEntry } from '@dashboard/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as catalogApi from '@/api/catalog.js';
import * as connectionsApi from '@/api/connections.js';
import { ConnectionsPage } from './ConnectionsPage.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Stubs GET /api/dashboards and GET /api/dashboards/:id/widgets with the given widget services per dashboard. */
function stubWidgets(byDashboard: Record<string, string[]>) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      const id = /\/dashboards\/([^/]+)\/widgets$/.exec(url)?.[1];
      const body = id
        ? { widgets: (byDashboard[id] ?? []).map((service, i) => ({ id: `${id}-${i}`, dashboardId: id, service })) }
        : { dashboards: Object.keys(byDashboard).map((d, i) => ({ id: d, name: d, position: i })) };
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
    }),
  );
}

function renderPage(connections: ConnectionEntry[] | undefined, mutate = vi.fn()) {
  vi.spyOn(connectionsApi, 'useConnections').mockReturnValue({
    data: connections && { connections },
    isPending: !connections,
  } as unknown as ReturnType<typeof connectionsApi.useConnections>);
  vi.spyOn(connectionsApi, 'useDisconnect').mockReturnValue({
    mutate,
    isPending: false,
    variables: undefined,
  } as unknown as ReturnType<typeof connectionsApi.useDisconnect>);
  vi.spyOn(catalogApi, 'useCatalog').mockReturnValue({
    data: {
      services: [
        {
          name: 'github',
          connection: 'oauth',
          connected: true,
          status: 'OK',
          widgets: [
            { service: 'github', name: 'recent_commits', description: '', params: [], minRefreshSec: 60 },
            { service: 'github', name: 'pull_requests', description: '', params: [], minRefreshSec: 60 },
          ],
        },
      ],
    },
  } as unknown as ReturnType<typeof catalogApi.useCatalog>);

  const queryClient = new QueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <ConnectionsPage />
    </QueryClientProvider>,
  );
  return mutate;
}

const row = (name: string) => screen.getByRole('row', { name: new RegExp(name) });

describe('ConnectionsPage', () => {
  it('shows each service with its sign-in type and status badge', () => {
    renderPage([
      { service: 'weather', connected: true, status: 'OK' },
      { service: 'github', connected: false, status: 'OK' },
      { service: 'steam', connected: true, status: 'OK' },
    ]);

    expect(within(row('Weather')).getByText('No account needed')).toBeTruthy();
    expect(within(row('Weather')).getByText('Always on')).toBeTruthy();
    expect(within(row('Weather')).getByText('Nothing to connect')).toBeTruthy();
    expect(within(row('GitHub')).getByText('OAuth')).toBeTruthy();
    expect(within(row('GitHub')).getByText('Not connected')).toBeTruthy();
    expect(within(row('GitHub')).getByRole('button', { name: 'Connect GitHub' })).toBeTruthy();
    expect(within(row('Steam')).getByText('OpenID')).toBeTruthy();
    expect(within(row('Steam')).getByText('Connected')).toBeTruthy();
    expect(within(row('Steam')).getByRole('button', { name: 'Disconnect' })).toBeTruthy();
  });

  it("lists the service's widget names from the catalog", () => {
    renderPage([{ service: 'github', connected: true, status: 'OK' }]);

    expect(screen.getByText('Recent commits, Pull requests')).toBeTruthy();
  });

  it('asks for inline confirmation before calling the disconnect API', () => {
    const mutate = renderPage([{ service: 'steam', connected: true, status: 'OK' }]);

    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));

    expect(mutate).not.toHaveBeenCalled();
    expect(screen.getByText('Its widgets stop updating.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    expect(mutate).toHaveBeenCalledWith('steam', expect.anything());
  });

  it('leaves the connection intact when the confirmation is cancelled', () => {
    const mutate = renderPage([{ service: 'steam', connected: true, status: 'OK' }]);

    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(mutate).not.toHaveBeenCalled();
    expect(screen.queryByText('Its widgets stop updating.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeTruthy();
  });

  it('shows an expired-access alert and a Reconnect action for a REAUTH connection', () => {
    renderPage([{ service: 'github', connected: true, status: 'REAUTH' }]);
    const startConnect = vi.spyOn(connectionsApi, 'startConnect').mockImplementation(() => {});

    expect(screen.getByText('GitHub access expired')).toBeTruthy();
    expect(within(row('GitHub')).getByText('Reconnect needed')).toBeTruthy();
    expect(within(row('GitHub')).getByRole('button', { name: 'Disconnect' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reconnect' }));

    expect(startConnect).toHaveBeenCalledWith('github');
  });

  it('counts the affected widgets across dashboards in the expired-access alert', async () => {
    stubWidgets({ d1: ['github', 'weather', 'github'], d2: ['github', 'steam'] });
    renderPage([{ service: 'github', connected: true, status: 'REAUTH' }]);

    expect(
      await screen.findByText('Your 3 GitHub widgets stopped updating. Reconnect to resume them. Their settings are kept.'),
    ).toBeTruthy();
  });

  it('renders skeleton status and action cells while connections load', () => {
    renderPage(undefined);

    expect(screen.queryByText('Loading…')).toBeNull();
    expect(within(row('Weather')).getByText('Always on')).toBeTruthy();
    for (const name of ['GitHub', 'Steam', 'YouTube']) {
      expect(within(row(name)).queryByRole('button')).toBeNull();
      expect(row(name).querySelectorAll('[data-slot="skeleton"]')).toHaveLength(2);
    }
    expect(screen.getByRole('table', { name: 'Services' }).getAttribute('aria-busy')).toBe('true');
  });

  it('shows no expired-access alert when every connection is OK', () => {
    renderPage([{ service: 'github', connected: true, status: 'OK' }]);

    expect(screen.queryByText('GitHub access expired')).toBeNull();
  });

  it('sends Connect to the OAuth start redirect for the clicked service', () => {
    renderPage([{ service: 'youtube', connected: false, status: 'OK' }]);
    const startConnect = vi.spyOn(connectionsApi, 'startConnect').mockImplementation(() => {});

    fireEvent.click(screen.getByRole('button', { name: 'Connect YouTube' }));

    expect(startConnect).toHaveBeenCalledWith('youtube');
  });
});
