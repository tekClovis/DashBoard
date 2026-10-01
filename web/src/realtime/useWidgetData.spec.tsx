import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SocketContext, type SocketContextValue } from './SocketProvider.js';
import { useWidgetData, type WidgetCacheEntry } from './useWidgetData.js';

function fakeSocket() {
  const handlers = new Map<string, (payload: unknown) => void>();
  return {
    emit: vi.fn(),
    on: vi.fn((event: string, handler: (payload: unknown) => void) => {
      handlers.set(event, handler);
    }),
    off: vi.fn(),
    trigger: (event: string, payload: unknown) => handlers.get(event)?.(payload),
  };
}

function wrapper(socketValue: SocketContextValue) {
  const queryClient = new QueryClient();
  return {
    queryClient,
    Wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <SocketContext.Provider value={socketValue}>{children}</SocketContext.Provider>
      </QueryClientProvider>
    ),
  };
}

describe('useWidgetData', () => {
  it('emits widget:subscribe on mount and widget:unsubscribe on unmount', () => {
    const socket = fakeSocket();
    const { Wrapper } = wrapper({ socket: socket as never, connected: true });

    const { unmount } = renderHook(() => useWidgetData('instance-1'), { wrapper: Wrapper });

    expect(socket.emit).toHaveBeenCalledWith('widget:subscribe', { instanceId: 'instance-1' });

    unmount();

    expect(socket.emit).toHaveBeenCalledWith('widget:unsubscribe', { instanceId: 'instance-1' });
  });

  it('writes an incoming widget:data event into the ["widget", instanceId] cache entry', async () => {
    const socket = fakeSocket();
    const { Wrapper, queryClient } = wrapper({ socket: socket as never, connected: true });

    renderHook(() => useWidgetData('instance-1'), { wrapper: Wrapper });

    socket.trigger('widget:data', { instanceId: 'instance-1', data: { count: 3 }, fetchedAt: '2026-01-01T00:00:00Z' });

    await waitFor(() => {
      const cached = queryClient.getQueryData<WidgetCacheEntry>(['widget', 'instance-1']);
      expect(cached).toEqual({
        data: { count: 3 },
        fetchedAt: '2026-01-01T00:00:00Z',
        error: null,
        history: [{ data: { count: 3 }, fetchedAt: '2026-01-01T00:00:00Z' }],
      });
    });
  });

  it('writes an incoming widget:error event into the cache without discarding prior data', async () => {
    const socket = fakeSocket();
    const { Wrapper, queryClient } = wrapper({ socket: socket as never, connected: true });

    renderHook(() => useWidgetData('instance-1'), { wrapper: Wrapper });

    socket.trigger('widget:data', { instanceId: 'instance-1', data: { count: 3 }, fetchedAt: '2026-01-01T00:00:00Z' });
    socket.trigger('widget:error', { instanceId: 'instance-1', code: 'RATE_LIMITED', message: 'slow down' });

    await waitFor(() => {
      const cached = queryClient.getQueryData<WidgetCacheEntry>(['widget', 'instance-1']);
      expect(cached?.error).toEqual({ code: 'RATE_LIMITED', message: 'slow down', retryAt: undefined });
      expect(cached?.data).toEqual({ count: 3 });
    });
  });

  it('ignores events for a different instanceId', async () => {
    const socket = fakeSocket();
    const { Wrapper, queryClient } = wrapper({ socket: socket as never, connected: true });

    renderHook(() => useWidgetData('instance-1'), { wrapper: Wrapper });

    socket.trigger('widget:data', { instanceId: 'other', data: { count: 9 }, fetchedAt: '2026-01-01T00:00:00Z' });

    expect(queryClient.getQueryData(['widget', 'instance-1'])).toBeUndefined();
  });

  it('does nothing when the socket is not yet connected', () => {
    const { Wrapper } = wrapper({ socket: null, connected: false });
    expect(() => renderHook(() => useWidgetData('instance-1'), { wrapper: Wrapper })).not.toThrow();
  });
});
