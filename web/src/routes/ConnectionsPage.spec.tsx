import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import * as connectionsApi from '@/api/connections.js';
import { ConnectionsPage } from './ConnectionsPage.js';

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <ConnectionsPage />
    </QueryClientProvider>,
  );
}

describe('ConnectionsPage', () => {
  it('shows a Connect button for an unconnected service and a Disconnect + badge for a connected one', () => {
    vi.spyOn(connectionsApi, 'useConnections').mockReturnValue({
      data: {
        connections: [
          { service: 'weather', connected: true, status: 'OK' },
          { service: 'github', connected: false, status: 'OK' },
          { service: 'steam', connected: true, status: 'OK' },
        ],
      },
      isPending: false,
    } as unknown as ReturnType<typeof connectionsApi.useConnections>);
    vi.spyOn(connectionsApi, 'useDisconnect').mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      variables: undefined,
    } as unknown as ReturnType<typeof connectionsApi.useDisconnect>);

    renderPage();

    expect(screen.getByText('not connected')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Connect' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeTruthy();
  });

  it('calls the disconnect mutation with the service name when Disconnect is clicked', () => {
    const mutate = vi.fn();
    vi.spyOn(connectionsApi, 'useConnections').mockReturnValue({
      data: { connections: [{ service: 'steam', connected: true, status: 'OK' }] },
      isPending: false,
    } as unknown as ReturnType<typeof connectionsApi.useConnections>);
    vi.spyOn(connectionsApi, 'useDisconnect').mockReturnValue({
      mutate,
      isPending: false,
      variables: undefined,
    } as unknown as ReturnType<typeof connectionsApi.useDisconnect>);

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));

    expect(mutate).toHaveBeenCalledWith('steam');
  });

  it('sends Connect to the OAuth start redirect for the clicked service', () => {
    vi.spyOn(connectionsApi, 'useConnections').mockReturnValue({
      data: { connections: [{ service: 'github', connected: false, status: 'OK' }] },
      isPending: false,
    } as unknown as ReturnType<typeof connectionsApi.useConnections>);
    vi.spyOn(connectionsApi, 'useDisconnect').mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      variables: undefined,
    } as unknown as ReturnType<typeof connectionsApi.useDisconnect>);
    const startConnect = vi.spyOn(connectionsApi, 'startConnect').mockImplementation(() => {});

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

    expect(startConnect).toHaveBeenCalledWith('github');
  });
});
