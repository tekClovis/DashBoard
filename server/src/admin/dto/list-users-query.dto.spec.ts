import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { ListUsersQueryDto } from './list-users-query.dto.js';

// Same options as the global pipe in main.ts.
const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });

function parse(query: Record<string, string>): Promise<ListUsersQueryDto> {
  return pipe.transform(query, { type: 'query', metatype: ListUsersQueryDto });
}

describe('ListUsersQueryDto', () => {
  it('defaults to page 1 of 20 with no search', async () => {
    const dto = await parse({});

    expect(dto).toBeInstanceOf(ListUsersQueryDto);
    expect(dto).toMatchObject({ page: 1, pageSize: 20 });
    expect(dto.q).toBeUndefined();
  });

  it('converts query-string numbers and accepts the bounds', async () => {
    expect(await parse({ q: 'bob', page: '1', pageSize: '100' })).toMatchObject({ q: 'bob', page: 1, pageSize: 100 });
    expect(await parse({ page: '7', pageSize: '1' })).toMatchObject({ page: 7, pageSize: 1 });
  });

  it.each([
    ['page', '0'],
    ['page', '-1'],
    ['page', '1.5'],
    ['page', 'abc'],
    ['pageSize', '0'],
    ['pageSize', '101'],
    ['pageSize', '2.5'],
  ])('rejects %s=%s', async (field, value) => {
    await expect(parse({ [field]: value })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts a 200-char search and rejects 201', async () => {
    await expect(parse({ q: 'x'.repeat(200) })).resolves.toMatchObject({ q: 'x'.repeat(200) });
    await expect(parse({ q: 'x'.repeat(201) })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an unknown query parameter', async () => {
    await expect(parse({ sort: 'email' })).rejects.toBeInstanceOf(BadRequestException);
  });
});
