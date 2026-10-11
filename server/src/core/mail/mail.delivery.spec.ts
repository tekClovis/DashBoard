import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { createServer, type AddressInfo, type Server } from 'node:net';
import type { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { validate } from '../config/env.validation.js';
import { MailService } from './mail.service.js';

const root = (file: string): string => readFileSync(new URL(`../../../../${file}`, import.meta.url), 'utf8');

/** Parse a dotenv-style file into a record (empty values kept as ''), dropping comments. */
function parseEnv(text: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const m = /^([A-Z_]+)=(.*?)(\s+#.*)?$/.exec(line);
    if (m) env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
  return env;
}

describe('.env.example SMTP defaults', () => {
  const env = parseEnv(root('.env.example'));

  it('lists SMTP_USER, SMTP_PASS and SMTP_SECURE with empty values', () => {
    expect(env).toMatchObject({ SMTP_USER: '', SMTP_PASS: '', SMTP_SECURE: '' });
  });

  it('keeps Mailpit as the default SMTP target in .env.example and docker-compose.yml', () => {
    expect(env).toMatchObject({ SMTP_HOST: 'mailpit', SMTP_PORT: '1025' });
    const compose = root('docker-compose.yml');
    expect(compose).toMatch(/image:\s*axllent\/mailpit/);
    // Credentials are only passed through from .env, never given a value in compose.
    expect(compose).not.toMatch(/^\s*SMTP_(USER|PASS|SECURE):(?! \$\{SMTP_\1:-\}$)/m);
  });

  it('passes env validation as shipped', () => {
    const shipped = { ...env, JWT_SECRET: 'x', TOKEN_ENC_KEY: Buffer.alloc(32, 1).toString('base64') };
    expect(() => validate(shipped)).not.toThrow();
  });
});

describe('MailService delivery with the default .env', () => {
  let server: Server | undefined;

  afterEach(() => {
    server?.close();
    vi.restoreAllMocks();
  });

  it('delivers the confirmation email, unauthenticated and in plaintext, to the SMTP_HOST:SMTP_PORT target', async () => {
    const received: string[] = [];
    const data = new Promise<string>((resolve) => {
      server = createServer((socket) => {
        let inData = false;
        let buf = '';
        socket.write('220 test ESMTP\r\n');
        socket.on('data', (chunk) => {
          buf += chunk.toString();
          let i: number;
          while ((i = buf.indexOf('\r\n')) >= 0) {
            const line = buf.slice(0, i);
            buf = buf.slice(i + 2);
            if (inData) {
              if (line === '.') {
                inData = false;
                resolve(received.join('\n'));
                socket.write('250 queued\r\n');
              } else received.push(line);
            } else if (/^EHLO/i.test(line)) socket.write('250-test\r\n250 8BITMIME\r\n');
            else if (/^DATA/i.test(line)) {
              inData = true;
              socket.write('354 go\r\n');
            } else if (/^QUIT/i.test(line)) socket.end('221 bye\r\n');
            else socket.write('250 ok\r\n');
          }
        });
      });
    });
    await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
    const port = (server!.address() as AddressInfo).port;
    const validated = validate({
      ...parseEnv(root('.env.example')),
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: String(port),
      APP_URL: 'http://localhost:8080',
      JWT_SECRET: 'x',
      TOKEN_ENC_KEY: Buffer.alloc(32, 1).toString('base64'),
    }) as unknown as Record<string, unknown>;
    const config = { get: (k: string) => validated[k] || undefined, getOrThrow: (k: string) => validated[k] } as unknown as ConfigService;
    const logError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await new MailService(config).sendConfirmationEmail('user@example.com', 'http://localhost:8080/confirm?token=abc');

    expect(await data).toContain('Subject: Confirm your email');
    expect(logError).not.toHaveBeenCalled();
  });
});
