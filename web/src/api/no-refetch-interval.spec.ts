import { describe, expect, it } from 'vitest';

/**
 * Checklist item 8 (features/frontend-shell/spec.md): no TanStack Query hook here sets
 * `refetchInterval` — realtime data flows only through useWidgetData's socket subscription.
 */
describe('query hooks', () => {
  it('never set refetchInterval', () => {
    const modules = import.meta.glob('./*.ts', { eager: true, query: '?raw', import: 'default' });

    const offenders = Object.entries(modules)
      .filter(([file]) => !file.endsWith('.spec.ts'))
      .filter(([, contents]) => typeof contents === 'string' && contents.includes('refetchInterval'))
      .map(([file]) => file);

    expect(offenders).toEqual([]);
  });
});
