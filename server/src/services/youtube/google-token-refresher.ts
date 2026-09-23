// Google access-token refresh for youtube connections — see docs/Architecture.md §5.2
// (`access_type=offline`, "refreshed on expiry or 401") and features/youtube-widgets/spec.md.
//
// The refreshed token is stored through connections-api's TokenCipherService (AES-256-GCM), the
// same path the connect callback uses. A failed refresh marks the row REAUTH and throws
// REAUTH_REQUIRED.
//
// The user can disconnect or reconnect while the token exchange is in flight, so either outcome is
// written only if the row still holds the refresh token that was exchanged (compare-and-set on
// refreshTokenEnc; its random IV makes a reconnect's ciphertext differ even for the same token).
// Otherwise the stale grant is dropped: see superseded().

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { googleConnectClient } from '../../connections/strategies/google-connect.strategy.js';
import { TokenCipherService } from '../../connections/token-cipher.service.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import type { Prisma, ServiceConnection } from '../../generated/prisma/client.js';
import { FetchError } from '../../timer/fetch-error.js';
import { fixedMessage } from './youtube-api.js';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const TIMEOUT_MS = 10_000;

interface TokenResponse {
  access_token: string;
  expiresAt: Date;
  refresh_token?: string;
}

/** The token response if it has the fields we persist, else null (nothing must reach the DB or the client). */
function parseTokenResponse(body: unknown): TokenResponse | null {
  const { access_token, expires_in, refresh_token } = (body ?? {}) as Record<string, unknown>;
  if (typeof access_token !== 'string' || !access_token) return null;
  if (typeof expires_in !== 'number' || !(expires_in > 0)) return null;
  // A huge expires_in overflows Date (Invalid Date), which the DB write would reject.
  const expiresAt = new Date(Date.now() + expires_in * 1000);
  if (Number.isNaN(expiresAt.getTime())) return null;
  if (refresh_token !== undefined && typeof refresh_token !== 'string') return null;
  return { access_token, expiresAt, refresh_token };
}

@Injectable()
export class GoogleTokenRefresher {
  private readonly client: { clientID: string; clientSecret: string };
  // One refresh per user at a time: N widgets hitting an expired token in the same tick share
  // it instead of racing N token exchanges and N last-write-wins DB updates.
  private readonly inFlight = new Map<string, Promise<string>>();

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly cipher: TokenCipherService,
  ) {
    this.client = googleConnectClient(config);
  }

  /** Returns a fresh access token for the user's youtube connection, persisting it (encrypted) with its expiry. */
  refresh(userId: string): Promise<string> {
    const existing = this.inFlight.get(userId);
    if (existing) return existing;

    const promise = this.exchange(userId)
      .catch(fixedMessage('Google token refresh failed.'))
      .finally(() => this.inFlight.delete(userId));
    this.inFlight.set(userId, promise);
    return promise;
  }

  private async exchange(userId: string): Promise<string> {
    const connection = await this.findConnection(userId);
    if (!connection?.refreshTokenEnc) {
      throw new FetchError('REAUTH_REQUIRED', 'No Google refresh token for this connection.');
    }

    let res: Response;
    try {
      res = await fetch(TOKEN_URL, {
        method: 'POST',
        body: new URLSearchParams({
          client_id: this.client.clientID,
          client_secret: this.client.clientSecret,
          refresh_token: this.cipher.decrypt(connection.refreshTokenEnc),
          grant_type: 'refresh_token',
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      throw new FetchError('UPSTREAM_ERROR', `Google token refresh failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (!res.ok) {
      await res.body?.cancel();
      // 400 invalid_grant (revoked/expired refresh token) or 401 invalid_client: only a reconnect fixes it.
      if (res.status === 400 || res.status === 401) {
        if (!(await this.writeIfCurrent(connection, { status: 'REAUTH' }))) return this.superseded(userId);
        throw new FetchError('REAUTH_REQUIRED', 'Google refused to refresh the access token.');
      }
      throw new FetchError('UPSTREAM_ERROR', `Google token endpoint responded with HTTP ${res.status}.`);
    }

    const token = parseTokenResponse(await res.json().catch(() => null));
    if (!token) throw new FetchError('UPSTREAM_ERROR', 'Google token endpoint returned an invalid response.');
    const stored = await this.writeIfCurrent(connection, {
      accessTokenEnc: this.cipher.encrypt(token.access_token),
      expiresAt: token.expiresAt,
      // Google only sometimes rotates the refresh token; keep the stored one otherwise.
      ...(token.refresh_token ? { refreshTokenEnc: this.cipher.encrypt(token.refresh_token) } : {}),
    });
    return stored ? token.access_token : this.superseded(userId);
  }

  private findConnection(userId: string): Promise<ServiceConnection | null> {
    return this.prisma.serviceConnection.findUnique({ where: { userId_service: { userId, service: 'youtube' } } });
  }

  /** Updates the row only if it still holds the refresh token that was exchanged; false if it no longer does. */
  private async writeIfCurrent(connection: ServiceConnection, data: Prisma.ServiceConnectionUpdateManyMutationInput): Promise<boolean> {
    const { count } = await this.prisma.serviceConnection.updateMany({
      where: { id: connection.id, refreshTokenEnc: connection.refreshTokenEnc },
      data,
    });
    return count === 1;
  }

  /**
   * The row no longer holds the refresh token just exchanged. Disconnected: NOT_CONNECTED.
   * Reconnected: that connect stored a fresh access token, so use it.
   */
  private async superseded(userId: string): Promise<string> {
    const current = await this.findConnection(userId);
    if (!current?.accessTokenEnc) {
      throw new FetchError('NOT_CONNECTED', 'The youtube connection was removed during a token refresh.');
    }
    return this.cipher.decrypt(current.accessTokenEnc);
  }
}
