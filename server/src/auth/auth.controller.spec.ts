import { describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import * as bcrypt from 'bcrypt';
import { AuthController } from './auth.controller.js';

function makeDeps() {
  const prisma = {
    user: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), create: vi.fn(), update: vi.fn() },
    authIdentity: { findMany: vi.fn().mockResolvedValue([]) },
  };
  const verification = { issueToken: vi.fn().mockResolvedValue('raw-token'), confirm: vi.fn() };
  const mail = { sendConfirmationEmail: vi.fn().mockResolvedValue(undefined) };
  const config = { getOrThrow: vi.fn().mockReturnValue('http://localhost:8080') };
  const jwt = { sign: vi.fn().mockReturnValue('signed-jwt'), verify: vi.fn() };
  const revocation = { revoke: vi.fn().mockResolvedValue(undefined), isRevoked: vi.fn().mockResolvedValue(false) };
  const store = new Map<string, number>();
  const redis = {
    incr: vi.fn(async (key: string) => {
      const next = (store.get(key) ?? 0) + 1;
      store.set(key, next);
      return next;
    }),
    expire: vi.fn().mockResolvedValue(1),
  };

  const controller = new AuthController(
    prisma as never,
    verification as never,
    mail as never,
    config as never,
    jwt as never,
    revocation as never,
    redis as never,
  );

  return { controller, prisma, verification, mail, config, jwt, revocation, redis };
}

function makeReq(): Request {
  return { socket: { remoteAddress: '127.0.0.1' }, headers: {} } as unknown as Request;
}

function makeRes(): Response {
  return { cookie: vi.fn(), clearCookie: vi.fn() } as unknown as Response;
}

