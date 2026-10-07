// Account-linking rules — docs/Architecture.md §5.1 "Account linking":
//   1. AuthIdentity(provider, providerUserId) match → log that user in.
//   2. Else a User with the same email exists → auto-link only if the provider's email is
//      verified AND the local user is confirmed; otherwise refuse.
//   3. Else refuse: OAuth never creates an account — register with email + password first.

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import type { User } from '../../generated/prisma/client.js';
import type { NormalizedOAuthProfile } from './normalized-profile.js';

/** Thrown for account-linking rule 2's refusal branch. Never mutates anything. */
export class OAuthLinkRefusedError extends Error {
  constructor() {
    super('An account with this email already exists. Log in with your password, then link from Profile.');
  }
}

/** Thrown for account-linking rule 3: no identity and no local account match. Never mutates anything. */
export class OAuthNoAccountError extends Error {
  constructor() {
    super('No account matches this provider. Register with your email first, then link from Profile.');
  }
}

/** Thrown when an authenticated `link` callback's provider identity already belongs to someone else. */
export class OAuthIdentityConflictError extends Error {
  constructor() {
    super('This provider account is already linked to a different user.');
  }
}

@Injectable()
export class OAuthLoginService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolves the user for a login-intent profile, auto-linking by email when the rules allow it.
   * @throws {@link OAuthLinkRefusedError} when the email matches a user but cannot be auto-linked.
   * @throws {@link OAuthNoAccountError} when nothing matches.
   */
  async loginOrLink(profile: NormalizedOAuthProfile): Promise<User> {
    const existingIdentity = await this.prisma.authIdentity.findUnique({
      where: { provider_providerUserId: { provider: profile.provider, providerUserId: profile.providerUserId } },
      include: { user: true },
    });
    if (existingIdentity) {
      return existingIdentity.user;
    }

    if (profile.email) {
      const existingUser = await this.prisma.user.findUnique({ where: { email: profile.email } });
      if (existingUser) {
        if (profile.emailVerified && existingUser.emailVerifiedAt) {
          await this.prisma.authIdentity.create({
            data: {
              userId: existingUser.id,
              provider: profile.provider,
              providerUserId: profile.providerUserId,
            },
          });
          return existingUser;
        }
        throw new OAuthLinkRefusedError();
      }
    }

    throw new OAuthNoAccountError();
  }

  /**
   * Attaches a verified provider identity (from a completed `link`-intent OAuth callback) to
   * the already-authenticated user id bound in the `state`. Never trusts a client-supplied
   * `providerUserId` — `profile` here always comes from the real provider handshake.
   * @throws {@link OAuthIdentityConflictError} when the identity belongs to another user.
   */
  async linkIdentity(userId: string, profile: NormalizedOAuthProfile): Promise<void> {
    const existing = await this.prisma.authIdentity.findUnique({
      where: { provider_providerUserId: { provider: profile.provider, providerUserId: profile.providerUserId } },
    });
    if (existing) {
      if (existing.userId === userId) return;
      throw new OAuthIdentityConflictError();
    }

    await this.prisma.authIdentity.create({
      data: { userId, provider: profile.provider, providerUserId: profile.providerUserId },
    });
  }
}
