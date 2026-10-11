// Nest normally loads this; class-transformer's implicit conversion needs it here.
import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
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

  it.each(['APP_URL', 'DATABASE_URL', 'REDIS_URL', 'JWT_SECRET', 'TOKEN_ENC_KEY'])('rejects a missing %s', (name) => {
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

  // `.env.example` ships `JWT_SECRET=`; docs/Architecture.md §8.6 says the server refuses to start without it.
  it('rejects an empty JWT_SECRET', () => {
    expect(() => validate({ ...validEnv(), JWT_SECRET: '' })).toThrow(/JWT_SECRET/);
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
