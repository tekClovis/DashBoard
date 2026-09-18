// Thrown by a WidgetDefinition's fetch() to signal a specific realtime error code — see
// docs/Architecture.md §6's error-code table. Anything else thrown from fetch() is treated
// as UPSTREAM_ERROR by the Timer.

import type { WidgetErrorCode } from '@dashboard/shared';

export class FetchError extends Error {
  constructor(
    public readonly code: WidgetErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'FetchError';
  }
}
