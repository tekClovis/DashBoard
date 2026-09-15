import { Global, Inject, Module, OnModuleDestroy } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { MailService } from './mail/mail.service.js';
import { PrismaService } from './prisma/prisma.service.js';
import { REDIS, redisProvider } from './redis/redis.provider.js';

/**
 * Config, Prisma, Redis, and Mail — everything else in the app reads these
 * without re-importing. See docs/Architecture.md §2.
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
