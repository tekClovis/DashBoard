import { describe, expect, it, vi } from 'vitest';
import type { RequestUser } from '../auth/types.js';
import { DashboardsController } from './dashboards.controller.js';

const user = { id: 'u1' } as RequestUser;
const dashboard = { id: 'd1', name: 'Home', position: 0 };
const instance = { id: 'w1' };

function makeController() {
  const dashboards = {
    list: vi.fn().mockResolvedValue([dashboard]),
    create: vi.fn().mockResolvedValue(dashboard),
    update: vi.fn().mockResolvedValue(dashboard),
    remove: vi.fn().mockResolvedValue(undefined),
    listWidgets: vi.fn().mockResolvedValue([instance]),
    addWidgetInstance: vi.fn().mockResolvedValue(instance),
    updateLayout: vi.fn().mockResolvedValue([instance]),
  };
  const shares = { share: vi.fn().mockResolvedValue(undefined) };
  return { controller: new DashboardsController(dashboards as never, shares as never), dashboards, shares };
}

describe('DashboardsController', () => {
  it('shares the dashboard named by the route id with the dto email as the session user', async () => {
    const { controller, shares } = makeController();

    expect(await controller.share('d1', { email: 'grace@example.com' }, user)).toEqual({ ok: true });
    expect(shares.share).toHaveBeenCalledExactlyOnceWith('u1', 'd1', 'grace@example.com');
  });

  it("wraps the caller's dashboards in a { dashboards } envelope", async () => {
    const { controller, dashboards } = makeController();

    expect(await controller.list(user)).toEqual({ dashboards: [dashboard] });
    expect(dashboards.list).toHaveBeenCalledExactlyOnceWith('u1');
  });

  it('creates a dashboard for the session user from the dto name', async () => {
    const { controller, dashboards } = makeController();

    expect(await controller.create({ name: 'Work' }, user)).toEqual(dashboard);
    expect(dashboards.create).toHaveBeenCalledExactlyOnceWith('u1', 'Work');
  });

  it('updates the dashboard named by the route id as the session user', async () => {
    const { controller, dashboards } = makeController();

    expect(await controller.update('d1', { name: 'Renamed' }, user)).toEqual(dashboard);
    expect(dashboards.update).toHaveBeenCalledExactlyOnceWith('u1', 'd1', { name: 'Renamed' });
  });

  it('answers { ok: true } once the dashboard is removed', async () => {
    const { controller, dashboards } = makeController();

    expect(await controller.remove('d1', user)).toEqual({ ok: true });
    expect(dashboards.remove).toHaveBeenCalledExactlyOnceWith('u1', 'd1');
  });

  it('propagates a removal failure instead of answering ok', async () => {
    const { controller, dashboards } = makeController();
    const notFound = new Error('not found');
    dashboards.remove.mockRejectedValue(notFound);

    await expect(controller.remove('d1', user)).rejects.toBe(notFound);
  });

  it("wraps a dashboard's instances in a { widgets } envelope", async () => {
    const { controller, dashboards } = makeController();

    expect(await controller.listWidgets('d1', user)).toEqual({ widgets: [instance] });
    expect(dashboards.listWidgets).toHaveBeenCalledExactlyOnceWith('u1', 'd1');
  });

  it('adds a widget instance to the dashboard named by the route id as the session user', async () => {
    const { controller, dashboards } = makeController();
    const dto = { service: 'fake', widget: 'echo', params: { label: 'hello' }, refreshRate: 120, x: 0, y: 0, w: 2, h: 2 };

    expect(await controller.addWidget('d1', dto, user)).toEqual(instance);
    expect(dashboards.addWidgetInstance).toHaveBeenCalledExactlyOnceWith('u1', 'd1', dto);
  });

  it('applies a layout batch to the dashboard named by the route id as the session user', async () => {
    const { controller, dashboards } = makeController();
    const entries = [{ id: 'w1', x: 1, y: 2, w: 3, h: 4 }];

    expect(await controller.updateLayout('d1', entries, user)).toEqual([instance]);
    expect(dashboards.updateLayout).toHaveBeenCalledExactlyOnceWith('u1', 'd1', entries);
  });
});
