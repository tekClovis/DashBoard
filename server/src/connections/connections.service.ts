// ServiceConnection CRUD + OAuth/OpenID connect upserts — see
// docs/Architecture.md §8.3 and features/connections-api/spec.md.

import { Injectable } from '@nestjs/common';
import type { ConnectionEntry } from '@dashboard/shared';
import { PrismaService } from '../core/prisma/prisma.service.js';
import { TokenCipherService } from './token-cipher.service.js';

/** Services that require a ServiceConnection. Weather is always on for any authenticated user. */
export const CONNECTABLE_SERVICES = ['github', 'steam', 'youtube'] as const;
export type ConnectableService = (typeof CONNECTABLE_SERVICES)[number];

/** Token material from a completed OAuth connect handshake. */
export interface OAuthTokenResult {
  externalAccountId: string;
  accessToken: string;
  refreshToken?: string;
  scopes: string[];
  expiresAt?: Date;
}

@Injectable()
export class ConnectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: TokenCipherService,
  ) {}

  /** Return one entry per service; `weather` is always connected, others reflect the stored row (status defaults to `OK` when absent). */
  async list(userId: string): Promise<{ connections: ConnectionEntry[] }> {
    const rows = await this.prisma.serviceConnection.findMany({
      where: { userId },
      select: { service: true, status: true },
    });
    const byService = new Map(rows.map((row) => [row.service, row.status]));

    const connections: ConnectionEntry[] = [
      { service: 'weather', connected: true, status: 'OK' },
      ...CONNECTABLE_SERVICES.map((service) => {
        const status = byService.get(service);
        return { service, connected: status !== undefined, status: status ?? 'OK' };
      }),
    ];

    return { connections };
  }

  /** Deletes the row. Provider-side revocation, where the API allows it, is the caller's job (best-effort). */
  async disconnect(userId: string, service: string): Promise<void> {
    await this.prisma.serviceConnection.deleteMany({ where: { userId, service } });
  }

  /** Fetch the decrypted access token for revocation; `null` when no row exists, `accessToken` is `null` for token-less connections (Steam). */
  async findForRevoke(userId: string, service: string): Promise<{ accessToken: string | null } | null> {
    const row = await this.prisma.serviceConnection.findUnique({
      where: { userId_service: { userId, service } },
    });
    if (!row) return null;
    return { accessToken: row.accessTokenEnc ? this.cipher.decrypt(row.accessTokenEnc) : null };
  }

  /** Upserts a GitHub/Google OAuth connection for (userId, service). Tokens are encrypted before persisting. */
  async upsertOAuthConnection(userId: string, service: ConnectableService, result: OAuthTokenResult): Promise<void> {
    const data = {
      externalAccountId: result.externalAccountId,
      accessTokenEnc: this.cipher.encrypt(result.accessToken),
      refreshTokenEnc: result.refreshToken ? this.cipher.encrypt(result.refreshToken) : null,
      expiresAt: result.expiresAt ?? null,
      scopes: result.scopes,
      status: 'OK' as const,
    };

    await this.prisma.serviceConnection.upsert({
      where: { userId_service: { userId, service } },
      create: { userId, service, ...data },
      update: data,
    });
  }

  /** Upserts a Steam OpenID connection. No token fields — the API key is server-side. */
  async upsertSteamConnection(userId: string, steamId64: string): Promise<void> {
    const data = {
      externalAccountId: steamId64,
      accessTokenEnc: null,
      refreshTokenEnc: null,
      expiresAt: null,
      scopes: [] as string[],
      status: 'OK' as const,
    };

    await this.prisma.serviceConnection.upsert({
      where: { userId_service: { userId, service: 'steam' } },
      create: { userId, service: 'steam', ...data },
      update: data,
    });
  }
}
