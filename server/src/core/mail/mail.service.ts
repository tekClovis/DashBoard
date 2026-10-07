import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';
import { renderHtml, renderText, type MailContent } from './mail.template.js';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(config: ConfigService) {
    this.from = config.getOrThrow<string>('SMTP_FROM');
    this.transporter = createTransport({
      host: config.getOrThrow<string>('SMTP_HOST'),
      port: config.getOrThrow<number>('SMTP_PORT'),
    });
  }

  /** Never throws — callers log-and-continue per docs/Architecture.md §5.1. */
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

  /** Never throws, same contract as sendConfirmationEmail. */
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
