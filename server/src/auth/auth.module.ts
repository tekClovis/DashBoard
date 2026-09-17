import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { IdentitiesController } from './identities.controller.js';
import { JwtGuard } from './jwt.guard.js';
import { GithubStrategy } from './oauth/github.strategy.js';
import { GoogleStrategy } from './oauth/google.strategy.js';
import { OAuthLoginService } from './oauth/oauth-login.service.js';
import { OAuthController } from './oauth/oauth.controller.js';
import { GithubOAuthGuard, GoogleOAuthGuard } from './oauth/oauth.guard.js';
import { VerificationService } from './verification.service.js';

@Module({
  controllers: [AuthController, OAuthController, IdentitiesController],
  providers: [
    VerificationService,
    JwtGuard,
    GithubStrategy,
    GoogleStrategy,
    GithubOAuthGuard,
    GoogleOAuthGuard,
    OAuthLoginService,
  ],
})
export class AuthModule {}
