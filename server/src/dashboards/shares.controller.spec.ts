import { describe, expect, it, vi } from 'vitest';
import type { RequestUser } from '../auth/types.js';
import { SharesController } from './shares.controller.js';

const user = { id: 'u2' } as RequestUser;
const entry = { id: 's1', dashboardName: 'Home', fromEmail: 'a@b.co', widgetCount: 1, createdAt: 'x' };

function makeController() {
  const shares = {
    listIncoming: vi.fn().mockResolvedValue([entry]),
    accept: vi.fn().mockResolvedValue({ id: 'd2', name: 'Home', position: 0 }),
    decline: vi.fn().mockResolvedValue(undefined),
  };
  return { controller: new SharesController(shares as never), shares };
}

describe('SharesController', () => {
  it('wraps the caller\'s incoming shares in { shares }', async () => {
    const { controller, shares } = makeController();
    expect(await controller.incoming(user)).toEqual({ shares: [entry] });
    expect(shares.listIncoming).toHaveBeenCalledExactlyOnceWith('u2');
  });

  it('accepts the share named by the route id as the session user and returns the copy', async () => {
    const { controller, shares } = makeController();
    expect(await controller.accept('s1', user)).toEqual({ id: 'd2', name: 'Home', position: 0 });
    expect(shares.accept).toHaveBeenCalledExactlyOnceWith('u2', 's1');
  });

  it('declines the share as the session user', async () => {
    const { controller, shares } = makeController();
    expect(await controller.decline('s1', user)).toEqual({ ok: true });
    expect(shares.decline).toHaveBeenCalledExactlyOnceWith('u2', 's1');
  });
});
