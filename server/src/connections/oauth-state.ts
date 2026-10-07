// Signed, expiring, CSRF-bound `state` for the OAuth/OpenID connect handshake.
//
// This extends the same pattern `oauth-login` built and then had to harden
// (see features/oauth-login/verification/review.md): the `start` leg reads
// the *session-authenticated* user id and binds it into the signed `state`;
// the `callback` leg trusts only the verified `state`, never any
// client-supplied id. Do not add a code path that accepts a caller-supplied
// userId for anything that creates or mutates a ServiceConnection.
//
// Shape: HMAC-SHA256 over a JSON payload, base64url(payload).base64url(mac).
// 10-minute expiry. Double-submit CSRF: `csrf` in the payload must match the
// SHA-256 of the `oauth_csrf` cookie value set at the `start` leg.

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const OAUTH_CSRF_COOKIE = 'oauth_csrf';
/** Steam is OpenID, not OAuth2 — passport-steam/node-openid don't echo an arbitrary `state` query param back on
 *  the provider redirect (the `returnURL` is fixed at strategy construction), so its signed state travels via
 *  cookie instead of the query string. Still double-submit-bound by OAUTH_CSRF_COOKIE inside the payload. */
export const OAUTH_STATE_COOKIE = 'oauth_state';
const STATE_TTL_MS = 10 * 60 * 1000;

/** Providers that support the connect flow. */
export type ConnectProvider = 'github' | 'google' | 'steam';

export interface ConnectStatePayload {
  intent: 'connect';
  provider: ConnectProvider;
  /** Bound from the session at the `start` leg — never trust a client-supplied value instead. */
  userId: string;
  csrf: string;
  iat: number;
  exp: number;
}

/** Random raw token for the CSRF cookie; only its hash travels inside the signed state. */
export function generateCsrfToken(): string {
  return randomBytes(24).toString('base64url');
}

/** Build a signed `state` for the `start` leg; `csrfToken` is the raw cookie value, only its hash enters the payload. Expires after 10 minutes. */
export function signConnectState(
  params: { provider: ConnectProvider; userId: string; csrfToken: string },
  secret: string,
): string {
  const now = Date.now();
  const payload: ConnectStatePayload = {
    intent: 'connect',
    provider: params.provider,
    userId: params.userId,
    csrf: hashCsrfToken(params.csrfToken),
    iat: now,
    exp: now + STATE_TTL_MS,
  };
  const payloadB64 = base64url(JSON.stringify(payload));
  const mac = sign(payloadB64, secret);
  return `${payloadB64}.${mac}`;
}

/** Raised by {@link verifyConnectState} for any invalid state. */
export class InvalidStateError extends Error {}

/** Verifies signature, expiry, provider match, and CSRF cookie binding. Throws InvalidStateError on any failure. */
export function verifyConnectState(
  state: string,
  expectedProvider: ConnectProvider,
  csrfCookieValue: string | undefined,
  secret: string,
): ConnectStatePayload {
  const parts = state.split('.');
  if (parts.length !== 2) {
    throw new InvalidStateError('Malformed state.');
  }
  const [payloadB64, mac] = parts;
  const expectedMac = sign(payloadB64, secret);
  if (!timingSafeEqualStrings(mac, expectedMac)) {
    throw new InvalidStateError('Bad signature.');
  }

  let payload: ConnectStatePayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as ConnectStatePayload;
  } catch {
    throw new InvalidStateError('Malformed state payload.');
  }

  if (payload.intent !== 'connect' || payload.provider !== expectedProvider) {
    throw new InvalidStateError('Intent/provider mismatch.');
  }
  if (typeof payload.exp !== 'number' || Date.now() > payload.exp) {
    throw new InvalidStateError('Expired state.');
  }
  if (!csrfCookieValue || hashCsrfToken(csrfCookieValue) !== payload.csrf) {
    throw new InvalidStateError('CSRF cookie mismatch.');
  }

  return payload;
}

function sign(payloadB64: string, secret: string): string {
  return base64url(createHmac('sha256', secret).update(payloadB64).digest());
}

function hashCsrfToken(raw: string): string {
  return createHash('sha256').update(raw).digest('base64url');
}

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url');
}

function timingSafeEqualStrings(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}
