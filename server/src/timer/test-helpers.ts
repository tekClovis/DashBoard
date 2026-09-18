import { vi } from 'vitest';
import type { WidgetDefinition } from '../catalog/widget-definition.js';

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
