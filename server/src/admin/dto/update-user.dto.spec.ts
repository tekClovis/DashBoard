import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { UpdateUserDto } from './update-user.dto.js';

// Same options as the global pipe in main.ts.
const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });

function parse(body: Record<string, unknown>): Promise<UpdateUserDto> {
  return pipe.transform(body, { type: 'body', metatype: UpdateUserDto });
}

describe('UpdateUserDto', () => {
  it.each(['USER', 'ADMIN'])('accepts role %s', async (role) => {
    await expect(parse({ role })).resolves.toMatchObject({ role });
  });

  it.each(['admin', 'SUPERADMIN', '', 1])('rejects role %s', async (role) => {
    await expect(parse({ role })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts an ISO date ban and a null unban', async () => {
    await expect(parse({ bannedAt: '2026-09-30T12:00:00.000Z' })).resolves.toMatchObject({
      bannedAt: '2026-09-30T12:00:00.000Z',
    });
    await expect(parse({ bannedAt: null })).resolves.toMatchObject({ bannedAt: null });
  });

  it.each(['yesterday', '', true, 1727697600000])('rejects bannedAt %s', async (bannedAt) => {
    await expect(parse({ bannedAt })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects fields outside the DTO', async () => {
    await expect(parse({ email: 'x@y.z' })).rejects.toBeInstanceOf(BadRequestException);
  });
});
