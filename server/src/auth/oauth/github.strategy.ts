// docs/Architecture.md §5.1: GitHub login, `passport-github2`, scopes `read:user user:email`.

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, type Profile } from 'passport-github2';
import type { NormalizedOAuthProfile } from './normalized-profile.js';

type GitHubEmail = { value: string; primary?: boolean; verified?: boolean };

@Injectable()
export class GithubStrategy extends PassportStrategy(Strategy, 'github') {
  constructor(config: ConfigService) {
    super({
      clientID: config.get<string>('GITHUB_CLIENT_ID') ?? 'unset-github-client-id',
      clientSecret: config.get<string>('GITHUB_CLIENT_SECRET') ?? 'unset-github-client-secret',
      callbackURL: `${config.getOrThrow<string>('APP_URL')}/api/oauth/github/callback`,
      scope: ['read:user', 'user:email'],
      // Keeps the `verified` flag per email instead of collapsing to just the primary value —
      // required to implement the auto-link rule (Architecture §5.1).
      allRawEmails: true,
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: (err: unknown, profile?: NormalizedOAuthProfile) => void,
  ): void {
    const emails = (profile.emails ?? []) as unknown as GitHubEmail[];
    const primary = emails.find((e) => e.primary) ?? emails[0];

    done(null, {
      provider: 'GITHUB',
      providerUserId: profile.id,
      email: primary?.value ?? null,
      emailVerified: Boolean(primary?.verified),
    });
  }
}
