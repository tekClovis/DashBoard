import { vi } from 'vitest';
import type { Redis } from 'ioredis';
import type { WidgetDefinition } from '../catalog/widget-definition.js';

/** In-memory Redis stub supporting get/set only. */
export function makeFakeRedis(): Redis {
  const store = new Map<string, string>();
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
      return 'OK';
    }),
  } as unknown as Redis;
}

export function makeWidgetDefinition(overrides: Partial<WidgetDefinition<never>> = {}): WidgetDefinition<never> {
  return {
    service: 'fake',
    name: 'echo',
    description: 'test',
    params: [{ name: 'label', type: 'string', required: true }],
    minRefreshSec: 60,
    auth: 'none',
    fetch: vi.fn(async () => ({ ok: true }) as never),
    ...overrides,
  };
}
