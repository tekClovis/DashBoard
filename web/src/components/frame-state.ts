import type { WidgetErrorCode } from '@dashboard/shared';
import { ago, hhmm } from '@/lib/time.js';
import type { WidgetCacheEntry } from '@/realtime/useWidgetData.js';

export type FrameState = 'warn' | 'error' | 'loading' | 'paused' | 'stale' | 'live';

/** Codes that recover by themselves or need one click (amber); the rest failed (red). */
const WARN_CODES: ReadonlySet<WidgetErrorCode> = new Set(['NOT_CONNECTED', 'REAUTH_REQUIRED', 'RATE_LIMITED']);

/** design-reference §5 frame state machine: first match wins. */
export function frameState(
  entry: WidgetCacheEntry | undefined,
  connected: boolean,
  refreshRate: number,
  now: number,
): FrameState {
  if (entry?.error) return WARN_CODES.has(entry.error.code) ? 'warn' : 'error';
  if (!entry?.fetchedAt) return 'loading';
  if (!connected) return 'paused';
  if (now - Date.parse(entry.fetchedAt) > 2 * refreshRate * 1000) return 'stale';
  return 'live';
}

export interface ErrorCopy {
  title: string;
  body: string;
  /** Short status label next to the header lamp. */
  meta: string;
  action?: { to: 'services' | 'configure'; label: string };
}

interface CopyContext {
  /** Display name of the service, e.g. "GitHub". */
  service: string;
  /** The weather city param, named in the INVALID_PARAMS copy. */
  city?: string;
  now: number;
}

type WidgetError = NonNullable<WidgetCacheEntry['error']>;

const COPY: Record<WidgetErrorCode, (error: WidgetError, ctx: CopyContext) => ErrorCopy> = {
  NOT_CONNECTED: (_, { service }) => ({
    title: `${service} isn’t connected`,
    body: 'Connect it to start receiving data.',
    meta: 'not connected',
    action: { to: 'services', label: `Connect ${service}` },
  }),
  REAUTH_REQUIRED: (_, { service }) => ({
    title: `${service} access expired`,
    body: 'Reconnect to resume updates. Your widget settings are kept.',
    meta: 'reconnect',
    action: { to: 'services', label: `Reconnect ${service}` },
  }),
  RATE_LIMITED: ({ retryAt }, { service, now }) => {
    const wait = retryAt && ago(Date.parse(retryAt) - now);
    return {
      title: `${service} rate limit reached`,
      body: retryAt ? `Next attempt at ${hhmm(retryAt)}, in ${wait}.` : 'Retrying automatically.',
      meta: wait ? `retry ${wait}` : 'retry',
    };
  },
  UPSTREAM_ERROR: ({ retryAt }, { service }) => ({
    title: `${service} didn’t respond`,
    body: `Retrying automatically.${retryAt ? ` Next attempt at ${hhmm(retryAt)}.` : ''}`,
    meta: 'failed',
  }),
  INVALID_PARAMS: (_, { city }) => ({
    ...(city
      ? { title: 'City not found', body: `No results for “${city}”. Check the city name.` }
      : { title: 'Settings rejected', body: 'The service rejected these settings. Check them and save again.' }),
    meta: 'fix settings',
    action: { to: 'configure', label: 'Configure' },
  }),
};

/** Alert band + header copy for one widget error (design-reference §5). */
export function errorCopy(error: WidgetError, ctx: CopyContext): ErrorCopy {
  return COPY[error.code](error, ctx);
}
