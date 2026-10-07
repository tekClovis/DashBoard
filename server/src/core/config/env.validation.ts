// Required env vars, validated at boot — see docs/Architecture.md §11.
// The server refuses to start without JWT_SECRET and a 32-byte TOKEN_ENC_KEY.

import { plainToInstance } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, IsUrl, Max, Min, validateSync } from 'class-validator';

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

/**
 * Validate and coerce the raw environment for `ConfigModule`.
 * @returns The typed config, with defaults applied.
 * @throws {@link Error} when a field fails validation or `TOKEN_ENC_KEY` does not decode to 32 bytes.
 */
export function validate(config: Record<string, unknown>): EnvironmentVariables {
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
