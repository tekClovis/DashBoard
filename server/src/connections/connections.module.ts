import { Module } from '@nestjs/common';
import { ConnectionsController } from './connections.controller.js';
import { ConnectionsService } from './connections.service.js';
import { OAuthController } from './oauth.controller.js';
import { GithubConnectStrategy } from './strategies/github-connect.strategy.js';
import { GoogleConnectStrategy } from './strategies/google-connect.strategy.js';
import { SteamConnectStrategy } from './strategies/steam-connect.strategy.js';
import { TokenCipherService } from './token-cipher.service.js';

// Widget-credential "connect" flow — see docs/Architecture.md §5.2 and
// features/connections-api/spec.md.
@Module({
  controllers: [ConnectionsController, OAuthController],
  providers: [
    ConnectionsService,
    TokenCipherService,
    GithubConnectStrategy,
    GoogleConnectStrategy,
    SteamConnectStrategy,
  ],
})
export class ConnectionsModule {}
