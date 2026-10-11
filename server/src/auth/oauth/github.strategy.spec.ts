import { describe, expect, it, vi } from 'vitest';
import type { Profile } from 'passport-github2';
import { GithubStrategy } from './github.strategy.js';

type RawEmail = { value: string; primary?: boolean; verified?: boolean };

function validate(emails: RawEmail[] | undefined) {
  const config = { get: () => undefined, getOrThrow: () => 'http://localhost:8080' };
  const strategy = new GithubStrategy(config as never);
  const done = vi.fn();
  strategy.validate('access', 'refresh', { id: 'gh-1', emails } as unknown as Profile, done);
  return done;
}

describe('GithubStrategy.validate', () => {
  it('normalises the primary email, not merely the first one', () => {
    const done = validate([
      { value: 'old@b.com', primary: false, verified: false },
      { value: 'main@b.com', primary: true, verified: true },
    ]);

    expect(done).toHaveBeenCalledExactlyOnceWith(null, {
      provider: 'GITHUB',
      providerUserId: 'gh-1',
      email: 'main@b.com',
      emailVerified: true,
    });
  });

  it('takes the verified flag from the chosen email only', () => {
    const done = validate([
      { value: 'other@b.com', primary: false, verified: true },
      { value: 'main@b.com', primary: true, verified: false },
    ]);

    expect(done).toHaveBeenCalledWith(null, expect.objectContaining({ email: 'main@b.com', emailVerified: false }));
  });

  it('falls back to the first email when none is marked primary', () => {
    const done = validate([{ value: 'first@b.com', verified: true }, { value: 'second@b.com' }]);

    expect(done).toHaveBeenCalledWith(null, expect.objectContaining({ email: 'first@b.com', emailVerified: true }));
  });

  it('treats an email without a verified flag as unverified', () => {
    const done = validate([{ value: 'a@b.com', primary: true }]);

    expect(done).toHaveBeenCalledWith(null, expect.objectContaining({ email: 'a@b.com', emailVerified: false }));
  });

  it.each([[undefined], [[]]])('yields a null, unverified email when the profile has none (%j)', (emails) => {
    const done = validate(emails);

    expect(done).toHaveBeenCalledWith(null, {
      provider: 'GITHUB',
      providerUserId: 'gh-1',
      email: null,
      emailVerified: false,
    });
  });
});

describe('GithubStrategy construction', () => {
  it('does not throw when the client id and secret are empty strings (as shipped in .env.example)', () => {
    const config = { get: () => '', getOrThrow: () => 'http://localhost:8080' };

    expect(() => new GithubStrategy(config as never)).not.toThrow();
  });
});
