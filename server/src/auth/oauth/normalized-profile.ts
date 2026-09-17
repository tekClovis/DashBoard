import type { AuthProvider } from '../../generated/prisma/client.js';

/** What both strategies normalize their provider's profile down to. */
export interface NormalizedOAuthProfile {
  provider: AuthProvider;
  providerUserId: string;
  email: string | null;
  emailVerified: boolean;
}
