import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTransport } from 'nodemailer';
import { MailService } from './mail.service.js';

const sendMail = vi.fn();

vi.mock('nodemailer', () => ({ createTransport: vi.fn(() => ({ sendMail })) }));

function configWith(extra: Record<string, string> = {}): ConfigService {
  const values: Record<string, unknown> = {
    SMTP_FROM: 'Dashboard <no-reply@dashboard.local>',
    SMTP_HOST: 'mailpit',
    SMTP_PORT: 1025,
    ...extra,
  };
  return { get: (key: string) => values[key], getOrThrow: (key: string) => values[key] } as unknown as ConfigService;
}

const config = configWith();

const URL = 'http://localhost:8080/confirm?token=abc123';

function expectBrandedHtml(html: string, url: string): void {
  expect(html).toContain('Dashboard</td>'); // header
  expect(html).toMatch(/<h1 style="[^"]+">/); // heading
  expect(html).toContain(`<a href="${url}" style="`); // CTA button, href unchanged
  expect(html).toContain('border-top:1px solid'); // footer
  expect(html).not.toMatch(/<link|<style|<img|<script|url\(/i); // inline CSS only, no remote assets
}

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
    const msg = sendMail.mock.calls[0][0];
    expect(msg.from).toBe('Dashboard <no-reply@dashboard.local>');
    expect(msg.to).toBe('user@example.com');
    expect(msg.subject).toBe('Confirm your email');
    expect(msg.text).toContain(URL);
    expectBrandedHtml(msg.html, URL);
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

describe('MailService.sendPasswordResetEmail', () => {
  beforeEach(() => {
    sendMail.mockReset();
  });

  it('sends a reset message carrying the link in text and html', async () => {
    sendMail.mockResolvedValue({});
    const url = 'http://localhost:8080/reset-password?token=abc123';

    await new MailService(config).sendPasswordResetEmail('user@example.com', url);

    const msg = sendMail.mock.calls[0][0];
    expect(msg.to).toBe('user@example.com');
    expect(msg.subject).toBe('Reset your password');
    expect(msg.text).toContain(url);
    expect(msg.text).toContain('works once and for 1 hour');
    expectBrandedHtml(msg.html, url);
  });

  it('escapes the url in the html href', async () => {
    sendMail.mockResolvedValue({});

    await new MailService(config).sendPasswordResetEmail('u@example.com', 'http://x/?a=1&b="2"');

    expect(sendMail.mock.calls[0][0].html).toContain('href="http://x/?a=1&amp;b=&quot;2&quot;"');
  });

  it('never throws when the transport fails', async () => {
    sendMail.mockRejectedValue(new Error('smtp down'));
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    await expect(new MailService(config).sendPasswordResetEmail('u@example.com', 'x')).resolves.toBeUndefined();
  });
});

describe('MailService transport options', () => {
  const create = vi.mocked(createTransport);

  beforeEach(() => {
    create.mockClear();
  });

  it('passes only host, port and secure:false without credentials', () => {
    new MailService(config);

    expect(create).toHaveBeenCalledWith({ host: 'mailpit', port: 1025, secure: false });
    expect(create.mock.calls[0][0]).not.toHaveProperty('auth');
  });

  it('passes auth when SMTP_USER and SMTP_PASS are set', () => {
    new MailService(configWith({ SMTP_USER: 'apikey', SMTP_PASS: 's3cret' }));

    expect(create.mock.calls[0][0]).toMatchObject({ auth: { user: 'apikey', pass: 's3cret' } });
  });

  it('requires a STARTTLS upgrade before sending credentials over a non-implicit-TLS connection', () => {
    new MailService(configWith({ SMTP_USER: 'apikey', SMTP_PASS: 's3cret' }));

    expect(create.mock.calls[0][0]).toMatchObject({ secure: false, requireTLS: true });
  });

  it('does not force requireTLS without credentials (Mailpit default)', () => {
    new MailService(config);

    expect(create.mock.calls[0][0]).not.toHaveProperty('requireTLS');
  });

  it('omits auth when SMTP_USER is empty', () => {
    new MailService(configWith({ SMTP_USER: '', SMTP_PASS: '' }));

    expect(create.mock.calls[0][0]).not.toHaveProperty('auth');
  });

  it.each([
    ['true', true],
    ['false', false],
    ['TRUE', false],
    ['1', false],
    ['', false],
  ])('maps SMTP_SECURE=%j to secure:%s', (value, secure) => {
    new MailService(configWith({ SMTP_SECURE: value }));

    expect(create.mock.calls[0][0]).toMatchObject({ secure });
  });

  it('defaults secure to false when SMTP_SECURE is unset', () => {
    new MailService(config);

    expect(create.mock.calls[0][0]).toMatchObject({ secure: false });
  });
});
