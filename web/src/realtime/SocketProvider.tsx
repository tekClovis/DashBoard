import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';

export interface SocketContextValue {
  socket: Socket | null;
  connected: boolean;
}

export const SocketContext = createContext<SocketContextValue>({ socket: null, connected: false });

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
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const s = io({ withCredentials: true });

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);
    setSocket(s);

    return () => {
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
      s.disconnect();
    };
  }, []);

  return <SocketContext.Provider value={{ socket, connected }}>{children}</SocketContext.Provider>;
}

export function useSocket(): SocketContextValue {
  return useContext(SocketContext);
}
