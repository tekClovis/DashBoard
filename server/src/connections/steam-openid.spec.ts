import type { ConfigService } from '@nestjs/config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SteamOpenIdError, SteamOpenIdService } from './steam-openid.js';

const APP_URL = 'http://localhost:8080';
const NONCE = 'nonce-123';
const STEAM_ID = '76561198000000000';

function makeService() {
  const used = new Set<string>();
  const redis = {
    set: vi.fn(async (key: string) => {
      if (used.has(key)) return null;
      used.add(key);
      return 'OK';
    }),
  };
  const config = { getOrThrow: () => APP_URL } as unknown as ConfigService;
  return { service: new SteamOpenIdService(config, redis as never), redis };
}

function assertion(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    nonce: NONCE,
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'id_res',
    'openid.op_endpoint': 'https://steamcommunity.com/openid/login',
    'openid.claimed_id': `https://steamcommunity.com/openid/id/${STEAM_ID}`,
    'openid.identity': `https://steamcommunity.com/openid/id/${STEAM_ID}`,
    'openid.return_to': `${APP_URL}/api/oauth/steam/callback?nonce=${NONCE}`,
    'openid.response_nonce': '2026-01-01T00:00:00ZabcDEF',
    'openid.assoc_handle': '1234567890',
    'openid.signed': 'signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle',
    'openid.sig': 'sig=',
    ...overrides,
  };
}

describe('SteamOpenIdService', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi
      .fn()
      .mockImplementation(async () => new Response('ns:http://specs.openid.net/auth/2.0\nis_valid:true\n'));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('generates a different nonce per request', () => {
    const { service } = makeService();

    expect(service.generateNonce()).not.toBe(service.generateNonce());
  });

  it('puts the nonce into the return_to of the sign-in URL', () => {
    const { service } = makeService();

    const url = new URL(service.loginUrl(NONCE));

    expect(url.origin + url.pathname).toBe('https://steamcommunity.com/openid/login');
    expect(url.searchParams.get('openid.return_to')).toBe(`${APP_URL}/api/oauth/steam/callback?nonce=${NONCE}`);
    expect(url.searchParams.get('openid.realm')).toBe(APP_URL);
  });

  it('accepts a confirmed assertion whose nonce matches the cookie and returns the SteamID64', async () => {
    const { service } = makeService();

    await expect(service.verify(assertion(), NONCE)).resolves.toEqual({ steamId64: STEAM_ID });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const sent = new URLSearchParams(init.body as string);
    expect(sent.get('openid.mode')).toBe('check_authentication');
    expect(sent.get('openid.sig')).toBe('sig=');
  });

  it.each([
    ['no nonce cookie', assertion(), undefined],
    ['no nonce in the query', (() => { const q = assertion(); delete q['nonce']; return q; })(), NONCE],
    ['a nonce that differs from the cookie', assertion({ nonce: 'other' }), NONCE],
    ['a return_to carrying another nonce', assertion({ 'openid.return_to': `${APP_URL}/api/oauth/steam/callback?nonce=other` }), NONCE],
  ])('rejects a callback with %s without calling Steam', async (_label, query, cookie) => {
    const { service } = makeService();

    await expect(service.verify(query, cookie)).rejects.toBeInstanceOf(SteamOpenIdError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['a cancelled sign-in', { 'openid.mode': 'cancel' }],
    ['a foreign op_endpoint', { 'openid.op_endpoint': 'https://evil.example/openid/login' }],
    ['a claimed_id outside Steam', { 'openid.claimed_id': 'https://evil.example/openid/id/1' }],
    ['an assertion that does not sign response_nonce', { 'openid.signed': 'signed,claimed_id,return_to' }],
  ])('rejects %s', async (_label, overrides) => {
    const { service } = makeService();

    await expect(service.verify(assertion(overrides), NONCE)).rejects.toBeInstanceOf(SteamOpenIdError);
  });

  it('rejects an assertion Steam does not confirm', async () => {
    fetchMock.mockResolvedValue(new Response('ns:http://specs.openid.net/auth/2.0\nis_valid:false\n'));
    const { service, redis } = makeService();

    await expect(service.verify(assertion(), NONCE)).rejects.toBeInstanceOf(SteamOpenIdError);
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('stores the response_nonce with a TTL and rejects a replay of it', async () => {
    const { service, redis } = makeService();

    await service.verify(assertion(), NONCE);
    expect(redis.set).toHaveBeenCalledWith(
      'steam:openid:nonce:2026-01-01T00:00:00ZabcDEF',
      '1',
      'EX',
      expect.any(Number),
      'NX',
    );

    await expect(service.verify(assertion(), NONCE)).rejects.toBeInstanceOf(SteamOpenIdError);
  });
});
