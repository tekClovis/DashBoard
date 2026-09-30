import { describe, expect, it } from 'vitest';
import { FetchError } from './fetch-error.js';

describe('FetchError', () => {
  it('is an Error carrying the realtime code, the message and its own name', () => {
    const err = new FetchError('REAUTH_REQUIRED', 'token expired');

    expect(err).toBeInstanceOf(Error);
    expect(err).toMatchObject({ code: 'REAUTH_REQUIRED', message: 'token expired', name: 'FetchError' });
  });
});
