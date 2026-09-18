import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { widgetCacheKey } from './cache-key.js';

describe('widgetCacheKey', () => {
  it('is order-independent over params (canonical sort)', () => {
    const a = widgetCacheKey('github', 'recent_commits', { repo: 'a/b', count: 5 });
    const b = widgetCacheKey('github', 'recent_commits', { count: 5, repo: 'a/b' });

    expect(a).toBe(b);
  });

  it('matches the documented shape: widget:{service}.{widget}:{sha256(canonical params)}', () => {
    const params = { city: 'Paris' };
    const expectedHash = createHash('sha256').update(JSON.stringify([['city', 'Paris']])).digest('hex');

    expect(widgetCacheKey('weather', 'current', params)).toBe(`widget:weather.current:${expectedHash}`);
  });

  it('omits the :conn: suffix when no connectionId is given', () => {
    expect(widgetCacheKey('weather', 'current', { city: 'Paris' })).not.toContain(':conn:');
  });

  it('appends :conn:{connectionId} when given, and differs per connection', () => {
    const base = widgetCacheKey('github', 'recent_commits', { repo: 'a/b' });
    const forConnA = widgetCacheKey('github', 'recent_commits', { repo: 'a/b' }, 'conn-a');
    const forConnB = widgetCacheKey('github', 'recent_commits', { repo: 'a/b' }, 'conn-b');

    expect(forConnA).toBe(`${base}:conn:conn-a`);
    expect(forConnA).not.toBe(forConnB);
  });

  it('differs when params differ', () => {
    const a = widgetCacheKey('github', 'recent_commits', { repo: 'a/b' });
    const b = widgetCacheKey('github', 'recent_commits', { repo: 'c/d' });

    expect(a).not.toBe(b);
  });
});
