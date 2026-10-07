// Socket.IO event contract — see docs/Architecture.md §6, §3.

export interface WidgetSubscribePayload {
  instanceId: string;
}

export interface WidgetUnsubscribePayload {
  instanceId: string;
}

/** Payload of {@link SOCKET_EVENTS}.data. */
export interface WidgetDataPayload {
  instanceId: string;
  data: unknown;
  /** ISO timestamp of the upstream fetch. */
  fetchedAt: string;
}

/** Failure reason of a widget fetch. See docs/Architecture.md §6's error-code table for cause/effect per code. */
export type WidgetErrorCode = 'NOT_CONNECTED' | 'REAUTH_REQUIRED' | 'RATE_LIMITED' | 'UPSTREAM_ERROR' | 'INVALID_PARAMS';

/** Payload of {@link SOCKET_EVENTS}.error. */
export interface WidgetErrorPayload {
  instanceId: string;
  code: WidgetErrorCode;
  message: string;
  /** ISO time of the server's next automatic retry; absent when no retry is scheduled. */
  retryAt?: string;
}

/** Socket.IO event names shared by client and server. */
export const SOCKET_EVENTS = {
  subscribe: 'widget:subscribe',
  unsubscribe: 'widget:unsubscribe',
  data: 'widget:data',
  error: 'widget:error',
} as const;
