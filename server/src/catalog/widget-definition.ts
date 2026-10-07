// Server-side widget registration — see docs/Architecture.md §8.1.

import type { ParamSpec, WidgetDataMap } from '@dashboard/shared';

export type Params = Record<string, string | number>;

/** Decrypted, per-user context a widget's fetch() runs with. Never serialized to the client. */
export interface FetchContext {
  userId: string;
  /** Decrypted access token, present only when the widget's service required a connection. */
  accessToken?: string;
  /** When accessToken expires, if the provider said so. */
  expiresAt?: Date;
  /** The connection's provider-side account id (e.g. SteamID64), present only when the widget's service required a connection. */
  externalAccountId?: string;
}

/** A widget as registered server-side: its public spec plus the `fetch` that produces its data. */
export interface WidgetDefinition<K extends keyof WidgetDataMap = keyof WidgetDataMap> {
  service: string;
  name: string;
  description: string;
  /** Must have at least one entry, or the widget does not count toward the subject's requirement. */
  params: ParamSpec[];
  /** Floor for the instance's refreshRate, and the Redis cache TTL. */
  minRefreshSec: number;
  /** 'connection' means the widget needs the user's ServiceConnection for this service. */
  auth: 'none' | 'connection';
  fetch(params: Params, ctx: FetchContext): Promise<WidgetDataMap[K]>;
}
