// Redis cache key shape — see docs/Architecture.md §7.
//
//   widget:{service}.{widget}:{sha256(canonical sorted params)}[:conn:{connectionId}]
//
// The `:conn:` suffix is present iff the widget's def.auth === 'connection', so two users'
// connection-scoped fetches never share a cache entry while public (auth: 'none') data is
// shared across all users.

import { createHash } from 'node:crypto';

export function widgetCacheKey(
  service: string,
  widget: string,
  params: Record<string, string | number>,
  connectionId?: string,
): string {
  const hash = createHash('sha256').update(canonicalParams(params)).digest('hex');
  const base = `widget:${service}.${widget}:${hash}`;
  return connectionId ? `${base}:conn:${connectionId}` : base;
}

/** Params as key-sorted JSON, so equal params give the same string whatever their key order. */
export function canonicalParams(params: Record<string, string | number>): string {
  return JSON.stringify(sortedEntries(params));
}

function sortedEntries(params: Record<string, string | number>): [string, string | number][] {
  return Object.keys(params)
    .sort()
    .map((key) => [key, params[key]]);
}
