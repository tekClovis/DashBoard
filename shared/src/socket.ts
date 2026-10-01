// Socket.IO event contract — see docs/Architecture.md §6, §8.

export interface WidgetSubscribePayload {
  instanceId: string;
}

export interface WidgetUnsubscribePayload {
  instanceId: string;
}

export interface WidgetDataPayload {
  instanceId: string;
  data: unknown;
  fetchedAt: string;
  /** Stable key of the params this data was fetched with; changes when the instance is reconfigured. */
  paramsKey?: string;
}

/** See docs/Architecture.md §6's error-code table for cause/effect per code. */
export type WidgetErrorCode = 'NOT_CONNECTED' | 'REAUTH_REQUIRED' | 'RATE_LIMITED' | 'UPSTREAM_ERROR' | 'INVALID_PARAMS';

export interface WidgetErrorPayload {
  instanceId: string;
  code: WidgetErrorCode;
  message: string;
  retryAt?: string;
}

export const SOCKET_EVENTS = {
  subscribe: 'widget:subscribe',
  unsubscribe: 'widget:unsubscribe',
  data: 'widget:data',
  error: 'widget:error',
} as const;
