// Nest normally loads this; class-transformer's implicit conversion needs it here.
import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { validate } from './env.validation.js';

const TOKEN_ENC_KEY = Buffer.alloc(32, 7).toString('base64');

function validEnv(): Record<string, unknown> {
  return {
    APP_URL: 'http://localhost:8080',
    DATABASE_URL: 'postgresql://dashboard:dashboard@postgres:5432/dashboard',
    REDIS_URL: 'redis://redis:6379',
    JWT_SECRET: 'a-long-enough-jwt-secret',
    TOKEN_ENC_KEY,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('validate (env)', () => {
  it('accepts a valid env and fills the SMTP defaults', () => {
    const env = validate(validEnv());

    expect(env).toMatchObject({
      APP_URL: 'http://localhost:8080',
      JWT_SECRET: 'a-long-enough-jwt-secret',
      TOKEN_ENC_KEY,
      SMTP_HOST: 'mailpit',
      SMTP_PORT: 1025,
      SMTP_FROM: 'Dashboard <no-reply@dashboard.local>',
    });
  });

  it('converts a string SMTP_PORT (as read from process.env) to a number', () => {
    expect(validate({ ...validEnv(), SMTP_PORT: '2525' }).SMTP_PORT).toBe(2525);
  });

  it.each(['APP_URL', 'DATABASE_URL', 'REDIS_URL'])('rejects a missing %s', (name) => {
    const env = validEnv();
    delete env[name];

    expect(() => validate(env)).toThrow(new RegExp(`Invalid environment configuration[\\s\\S]*${name}`));
  });

  it('rejects an APP_URL that is not a URL', () => {
    expect(() => validate({ ...validEnv(), APP_URL: 'not a url' })).toThrow(/APP_URL/);
  });

  it.each(['abc', '0', '65536', '25.5'])('rejects SMTP_PORT=%s', (port) => {
    expect(() => validate({ ...validEnv(), SMTP_PORT: port })).toThrow(/SMTP_PORT/);
  });

  it.each([16, 33])('rejects a %i-byte TOKEN_ENC_KEY', (bytes) => {
    const key = Buffer.alloc(bytes, 7).toString('base64');

    expect(() => validate({ ...validEnv(), TOKEN_ENC_KEY: key })).toThrow(/TOKEN_ENC_KEY must be 32 bytes/);
  });

  // `.env.example` ships `JWT_SECRET=` and `TOKEN_ENC_KEY=`: an unconfigured fresh clone must boot.
  it.each(['JWT_SECRET', 'TOKEN_ENC_KEY'])('generates %s and warns when it is unset or empty', (name) => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const unset = validEnv();
    delete unset[name];

    for (const raw of [unset, { ...validEnv(), [name]: '' }]) {
      warn.mockClear();
      const env = validate(raw) as unknown as Record<string, string>;

      expect(env[name]).toBeTruthy();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining(name));
    }
  });

  it('generates a TOKEN_ENC_KEY that is 32 bytes of base64 and a fresh JWT_SECRET on every boot', () => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const raw = { ...validEnv(), JWT_SECRET: '', TOKEN_ENC_KEY: '' };

    const first = validate(raw);
    const second = validate(raw);

    expect(Buffer.from(first.TOKEN_ENC_KEY, 'base64')).toHaveLength(32);
    expect(first.JWT_SECRET).not.toBe(second.JWT_SECRET);
    expect(first.TOKEN_ENC_KEY).not.toBe(second.TOKEN_ENC_KEY);
  });

  it('does not warn or replace the secrets when both are set', () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    expect(validate(validEnv())).toMatchObject({ JWT_SECRET: 'a-long-enough-jwt-secret', TOKEN_ENC_KEY });
    expect(warn).not.toHaveBeenCalled();
  });

  it.each(['', undefined])('accepts empty OAuth client ids and secrets (%s)', (value) => {
    const raw = {
      ...validEnv(),
      GITHUB_CLIENT_ID: value,
      GITHUB_CLIENT_SECRET: value,
      GOOGLE_CLIENT_ID: value,
      GOOGLE_CLIENT_SECRET: value,
    };

    expect(() => validate(raw)).not.toThrow();
  });

  it('accepts the optional SMTP credentials and leaves them unset by default', () => {
    expect(validate(validEnv())).toMatchObject({ SMTP_USER: undefined, SMTP_PASS: undefined, SMTP_SECURE: undefined });
    expect(validate({ ...validEnv(), SMTP_USER: 'u', SMTP_PASS: 'p', SMTP_SECURE: 'true' })).toMatchObject({
      SMTP_USER: 'u',
      SMTP_PASS: 'p',
      SMTP_SECURE: 'true',
    });
  });

  it('rejects SMTP_USER without SMTP_PASS', () => {
    expect(() => validate({ ...validEnv(), SMTP_USER: 'u' })).toThrow(/SMTP_PASS/);
    expect(() => validate({ ...validEnv(), SMTP_USER: 'u', SMTP_PASS: '' })).toThrow(/SMTP_PASS/);
  });

  it('treats empty SMTP_USER / SMTP_PASS / SMTP_SECURE (as shipped in .env.example) as unset', () => {
    expect(() => validate({ ...validEnv(), SMTP_USER: '', SMTP_PASS: '', SMTP_SECURE: '' })).not.toThrow();
  });
});
