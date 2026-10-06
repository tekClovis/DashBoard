import { PASSWORD_PATTERN } from '@dashboard/shared';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_PATTERN.test(email);
}

export function isValidPassword(password: string): boolean {
  return PASSWORD_PATTERN.test(password);
}

/** Mirrors the shared PASSWORD_PATTERN, one rule per line. */
export const PASSWORD_RULES: [string, (pw: string) => boolean][] = [
  ['8 to 72 characters', (pw) => pw.length >= 8 && pw.length <= 72],
  ['At least one digit', (pw) => /\d/.test(pw)],
  ['At least one symbol', (pw) => /[^A-Za-z0-9]/.test(pw)],
];
