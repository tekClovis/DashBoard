import { BadGatewayException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants.js';
import { Reflector } from '@nestjs/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JwtGuard } from '../../auth/jwt.guard.js';
import { SteamController } from './steam.controller.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SteamController', () => {
  it('is protected by JwtGuard', () => {
    expect(new Reflector().get(GUARDS_METADATA, SteamController)).toEqual([JwtGuard]);
  });

  it('wraps the candidates in { results }', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ items: [{ id: 620, name: 'Portal 2', tiny_image: 'https://x/620.jpg' }] })),
    );

    await expect(new SteamController().search('portal')).resolves.toEqual({
      results: [{ appId: 620, name: 'Portal 2', image: 'https://x/620.jpg' }],
    });
  });

  it('answers a missing query with an empty list, not an error', async () => {
    await expect(new SteamController().search(undefined)).resolves.toEqual({ results: [] });
  });

  it('maps an upstream failure to 502', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({}, { status: 500 })));

    await expect(new SteamController().search('portal')).rejects.toBeInstanceOf(BadGatewayException);
  });
});
