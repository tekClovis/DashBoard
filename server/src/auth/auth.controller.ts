import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import type { Request } from 'express';
import type { Redis } from 'ioredis';
import { clientAddress } from '../core/http/client-address.js';
import { MailService } from '../core/mail/mail.service.js';
import { PrismaService } from '../core/prisma/prisma.service.js';
import { REDIS } from '../core/redis/redis.provider.js';
import { RegisterDto } from './dto/register.dto.js';
import { ResendDto } from './dto/resend.dto.js';
import { VerificationService } from './verification.service.js';

const BCRYPT_COST = 12;

/** POST /api/auth/register, GET /api/auth/confirm, POST /api/auth/resend — see docs/auth/specs.md. */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly verification: VerificationService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  @Post('register')
  @HttpCode(201)
  async register(@Body() dto: RegisterDto, @Req() req: Request): Promise<{ ok: true }> {
    await this.enforceRateLimit(`register:${clientAddress(req)}`, 5, 3600);

    const email = normalizeEmail(dto.email);
    const existing = await this.prisma.user.findUnique({ where: { email } });

    if (existing) {
      if (existing.emailVerifiedAt || existing.passwordHash === null) {
        throw new ConflictException({ error: 'EMAIL_IN_USE' });
      }
      await this.issueAndSend(existing.id, email);
      return { ok: true };
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_COST);
    const user = await this.prisma.user.create({ data: { email, passwordHash } });
    await this.issueAndSend(user.id, email);

    return { ok: true };
  }

  @Get('confirm')
  async confirm(@Query('token') token: string | undefined, @Req() req: Request): Promise<{ ok: true }> {
    await this.enforceRateLimit(`confirm:${clientAddress(req)}`, 20, 3600);
    await this.verification.confirm(token ?? '');
    return { ok: true };
  }

  @Post('resend')
  @HttpCode(200)
  async resend(@Body() dto: ResendDto): Promise<{ ok: true }> {
    const email = normalizeEmail(dto.email);

    const [withinShortLimit, withinDailyLimit] = await Promise.all([
      this.checkRateLimit(`verify:resend:${email}`, 1, 60),
      this.checkRateLimit(`verify:resend:daily:${email}`, 5, 86400),
    ]);

    if (withinShortLimit && withinDailyLimit) {
      const user = await this.prisma.user.findUnique({ where: { email } });
      if (user && !user.emailVerifiedAt) {
        await this.issueAndSend(user.id, email);
      }
    }

    return { ok: true };
  }

  private async issueAndSend(userId: string, email: string): Promise<void> {
    const token = await this.verification.issueToken(userId);
    const appUrl = this.config.getOrThrow<string>('APP_URL');
    await this.mail.sendConfirmationEmail(email, `${appUrl}/confirm?token=${token}`);
  }

  /** Throws 429 on breach. */
  private async enforceRateLimit(key: string, limit: number, windowSec: number): Promise<void> {
    const allowed = await this.checkRateLimit(key, limit, windowSec);
    if (!allowed) {
      throw new HttpException('Too Many Requests', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  /** Increments the window counter and reports whether it's still within limit. */
  private async checkRateLimit(key: string, limit: number, windowSec: number): Promise<boolean> {
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, windowSec);
    }
    return count <= limit;
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
