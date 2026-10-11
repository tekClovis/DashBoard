import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';
import { renderHtml, renderText, type MailContent } from './mail.template.js';

/**
 * Sends transactional emails over SMTP, using `SMTP_HOST`, `SMTP_PORT` and `SMTP_FROM`.
 * Optional `SMTP_USER`/`SMTP_PASS` enable authentication; `SMTP_SECURE='true'` selects implicit TLS
 * (otherwise STARTTLS is used when the server offers it, and is mandatory when credentials are set).
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(config: ConfigService) {
    this.from = config.getOrThrow<string>('SMTP_FROM');
    const user = config.get<string>('SMTP_USER');
    const secure = config.get<string>('SMTP_SECURE') === 'true';
    this.transporter = createTransport({
      host: config.getOrThrow<string>('SMTP_HOST'),
      port: config.getOrThrow<number>('SMTP_PORT'),
      secure,
      // Never send credentials in cleartext: without implicit TLS, fail unless STARTTLS succeeds first.
      ...(user ? { auth: { user, pass: config.getOrThrow<string>('SMTP_PASS') }, requireTLS: !secure } : {}),
    });
  }

  /** Send the email-confirmation link; never throws, a send failure is only logged. */
  async sendConfirmationEmail(to: string, confirmUrl: string): Promise<void> {
    const content: MailContent = {
      heading: 'Confirm your email',
      intro: 'Thanks for signing up. Confirm your email address to activate your account.',
      buttonLabel: 'Confirm email',
      url: confirmUrl,
      footer: "You received this email because someone signed up with this address. If it wasn't you, ignore it.",
    };
    try {
      await this.transporter.sendMail({
        from: this.from,
        to,
        subject: 'Confirm your email',
        text: renderText(content),
        html: renderHtml(content),
      });
    } catch (err) {
      this.logger.error(`Failed to send confirmation email to ${to}`, err instanceof Error ? err.stack : err);
    }
  }

  /** Send the password-reset link (valid once, 1 hour); never throws, a send failure is only logged. */
  async sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
    const content: MailContent = {
      heading: 'Reset your password',
      intro: 'We received a request to reset your password. Use the button below to choose a new one.',
      buttonLabel: 'Reset password',
      url: resetUrl,
      note: 'This link works once and for 1 hour.',
      footer: "If you didn't request a password reset, ignore this email; your password stays unchanged.",
    };
    try {
      await this.transporter.sendMail({
        from: this.from,
        to,
        subject: 'Reset your password',
        text: renderText(content),
        html: renderHtml(content),
      });
    } catch (err) {
      this.logger.error(`Failed to send password reset email to ${to}`, err instanceof Error ? err.stack : err);
    }
  }
}
