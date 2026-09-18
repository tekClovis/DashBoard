// Fake WidgetDefinitions exercising the full subscribe -> Timer -> FetchService -> Redis ->
// widget:data/widget:error pipeline before any real `server/src/services/*` module exists
// (out of scope here — see features/timer-realtime/spec.md's Constraints). Registered only
// outside production. Swapping in real weather/github/etc. definitions later is purely
// additive: register them with WidgetRegistryService the same way, no Timer/gateway changes.

import type { WidgetDefinition } from '../catalog/widget-definition.js';
import { WidgetRegistryService } from '../catalog/widget-registry.service.js';
import { FetchError } from './fetch-error.js';

// WidgetDataMap is augmented per widget by the module that registers it (see
// widget-definition.ts / widgets.ts) so a view and its server fetch() cannot drift apart.
declare module '@dashboard/shared' {
  interface WidgetDataMap {
    'fake.echo': { label: string | number; value: number };
    'fake-connected.profile': { label: string | number; userId: string; hasToken: boolean };
  }
}

/** `params.label` of 'rate-limited' / 'not-connected' triggers that failure instead of data. */
const fakeEchoWidget: WidgetDefinition<'fake.echo'> = {
  service: 'fake',
  name: 'echo',
  description: 'Deterministic fake data for exercising the Timer/FetchService pipeline.',
  params: [{ name: 'label', type: 'string', required: true }],
  minRefreshSec: 1,
  auth: 'none',
  fetch: async (params) => {
    if (params['label'] === 'rate-limited') throw new FetchError('RATE_LIMITED', 'Fake upstream rate limit.');
    if (params['label'] === 'not-connected') throw new FetchError('NOT_CONNECTED', 'Fake service requires a connection.');
    return { label: params['label'], value: Math.random() };
  },
};

/** Connection-scoped fake widget, for exercising the `:conn:` cache-key suffix and token decryption. */
const fakeProfileWidget: WidgetDefinition<'fake-connected.profile'> = {
  service: 'fake-connected',
  name: 'profile',
  description: 'Deterministic fake connection-scoped data for exercising the FetchContext.',
  params: [{ name: 'label', type: 'string', required: true }],
  minRefreshSec: 1,
  auth: 'connection',
  fetch: async (params, ctx) => ({ label: params['label'], userId: ctx.userId, hasToken: Boolean(ctx.accessToken) }),
};

export function registerFakeWidgets(registry: WidgetRegistryService): void {
  registry.registerService({ name: 'fake', connection: 'none' });
  registry.register(fakeEchoWidget);
  registry.registerService({ name: 'fake-connected', connection: 'oauth' });
  registry.register(fakeProfileWidget);
}
