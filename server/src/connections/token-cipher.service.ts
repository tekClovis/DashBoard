// AES-256-GCM token encryption — see docs/Architecture.md §5.2.
//
// Key: TOKEN_ENC_KEY (32 bytes, base64, from env; shape validated at boot by
// env.validation.ts). Random 12-byte IV per value, stored as
// `iv:tag:ciphertext` (each base64). Decryption is only ever meant to run
// inside a later `FetchContext` — never call `decrypt` on a value headed for
// an API response.

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

@Injectable()
export class TokenCipherService {
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    this.key = Buffer.from(config.getOrThrow<string>('TOKEN_ENC_KEY'), 'base64');
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`;
  }

  decrypt(stored: string): string {
    const [ivB64, tagB64, ciphertextB64] = stored.split(':');
    if (!ivB64 || !tagB64 || !ciphertextB64) {
      throw new Error('Malformed encrypted token value.');
    }
    const decipher = createDecipheriv(ALGORITHM, this.key, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextB64, 'base64')), decipher.final()]);
    return plaintext.toString('utf8');
  }
}
