import type { WidgetInstanceEntry } from '@dashboard/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useUpdateLayout } from './widgets.js';

afterEach(() => vi.unstubAllGlobals());

describe('useUpdateLayout', () => {
  it('cancels in-flight widget queries before the optimistic write, and resyncs on settle', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('{}', { status: 200 }))),
    );
    const client = new QueryClient();
    const w = { id: 'a', x: 0, y: 0, w: 4, h: 3 } as WidgetInstanceEntry;
    client.setQueryData(['widgets', 'd'], { widgets: [w] });
    const order: string[] = [];
    vi.spyOn(client, 'cancelQueries').mockImplementation(() => {
      order.push('cancel');
      return Promise.resolve();
    });
    const setData = client.setQueryData.bind(client);
    vi.spyOn(client, 'setQueryData').mockImplementation(((...args: Parameters<typeof setData>) => {
      order.push('write');
      return setData(...args);
    }) as typeof client.setQueryData);
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useUpdateLayout('d'), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });
    await act(() => result.current.mutateAsync([{ id: 'a', x: 5, y: 0, w: 4, h: 3 }]));

    expect(order).toEqual(['cancel', 'write']);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['widgets', 'd'] });
  });
});
