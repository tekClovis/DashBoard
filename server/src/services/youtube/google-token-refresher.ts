// Google access-token refresh for youtube connections — see docs/Architecture.md §5.2
// (`access_type=offline`, "refreshed on expiry or 401") and features/youtube-widgets/spec.md.
//
// The refreshed token is stored through connections-api's TokenCipherService (AES-256-GCM), the
// same path the connect callback uses. A failed refresh throws REAUTH_REQUIRED, which the Timer
// turns into ServiceConnection.status = REAUTH.

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { googleConnectClient } from '../../connections/strategies/google-connect.strategy.js';
import { TokenCipherService } from '../../connections/token-cipher.service.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { FetchError } from '../../timer/fetch-error.js';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const TIMEOUT_MS = 10_000;

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
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

    const promise = this.exchange(userId).finally(() => this.inFlight.delete(userId));
    this.inFlight.set(userId, promise);
    return promise;
  }

  private async exchange(userId: string): Promise<string> {
    const connection = await this.prisma.serviceConnection.findUnique({
      where: { userId_service: { userId, service: 'youtube' } },
    });
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
        throw new FetchError('REAUTH_REQUIRED', 'Google refused to refresh the access token.');
      }
      throw new FetchError('UPSTREAM_ERROR', `Google token endpoint responded with HTTP ${res.status}.`);
    }

    const token = (await res.json()) as TokenResponse;
    await this.prisma.serviceConnection.update({
      where: { id: connection.id },
      data: {
        accessTokenEnc: this.cipher.encrypt(token.access_token),
        expiresAt: new Date(Date.now() + token.expires_in * 1000),
        // Google only sometimes rotates the refresh token; keep the stored one otherwise.
        ...(token.refresh_token ? { refreshTokenEnc: this.cipher.encrypt(token.refresh_token) } : {}),
      },
    });
    return token.access_token;
  }
}
