import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Redis } from 'ioredis';
import { TokenRevocationService } from './token-revocation.service.js';

const NOW_MS = Date.UTC(2026, 0, 1);
const NOW_SEC = NOW_MS / 1000;

/** In-memory Redis stub for `SET key value EX ttl` / `EXISTS key` (timer/test-helpers' one has no `exists`). */
function makeFakeRedis() {
  const ttls = new Map<string, number>();
  const redis = {
    set: vi.fn(async (key: string, _value: string, _mode: 'EX', ttlSec: number) => {
      ttls.set(key, ttlSec);
      return 'OK';
    }),
    exists: vi.fn(async (key: string) => (ttls.has(key) ? 1 : 0)),
  };
  return { redis: redis as unknown as Redis, ttls };
}

describe('TokenRevocationService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW_MS);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports a revoked jti as revoked and leaves other jtis alone', async () => {
    const { redis } = makeFakeRedis();
    const service = new TokenRevocationService(redis);

    await service.revoke('jti-1', NOW_SEC + 60);

    await expect(service.isRevoked('jti-1')).resolves.toBe(true);
    await expect(service.isRevoked('jti-2')).resolves.toBe(false);
  });

  it('keeps the revocation only for the remaining lifetime of the token', async () => {
    const { redis, ttls } = makeFakeRedis();
    const service = new TokenRevocationService(redis);

    await service.revoke('jti-1', NOW_SEC + 90);

    expect([...ttls.values()]).toEqual([90]);
  });

  it.each([
    ['already expired', NOW_SEC - 1],
    ['expiring this very second', NOW_SEC],
  ])('stores nothing for a token %s', async (_label, exp) => {
    const { redis, ttls } = makeFakeRedis();
    const service = new TokenRevocationService(redis);

    await service.revoke('jti-1', exp);

    expect(ttls.size).toBe(0);
    await expect(service.isRevoked('jti-1')).resolves.toBe(false);
  });
});
