import { describe, expect, it } from 'vitest';
import type { WidgetDefinition } from './widget-definition.js';
import { WidgetRegistryService } from './widget-registry.service.js';

function makeDef(overrides: Partial<WidgetDefinition> = {}): WidgetDefinition {
  return {
    service: 'weather',
    name: 'current_weather',
    description: 'Current weather for a city.',
    params: [{ name: 'city', type: 'string', required: true }],
    minRefreshSec: 300,
    auth: 'none',
    fetch: async () => ({}) as never,
    ...overrides,
  };
}

describe('WidgetRegistryService', () => {
  it('rejects a widget registered before its service', () => {
    const registry = new WidgetRegistryService();
    expect(() => registry.register(makeDef())).toThrow(/must be registered/);
  });

  it('rejects a duplicate service', () => {
    const registry = new WidgetRegistryService();
    registry.registerService({ name: 'weather', connection: 'none' });
    expect(() => registry.registerService({ name: 'weather', connection: 'none' })).toThrow(
      /already registered/,
    );
  });

  it('rejects a duplicate widget', () => {
    const registry = new WidgetRegistryService();
    registry.registerService({ name: 'weather', connection: 'none' });
    registry.register(makeDef());
    expect(() => registry.register(makeDef())).toThrow(/already registered/);
  });

  it('rejects a widget with no params', () => {
    const registry = new WidgetRegistryService();
    registry.registerService({ name: 'weather', connection: 'none' });
    expect(() => registry.register(makeDef({ params: [] }))).toThrow(/at least one param/);
  });

  it('projects registered services and widgets', () => {
    const registry = new WidgetRegistryService();
    registry.registerService({ name: 'weather', connection: 'none' });
    registry.register(makeDef());

    expect(registry.services()).toEqual([
      {
        name: 'weather',
        connection: 'none',
        widgets: [
          {
            service: 'weather',
            name: 'current_weather',
            description: 'Current weather for a city.',
            params: [{ name: 'city', type: 'string', required: true }],
            minRefreshSec: 300,
          },
        ],
      },
    ]);
    expect(registry.get('weather', 'current_weather')).toMatchObject({ name: 'current_weather' });
    expect(registry.get('weather', 'missing')).toBeUndefined();
  });
});
