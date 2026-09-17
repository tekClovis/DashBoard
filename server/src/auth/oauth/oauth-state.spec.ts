import { describe, expect, it, vi } from 'vitest';
import { assertBoundState, signOAuthState, verifyOAuthState } from './oauth-state.js';

const SECRET = 'test-secret';

describe('oauth-state', () => {
  it('round-trips a signed state', () => {
    const token = signOAuthState({ intent: 'login', provider: 'github' }, SECRET);
    expect(verifyOAuthState(token, SECRET)).toEqual({ intent: 'login', provider: 'github' });
  });

  it('rejects a tampered signature', () => {
    const token = signOAuthState({ intent: 'login', provider: 'github' }, SECRET);
    const [encoded] = token.split('.');
    const tampered = `${encoded}.not-the-real-signature-not-the-real-signature`;
    expect(() => verifyOAuthState(tampered, SECRET)).toThrow('INVALID_STATE');
  });

  it('rejects a token signed with a different secret', () => {
    const token = signOAuthState({ intent: 'login', provider: 'google' }, SECRET);
    expect(() => verifyOAuthState(token, 'other-secret')).toThrow('INVALID_STATE');
  });

  it('rejects a malformed token', () => {
    expect(() => verifyOAuthState('not-a-real-token', SECRET)).toThrow('INVALID_STATE');
  });

  it('rejects an expired state', () => {
    vi.useFakeTimers();
    const token = signOAuthState({ intent: 'login', provider: 'github' }, SECRET);
    vi.advanceTimersByTime(11 * 60 * 1000);
    expect(() => verifyOAuthState(token, SECRET)).toThrow('STATE_EXPIRED');
    vi.useRealTimers();
  });

  describe('assertBoundState', () => {
    it('accepts a query state that matches the cookie and is validly signed', () => {
      const token = signOAuthState({ intent: 'login', provider: 'google' }, SECRET);
      expect(assertBoundState(token, token, SECRET)).toEqual({ intent: 'login', provider: 'google' });
    });

    it('rejects when the query state does not match the cookie', () => {
      const token = signOAuthState({ intent: 'login', provider: 'github' }, SECRET);
      const other = signOAuthState({ intent: 'login', provider: 'github' }, SECRET);
      expect(() => assertBoundState(token, other, SECRET)).toThrow('INVALID_STATE');
    });

    it('rejects a missing cookie', () => {
      const token = signOAuthState({ intent: 'login', provider: 'github' }, SECRET);
      expect(() => assertBoundState(token, undefined, SECRET)).toThrow('INVALID_STATE');
    });

    it('rejects a missing query state', () => {
      const token = signOAuthState({ intent: 'login', provider: 'github' }, SECRET);
      expect(() => assertBoundState(undefined, token, SECRET)).toThrow('INVALID_STATE');
    });
  });
});
