import { describe, expect, it } from 'vitest';
import { WidgetRegistryService } from '../catalog/widget-registry.service.js';
import { fakeWidgetsEnabled, registerFakeWidgets } from './fake-widgets.js';

describe('fakeWidgetsEnabled', () => {
  it('is true only for ENABLE_FAKE_WIDGETS=true', () => {
    expect(fakeWidgetsEnabled({ ENABLE_FAKE_WIDGETS: 'true' })).toBe(true);
  });

  it.each([{}, { ENABLE_FAKE_WIDGETS: '' }, { ENABLE_FAKE_WIDGETS: 'false' }, { ENABLE_FAKE_WIDGETS: '1' }])(
    'is false for %o, even outside production',
    (env) => {
      expect(fakeWidgetsEnabled({ ...env, NODE_ENV: 'development' })).toBe(false);
    },
  );
});

describe('registerFakeWidgets', () => {
  it('registers the fake services, which a fresh registry does not have', () => {
    const registry = new WidgetRegistryService();
    expect(registry.services()).toEqual([]);

    registerFakeWidgets(registry);

    expect(registry.services().map((s) => s.name)).toEqual(expect.arrayContaining(['fake', 'fake-connected']));
  });
});
