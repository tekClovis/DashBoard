import { describe, expect, it, vi } from 'vitest';
import type { Profile } from 'passport-google-oauth20';
import { GoogleStrategy } from './google.strategy.js';

function validate(profile: Partial<Profile>) {
  const config = { get: () => undefined, getOrThrow: () => 'http://localhost:8080' };
  const strategy = new GoogleStrategy(config as never);
  const done = vi.fn();
  strategy.validate('access', 'refresh', profile as Profile, done);
  return done;
}

describe('GoogleStrategy.validate', () => {
  it('normalises a profile with a verified email', () => {
    const done = validate({
      id: 'g-1',
      emails: [{ value: 'a@b.com', verified: true }],
      _json: { email_verified: true } as Profile['_json'],
    });

    expect(done).toHaveBeenCalledExactlyOnceWith(null, {
      provider: 'GOOGLE',
      providerUserId: 'g-1',
      email: 'a@b.com',
      emailVerified: true,
    });
  });

  it('reports an unverified email as unverified', () => {
    const done = validate({
      id: 'g-1',
      emails: [{ value: 'a@b.com', verified: false }],
      _json: { email_verified: false } as Profile['_json'],
    });

    expect(done).toHaveBeenCalledWith(null, expect.objectContaining({ email: 'a@b.com', emailVerified: false }));
  });

  it('treats a profile without the email_verified claim as unverified', () => {
    const done = validate({ id: 'g-1', emails: [{ value: 'a@b.com', verified: true }] });

    expect(done).toHaveBeenCalledWith(null, expect.objectContaining({ emailVerified: false }));
  });

  it.each([{ emails: undefined }, { emails: [] }])('yields a null email when the profile has none (%j)', ({ emails }) => {
    const done = validate({ id: 'g-1', emails, _json: { email_verified: true } as Profile['_json'] });

    expect(done).toHaveBeenCalledWith(null, expect.objectContaining({ providerUserId: 'g-1', email: null }));
  });
});

describe('GoogleStrategy construction', () => {
  it('does not throw when the client id and secret are empty strings (as shipped in .env.example)', () => {
    const config = { get: () => '', getOrThrow: () => 'http://localhost:8080' };

    expect(() => new GoogleStrategy(config as never)).not.toThrow();
  });
});
