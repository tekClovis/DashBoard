import { describe, expect, it, vi } from 'vitest';
import type { Request } from 'express';
import { AuthController } from './auth.controller.js';

function makeDeps() {
  const prisma = {
    user: { findUnique: vi.fn(), create: vi.fn() },
  };
  const verification = { issueToken: vi.fn().mockResolvedValue('raw-token'), confirm: vi.fn() };
  const mail = { sendConfirmationEmail: vi.fn().mockResolvedValue(undefined) };
  const config = { getOrThrow: vi.fn().mockReturnValue('http://localhost:8080') };
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
    redis as never,
  );

  return { controller, prisma, verification, mail, redis };
}

function makeReq(): Request {
  return { socket: { remoteAddress: '127.0.0.1' } } as unknown as Request;
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
});
