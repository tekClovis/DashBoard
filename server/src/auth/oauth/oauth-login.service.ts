// Account-linking rules — docs/Architecture.md §5.1 "Account linking":
//   1. AuthIdentity(provider, providerUserId) match → log that user in.
//   2. Else a User with the same email exists → auto-link only if the provider's email is
//      verified AND the local user is confirmed; otherwise refuse.
//   3. Else create a new verified User + AuthIdentity, then log in.

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

@Injectable()
export class OAuthLoginService {
  constructor(private readonly prisma: PrismaService) {}

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

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: profile.email ?? `${profile.provider.toLowerCase()}-${profile.providerUserId}@users.invalid`,
          emailVerifiedAt: new Date(),
        },
      });
      await tx.authIdentity.create({
        data: { userId: user.id, provider: profile.provider, providerUserId: profile.providerUserId },
      });
      return user;
    });
  }
}
