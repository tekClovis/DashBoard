import { describe, expect, it } from 'vitest';
import { ago, every, hhmm } from './time.js';

describe('time formatting', () => {
  it.each([
    [-5_000, '0s'],
    [9_000, '9s'],
    [4 * 60_000, '4m'],
    [26 * 3_600_000, '26h'],
    [9 * 86_400_000, '9d'],
  ])('ago(%i) is %s', (ms, out) => {
    expect(ago(ms)).toBe(out);
  });

  it.each([
    [30, '30s'],
    [60, '1m'],
    [600, '10m'],
    [3600, '1h'],
    [90, '90s'],
  ])('every(%i) is %s', (sec, out) => {
    expect(every(sec)).toBe(out);
  });

  it('hhmm is local 24h time', () => {
    expect(hhmm(new Date(2026, 9, 1, 9, 5))).toBe('09:05');
  });
});
