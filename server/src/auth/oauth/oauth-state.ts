// OAuth `state` param for the `login`/`link` intents — see docs/Architecture.md §8.3: "The
// intent (`login` | `link` | `connect`) travels in `state`: an HMAC-signed, 10-minute value that is also
// bound to a short-lived cookie." `connect`'s own state (with its own CSRF-cookie binding,
// needed for Steam's OpenID round trip, which can't echo an arbitrary `state` query param)
// lives in ../../connections/oauth-state.js and is verified separately by oauth.guard.ts —
// this module's `OAuthIntent` still enumerates `connect` since the *start* leg's `?intent=`
// query parsing (oauth.guard.ts's `getIntent`) is shared across all three intents.
//
// `link` is this feature's own intent (authenticated identity-linking): it additionally
// binds the state to the currently-logged-in user's id at the start leg, so the callback
// can attach the verified provider identity to that exact user instead of trusting
// anything client-supplied.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export type OAuthIntent = 'login' | 'connect' | 'link';
export type OAuthProviderSlug = 'github' | 'google';

export type OAuthStatePayload =
  | { intent: 'login'; provider: OAuthProviderSlug }
  | { intent: 'link'; provider: OAuthProviderSlug; userId: string };

const TTL_MS = 10 * 60 * 1000;
export const OAUTH_STATE_COOKIE = 'oauth_state';

type SignedBody = OAuthStatePayload & { nonce: string; exp: number };

/** Produces the opaque `state` query-param value: base64url(payload).base64url(hmac). */
export function signOAuthState(payload: OAuthStatePayload, secret: string): string {
  const body: SignedBody = {
    ...payload,
    nonce: randomBytes(16).toString('base64url'),
    exp: Date.now() + TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(body)).toString('base64url');
  const signature = createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

/** Verifies signature + expiry. Throws on any tamper/expiry/shape mismatch. */
export function verifyOAuthState(token: string, secret: string): OAuthStatePayload {
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) {
    throw new Error('INVALID_STATE');
  }

  const expected = createHmac('sha256', secret).update(encoded).digest('base64url');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error('INVALID_STATE');
  }

  const body = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SignedBody;
  if (typeof body.exp !== 'number' || body.exp < Date.now()) {
    throw new Error('STATE_EXPIRED');
  }
  if (body.provider !== 'github' && body.provider !== 'google') {
    throw new Error('INVALID_STATE');
  }

  if (body.intent === 'link') {
    if (typeof body.userId !== 'string' || body.userId.length === 0) {
      throw new Error('INVALID_STATE');
    }
    return { intent: 'link', provider: body.provider, userId: body.userId };
  }
  if (body.intent !== 'login') {
    throw new Error('INVALID_STATE');
  }

  return { intent: 'login', provider: body.provider };
}

/**
 * Full callback-leg check: the `state` query value must both verify (signature + expiry)
 * and match byte-for-byte the value stashed in the short-lived cookie set on the start leg.
 * This binding is what makes the state CSRF-resistant — an attacker who only sees the
 * redirect URL (state included) still lacks the httpOnly cookie.
 */
export function assertBoundState(
  queryState: string | undefined,
  cookieState: string | undefined,
  secret: string,
): OAuthStatePayload {
  if (!queryState || !cookieState || queryState !== cookieState) {
    throw new Error('INVALID_STATE');
  }
  return verifyOAuthState(queryState, secret);
}
