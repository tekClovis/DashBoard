import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

/** Injection token for the shared ioredis client. */
export const REDIS = Symbol('REDIS');

/** Creates the ioredis client from `REDIS_URL`; closed by {@link CoreModule}. */
export const redisProvider: Provider = {
  provide: REDIS,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => new Redis(config.getOrThrow<string>('REDIS_URL')),
};
