import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';

/** `attempt` is 0 until the manager's first `reconnect_attempt` (initial connect, or just after a drop). */
export type ConnectionState =
  | { status: 'live' }
  | { status: 'reconnecting'; attempt: number }
  | { status: 'offline' };

export interface SocketContextValue {
  socket: Socket | null;
  connected: boolean;
  connection: ConnectionState;
  /** Starts a fresh reconnect cycle after the manager gave up (`offline`). */
  retry: () => void;
}

/** After this many failed reconnects the manager emits `reconnect_failed` and the shell shows offline. */
const RECONNECT_ATTEMPTS = 5;
const CONNECTING: ConnectionState = { status: 'reconnecting', attempt: 0 };

export const SocketContext = createContext<SocketContextValue>({
  socket: null,
  connected: false,
  connection: CONNECTING,
  retry: () => {},
});

/**
 * One socket.io-client connection for the authenticated shell, carrying the session cookie
 * (`withCredentials`) so the server's handshake auth (`RealtimeGateway`, `timer-realtime`) can
 * identify the user the same way `JwtGuard` does for REST. Mount this only inside the
 * authenticated route tree — connects on mount, disconnects on unmount (i.e. on logout, when
 * `RequireAuth` unmounts the shell).
 *
 * Connects to `RealtimeGateway`'s default namespace (`server/src/timer/realtime.gateway.ts`,
 * `timer-realtime`) — no custom path/namespace needed since the gateway is registered with
 * `@WebSocketGateway()` and no options, and `vite.config.ts` already proxies `/socket.io`.
 */
export function SocketProvider({ children }: { children: ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connection, setConnection] = useState<ConnectionState>(CONNECTING);

  useEffect(() => {
    const s = io({ withCredentials: true, reconnectionAttempts: RECONNECT_ATTEMPTS });

    const onConnect = () => setConnection({ status: 'live' });
    const onDisconnect = () => setConnection(CONNECTING);
    const onReconnectAttempt = (attempt: number) => setConnection({ status: 'reconnecting', attempt });
    const onReconnectFailed = () => setConnection({ status: 'offline' });
    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);
    s.io.on('reconnect_attempt', onReconnectAttempt);
    s.io.on('reconnect_failed', onReconnectFailed);
    setSocket(s);

    return () => {
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
      s.io.off('reconnect_attempt', onReconnectAttempt);
      s.io.off('reconnect_failed', onReconnectFailed);
      s.disconnect();
    };
  }, []);

  const retry = useCallback(() => {
    if (!socket) return;
    setConnection(CONNECTING);
    socket.connect();
  }, [socket]);

  return (
    <SocketContext.Provider value={{ socket, connected: connection.status === 'live', connection, retry }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket(): SocketContextValue {
  return useContext(SocketContext);
}
