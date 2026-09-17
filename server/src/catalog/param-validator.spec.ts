import { describe, expect, it } from 'vitest';
import type { ParamSpec } from '@dashboard/shared';
import { validateParams } from './param-validator.js';

const specs: ParamSpec[] = [
  { name: 'repo', type: 'string', required: true, pattern: '^[\\w.-]+/[\\w.-]+$', label: 'Repository' },
  { name: 'count', type: 'integer', min: 1, max: 20, default: 5, label: 'Count' },
  { name: 'sort', type: 'string', enum: ['recent', 'oldest'], default: 'recent', label: 'Sort' },
];

describe('validateParams', () => {
  it('accepts a fully-valid params object and coerces a numeric string to a number', () => {
    const result = validateParams(specs, { repo: 'octocat/hello-world', count: '10', sort: 'oldest' });

    expect(result).toEqual({ ok: true, params: { repo: 'octocat/hello-world', count: 10, sort: 'oldest' } });
  });

  it('fills in defaults for omitted optional params', () => {
    const result = validateParams(specs, { repo: 'octocat/hello-world' });

    expect(result).toEqual({ ok: true, params: { repo: 'octocat/hello-world', count: 5, sort: 'recent' } });
  });

  it('drops unknown params instead of passing them through', () => {
    const result = validateParams(specs, {
      repo: 'octocat/hello-world',
      count: 5,
      sort: 'recent',
      admin: true,
      extra: 'nope',
    });

    expect(result).toEqual({ ok: true, params: { repo: 'octocat/hello-world', count: 5, sort: 'recent' } });
  });

  it('rejects a missing required param', () => {
    const result = validateParams(specs, { count: 5 });

    expect(result).toEqual({ ok: false, error: { param: 'repo', message: expect.stringContaining('repo') } });
  });

  it('rejects an out-of-range integer', () => {
    const result = validateParams(specs, { repo: 'octocat/hello-world', count: 21 });

    expect(result).toEqual({ ok: false, error: { param: 'count', message: expect.stringContaining('count') } });
  });

  it('rejects a string that fails its pattern', () => {
    const result = validateParams(specs, { repo: 'not-a-valid-repo' });

    expect(result).toEqual({ ok: false, error: { param: 'repo', message: expect.stringContaining('repo') } });
  });

  it('rejects a value not in an enum', () => {
    const result = validateParams(specs, { repo: 'octocat/hello-world', sort: 'sideways' });

    expect(result).toEqual({ ok: false, error: { param: 'sort', message: expect.stringContaining('sort') } });
  });

  it('rejects a non-integer value for an integer param', () => {
    const result = validateParams(specs, { repo: 'octocat/hello-world', count: 'not-a-number' });

    expect(result).toEqual({ ok: false, error: { param: 'count', message: expect.stringContaining('count') } });
  });
});
