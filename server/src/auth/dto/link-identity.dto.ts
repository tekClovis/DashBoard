import { IsString, MinLength } from 'class-validator';

/**
 * Body for POST /api/auth/identities/:provider — the caller has already completed the
 * provider's OAuth handshake (out of scope here; connections-api/frontend owns that UI)
 * and hands over the resulting provider account id to link to the current session's user.
 */
export class LinkIdentityDto {
  @IsString()
  @MinLength(1)
  providerUserId!: string;
}
