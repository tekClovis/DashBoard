// Extension point for timer-realtime — see docs/Architecture.md §5.4 and
// features/dashboards-api/spec.md's non-goals. This feature never touches the Timer's in-memory
// active set or Socket.IO directly; it only emits when a WidgetInstance is created, reconfigured,
// or deleted, so timer-realtime can subscribe (`events.on('instance.created', ...)`) to
// activate/deactivate its per-instance refresh loop without this module knowing it exists.

import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import type { WidgetInstanceEntry } from '@dashboard/shared';

/** Lifecycle event of a WidgetInstance; `type` is also the emitted event name. */
export type DashboardEvent =
  | { type: 'instance.created'; instance: WidgetInstanceEntry }
  | { type: 'instance.updated'; instance: WidgetInstanceEntry }
  | { type: 'instance.deleted'; instanceId: string };

/** In-process event bus for WidgetInstance changes; listeners subscribe by event type. */
@Injectable()
export class DashboardEventsService extends EventEmitter {
  /** Emits `event` synchronously under the name `event.type`. */
  emitEvent(event: DashboardEvent): void {
    this.emit(event.type, event);
  }
}
