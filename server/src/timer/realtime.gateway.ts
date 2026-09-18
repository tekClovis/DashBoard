// Socket.IO gateway — see docs/Architecture.md §6, §8.
//
// Handshake auth mirrors JwtGuard (session cookie, revocation, ban, tokenVersion) but runs
// as a Socket.IO middleware (`server.use`) rather than a Nest guard, so an unauthenticated
// or invalid socket is rejected before 'connect' fires at all — the client only ever sees
// 'connect_error'.

import { Injectable } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
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

@Injectable()
@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection {
  @WebSocketServer()
  private server!: Server;

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
      void this.authenticate(socket).then((userId) => {
        if (!userId) {
          next(new Error('Unauthorized'));
          return;
        }
        socket.data.userId = userId;
        next();
      });
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
  }

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
