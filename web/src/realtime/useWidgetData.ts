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
  /** The params `history` was collected under; a push under other params starts a new history. */
  historyParams?: string;
}

const PUSH_HISTORY = 12;

/**
 * Subscribes to one widget instance's realtime updates for the lifetime of the calling
 * component: emits `widget:subscribe` on mount / `widget:unsubscribe` on unmount, and writes
 * incoming `widget:data`/`widget:error` into the query cache under `['widget', instanceId]` —
 * per docs/Architecture.md §9 and `timer-realtime`'s gateway (`shared/src/socket.ts`'s event
 * contract). Returns that cache entry like any other query so a widget view can render from
 * it directly. Pass the instance's `params`: a Configure change resubscribes (so the server's
 * Timer picks up the saved params) and starts a new push history once the server has
 * acknowledged that subscribe, instead of mixing the old city or repo into the new one's
 * sparkline and deltas.
 */
export function useWidgetData(instanceId: string, params?: Record<string, unknown>) {
  const { socket } = useSocket();
  const queryClient = useQueryClient();
  const paramsKey = params === undefined ? undefined : JSON.stringify(params);
  // The params the server is fetching with. Pushes still in transit when params change carry
  // old-params data, so they keep the old tag until the resubscribe is acknowledged.
  const subscribedParams = useRef(paramsKey);

  useEffect(() => {
    if (!socket) return;

    let current = true;
    socket.emit(SOCKET_EVENTS.subscribe, { instanceId }, () => {
      if (current) subscribedParams.current = paramsKey;
    });

    function onData(event: WidgetDataPayload) {
      if (event.instanceId !== instanceId) return;
      const push = { data: event.data, fetchedAt: event.fetchedAt };
      // The server's key wins: another session's Configure changes what the room is fetched
      // with without this session's params prop changing.
      const historyParams = event.paramsKey ?? subscribedParams.current;
      queryClient.setQueryData<WidgetCacheEntry>(['widget', instanceId], (prev) => {
        const previous = prev?.historyParams === historyParams ? (prev?.history ?? []) : [];
        // A re-push of the same fetch (e.g. on resubscribe) replaces its point instead of adding one.
        const kept = previous.filter((p) => p.fetchedAt !== push.fetchedAt);
        return { ...push, error: null, history: [...kept, push].slice(-PUSH_HISTORY), historyParams };
      });
    }

    function onError(event: WidgetErrorPayload) {
      if (event.instanceId !== instanceId) return;
      queryClient.setQueryData<WidgetCacheEntry>(['widget', instanceId], (prev) => ({
        data: prev?.data ?? null,
        fetchedAt: prev?.fetchedAt ?? null,
        error: { code: event.code, message: event.message, retryAt: event.retryAt },
        history: prev?.history,
        historyParams: prev?.historyParams,
      }));
    }

    socket.on(SOCKET_EVENTS.data, onData);
    socket.on(SOCKET_EVENTS.error, onError);

    return () => {
      current = false;
      socket.emit(SOCKET_EVENTS.unsubscribe, { instanceId });
      socket.off(SOCKET_EVENTS.data, onData);
      socket.off(SOCKET_EVENTS.error, onError);
    };
  }, [socket, instanceId, queryClient, paramsKey]);

  return useQuery<WidgetCacheEntry | undefined>({
    queryKey: ['widget', instanceId],
    queryFn: skipToken,
  });
}
