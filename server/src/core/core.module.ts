import { Global, Inject, Module, OnModuleDestroy } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { MailService } from './mail/mail.service.js';
import { PrismaService } from './prisma/prisma.service.js';
import { REDIS, redisProvider } from './redis/redis.provider.js';

/**
 * Global module exposing {@link PrismaService}, the {@link REDIS} client and {@link MailService}.
 * Closes the Redis connection on shutdown.
 */
@Global()
@Module({
  providers: [PrismaService, redisProvider, MailService],
  exports: [PrismaService, REDIS, MailService],
})
export class CoreModule implements OnModuleDestroy {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }
}
