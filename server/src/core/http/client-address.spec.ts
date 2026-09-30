import { describe, expect, it } from 'vitest';
import type { Request } from 'express';
import { clientAddress } from './client-address.js';

function makeReq(remoteAddress: string | undefined, headers: Record<string, string> = {}): Request {
  return { socket: { remoteAddress }, headers } as unknown as Request;
}

describe('clientAddress', () => {
  it('returns a direct IPv4 address as-is', () => {
    expect(clientAddress(makeReq('203.0.113.7'))).toBe('203.0.113.7');
  });

  it('strips the ::ffff: IPv4-mapped prefix', () => {
    expect(clientAddress(makeReq('::ffff:203.0.113.7'))).toBe('203.0.113.7');
  });

  it('keeps a plain IPv6 address intact', () => {
    expect(clientAddress(makeReq('2001:db8::1'))).toBe('2001:db8::1');
    expect(clientAddress(makeReq('::1'))).toBe('::1');
  });

  it('returns an empty string when the socket has no remote address', () => {
    expect(clientAddress(makeReq(undefined))).toBe('');
  });

  it('ignores X-Forwarded-For / X-Real-IP and uses the socket address', () => {
    const req = makeReq('::ffff:10.0.0.2', { 'x-forwarded-for': '198.51.100.1, 10.0.0.1', 'x-real-ip': '198.51.100.1' });

    expect(clientAddress(req)).toBe('10.0.0.2');
  });
});
