import { Module } from '@nestjs/common';
import { AdminSeedService } from './admin-seed.service.js';
import { AuthController } from './auth.controller.js';
import { IdentitiesController } from './identities.controller.js';
import { JwtGuard } from './jwt.guard.js';
import { JwtService } from './jwt.service.js';
import { GithubStrategy } from './oauth/github.strategy.js';
import { GoogleStrategy } from './oauth/google.strategy.js';
import { OAuthLoginService } from './oauth/oauth-login.service.js';
import { TokenRevocationService } from './token-revocation.service.js';
import { VerificationService } from './verification.service.js';

// The `oauth/` start/callback routes live in OAuthModule, not here — it needs both this
// module's exports and ConnectionsModule's, and importing ConnectionsModule from here
// would create AuthModule <-> ConnectionsModule circular imports (ConnectionsController
// needs JwtGuard). GithubStrategy/GoogleStrategy still live here since they self-register
// into passport on instantiation and OAuthLoginService is theirs to own; OAuthModule just
// imports this module to reach them.
// AuthController.register() creates the signup user's default Dashboard by writing the
// `dashboard` row directly inside the same transaction as the `user` row, rather than depending
// on DashboardsService — DashboardsModule
// imports CatalogModule, which imports this module, so a static import of DashboardsModule here
// would close AuthModule -> DashboardsModule -> CatalogModule -> AuthModule into a real circular
// import (forwardRef only defers Nest's own DI resolution, not the underlying ES module load
// order, so it doesn't fix this one).
@Module({
  controllers: [AuthController, IdentitiesController],
  providers: [
    VerificationService,
    JwtService,
    JwtGuard,
    AdminSeedService,
    TokenRevocationService,
    GithubStrategy,
    GoogleStrategy,
    OAuthLoginService,
  ],
  exports: [JwtService, JwtGuard, TokenRevocationService, OAuthLoginService],
})
export class AuthModule {}
