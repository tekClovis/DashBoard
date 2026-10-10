import { Controller, Delete, HttpCode, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { clearSessionCookie } from '../auth/session-cookie.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtGuard } from '../auth/jwt.guard.js';
import type { RequestUser } from '../auth/types.js';
import { UsersService } from './users.service.js';

@Controller('users')
@UseGuards(JwtGuard)
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly config: ConfigService,
  ) {}

  /** Delete the caller's account and clear their session cookie. */
  @Delete('me')
  @HttpCode(204)
  async deleteMe(@CurrentUser() user: RequestUser, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.users.deleteSelf(user);
    clearSessionCookie(res, this.config.getOrThrow<string>('APP_URL'));
  }
}
