import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';

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
    try {
      await this.transporter.sendMail({
        from: this.from,
        to,
        subject: 'Confirm your email',
        text: `Confirm your email: ${confirmUrl}`,
        html: `<p>Confirm your email: <a href="${confirmUrl}">${confirmUrl}</a></p>`,
      });
    } catch (err) {
      this.logger.error(`Failed to send confirmation email to ${to}`, err instanceof Error ? err.stack : err);
    }
  }

  /** Never throws, same contract as sendConfirmationEmail. */
  async sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: this.from,
        to,
        subject: 'Reset your password',
        text: `Reset your password: ${resetUrl}\nThis link works once and for 1 hour.`,
        html: `<p>Reset your password: <a href="${resetUrl}">${resetUrl}</a></p><p>This link works once and for 1 hour.</p>`,
      });
    } catch (err) {
      this.logger.error(`Failed to send password reset email to ${to}`, err instanceof Error ? err.stack : err);
    }
  }
}
