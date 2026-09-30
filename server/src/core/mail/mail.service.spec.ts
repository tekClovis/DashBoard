import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MailService } from './mail.service.js';

const sendMail = vi.fn();

vi.mock('nodemailer', () => ({ createTransport: vi.fn(() => ({ sendMail })) }));

const config = {
  getOrThrow: (key: string) =>
    ({ SMTP_FROM: 'Dashboard <no-reply@dashboard.local>', SMTP_HOST: 'mailpit', SMTP_PORT: 1025 })[key],
} as unknown as ConfigService;

const URL = 'http://localhost:8080/confirm?token=abc123';

describe('MailService.sendConfirmationEmail', () => {
  beforeEach(() => {
    sendMail.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends a confirmation message carrying the link in text and html', async () => {
    sendMail.mockResolvedValue({});
    const service = new MailService(config);

    await service.sendConfirmationEmail('user@example.com', URL);

    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0][0]).toEqual({
      from: 'Dashboard <no-reply@dashboard.local>',
      to: 'user@example.com',
      subject: 'Confirm your email',
      text: `Confirm your email: ${URL}`,
      html: `<p>Confirm your email: <a href="${URL}">${URL}</a></p>`,
    });
  });

  it('swallows a transport failure and logs it with the recipient and stack', async () => {
    const failure = new Error('ECONNREFUSED');
    sendMail.mockRejectedValue(failure);
    const logError = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const service = new MailService(config);

    await expect(service.sendConfirmationEmail('user@example.com', URL)).resolves.toBeUndefined();

    expect(logError).toHaveBeenCalledWith(expect.stringContaining('user@example.com'), failure.stack);
  });

  it('logs a non-Error rejection value as-is', async () => {
    sendMail.mockRejectedValue('smtp down');
    const logError = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const service = new MailService(config);

    await expect(service.sendConfirmationEmail('user@example.com', URL)).resolves.toBeUndefined();

    expect(logError).toHaveBeenCalledWith(expect.any(String), 'smtp down');
  });
});
