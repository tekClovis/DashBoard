import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Request } from 'express';
import { makeWidgetDefinition } from '../timer/test-helpers.js';
import { AboutController } from './about.controller.js';
import { WidgetRegistryService } from './widget-registry.service.js';

function makeReq(remoteAddress: string): Request {
  return { socket: { remoteAddress }, headers: {} } as unknown as Request;
}

describe('AboutController', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports the client host with the IPv4-mapped prefix stripped', () => {
    const about = new AboutController(new WidgetRegistryService()).get(makeReq('::ffff:192.0.2.10'));

    expect(about.client).toEqual({ host: '192.0.2.10' });
  });

  it('reports current_time as whole Unix seconds', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-30T12:00:00.999Z'));

    const about = new AboutController(new WidgetRegistryService()).get(makeReq('127.0.0.1'));

    expect(about.server.current_time).toBe(Date.UTC(2026, 8, 30, 12, 0, 0) / 1000);
  });

  it('returns an empty services list from an empty registry', () => {
    const about = new AboutController(new WidgetRegistryService()).get(makeReq('127.0.0.1'));

    expect(about.server.services).toEqual([]);
  });

  it('projects services and widgets to the trimmed public shape', () => {
    const registry = new WidgetRegistryService();
    registry.registerService({ name: 'weather', connection: 'none' });
    registry.registerService({ name: 'github', connection: 'oauth' });
    registry.register(
      makeWidgetDefinition({
        service: 'weather',
        name: 'current_weather',
        description: 'Current weather for a city.',
        params: [
          { name: 'city', type: 'string', required: true },
          { name: 'days', type: 'integer', required: false },
        ],
      }),
    );

    const about = new AboutController(registry).get(makeReq('127.0.0.1'));

    expect(about.server.services).toEqual([
      {
        name: 'weather',
        widgets: [
          {
            name: 'current_weather',
            description: 'Current weather for a city.',
            params: [
              { name: 'city', type: 'string' },
              { name: 'days', type: 'integer' },
            ],
          },
        ],
      },
      { name: 'github', widgets: [] },
    ]);
  });
});
