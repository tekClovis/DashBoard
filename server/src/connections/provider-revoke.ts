// Best-effort provider-side token revocation on disconnect — see
// docs/Architecture.md §5.2 ("Disconnecting ... revokes the token at the
// provider where an API allows it"). Steam has no token to revoke.

import { ConfigService } from '@nestjs/config';
import { githubConnectClient } from './strategies/github-connect.strategy.js';

/**
 * Revoke an access token at its provider (GitHub, Google for `youtube`).
 *
 * A no-op for Steam, unknown services or a missing token.
 * Never throws: network and provider errors are swallowed, and the response status is not checked.
 */
export async function revokeAtProvider(
  service: string,
  accessToken: string | null,
  config: ConfigService,
): Promise<void> {
  if (!accessToken) return;

  try {
    if (service === 'github') {
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
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(accessToken)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
    }
    // steam: no token issued, nothing to revoke.
  } catch {
    // Best-effort: disconnect must still succeed locally even if the provider call fails.
  }
}
