import { describe, expect, it } from 'vitest';
import { readCookie } from './cookies.js';

describe('readCookie', () => {
  it('returns null when there is no Cookie header', () => {
    expect(readCookie(undefined, 'session')).toBeNull();
    expect(readCookie('', 'session')).toBeNull();
  });

  it('returns null when the named cookie is absent', () => {
    expect(readCookie('theme=dark; lang=en', 'session')).toBeNull();
  });

  it('picks the named cookie out of several, ignoring surrounding whitespace', () => {
    const header = 'theme=dark;  session = abc.def ;lang=en';

    expect(readCookie(header, 'session')).toBe('abc.def');
    expect(readCookie(header, 'lang')).toBe('en');
  });

  it('matches the whole name, not a prefix or suffix', () => {
    expect(readCookie('old_session=x; sessionid=y', 'session')).toBeNull();
  });

  it('keeps "=" characters inside the value', () => {
    expect(readCookie('session=a=b==', 'session')).toBe('a=b==');
  });

  it('skips parts without "=" instead of stopping', () => {
    expect(readCookie('flag; session=abc', 'session')).toBe('abc');
  });

  it('URI-decodes the value', () => {
    expect(readCookie('state=a%20b%3Bc', 'state')).toBe('a b;c');
  });

  it('returns an empty string for a present but empty cookie', () => {
    expect(readCookie('session=', 'session')).toBe('');
  });

  // Bug: decodeURIComponent throws URIError on a malformed escape, so a client-sent `session=%`
  // makes JwtGuard throw a non-HTTP error (500) instead of treating the cookie as unusable (401).
  it.fails('does not throw on a malformed percent-escape', () => {
    expect(() => readCookie('session=%E0%A4%A', 'session')).not.toThrow();
  });
});
