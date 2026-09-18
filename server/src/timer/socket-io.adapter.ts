import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { Server, ServerOptions } from 'socket.io';

/**
 * Forces the Socket.IO server's CORS origin to `appUrl`, overriding whatever
 * RealtimeGateway's own `@WebSocketGateway()` decorator options request. The
 * decorator's options are fixed at class-decoration/import time, before
 * ConfigModule has loaded APP_URL from the environment, so the real value can
 * only be applied here (after ConfigService is available). A permissive
 * origin (e.g. `origin: true`, reflecting every request's Origin header) plus
 * `credentials: true` lets any external site open an authenticated socket
 * using the visitor's session cookie (cross-site WebSocket hijacking) — the
 * cookie's `sameSite: 'lax'` alone isn't a reliable substitute for a real
 * origin check on a cross-site subresource request like a WS handshake.
 */
export class SocketIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly appUrl: string,
  ) {
    super(app);
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    return super.createIOServer(port, {
      ...options,
      cors: { origin: this.appUrl, credentials: true },
    } as ServerOptions);
  }
}
