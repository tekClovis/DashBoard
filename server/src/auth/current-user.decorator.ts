import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { RequestUser } from './types.js';

/** The `req.user` set by {@link JwtGuard}. Only valid behind that guard. */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): RequestUser => {
  const req = ctx.switchToHttp().getRequest<Request>();
  return req.user!;
});
