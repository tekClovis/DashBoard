// Redis-backed fetch cache + in-flight dedupe — see docs/Architecture.md §8.5.
//
// FetchContext is the first real consumer of connections-api's token decryption: the
// access token is decrypted here, handed to def.fetch(), and never passed anywhere else.

import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import type { FetchContext, Params, WidgetDefinition } from '../catalog/widget-definition.js';
import { PrismaService } from '../core/prisma/prisma.service.js';
import { REDIS } from '../core/redis/redis.provider.js';
import { TokenCipherService } from '../connections/token-cipher.service.js';
import { widgetCacheKey } from './cache-key.js';
import { FetchError } from './fetch-error.js';

/** Fetches widget data through a Redis cache with in-flight dedupe. */
@Injectable()
export class FetchService {
  // Keyed by cache key, not instanceId, so two due instances with identical
  // (service, widget, params) and no connection scoping dedupe onto one upstream call.
  private readonly inFlight = new Map<string, Promise<unknown>>();

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly prisma: PrismaService,
    private readonly cipher: TokenCipherService,
  ) {}

  /**
   * Return the widget data from Redis if cached, else fetch it upstream and cache it for `def.minRefreshSec` seconds.
   * Concurrent calls with the same cache key share one fetch.
   * @throws {@link FetchError} with `NOT_CONNECTED` when the widget needs a connection the user lacks; errors from `def.fetch` propagate unchanged.
   */
  async get(def: WidgetDefinition, params: Params, userId: string): Promise<unknown> {
    if (def.auth === 'connection') {
      return this.getConnectionScoped(def, params, userId);
    }
    return this.dedupedFetch(widgetCacheKey(def.service, def.name, params), def, params, { userId });
  }

  private async getConnectionScoped(def: WidgetDefinition, params: Params, userId: string): Promise<unknown> {
    const connection = await this.prisma.serviceConnection.findUnique({
      where: { userId_service: { userId, service: def.service } },
    });
    if (!connection) {
      throw new FetchError('NOT_CONNECTED', `No ${def.service} connection for this user.`);
    }

    const key = widgetCacheKey(def.service, def.name, params, connection.id);
    const ctx: FetchContext = {
      userId,
      accessToken: connection.accessTokenEnc ? this.cipher.decrypt(connection.accessTokenEnc) : undefined,
      expiresAt: connection.expiresAt ?? undefined,
      externalAccountId: connection.externalAccountId,
    };
    return this.dedupedFetch(key, def, params, ctx);
  }

  /**
   * Synchronous up to the in-flight map read/write (no `await` before either), so two
   * back-to-back calls for the same key within one Timer tick reuse the same promise
   * instead of racing two upstream fetches.
   */
  private dedupedFetch(key: string, def: WidgetDefinition, params: Params, ctx: FetchContext): Promise<unknown> {
    const existing = this.inFlight.get(key);
    if (existing) return existing;

    const promise = this.fetchAndCache(key, def, params, ctx).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, promise);
    return promise;
  }

  private async fetchAndCache(key: string, def: WidgetDefinition, params: Params, ctx: FetchContext): Promise<unknown> {
    const cached = await this.redis.get(key);
    if (cached !== null) return JSON.parse(cached) as unknown;

    const data = await def.fetch(params, ctx);
    await this.redis.set(key, JSON.stringify(data), 'EX', def.minRefreshSec);
    return data;
  }
}
