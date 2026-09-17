// Best-effort provider-side token revocation on disconnect — see
// docs/Architecture.md §5.2 ("Disconnecting ... revokes the token at the
// provider where an API allows it"). Steam has no token to revoke.

import { ConfigService } from '@nestjs/config';

export async function revokeAtProvider(
  service: string,
  accessToken: string | null,
  config: ConfigService,
): Promise<void> {
  if (!accessToken) return;

  try {
    if (service === 'github') {
      const clientId = config.get<string>('GITHUB_CLIENT_ID');
      const clientSecret = config.get<string>('GITHUB_CLIENT_SECRET');
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
