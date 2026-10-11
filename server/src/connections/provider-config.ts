// Which OAuth/OpenID providers have credentials — exposed to the web so it can disable the
// matching login and Connect buttons instead of sending the user to a dead handshake.

import type { ConfigService } from '@nestjs/config';
import { githubConnectClient } from './strategies/github-connect.strategy.js';
import { googleConnectClient } from './strategies/google-connect.strategy.js';

/** True when the login OAuth app (`GITHUB_CLIENT_ID`/`_SECRET` or `GOOGLE_CLIENT_ID`/`_SECRET`) has both values set and non-empty. */
export function loginProviderConfigured(config: ConfigService, provider: 'github' | 'google'): boolean {
  const prefix = provider.toUpperCase();
  return Boolean(config.get<string>(`${prefix}_CLIENT_ID`) && config.get<string>(`${prefix}_CLIENT_SECRET`));
}

/** True when the credentials the connect flow of `service` needs are set; services without a connect flow (weather) are always configured. */
export function connectServiceConfigured(config: ConfigService, service: string): boolean {
  switch (service) {
    case 'github': {
      const { clientID, clientSecret } = githubConnectClient(config);
      return Boolean(clientID && clientSecret);
    }
    case 'youtube': {
      const { clientID, clientSecret } = googleConnectClient(config);
      return Boolean(clientID && clientSecret);
    }
    case 'steam':
      return Boolean(config.get<string>('STEAM_API_KEY'));
    default:
      return true;
  }
}
