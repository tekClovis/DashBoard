import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS } from '../core/redis/redis.provider.js';

const REVOKED_JTI_PREFIX = 'auth:revoked-jti:';

/**
 * Per-token (jti) revocation for plain `logout`, distinct from `logout-all`'s
 * per-user `tokenVersion` bump — see docs/Architecture.md §5.1. Backed by
 * Redis (shared across instances) with a TTL matching the token's remaining
 * lifetime, so revoked entries expire on their own.
 */
@Injectable()
export class TokenRevocationService {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  /** Marks `jti` revoked until `expUnixSec`, the token's own expiry. */
  async revoke(jti: string, expUnixSec: number): Promise<void> {
    const ttlSec = expUnixSec - Math.floor(Date.now() / 1000);
    if (ttlSec <= 0) return;
    await this.redis.set(REVOKED_JTI_PREFIX + jti, '1', 'EX', ttlSec);
  }

  async isRevoked(jti: string): Promise<boolean> {
    return (await this.redis.exists(REVOKED_JTI_PREFIX + jti)) === 1;
  }
}
