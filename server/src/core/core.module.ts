import { Global, Inject, Module, OnModuleDestroy } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { MailService } from './mail/mail.service.js';
import { PrismaService } from './prisma/prisma.service.js';
import { REDIS, redisProvider } from './redis/redis.provider.js';
import { SessionService } from './session/session.service.js';

/**
 * Config, Prisma, Redis, Mail, and the session-cookie reader — everything
 * else in the app reads these without re-importing. See docs/Architecture.md
 * §2. (`SessionService` is a temporary stand-in for `auth-session`'s
 * `JwtGuard` — see its own file comment.)
 */
@Global()
@Module({
  providers: [PrismaService, redisProvider, MailService, SessionService],
  exports: [PrismaService, REDIS, MailService, SessionService],
})
export class CoreModule implements OnModuleDestroy {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }
}
