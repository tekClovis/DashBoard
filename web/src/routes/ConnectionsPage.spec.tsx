import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as clientApi from '@/api/client.js';
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
      data: {
        connections: [{ service: 'steam', connected: true, status: 'OK' }],
      },
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
      data: {
        connections: [{ service: 'github', connected: false, status: 'OK' }],
      },
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

  describe('REAUTH service', () => {
    afterEach(() => vi.restoreAllMocks());

    function setup(mutate = vi.fn()) {
      vi.spyOn(connectionsApi, 'useConnections').mockReturnValue({
        data: {
          connections: [
            { service: 'github', connected: true, status: 'REAUTH' },
            { service: 'steam', connected: true, status: 'OK' },
          ],
        },
        isPending: false,
      } as unknown as ReturnType<typeof connectionsApi.useConnections>);
      vi.spyOn(connectionsApi, 'useDisconnect').mockReturnValue({
        mutate,
        isPending: false,
        variables: undefined,
      } as unknown as ReturnType<typeof connectionsApi.useDisconnect>);
      const startConnect = vi.spyOn(connectionsApi, 'startConnect').mockImplementation(() => {});
      renderPage();
      return { mutate, startConnect };
    }

    it('shows Reauthenticate (not Disconnect) for REAUTH and Disconnect (not Reauthenticate) for OK', () => {
      setup();

      expect(screen.getAllByRole('button', { name: 'Reauthenticate' })).toHaveLength(1);
      expect(screen.getAllByRole('button', { name: 'Disconnect' })).toHaveLength(1);
    });

    it('disconnects then starts connect for the same service, disabled while pending', () => {
      const { mutate, startConnect } = setup();

      fireEvent.click(screen.getByRole('button', { name: 'Reauthenticate' }));

      expect(mutate).toHaveBeenCalledWith('github', expect.any(Object));
      expect(startConnect).not.toHaveBeenCalled();
      const pending = screen.getByRole('button', {
        name: 'Reauthenticating…',
      }) as HTMLButtonElement;
      expect(pending.disabled).toBe(true);
      expect(pending.getAttribute('aria-busy')).toBe('true');

      act(() => {
        mutate.mock.calls[0]![1].onSuccess();
      });
      expect(startConnect).toHaveBeenCalledWith('github');
    });

    it('keeps a disabled Redirecting button, not Connect, once the service reads not connected', () => {
      const { mutate } = setup();
      fireEvent.click(screen.getByRole('button', { name: 'Reauthenticate' }));
      vi.spyOn(connectionsApi, 'useConnections').mockReturnValue({
        data: { connections: [{ service: 'github', connected: false, status: 'OK' }] },
        isPending: false,
      } as unknown as ReturnType<typeof connectionsApi.useConnections>);
      act(() => {
        mutate.mock.calls[0]![1].onSuccess();
      });

      const redirecting = screen.getByRole('button', { name: 'Redirecting…' }) as HTMLButtonElement;
      expect(redirecting.disabled).toBe(true);
      expect(screen.queryByRole('button', { name: 'Connect' })).toBeNull();
    });

    it('does not start connect and shows an error when disconnect fails', () => {
      const { mutate, startConnect } = setup();

      fireEvent.click(screen.getByRole('button', { name: 'Reauthenticate' }));
      act(() => {
        mutate.mock.calls[0]![1].onError();
      });

      expect(startConnect).not.toHaveBeenCalled();
      expect(screen.getByRole('alert').textContent).toContain('Could not disconnect GitHub');
      const githubRow = screen.getByText('GitHub').closest('div[class*="flex-wrap"]')!;
      expect(githubRow.contains(screen.getByRole('alert'))).toBe(true);
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Reauthenticate' }));
      expect(
        (
          screen.getByRole('button', {
            name: 'Reauthenticate',
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false);
    });

    it('still starts connect when another service is disconnected while the reauth is pending', async () => {
      vi.restoreAllMocks();
      const pending = new Map<string, () => void>();
      vi.spyOn(clientApi, 'apiFetch').mockImplementation((path: string) => {
        if (path === '/connections') {
          return Promise.resolve({
            connections: [
              { service: 'github', connected: true, status: 'REAUTH' },
              { service: 'steam', connected: true, status: 'OK' },
            ],
          });
        }
        return new Promise((resolve) => pending.set(path, () => resolve({ ok: true })));
      });
      const startConnect = vi.spyOn(connectionsApi, 'startConnect').mockImplementation(() => {});
      renderPage();

      fireEvent.click(await screen.findByRole('button', { name: 'Reauthenticate' }));
      fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
      expect(await screen.findByRole('button', { name: 'Disconnecting…' })).toBeTruthy();
      await act(async () => pending.get('/connections/github')!());

      await waitFor(() => expect(startConnect).toHaveBeenCalledWith('github'));
    });
  });
});
