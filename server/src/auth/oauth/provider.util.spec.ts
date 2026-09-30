import { describe, expect, it } from 'vitest';
import { parseProviderSlug } from './provider.util.js';

describe('parseProviderSlug', () => {
  it.each([
    ['github', 'GITHUB'],
    ['GitHub', 'GITHUB'],
    ['google', 'GOOGLE'],
  ])('maps %s to %s', (raw, expected) => {
    expect(parseProviderSlug(raw)).toBe(expected);
  });

  it.each(['steam', 'local', '', 'github '])('rejects the non-login provider "%s" with 400 UNKNOWN_PROVIDER', (raw) => {
    expect(() => parseProviderSlug(raw)).toThrow(
      expect.objectContaining({ status: 400, response: { error: 'UNKNOWN_PROVIDER' } }),
    );
  });
});
