import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { JwtService } from './jwt.service.js';

const SECRET = 'test-secret';

function makeService(secret = SECRET) {
  const config = { getOrThrow: () => secret };
  return new JwtService(config as never);
}

/** Builds a validly-signed token for an arbitrary payload, bypassing the 7-day default expiry. */
function signRaw(payload: object, secret = SECRET): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

describe('JwtService', () => {
  it('round-trips a signed token', () => {
    const service = makeService();

    const token = service.sign({ sub: 'u1', role: 'USER', tv: 0 });
    const payload = service.verify(token);

    expect(payload).toMatchObject({ sub: 'u1', role: 'USER', tv: 0 });
    expect(typeof payload!.exp).toBe('number');
    expect(typeof payload!.jti).toBe('string');
    expect(payload!.jti.length).toBeGreaterThan(0);
  });

  it('assigns a distinct jti to each signed token', () => {
    const service = makeService();

    const a = service.verify(service.sign({ sub: 'u1', role: 'USER', tv: 0 }));
    const b = service.verify(service.sign({ sub: 'u1', role: 'USER', tv: 0 }));

    expect(a!.jti).not.toBe(b!.jti);
  });

  it('rejects a token signed with a different secret', () => {
    const token = makeService('secret-a').sign({ sub: 'u1', role: 'USER', tv: 0 });

    expect(makeService('secret-b').verify(token)).toBeNull();
  });

  it('rejects a tampered payload', () => {
    const service = makeService();
    const token = service.sign({ sub: 'u1', role: 'USER', tv: 0 });
    const [header, , signature] = token.split('.');
    const tamperedBody = Buffer.from(JSON.stringify({ sub: 'u2', role: 'ADMIN', tv: 0, exp: 9999999999 })).toString(
      'base64url',
    );

    expect(service.verify(`${header}.${tamperedBody}.${signature}`)).toBeNull();
  });

  it('rejects an expired token', () => {
    const service = makeService();
    const expired = signRaw({ sub: 'u1', role: 'USER', tv: 0, exp: Math.floor(Date.now() / 1000) - 10 });

    expect(service.verify(expired)).toBeNull();
  });

  it('rejects a malformed token', () => {
    const service = makeService();

    expect(service.verify('not-a-jwt')).toBeNull();
  });
});
