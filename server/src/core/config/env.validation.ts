// Required env vars, validated at boot — see docs/Architecture.md §8.6.
// A missing JWT_SECRET or TOKEN_ENC_KEY is generated for this run (with a warning) so a fresh
// clone boots without a .env; a TOKEN_ENC_KEY that is set must still be 32 bytes.

import { randomBytes } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, IsUrl, Max, Min, ValidateIf, validateSync } from 'class-validator';

/** Shape of the environment the server accepts; optional fields have defaults or disable a feature. */
export class EnvironmentVariables {
  @IsUrl({ require_tld: false })
  APP_URL!: string;

  @IsString()
  DATABASE_URL!: string;

  @IsString()
  REDIS_URL!: string;

  @IsString()
  @IsNotEmpty()
  JWT_SECRET!: string;

  @IsString()
  TOKEN_ENC_KEY!: string;

  @IsString()
  @IsOptional()
  SMTP_HOST: string = 'mailpit';

  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  SMTP_PORT: number = 1025;

  @IsString()
  @IsOptional()
  SMTP_FROM: string = 'Dashboard <no-reply@dashboard.local>';

  /** SMTP login; leave empty for an unauthenticated relay such as Mailpit. */
  @IsString()
  @IsOptional()
  SMTP_USER?: string;

  /** Required when `SMTP_USER` is set. */
  @ValidateIf((env: EnvironmentVariables) => Boolean(env.SMTP_USER))
  @IsString()
  @IsNotEmpty()
  SMTP_PASS?: string;

  /** `'true'` for implicit TLS (port 465); anything else upgrades with STARTTLS when offered. */
  @IsString()
  @IsOptional()
  SMTP_SECURE?: string;

  @IsString()
  @IsOptional()
  ADMIN_EMAIL?: string;

  @IsString()
  @IsOptional()
  ADMIN_PASSWORD?: string;

  @IsString()
  @IsOptional()
  GITHUB_CLIENT_ID?: string;

  @IsString()
  @IsOptional()
  GITHUB_CLIENT_SECRET?: string;

  @IsString()
  @IsOptional()
  STEAM_API_KEY?: string;

  @IsString()
  @IsOptional()
  GOOGLE_CLIENT_ID?: string;

  @IsString()
  @IsOptional()
  GOOGLE_CLIENT_SECRET?: string;
}

/** Secrets generated when unset: sessions and encrypted tokens do not survive a restart. */
const GENERATED_SECRETS: Record<'JWT_SECRET' | 'TOKEN_ENC_KEY', () => string> = {
  JWT_SECRET: () => randomBytes(32).toString('hex'),
  TOKEN_ENC_KEY: () => randomBytes(32).toString('base64'),
};

/**
 * Validate and coerce the raw environment for `ConfigModule`.
 * @returns The typed config, with defaults applied and any unset secret generated (with a warning).
 * @throws {@link Error} when a field fails validation or `TOKEN_ENC_KEY` does not decode to 32 bytes.
 */
export function validate(rawConfig: Record<string, unknown>): EnvironmentVariables {
  const config = { ...rawConfig };
  for (const [name, generate] of Object.entries(GENERATED_SECRETS)) {
    if (config[name]) continue;
    config[name] = generate();
    new Logger('Env').warn(
      `${name} is not set: generated one for this run. Sessions and stored tokens will not survive a restart; set ${name} in .env.`,
    );
  }

  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    throw new Error(`Invalid environment configuration:\n${errors.toString()}`);
  }

  const keyBytes = Buffer.from(validated.TOKEN_ENC_KEY, 'base64');
  if (keyBytes.length !== 32) {
    throw new Error('TOKEN_ENC_KEY must be 32 bytes, base64-encoded (e.g. `openssl rand -base64 32`).');
  }

  return validated;
}
