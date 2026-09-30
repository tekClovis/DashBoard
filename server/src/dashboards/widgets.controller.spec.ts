import { describe, expect, it, vi } from 'vitest';
import type { RequestUser } from '../auth/types.js';
import { WidgetsController } from './widgets.controller.js';

const user = { id: 'u1' } as RequestUser;
const instance = { id: 'w1' };

function makeController() {
  const dashboards = {
    updateWidgetInstance: vi.fn().mockResolvedValue(instance),
    removeWidgetInstance: vi.fn().mockResolvedValue(undefined),
  };
  return { controller: new WidgetsController(dashboards as never), dashboards };
}

describe('WidgetsController', () => {
  it('reconfigures the instance named by the route id as the session user', async () => {
    const { controller, dashboards } = makeController();

    expect(await controller.update('w1', { refreshRate: 300 }, user)).toEqual(instance);
    expect(dashboards.updateWidgetInstance).toHaveBeenCalledExactlyOnceWith('u1', 'w1', { refreshRate: 300 });
  });

  it('answers { ok: true } once the instance is removed', async () => {
    const { controller, dashboards } = makeController();

    expect(await controller.remove('w1', user)).toEqual({ ok: true });
    expect(dashboards.removeWidgetInstance).toHaveBeenCalledExactlyOnceWith('u1', 'w1');
  });

  it('propagates a removal failure instead of answering ok', async () => {
    const { controller, dashboards } = makeController();
    const notFound = new Error('not found');
    dashboards.removeWidgetInstance.mockRejectedValue(notFound);

    await expect(controller.remove('w1', user)).rejects.toBe(notFound);
  });
});
