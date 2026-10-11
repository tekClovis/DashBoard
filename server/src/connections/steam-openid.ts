// Steam OpenID 2.0 connect handshake — connect-only, no login. Replaces passport-steam, whose
// `returnURL` is fixed at construction and so cannot carry a per-request nonce.
//
// Start: a random nonce goes into `return_to` and into a cookie. Callback: the nonce echoed in
// `return_to` must equal the cookie, Steam must confirm the signature (`check_authentication`),
// and `openid.response_nonce` is stored in Redis with a TTL so a captured response can't replay.
// Stores `externalAccountId` = SteamID64; no tokens (the Steam Web API key is server-side).

import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { Redis } from 'ioredis';
import { REDIS } from '../core/redis/redis.provider.js';

export const STEAM_NONCE_COOKIE = 'oauth_steam_nonce';
const STEAM_OPENID_ENDPOINT = 'https://steamcommunity.com/openid/login';
const OPENID_NS = 'http://specs.openid.net/auth/2.0';
const IDENTIFIER_SELECT = 'http://specs.openid.net/auth/2.0/identifier_select';
const CLAIMED_ID = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d+)$/;
/** Fields Steam must have signed for the assertion to bind this request and make the nonce meaningful. */
const REQUIRED_SIGNED = ['claimed_id', 'return_to', 'response_nonce'];
/** Replay window: longer than the 10 minute state lifetime, so a response nonce outlives any valid callback. */
const RESPONSE_NONCE_TTL_SEC = 15 * 60;

export interface SteamConnectResult {
  steamId64: string;
}

/** Raised by {@link SteamOpenIdService.verify} for any rejected callback. */
export class SteamOpenIdError extends Error {}

@Injectable()
export class SteamOpenIdService {
  constructor(
    private readonly config: ConfigService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /** Random per-request nonce for the `return_to` URL and its cookie. */
  generateNonce(): string {
    return randomBytes(24).toString('base64url');
  }

  /** The Steam sign-in URL to redirect the user to, with `nonce` carried in `return_to`. */
  loginUrl(nonce: string): string {
    const params = new URLSearchParams({
      'openid.ns': OPENID_NS,
      'openid.mode': 'checkid_setup',
      'openid.return_to': this.returnTo(nonce),
      'openid.realm': this.config.getOrThrow<string>('APP_URL'),
      'openid.identity': IDENTIFIER_SELECT,
      'openid.claimed_id': IDENTIFIER_SELECT,
    });
    return `${STEAM_OPENID_ENDPOINT}?${params.toString()}`;
  }

  /**
   * Validates a callback's query against the nonce cookie and Steam, and returns the SteamID64.
   * @throws {@link SteamOpenIdError} on a missing/mismatched nonce, an unsigned or forged assertion, or a replayed `response_nonce`.
   */
  async verify(query: Record<string, unknown>, cookieNonce: string | undefined): Promise<SteamConnectResult> {
    const queryNonce = typeof query['nonce'] === 'string' ? query['nonce'] : undefined;
    if (!cookieNonce || !queryNonce || !sameString(queryNonce, cookieNonce)) {
      throw new SteamOpenIdError('Missing or mismatched nonce.');
    }

    const openid = Object.fromEntries(
      Object.entries(query).filter(([key, value]) => key.startsWith('openid.') && typeof value === 'string'),
    ) as Record<string, string>;
    if (openid['openid.mode'] !== 'id_res' || openid['openid.op_endpoint'] !== STEAM_OPENID_ENDPOINT) {
      throw new SteamOpenIdError('Not a positive Steam assertion.');
    }
    if (openid['openid.return_to'] !== this.returnTo(cookieNonce)) {
      throw new SteamOpenIdError('return_to does not match this request.');
    }
    const signed = (openid['openid.signed'] ?? '').split(',');
    if (!REQUIRED_SIGNED.every((field) => signed.includes(field))) {
      throw new SteamOpenIdError('Required fields are not signed.');
    }
    const steamId64 = CLAIMED_ID.exec(openid['openid.claimed_id'] ?? '')?.[1];
    const responseNonce = openid['openid.response_nonce'];
    if (!steamId64 || !responseNonce) {
      throw new SteamOpenIdError('Malformed assertion.');
    }

    if (!(await this.steamConfirms(openid))) {
      throw new SteamOpenIdError('Steam rejected the assertion.');
    }

    const fresh = await this.redis.set(`steam:openid:nonce:${responseNonce}`, '1', 'EX', RESPONSE_NONCE_TTL_SEC, 'NX');
    if (fresh === null) {
      throw new SteamOpenIdError('response_nonce was already used.');
    }
    return { steamId64 };
  }

  private returnTo(nonce: string): string {
    return `${this.config.getOrThrow<string>('APP_URL')}/api/oauth/steam/callback?nonce=${encodeURIComponent(nonce)}`;
  }

  /** Direct verification: Steam re-checks its own signature over the exact fields we received. */
  private async steamConfirms(openid: Record<string, string>): Promise<boolean> {
    const body = new URLSearchParams({ ...openid, 'openid.mode': 'check_authentication' });
    const response = await fetch(STEAM_OPENID_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!response.ok) return false;
    return (await response.text()).split('\n').some((line) => line.trim() === 'is_valid:true');
  }
}

function sameString(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
