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

function wrapper({ socket, connected }: Pick<SocketContextValue, 'socket' | 'connected'>) {
  const queryClient = new QueryClient();
  const socketValue: SocketContextValue = {
    socket,
    connected,
    connection: connected ? { status: 'live' } : { status: 'reconnecting', attempt: 0 },
    retry: () => {},
  };
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

  it('keeps the last 12 pushes, oldest first, one per fetchedAt', async () => {
    const socket = fakeSocket();
    const { Wrapper, queryClient } = wrapper({ socket: socket as never, connected: true });

    renderHook(() => useWidgetData('instance-1'), { wrapper: Wrapper });

    const at = (m: number) => `2026-01-01T00:${String(m).padStart(2, '0')}:00Z`;
    for (let m = 0; m < 14; m++) socket.trigger('widget:data', { instanceId: 'instance-1', data: { m }, fetchedAt: at(m) });
    // A re-push of the same fetch (e.g. after a resubscribe) replaces its point.
    socket.trigger('widget:data', { instanceId: 'instance-1', data: { m: 13 }, fetchedAt: at(13) });

    await waitFor(() => {
      const history = queryClient.getQueryData<WidgetCacheEntry>(['widget', 'instance-1'])?.history;
      expect(history?.map((p) => p.fetchedAt)).toEqual(Array.from({ length: 12 }, (_, i) => at(i + 2)));
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
      expect(cached?.history).toEqual([{ data: { count: 3 }, fetchedAt: '2026-01-01T00:00:00Z' }]);
    });
  });

  it('on a config change, resubscribes and resets the cache entry to waiting', async () => {
    const socket = fakeSocket();
    const { Wrapper, queryClient } = wrapper({ socket: socket as never, connected: true });
    const { rerender } = renderHook(({ config }) => useWidgetData('instance-1', config), {
      wrapper: Wrapper,
      initialProps: { config: 'city=Qxzvbnmqq' },
    });
    socket.trigger('widget:data', { instanceId: 'instance-1', data: { t: 1 }, fetchedAt: '2026-01-01T00:00:00Z' });
    socket.trigger('widget:error', { instanceId: 'instance-1', code: 'INVALID_PARAMS', message: 'bad city' });

    rerender({ config: 'city=London' });

    const subscribes = socket.emit.mock.calls.filter(([event]) => event === 'widget:subscribe');
    expect(subscribes).toHaveLength(2);
    expect(socket.emit).toHaveBeenCalledWith('widget:unsubscribe', { instanceId: 'instance-1' });
    await waitFor(() => {
      expect(queryClient.getQueryData<WidgetCacheEntry>(['widget', 'instance-1'])).toEqual({
        data: null,
        fetchedAt: null,
        error: null,
      });
    });
  });

  it('keeps the cached entry and subscription when the config is unchanged', () => {
    const socket = fakeSocket();
    const { Wrapper, queryClient } = wrapper({ socket: socket as never, connected: true });
    const { rerender } = renderHook(({ config }) => useWidgetData('instance-1', config), {
      wrapper: Wrapper,
      initialProps: { config: 'city=Paris' },
    });
    socket.trigger('widget:data', { instanceId: 'instance-1', data: { t: 1 }, fetchedAt: '2026-01-01T00:00:00Z' });

    rerender({ config: 'city=Paris' });

    expect(socket.emit.mock.calls.filter(([event]) => event === 'widget:subscribe')).toHaveLength(1);
    expect(queryClient.getQueryData<WidgetCacheEntry>(['widget', 'instance-1'])?.fetchedAt).toBe('2026-01-01T00:00:00Z');
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
