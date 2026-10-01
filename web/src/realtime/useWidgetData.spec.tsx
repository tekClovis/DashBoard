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
    /** Answers the most recent `widget:subscribe` the way the gateway does once it has joined the room. */
    ackLastSubscribe() {
      const call = this.emit.mock.calls.findLast(([event]) => event === 'widget:subscribe');
      (call?.[2] as ((res: { ok: boolean }) => void) | undefined)?.({ ok: true });
    },
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

    expect(socket.emit).toHaveBeenCalledWith('widget:subscribe', { instanceId: 'instance-1' }, expect.any(Function));

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

  it('resubscribes on a params change and keeps old-params pushes out of the new history', async () => {
    const socket = fakeSocket();
    const { Wrapper, queryClient } = wrapper({ socket: socket as never, connected: true });
    const { rerender } = renderHook(({ params }) => useWidgetData('instance-1', params), {
      wrapper: Wrapper,
      initialProps: { params: { city: 'Reykjavik' } as Record<string, unknown> },
    });
    socket.ackLastSubscribe();
    socket.trigger('widget:data', { instanceId: 'instance-1', data: { t: 10 }, fetchedAt: '2026-01-01T00:00:00Z' });

    rerender({ params: { city: 'Paris' } });
    expect(socket.emit).toHaveBeenCalledWith('widget:unsubscribe', { instanceId: 'instance-1' });
    expect(socket.emit.mock.calls.filter(([event]) => event === 'widget:subscribe')).toHaveLength(2);

    // The server timer was still on Reykjavik when this push left, before the resubscribe landed.
    socket.trigger('widget:data', { instanceId: 'instance-1', data: { t: 10 }, fetchedAt: '2026-01-01T00:01:00Z' });
    socket.ackLastSubscribe();
    socket.trigger('widget:data', { instanceId: 'instance-1', data: { t: 20 }, fetchedAt: '2026-01-01T00:02:00Z' });

    await waitFor(() => {
      const cached = queryClient.getQueryData<WidgetCacheEntry>(['widget', 'instance-1']);
      expect(cached?.history).toEqual([{ data: { t: 20 }, fetchedAt: '2026-01-01T00:02:00Z' }]);
    });
  });

  it('starts a new history when pushes arrive under new params changed by another session', async () => {
    const socket = fakeSocket();
    const { Wrapper, queryClient } = wrapper({ socket: socket as never, connected: true });
    // This session never sees the Configure: its params prop stays Paris throughout.
    renderHook(() => useWidgetData('instance-1', { city: 'Paris' }), { wrapper: Wrapper });
    socket.ackLastSubscribe();
    socket.trigger('widget:data', {
      instanceId: 'instance-1',
      data: { t: 16.5 },
      fetchedAt: '2026-01-01T00:00:00Z',
      paramsKey: '[["city","Paris"]]',
    });

    // Another session saved London; the server now fetches London for the whole room.
    socket.trigger('widget:data', {
      instanceId: 'instance-1',
      data: { t: 16 },
      fetchedAt: '2026-01-01T00:05:00Z',
      paramsKey: '[["city","London"]]',
    });
    socket.trigger('widget:data', {
      instanceId: 'instance-1',
      data: { t: 15 },
      fetchedAt: '2026-01-01T00:10:00Z',
      paramsKey: '[["city","London"]]',
    });

    await waitFor(() => {
      const cached = queryClient.getQueryData<WidgetCacheEntry>(['widget', 'instance-1']);
      expect(cached?.history).toEqual([
        { data: { t: 16 }, fetchedAt: '2026-01-01T00:05:00Z' },
        { data: { t: 15 }, fetchedAt: '2026-01-01T00:10:00Z' },
      ]);
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
