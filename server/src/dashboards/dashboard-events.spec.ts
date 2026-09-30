import { describe, expect, it, vi } from 'vitest';
import { DashboardEventsService, type DashboardEvent } from './dashboard-events.js';

describe('DashboardEventsService', () => {
  it('delivers the whole event to listeners of its own type only', () => {
    const events = new DashboardEventsService();
    const onDeleted = vi.fn();
    const onCreated = vi.fn();
    events.on('instance.deleted', onDeleted);
    events.on('instance.created', onCreated);
    const event: DashboardEvent = { type: 'instance.deleted', instanceId: 'w1' };

    events.emitEvent(event);

    expect(onDeleted).toHaveBeenCalledExactlyOnceWith(event);
    expect(onCreated).not.toHaveBeenCalled();
  });
});
