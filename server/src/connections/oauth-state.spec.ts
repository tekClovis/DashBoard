import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateCsrfToken, InvalidStateError, signConnectState, verifyConnectState } from './oauth-state.js';

const SECRET = 'test-secret';

describe('oauth-state', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('round-trips a valid state and returns the bound userId', () => {
    const csrfToken = generateCsrfToken();
    const state = signConnectState({ provider: 'github', userId: 'user-1', csrfToken }, SECRET);

    const payload = verifyConnectState(state, 'github', csrfToken, SECRET);

    expect(payload.userId).toBe('user-1');
    expect(payload.provider).toBe('github');
    expect(payload.intent).toBe('connect');
  });

  it('rejects a tampered payload (e.g. swapped userId)', () => {
    const csrfToken = generateCsrfToken();
    const state = signConnectState({ provider: 'github', userId: 'victim', csrfToken }, SECRET);
    const [payloadB64, mac] = state.split('.');
    const tamperedPayload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    tamperedPayload.userId = 'attacker';
    const tamperedState = `${Buffer.from(JSON.stringify(tamperedPayload)).toString('base64url')}.${mac}`;

    expect(() => verifyConnectState(tamperedState, 'github', csrfToken, SECRET)).toThrow(InvalidStateError);
  });

  it('rejects a state signed with a different secret', () => {
    const csrfToken = generateCsrfToken();
    const state = signConnectState({ provider: 'github', userId: 'user-1', csrfToken }, 'other-secret');

    expect(() => verifyConnectState(state, 'github', csrfToken, SECRET)).toThrow(InvalidStateError);
  });

  it('rejects a malformed state string', () => {
    expect(() => verifyConnectState('not-a-real-state', 'github', 'anything', SECRET)).toThrow(InvalidStateError);
  });

  it('rejects an expired state', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const csrfToken = generateCsrfToken();
    const state = signConnectState({ provider: 'github', userId: 'user-1', csrfToken }, SECRET);

    vi.setSystemTime(new Date('2026-01-01T00:11:00Z')); // +11 min

    expect(() => verifyConnectState(state, 'github', csrfToken, SECRET)).toThrow(InvalidStateError);
  });

  it('rejects a provider mismatch (state minted for github used against google callback)', () => {
    const csrfToken = generateCsrfToken();
    const state = signConnectState({ provider: 'github', userId: 'user-1', csrfToken }, SECRET);

    expect(() => verifyConnectState(state, 'google', csrfToken, SECRET)).toThrow(InvalidStateError);
  });

  it('rejects a mismatched or missing CSRF cookie (double-submit binding)', () => {
    const csrfToken = generateCsrfToken();
    const state = signConnectState({ provider: 'github', userId: 'user-1', csrfToken }, SECRET);

    expect(() => verifyConnectState(state, 'github', 'wrong-cookie-value', SECRET)).toThrow(InvalidStateError);
    expect(() => verifyConnectState(state, 'github', undefined, SECRET)).toThrow(InvalidStateError);
  });
});
