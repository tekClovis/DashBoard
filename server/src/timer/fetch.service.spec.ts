import { describe, expect, it, vi } from 'vitest';
import type { FetchContext, Params, WidgetDefinition } from '../catalog/widget-definition.js';
import type { PrismaService } from '../core/prisma/prisma.service.js';
import type { TokenCipherService } from '../connections/token-cipher.service.js';
import { FetchService } from './fetch.service.js';
import { makeFakeRedis, makeWidgetDefinition as makeDef } from './test-helpers.js';

function makePrisma(
  connection: { id: string; accessTokenEnc: string | null; externalAccountId?: string } | null = null,
): PrismaService {
  return {
    serviceConnection: { findUnique: vi.fn(async () => connection) },
  } as unknown as PrismaService;
}

function makeCipher(decrypted = 'decrypted-token'): TokenCipherService {
  return { decrypt: vi.fn(() => decrypted) } as unknown as TokenCipherService;
}

describe('FetchService', () => {
  it('calls def.fetch() on a cache miss and caches the result', async () => {
    const redis = makeFakeRedis();
    const def = makeDef();
    const service = new FetchService(redis, makePrisma(), makeCipher());

    const params: Params = { label: 'x' };
    const result = await service.get(def, params, 'user-1');

    expect(result.data).toEqual({ ok: true });
    expect(def.fetch).toHaveBeenCalledTimes(1);
    expect(redis.set).toHaveBeenCalledWith(
      expect.stringContaining('widget:fake.echo:'),
      JSON.stringify({ data: { ok: true }, fetchedAt: result.fetchedAt }),
      'EX',
      60,
    );
  });

  it('reports the original fetch time, not now, on a cache hit', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
      const service = new FetchService(makeFakeRedis(), makePrisma(), makeCipher());
      const def = makeDef();

      const first = await service.get(def, { label: 'x' }, 'user-1');
      vi.setSystemTime(new Date('2026-01-01T00:00:30.000Z'));
      const second = await service.get(def, { label: 'x' }, 'user-1');

      expect(first.fetchedAt).toBe('2026-01-01T00:00:00.000Z');
      expect(second.fetchedAt).toBe('2026-01-01T00:00:00.000Z');
      expect(second.data).toEqual({ ok: true });
      expect(def.fetch).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('serves from Redis on a cache hit, without calling def.fetch() again', async () => {
    const redis = makeFakeRedis();
    const def = makeDef();
    const service = new FetchService(redis, makePrisma(), makeCipher());
    const params: Params = { label: 'x' };

    await service.get(def, params, 'user-1');
    await service.get(def, params, 'user-1');

    expect(def.fetch).toHaveBeenCalledTimes(1);
  });

  it('dedupes two concurrent calls for the same key into one def.fetch() call', async () => {
    const redis = makeFakeRedis();
    let resolveFetch!: (v: { ok: boolean }) => void;
    const def = makeDef({
      fetch: vi.fn(() => new Promise((resolve) => (resolveFetch = resolve))) as unknown as WidgetDefinition<never>['fetch'],
    });
    const service = new FetchService(redis, makePrisma(), makeCipher());
    const params: Params = { label: 'x' };

    const first = service.get(def, params, 'user-1');
    const second = service.get(def, params, 'user-1');
    await vi.waitFor(() => expect(def.fetch).toHaveBeenCalled());
    resolveFetch({ ok: true });

    const [a, b] = await Promise.all([first, second]);
    expect(a).toEqual(b);
    expect(a.data).toEqual({ ok: true });
    expect(def.fetch).toHaveBeenCalledTimes(1);
  });

  it('throws NOT_CONNECTED for an auth:"connection" widget with no ServiceConnection row', async () => {
    const redis = makeFakeRedis();
    const def = makeDef({ auth: 'connection' });
    const service = new FetchService(redis, makePrisma(null), makeCipher());

    await expect(service.get(def, { label: 'x' }, 'user-1')).rejects.toMatchObject({ code: 'NOT_CONNECTED' });
    expect(def.fetch).not.toHaveBeenCalled();
  });

  it('decrypts the connection token into FetchContext and appends :conn:{connectionId}', async () => {
    const redis = makeFakeRedis();
    let receivedCtx: FetchContext | undefined;
    const def = makeDef({
      auth: 'connection',
      fetch: vi.fn(async (_params, ctx) => {
        receivedCtx = ctx;
        return { ok: true } as never;
      }),
    });
    const service = new FetchService(redis, makePrisma({ id: 'conn-1', accessTokenEnc: 'enc', externalAccountId: 'ext-1' }), makeCipher('plain-token'));

    await service.get(def, { label: 'x' }, 'user-1');

    expect(receivedCtx).toEqual({ userId: 'user-1', accessToken: 'plain-token', externalAccountId: 'ext-1' });
    expect(redis.set).toHaveBeenCalledWith(expect.stringContaining(':conn:conn-1'), expect.any(String), 'EX', 60);
  });

  it('gives two different connections different cache keys, never sharing data', async () => {
    const redis = makeFakeRedis();
    const defA = makeDef({ auth: 'connection', fetch: vi.fn(async () => ({ who: 'a' }) as never) });
    const defB = makeDef({ auth: 'connection', fetch: vi.fn(async () => ({ who: 'b' }) as never) });
    const serviceA = new FetchService(redis, makePrisma({ id: 'conn-a', accessTokenEnc: null }), makeCipher());
    const serviceB = new FetchService(redis, makePrisma({ id: 'conn-b', accessTokenEnc: null }), makeCipher());

    const resultA = await serviceA.get(defA, { label: 'x' }, 'user-a');
    const resultB = await serviceB.get(defB, { label: 'x' }, 'user-b');

    expect(resultA.data).toEqual({ who: 'a' });
    expect(resultB.data).toEqual({ who: 'b' });
  });
});
