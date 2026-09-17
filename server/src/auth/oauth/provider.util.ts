import { BadRequestException } from '@nestjs/common';
import type { AuthProvider } from '../../generated/prisma/client.js';

export function parseProviderSlug(raw: string): AuthProvider {
  const upper = raw.toUpperCase();
  if (upper === 'GITHUB' || upper === 'GOOGLE') return upper as AuthProvider;
  throw new BadRequestException({ error: 'UNKNOWN_PROVIDER' });
}
