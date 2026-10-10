import { Module } from '@nestjs/common';
import { ConnectionsModule } from '../../connections/connections.module.js';
import { DashboardsModule } from '../../dashboards/dashboards.module.js';
import { AuthModule } from '../auth.module.js';
import { OAuthController } from './oauth.controller.js';
import { GithubOAuthGuard, GoogleOAuthGuard, SteamOAuthGuard } from './oauth.guard.js';

// Owns `/api/oauth/{provider}/{start,callback}` for all three intents (login, link,
// connect) — see docs/Architecture.md §8.3. Sits above AuthModule and ConnectionsModule
// rather than inside either, since OAuthController needs both (OAuthLoginService/JwtService
// from AuthModule, ConnectionsService from ConnectionsModule) and neither of those two
// modules needs the other.
@Module({
  imports: [AuthModule, ConnectionsModule, DashboardsModule],
  controllers: [OAuthController],
  providers: [GithubOAuthGuard, GoogleOAuthGuard, SteamOAuthGuard],
})
export class OAuthModule {}
