// Socket.IO gateway — see docs/Architecture.md §6, §3.
//
// Handshake auth mirrors JwtGuard (session cookie, revocation, ban, tokenVersion) but runs
// as a Socket.IO middleware (`server.use`) rather than a Nest guard, so an unauthenticated
// or invalid socket is rejected before 'connect' fires at all — the client only ever sees
// 'connect_error'. CORS is deliberately NOT set here — RealtimeGateway's decorator options
// are fixed before ConfigModule loads APP_URL, so the real origin restriction is applied by
// SocketIoAdapter (main.ts) once ConfigService is available; see that file's comment.
//
// A connection is only checked against revocation/ban/tokenVersion once, at handshake — a
// long-lived socket won't otherwise notice a logout, logout-all, or ban that happens after
// it connects. REAUTH_INTERVAL_MS re-runs that same check periodically and disconnects the
// socket once it no longer passes, bounding how long a since-invalidated session can keep
// receiving widget updates.

import { Injectable } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { WidgetSubscribePayload, WidgetUnsubscribePayload } from '@dashboard/shared';
import type { Server, Socket } from 'socket.io';
import { JwtService } from '../auth/jwt.service.js';
import { resolveSessionUser } from '../auth/session-user.js';
import { SESSION_COOKIE } from '../auth/session.constants.js';
import { TokenRevocationService } from '../auth/token-revocation.service.js';
import { readCookie } from '../core/http/cookies.js';
import { PrismaService } from '../core/prisma/prisma.service.js';
import { InstanceLookupService } from './instance-lookup.service.js';
import { TimerService } from './timer.service.js';

const INSTANCE_ROOM_PREFIX = 'instance:';
const REAUTH_INTERVAL_MS = 60_000;

/** Socket.IO gateway: authenticates sockets and maps `widget:subscribe`/`widget:unsubscribe` to Timer activation. */
@Injectable()
@WebSocketGateway()
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  private server!: Server;

  private readonly reauthTimers = new Map<string, ReturnType<typeof setInterval>>();

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly revocation: TokenRevocationService,
    private readonly timer: TimerService,
    private readonly instances: InstanceLookupService,
  ) {}

  afterInit(server: Server): void {
    this.timer.setServer(server);

    server.use((socket, next) => {
      // A rejected `authenticate()` (e.g. a transient DB error) must still resolve this
      // middleware — an unhandled rejection here crashes the whole process (Node terminates
      // on unhandled rejection by default), not just this one handshake.
      void this.authenticate(socket)
        .then((userId) => {
          if (!userId) {
            next(new Error('Unauthorized'));
            return;
          }
          socket.data.userId = userId;
          next();
        })
        .catch(() => next(new Error('Unauthorized')));
    });

    // The default in-memory adapter emits this once a room's last member leaves, whether
    // via an explicit `widget:unsubscribe` (client.leave) or a bare disconnect — one code
    // path deactivates the Timer entry either way.
    server.of('/').adapter.on('delete-room', (room: string) => {
      if (room.startsWith(INSTANCE_ROOM_PREFIX)) {
        this.timer.deactivate(room.slice(INSTANCE_ROOM_PREFIX.length));
      }
    });
  }

  async handleConnection(client: Socket): Promise<void> {
    const userId = client.data.userId as string | undefined;
    if (!userId) return;
    await client.join(`user:${userId}`);

    // `checking` skips a tick if the previous one hasn't settled yet, so a slow or hung
    // re-check (e.g. a stalled DB call) can't pile up overlapping calls per socket.
    let checking = false;
    this.reauthTimers.set(
      client.id,
      setInterval(() => {
        if (checking) return;
        checking = true;
        this.authenticate(client)
          .then((stillValid) => {
            if (!stillValid) client.disconnect(true);
          })
          .catch(() => {
            // A failed re-check (e.g. a transient DB error) is inconclusive, not a reason to
            // disconnect — and must not become an unhandled rejection, which would crash the
            // whole process rather than just this one socket's check.
          })
          .finally(() => {
            checking = false;
          });
      }, REAUTH_INTERVAL_MS),
    );
  }

  /** Immediately drops every live socket of `userId` (ban / role change / delete) — no waiting for the reauth tick. */
  disconnectUser(userId: string): void {
    this.server?.in(`user:${userId}`).disconnectSockets(true);
  }

  handleDisconnect(client: Socket): void {
    const timer = this.reauthTimers.get(client.id);
    if (timer) {
      clearInterval(timer);
      this.reauthTimers.delete(client.id);
    }
  }

  /**
   * Join the instance room and activate its Timer entry.
   * @returns `{ ok: false }` when the instance is missing or not owned by the socket's user.
   */
  @SubscribeMessage('widget:subscribe')
  async handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: WidgetSubscribePayload,
  ): Promise<{ ok: boolean }> {
    const userId = client.data.userId as string | undefined;
    if (!userId || !body?.instanceId) return { ok: false };

    // Not found and not-owned are indistinguishable to the caller — no existence leak.
    const instance = await this.instances.findOwned(body.instanceId, userId);
    if (!instance) return { ok: false };

    await client.join(INSTANCE_ROOM_PREFIX + instance.id);
    this.timer.activate({
      id: instance.id,
      service: instance.service,
      widget: instance.widget,
      params: instance.params,
      refreshRate: instance.refreshRate,
      userId,
    });
    return { ok: true };
  }

  /** Leave the instance room; the Timer entry is deactivated once the room is empty. */
  @SubscribeMessage('widget:unsubscribe')
  async handleUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: WidgetUnsubscribePayload,
  ): Promise<{ ok: boolean }> {
    if (!body?.instanceId) return { ok: false };
    await client.leave(INSTANCE_ROOM_PREFIX + body.instanceId);
    return { ok: true };
  }

  private async authenticate(client: Socket): Promise<string | null> {
    const token = readCookie(client.handshake.headers.cookie, SESSION_COOKIE);
    if (!token) return null;

    const user = await resolveSessionUser(token, this.jwt, this.prisma, this.revocation);
    return user?.id ?? null;
  }
}