describe('AuthController', () => {
  describe('register', () => {
    it('creates a fresh user, issues a token, and sends mail', async () => {
      const { controller, prisma, verification, mail } = makeDeps();
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({ id: 'u1' });

      const res = await controller.register(
        { email: ' User@Example.com ', password: 'abc12345!' },
        makeReq(),
      );

      expect(res).toEqual({ ok: true });
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: { email: 'user@example.com', passwordHash: expect.any(String) },
      });
      expect(verification.issueToken).toHaveBeenCalledWith('u1');
      expect(mail.sendConfirmationEmail).toHaveBeenCalledWith(
        'user@example.com',
        'http://localhost:8080/confirm?token=raw-token',
      );
    });

    it('rejects a verified existing user without creating anything', async () => {
      const { controller, prisma, verification, mail } = makeDeps();
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', emailVerifiedAt: new Date(), passwordHash: 'x' });

      await expect(
        controller.register({ email: 'a@b.com', password: 'abc12345!' }, makeReq()),
      ).rejects.toMatchObject({ response: { error: 'EMAIL_IN_USE' } });
      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(verification.issueToken).not.toHaveBeenCalled();
      expect(mail.sendConfirmationEmail).not.toHaveBeenCalled();
    });

    it('rejects an OIDC-only existing user (null passwordHash)', async () => {
      const { controller, prisma } = makeDeps();
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', emailVerifiedAt: null, passwordHash: null });

      await expect(
        controller.register({ email: 'a@b.com', password: 'abc12345!' }, makeReq()),
      ).rejects.toMatchObject({ response: { error: 'EMAIL_IN_USE' } });
    });

    it('treats an unverified local account as an implicit resend', async () => {
      const { controller, prisma, verification, mail } = makeDeps();
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', emailVerifiedAt: null, passwordHash: 'x' });

      const res = await controller.register({ email: 'a@b.com', password: 'abc12345!' }, makeReq());

      expect(res).toEqual({ ok: true });
      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(verification.issueToken).toHaveBeenCalledWith('u1');
      expect(mail.sendConfirmationEmail).toHaveBeenCalled();
    });

    it('429s once the per-IP rate limit is exceeded', async () => {
      const { controller, prisma } = makeDeps();
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({ id: 'u1' });
      const req = makeReq();

      for (let i = 0; i < 5; i++) {
        await controller.register({ email: `a${i}@b.com`, password: 'abc12345!' }, req);
      }

      await expect(
        controller.register({ email: 'over@b.com', password: 'abc12345!' }, req),
      ).rejects.toMatchObject({ status: 429 });
    });
  });

  describe('confirm', () => {
    it('delegates to VerificationService', async () => {
      const { controller, verification } = makeDeps();

      const res = await controller.confirm('raw-token', makeReq());

      expect(res).toEqual({ ok: true });
      expect(verification.confirm).toHaveBeenCalledWith('raw-token');
    });

    it('confirms with an empty string when no token query param is given', async () => {
      const { controller, verification } = makeDeps();

      await controller.confirm(undefined, makeReq());

      expect(verification.confirm).toHaveBeenCalledWith('');
    });
  });

  describe('resend', () => {
    it('never leaks whether the account exists', async () => {
      const { controller, prisma, mail } = makeDeps();
      prisma.user.findUnique.mockResolvedValue(null);

      const res = await controller.resend({ email: 'unknown@b.com' });

      expect(res).toEqual({ ok: true });
      expect(mail.sendConfirmationEmail).not.toHaveBeenCalled();
    });

    it('resends for an unverified user within limits', async () => {
      const { controller, prisma, verification, mail } = makeDeps();
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', emailVerifiedAt: null });

      const res = await controller.resend({ email: 'a@b.com' });

      expect(res).toEqual({ ok: true });
      expect(verification.issueToken).toHaveBeenCalledWith('u1');
      expect(mail.sendConfirmationEmail).toHaveBeenCalled();
    });

    it('does not resend for an already-verified user', async () => {
      const { controller, prisma, mail } = makeDeps();
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', emailVerifiedAt: new Date() });

      const res = await controller.resend({ email: 'a@b.com' });

      expect(res).toEqual({ ok: true });
      expect(mail.sendConfirmationEmail).not.toHaveBeenCalled();
    });

    it('silently no-ops over the 1/60s limit', async () => {
      const { controller, prisma, mail } = makeDeps();
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', emailVerifiedAt: null });

      await controller.resend({ email: 'a@b.com' });
      mail.sendConfirmationEmail.mockClear();
      const res = await controller.resend({ email: 'a@b.com' });

      expect(res).toEqual({ ok: true });
      expect(mail.sendConfirmationEmail).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('sets the session cookie and returns ok on correct credentials for a verified user', async () => {
      const { controller, prisma, jwt } = makeDeps();
      const passwordHash = await bcrypt.hash('correct-horse', 4);
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        role: 'USER',
        tokenVersion: 0,
        passwordHash,
        emailVerifiedAt: new Date(),
      });
      const res = makeRes();

      const result = await controller.login({ email: 'a@b.com', password: 'correct-horse' }, makeReq(), res);

      expect(result).toEqual({ ok: true });
      expect(jwt.sign).toHaveBeenCalledWith({ sub: 'u1', role: 'USER', tv: 0 });
      expect(vi.mocked(res.cookie)).toHaveBeenCalledWith(
        'session',
        'signed-jwt',
        expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/' }),
      );
    });

    it('rejects a wrong password with a generic 401', async () => {
      const { controller, prisma } = makeDeps();
      const passwordHash = await bcrypt.hash('correct-horse', 4);
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        role: 'USER',
        tokenVersion: 0,
        passwordHash,
        emailVerifiedAt: new Date(),
      });

      await expect(
        controller.login({ email: 'a@b.com', password: 'wrong' }, makeReq(), makeRes()),
      ).rejects.toMatchObject({ status: 401, response: { error: 'INVALID_CREDENTIALS' } });
    });

    it('rejects an unknown email with the same generic 401 (no enumeration)', async () => {
      const { controller, prisma } = makeDeps();
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        controller.login({ email: 'nobody@b.com', password: 'whatever' }, makeReq(), makeRes()),
      ).rejects.toMatchObject({ status: 401, response: { error: 'INVALID_CREDENTIALS' } });
    });

    it('returns 403 EMAIL_NOT_CONFIRMED for correct credentials on an unverified user', async () => {
      const { controller, prisma } = makeDeps();
      const passwordHash = await bcrypt.hash('correct-horse', 4);
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        role: 'USER',
        tokenVersion: 0,
        passwordHash,
        emailVerifiedAt: null,
      });

      await expect(
        controller.login({ email: 'a@b.com', password: 'correct-horse' }, makeReq(), makeRes()),
      ).rejects.toMatchObject({ status: 403, response: { error: 'EMAIL_NOT_CONFIRMED' } });
    });

    it('rejects an OIDC-only user (null passwordHash) with the generic 401', async () => {
      const { controller, prisma } = makeDeps();
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        role: 'USER',
        tokenVersion: 0,
        passwordHash: null,
        emailVerifiedAt: new Date(),
      });

      await expect(
        controller.login({ email: 'a@b.com', password: 'whatever' }, makeReq(), makeRes()),
      ).rejects.toMatchObject({ status: 401, response: { error: 'INVALID_CREDENTIALS' } });
    });

    it('429s once the per-IP rate limit is exceeded', async () => {
      const { controller, prisma } = makeDeps();
      prisma.user.findUnique.mockResolvedValue(null);
      const req = makeReq();

      for (let i = 0; i < 10; i++) {
        await expect(
          controller.login({ email: 'a@b.com', password: 'x' }, req, makeRes()),
        ).rejects.toMatchObject({ status: 401 });
      }

      await expect(
        controller.login({ email: 'a@b.com', password: 'x' }, req, makeRes()),
      ).rejects.toMatchObject({ status: 429 });
    });
  });

  describe('me', () => {
    it('returns the current user plus linked identities', async () => {
      const { controller, prisma } = makeDeps();
      prisma.authIdentity.findMany.mockResolvedValue([{ provider: 'GITHUB' }]);
      prisma.user.findUniqueOrThrow.mockResolvedValue({ passwordHash: 'hash' });
      const verifiedAt = new Date();

      const result = await controller.me({
        id: 'u1',
        email: 'a@b.com',
        role: 'USER',
        emailVerifiedAt: verifiedAt,
      });

      expect(result).toEqual({
        id: 'u1',
        email: 'a@b.com',
        role: 'USER',
        emailVerifiedAt: verifiedAt.toISOString(),
        hasPassword: true,
        identities: [{ provider: 'GITHUB' }],
      });
    });
  });

  describe('logout', () => {
    it('clears the session cookie', async () => {
      const { controller } = makeDeps();
      const res = makeRes();

      const result = await controller.logout(makeReq(), res);

      expect(result).toEqual({ ok: true });
      expect(vi.mocked(res.clearCookie)).toHaveBeenCalledWith('session', expect.objectContaining({ path: '/' }));
    });

    it('revokes the token jti so the old cookie cannot be reused', async () => {
      const { controller, jwt, revocation } = makeDeps();
      const req = { ...makeReq(), headers: { cookie: 'session=old-token' } } as never;
      const res = makeRes();
      jwt.verify.mockReturnValue({ sub: 'u1', role: 'USER', tv: 0, jti: 'jti-1', exp: 9999999999 });

      await controller.logout(req, res);

      expect(revocation.revoke).toHaveBeenCalledWith('jti-1', 9999999999);
    });
  });

  describe('logoutAll', () => {
    it('bumps tokenVersion and clears the session cookie', async () => {
      const { controller, prisma } = makeDeps();
      const res = makeRes();

      const result = await controller.logoutAll(
        { id: 'u1', email: 'a@b.com', role: 'USER', emailVerifiedAt: new Date() },
        res,
      );

      expect(result).toEqual({ ok: true });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { tokenVersion: { increment: 1 } },
      });
      expect(vi.mocked(res.clearCookie)).toHaveBeenCalledWith('session', expect.objectContaining({ path: '/' }));
    });
  });
});
