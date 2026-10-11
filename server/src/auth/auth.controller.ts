import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { MeResponse } from '@dashboard/shared';
import * as bcrypt from 'bcrypt';
import type { Request, Response } from 'express';
import type { Redis } from 'ioredis';
import { clientAddress } from '../core/http/client-address.js';
import { readCookie } from '../core/http/cookies.js';
import { MailService } from '../core/mail/mail.service.js';
import { PrismaService } from '../core/prisma/prisma.service.js';
import { REDIS } from '../core/redis/redis.provider.js';
import { DEFAULT_DASHBOARD_NAME, DEFAULT_DASHBOARD_POSITION } from '../dashboards/dashboards.service.js';
import { CurrentUser } from './current-user.decorator.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { ResendDto } from './dto/resend.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { JwtGuard } from './jwt.guard.js';
import { JwtService } from './jwt.service.js';
import { PasswordResetService } from './password-reset.service.js';
import { clearSessionCookie, setSessionCookie } from './session-cookie.js';
import { SESSION_COOKIE } from './session.constants.js';
import { TokenRevocationService } from './token-revocation.service.js';
import type { RequestUser } from './types.js';
import { VerificationService } from './verification.service.js';

const BCRYPT_COST = 12;

/** Compared against when the account is unknown or has no password, so login takes the same time either way. */
const DUMMY_PASSWORD_HASH = bcrypt.hash('dummy-password-for-timing-only', BCRYPT_COST);

/** Email/password auth routes under `/api/auth`: register, confirm, resend, forgot/reset-password, login, me, logout, logout-all. */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly verification: VerificationService,
    private readonly passwordReset: PasswordResetService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly revocation: TokenRevocationService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /**
   * Creates an unverified user with its default Dashboard and mails a confirmation link.
   * Always answers the same 201 body, so it never reveals whether the email is new, unverified or verified.
   * An existing unverified account only gets its confirmation resent; its password is never overwritten.
   */
  @Post('register')
  @HttpCode(201)
  async register(@Body() dto: RegisterDto, @Req() req: Request): Promise<{ ok: true }> {
    await this.enforceRateLimit(`register:${clientAddress(req)}`, 5, 3600);

    const email = normalizeEmail(dto.email);
    const existing = await this.prisma.user.findUnique({ where: { email } });

    if (existing) {
      if (!existing.emailVerifiedAt && existing.passwordHash !== null) {
        await this.issueAndSend(existing.id, email);
      }
      return { ok: true };
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_COST);
    // Default Dashboard created atomically with the User row here — see AuthModule's comment on
    // why DashboardsService.createDefault isn't used.
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({ data: { email, passwordHash } });
      await tx.dashboard.create({
        data: { userId: created.id, name: DEFAULT_DASHBOARD_NAME, position: DEFAULT_DASHBOARD_POSITION },
      });
      return created;
    });
    await this.issueAndSend(user.id, email);

    return { ok: true };
  }

  @Get('confirm')
  async confirm(@Query('token') token: string | undefined, @Req() req: Request): Promise<{ ok: true }> {
    await this.enforceRateLimit(`confirm:${clientAddress(req)}`, 20, 3600);
    await this.verification.confirm(token ?? '');
    return { ok: true };
  }

  /** Always 200, whether or not the account exists or the rate limit was hit, so it reveals nothing. */
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

  /** Always 200 so the response never reveals whether an account exists. OAuth-only accounts get no mail. */
  @Post('forgot-password')
  @HttpCode(200)
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<{ ok: true }> {
    const email = normalizeEmail(dto.email);

    const [withinShortLimit, withinDailyLimit] = await Promise.all([
      this.checkRateLimit(`reset:request:${email}`, 1, 60),
      this.checkRateLimit(`reset:request:daily:${email}`, 5, 86400),
    ]);

    if (withinShortLimit && withinDailyLimit) {
      const user = await this.prisma.user.findUnique({ where: { email } });
      if (user?.passwordHash) {
        const token = await this.passwordReset.issueToken(user.id);
        const appUrl = this.config.getOrThrow<string>('APP_URL');
        await this.mail.sendPasswordResetEmail(email, `${appUrl}/reset-password?token=${token}`);
      }
    }

    return { ok: true };
  }

  @Post('reset-password')
  @HttpCode(200)
  async resetPassword(@Body() dto: ResetPasswordDto, @Req() req: Request): Promise<{ ok: true }> {
    await this.enforceRateLimit(`reset:confirm:${clientAddress(req)}`, 20, 3600);
    await this.passwordReset.reset(dto.token, await bcrypt.hash(dto.password, BCRYPT_COST));
    return { ok: true };
  }

  /**
   * Verifies credentials and sets the session cookie.
   * @throws {@link UnauthorizedException} with `INVALID_CREDENTIALS`; {@link ForbiddenException} with `EMAIL_NOT_CONFIRMED` or `ACCOUNT_BANNED`.
   */
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: true }> {
    await this.enforceRateLimit(`login:${clientAddress(req)}`, 10, 3600);

    const email = normalizeEmail(dto.email);
    const user = await this.prisma.user.findUnique({ where: { email } });

    const passwordMatches = await bcrypt.compare(dto.password, user?.passwordHash ?? (await DUMMY_PASSWORD_HASH));
    if (!user || !user.passwordHash || !passwordMatches) {
      throw new UnauthorizedException({ error: 'INVALID_CREDENTIALS' });
    }
    if (!user.emailVerifiedAt) {
      throw new ForbiddenException({ error: 'EMAIL_NOT_CONFIRMED' });
    }
    // After the password check so a ban isn't disclosed to someone without the credentials.
    if (user.bannedAt) {
      throw new ForbiddenException({ error: 'ACCOUNT_BANNED' });
    }

    const token = this.jwt.sign({ sub: user.id, role: user.role, tv: user.tokenVersion });
    setSessionCookie(res, this.config.getOrThrow<string>('APP_URL'), token);

    return { ok: true };
  }

  @Get('me')
  @UseGuards(JwtGuard)
  async me(@CurrentUser() user: RequestUser): Promise<MeResponse> {
    const [identities, fullUser] = await Promise.all([
      this.prisma.authIdentity.findMany({ where: { userId: user.id }, select: { provider: true } }),
      this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { passwordHash: true } }),
    ]);

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      emailVerifiedAt: user.emailVerifiedAt ? user.emailVerifiedAt.toISOString() : null,
      hasPassword: fullUser.passwordHash !== null,
      identities,
    };
  }

  /** Revokes this session's token only (by `jti`) and clears the cookie. */
  @Post('logout')
  @HttpCode(200)
  @UseGuards(JwtGuard)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<{ ok: true }> {
    const token = readCookie(req.headers.cookie, SESSION_COOKIE);
    const payload = token ? this.jwt.verify(token) : null;
    if (payload) {
      await this.revocation.revoke(payload.jti, payload.exp);
    }
    clearSessionCookie(res, this.config.getOrThrow<string>('APP_URL'));
    return { ok: true };
  }

  /** Invalidates every session of the user by bumping `tokenVersion`, and clears the cookie. */
  @Post('logout-all')
  @HttpCode(200)
  @UseGuards(JwtGuard)
  async logoutAll(
    @CurrentUser() user: RequestUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: true }> {
    await this.prisma.user.update({
      where: { id: user.id },
      data: { tokenVersion: { increment: 1 } },
    });
    clearSessionCookie(res, this.config.getOrThrow<string>('APP_URL'));
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
      throw new HttpException({ error: 'RATE_LIMITED' }, HttpStatus.TOO_MANY_REQUESTS);
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
