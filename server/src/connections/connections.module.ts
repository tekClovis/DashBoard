import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ConnectionsController } from './connections.controller.js';
import { ConnectionsService } from './connections.service.js';
import { GithubConnectStrategy } from './strategies/github-connect.strategy.js';
import { GoogleConnectStrategy } from './strategies/google-connect.strategy.js';
import { SteamConnectStrategy } from './strategies/steam-connect.strategy.js';
import { TokenCipherService } from './token-cipher.service.js';

// Widget-credential "connect" flow — see docs/Architecture.md §8.3 and
// features/connections-api/spec.md. The `connect` OAuth/OpenID start/callback routes
// themselves live in OAuthModule — see docs/Architecture.md §8.3's "one callback per
// provider, serves both login and connect" — this module only owns ServiceConnection CRUD
// (behind AuthModule's JwtGuard) and the connect-scoped passport strategies (which
// self-register into passport on instantiation regardless of who injects them).
@Module({
  imports: [AuthModule],
  controllers: [ConnectionsController],
  providers: [
    ConnectionsService,
    TokenCipherService,
    GithubConnectStrategy,
    GoogleConnectStrategy,
    SteamConnectStrategy,
  ],
  exports: [ConnectionsService],
})
export class ConnectionsModule {}
