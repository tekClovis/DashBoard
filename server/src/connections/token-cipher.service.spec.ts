import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { TokenCipherService } from './token-cipher.service.js';

function makeCipher(): TokenCipherService {
  const key = randomBytes(32).toString('base64');
  const config = { getOrThrow: () => key } as unknown as ConfigService;
  return new TokenCipherService(config);
}

describe('TokenCipherService', () => {
  it('round-trips a token back to its original plaintext', () => {
    const cipher = makeCipher();
    const stored = cipher.encrypt('gho_realGitHubAccessToken');

    expect(cipher.decrypt(stored)).toBe('gho_realGitHubAccessToken');
  });

  it('never stores the plaintext token in the encrypted value', () => {
    const cipher = makeCipher();
    const stored = cipher.encrypt('gho_realGitHubAccessToken');

    expect(stored).not.toContain('gho_realGitHubAccessToken');
    expect(stored).not.toBe('gho_realGitHubAccessToken');
  });

  it('stores as iv:tag:ciphertext', () => {
    const cipher = makeCipher();
    const stored = cipher.encrypt('some-token');

    expect(stored.split(':')).toHaveLength(3);
  });

  it('uses a random IV per value, so encrypting the same plaintext twice differs', () => {
    const cipher = makeCipher();
    const first = cipher.encrypt('same-token');
    const second = cipher.encrypt('same-token');

    expect(first).not.toBe(second);
  });

  it('rejects a tampered ciphertext (auth tag mismatch)', () => {
    const cipher = makeCipher();
    const stored = cipher.encrypt('some-token');
    const [iv, tag, ciphertext] = stored.split(':');
    const tampered = `${iv}:${tag}:${ciphertext.slice(0, -2)}${ciphertext.slice(-2) === 'AA' ? 'BB' : 'AA'}`;

    expect(() => cipher.decrypt(tampered)).toThrow();
  });
});
