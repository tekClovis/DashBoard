import type { WidgetDataPayload, WidgetErrorCode, WidgetErrorPayload } from '@dashboard/shared';
import { SOCKET_EVENTS } from '@dashboard/shared';
import { skipToken, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useSocket } from './SocketProvider.js';

export interface WidgetPush {
  data: unknown;
  fetchedAt: string | null;
}

export interface WidgetCacheEntry extends WidgetPush {
  error: { code: WidgetErrorCode; message: string; retryAt?: string } | null;
  /** The last `PUSH_HISTORY` pushes, oldest first (one per `fetchedAt`), for sparklines and deltas. */
  history?: WidgetPush[];
}

const PUSH_HISTORY = 12;

/**
 * Subscribes to one widget instance's realtime updates for the lifetime of the calling
 * component: emits `widget:subscribe` on mount / `widget:unsubscribe` on unmount, and writes
 * incoming `widget:data`/`widget:error` into the query cache under `['widget', instanceId]` —
 * per docs/Architecture.md §9 and `timer-realtime`'s gateway (`shared/src/socket.ts`'s event
 * contract). Returns that cache entry like any other query so a widget view can render from
 * it directly. Recent pushes are kept in that entry too, so trends survive a remount.
 *
 * `config` identifies the instance's params and refresh rate. When it changes (a Configure
 * save), the entry is reset to waiting and the subscription is renewed: the server reads the
 * new settings on subscribe, and drops an instance that failed with INVALID_PARAMS until then.
 */
export function useWidgetData(instanceId: string, config?: string) {
  const { socket } = useSocket();
  const queryClient = useQueryClient();
  const subscribedConfig = useRef(config);

  useEffect(() => {
    if (!socket) return;

    if (subscribedConfig.current !== config) {
      subscribedConfig.current = config;
      queryClient.setQueryData<WidgetCacheEntry>(['widget', instanceId], { data: null, fetchedAt: null, error: null });
    }
    socket.emit(SOCKET_EVENTS.subscribe, { instanceId });

    function onData(event: WidgetDataPayload) {
      if (event.instanceId !== instanceId) return;
      const push = { data: event.data, fetchedAt: event.fetchedAt };
      queryClient.setQueryData<WidgetCacheEntry>(['widget', instanceId], (prev) => {
        // A re-push of the same fetch (e.g. on resubscribe) replaces its point instead of adding one.
        const kept = (prev?.history ?? []).filter((p) => p.fetchedAt !== push.fetchedAt);
        return { ...push, error: null, history: [...kept, push].slice(-PUSH_HISTORY) };
      });
    }

    function onError(event: WidgetErrorPayload) {
      if (event.instanceId !== instanceId) return;
      queryClient.setQueryData<WidgetCacheEntry>(['widget', instanceId], (prev) => ({
        data: null,
        fetchedAt: null,
        ...prev,
        error: { code: event.code, message: event.message, retryAt: event.retryAt },
      }));
    }

    socket.on(SOCKET_EVENTS.data, onData);
    socket.on(SOCKET_EVENTS.error, onError);

    return () => {
      socket.emit(SOCKET_EVENTS.unsubscribe, { instanceId });
      socket.off(SOCKET_EVENTS.data, onData);
      socket.off(SOCKET_EVENTS.error, onError);
    };
  }, [socket, instanceId, config, queryClient]);

  return useQuery<WidgetCacheEntry | undefined>({
    queryKey: ['widget', instanceId],
    queryFn: skipToken,
  });
}
