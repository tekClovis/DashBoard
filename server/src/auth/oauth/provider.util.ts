import { BadRequestException } from '@nestjs/common';
import type { AuthProvider } from '../../generated/prisma/client.js';

/**
 * Maps a URL slug to its login {@link AuthProvider}, case-insensitively; only GitHub and Google are accepted.
 * @throws {@link BadRequestException} with `UNKNOWN_PROVIDER` for any other value.
 */
export function parseProviderSlug(raw: string): AuthProvider {
  const upper = raw.toUpperCase();
  if (upper === 'GITHUB' || upper === 'GOOGLE') return upper as AuthProvider;
  throw new BadRequestException({ error: 'UNKNOWN_PROVIDER' });
}
