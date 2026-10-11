// Best-effort provider-side token revocation on disconnect — see
// docs/Architecture.md §8.3 ("Disconnecting ... revokes the token at the
// provider where an API allows it"). Steam has no token to revoke.

import { ConfigService } from '@nestjs/config';
import { githubConnectClient } from './strategies/github-connect.strategy.js';

/** Decrypted tokens of a connection being revoked; either may be absent. */
export interface RevocableTokens {
  accessToken: string | null;
  refreshToken: string | null;
}

/**
 * Revoke a connection's token at its provider: GitHub's grant by access token, Google by refresh token
 * (revoking it also invalidates its access tokens; the access token is used only when no refresh token exists).
 *
 * A no-op for Steam, unknown services or a missing token.
 * Never throws: network and provider errors are swallowed, and the response status is not checked.
 */
export async function revokeAtProvider(
  service: string,
  { accessToken, refreshToken }: RevocableTokens,
  config: ConfigService,
): Promise<void> {
  const googleToken = refreshToken ?? accessToken;

  try {
    if (service === 'github') {
      if (!accessToken) return;
      const { clientID: clientId, clientSecret } = githubConnectClient(config);
      if (!clientId || !clientSecret) return;
      await fetch(`https://api.github.com/applications/${clientId}/grant`, {
        method: 'DELETE',
        headers: {
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ access_token: accessToken }),
      });
    } else if (service === 'youtube') {
      if (!googleToken) return;
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(googleToken)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
    }
    // steam: no token issued, nothing to revoke.
  } catch {
    // Best-effort: disconnect must still succeed locally even if the provider call fails.
  }
}
