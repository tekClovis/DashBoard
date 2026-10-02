import type { WidgetDataMap, WidgetInstanceEntry } from '@dashboard/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SocketContext, type SocketContextValue } from '@/realtime/SocketProvider.js';
import * as widgetData from '@/realtime/useWidgetData.js';
import type { WidgetCacheEntry } from '@/realtime/useWidgetData.js';
import { WidgetFrame } from './WidgetFrame.js';

const instance: WidgetInstanceEntry = {
  id: 'i1',
  dashboardId: 'd',
  service: 'github',
  widget: 'recent_commits',
  params: { repo: 'acme/telemetry' },
  refreshRate: 60,
  x: 0,
  y: 0,
  w: 4,
  h: 3,
};

const commits: WidgetDataMap['github.recent_commits'] = {
  repo: 'acme/telemetry',
  commits: [{ sha: 'a3f9c21ffff', message: 'fix(grid): clamp resize', author: 'ada', date: new Date().toISOString(), url: 'https://x/c' }],
};

const socketValue = (socket: unknown, connected: boolean): SocketContextValue => ({
  socket: socket as SocketContextValue['socket'],
  connected,
  connection: connected ? { status: 'live' } : { status: 'reconnecting', attempt: 1 },
  retry: () => {},
});

const secondsAgo = (s: number) => new Date(Date.now() - s * 1000).toISOString();

function renderFrame(
  entry: WidgetCacheEntry | undefined,
  { connected = true, inst = instance, onConfigure = vi.fn() } = {},
) {
  vi.spyOn(widgetData, 'useWidgetData').mockReturnValue({ data: entry } as ReturnType<
    typeof widgetData.useWidgetData
  >);
  return render(
    <SocketContext.Provider value={socketValue(null, connected)}>
      <MemoryRouter>
        <WidgetFrame instance={inst} onConfigure={onConfigure} onDelete={vi.fn()} onMove={vi.fn()} />
      </MemoryRouter>
    </SocketContext.Provider>,
  );
}

const panel = (c: HTMLElement) => c.querySelector('article') as HTMLElement;
const lamp = (c: HTMLElement) => c.querySelector('[data-slot="lamp"][data-state]') as HTMLElement;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('WidgetFrame header', () => {
  it('titles the panel with the service name and widget label, refresh interval and menu', () => {
    renderFrame({ data: commits, fetchedAt: secondsAgo(9), error: null });

    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('GitHub Recent commits');
    expect(screen.getByTitle('Refresh interval').textContent).toBe('1m');
    expect(screen.getByRole('button', { name: 'GitHub Recent commits options' })).toBeTruthy();
  });

  it('falls back to the raw service and widget names for an unknown widget', () => {
    renderFrame(undefined, { inst: { ...instance, service: 'fake', widget: 'echo' } });
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('fake echo');
  });
});

describe('WidgetFrame states', () => {
  it('loading: skeleton, waiting lamp and copy naming the service', () => {
    const { container } = renderFrame(undefined);

    expect(panel(container).dataset.state).toBe('loading');
    expect(lamp(container).dataset.state).toBe('waiting');
    expect(screen.getByText('waiting')).toBeTruthy();
    expect(container.querySelector('[data-slot="skeleton"]')).toBeTruthy();
    expect(screen.getByText('Waiting for the first update from GitHub.')).toBeTruthy();
  });

  it('live: the view sits in the only aria-live region, with a green lamp and "updated … ago"', () => {
    const { container } = renderFrame({ data: commits, fetchedAt: secondsAgo(9), error: null });

    expect(panel(container).dataset.state).toBe('live');
    expect(lamp(container).dataset.state).toBe('live');
    expect(lamp(container).parentElement?.textContent).toMatch(/updated \d+s ago/);
    const live = container.querySelectorAll('[aria-live]');
    expect(live).toHaveLength(1);
    expect(live[0].textContent).toContain('fix(grid): clamp resize');
  });

  it('renders the JSON fallback for an unknown widget', () => {
    renderFrame({ data: { temp: 18 }, fetchedAt: secondsAgo(1), error: null }, { inst: { ...instance, service: 'fake' } });
    expect(screen.getByText(/"temp": 18/)).toBeTruthy();
  });

  it('stale: keeps the view and adds a footer note with the expected interval', () => {
    const { container } = renderFrame({ data: commits, fetchedAt: secondsAgo(200), error: null });

    expect(panel(container).dataset.state).toBe('stale');
    expect(lamp(container).dataset.state).toBe('stale');
    // A footer outside the scrolling body, so long detail never pushes it out of view.
    const note = screen.getByText('No update for 3m. Expected every 1m.');
    expect(note.closest('[aria-live]')).toBeNull();
    expect(note.closest('.overflow-auto')).toBeNull();
    expect(screen.getByText('fix(grid): clamp resize')).toBeTruthy();
  });

  it('paused: keeps the view unchanged with a paused lamp', () => {
    const { container } = renderFrame({ data: commits, fetchedAt: secondsAgo(9), error: null }, { connected: false });

    expect(panel(container).dataset.state).toBe('paused');
    expect(lamp(container).dataset.state).toBe('paused');
    expect(lamp(container).parentElement?.textContent).toMatch(/paused \d+s/);
    expect(screen.getByText('fix(grid): clamp resize')).toBeTruthy();
  });

  it.each(['REAUTH_REQUIRED', 'NOT_CONNECTED'] as const)('%s: amber band linking to Services', (code) => {
    const { container } = renderFrame({ data: null, fetchedAt: null, error: { code, message: 'x' } });

    expect(panel(container).dataset.state).toBe('warn');
    expect(lamp(container).dataset.state).toBe('warn');
    expect(screen.getByRole('alert').textContent).toContain('GitHub');
    expect(screen.getByRole('link', { name: /connect GitHub/i }).getAttribute('href')).toBe('/services');
  });

  it('keeps earlier data under the band, captioned "Last data from HH:MM", without the stat', () => {
    const fetchedAt = new Date(2026, 9, 1, 14, 5).toISOString();
    renderFrame({ data: commits, fetchedAt, error: { code: 'RATE_LIMITED', message: 'x' } });

    expect(screen.getByText('Last data from 14:05')).toBeTruthy();
    expect(screen.getByText('fix(grid): clamp resize')).toBeTruthy();
    expect(screen.queryByText('since the last commit')).toBeNull();
  });

  it('INVALID_PARAMS: red band whose Configure action opens the dialog', () => {
    const onConfigure = vi.fn();
    const { container } = renderFrame(
      { data: null, fetchedAt: null, error: { code: 'INVALID_PARAMS', message: 'x' } },
      { inst: { ...instance, service: 'weather', widget: 'current_weather', params: { city: 'Pariss' } }, onConfigure },
    );

    expect(panel(container).dataset.state).toBe('error');
    expect(lamp(container).dataset.state).toBe('error');
    expect(screen.getByText('No results for “Pariss”. Check the city name.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Configure' }));
    expect(onConfigure).toHaveBeenCalled();
  });

  it('UPSTREAM_ERROR: red "failed" lamp, no green anywhere', () => {
    const { container } = renderFrame({ data: null, fetchedAt: null, error: { code: 'UPSTREAM_ERROR', message: 'x' } });

    expect(lamp(container).dataset.state).toBe('error');
    expect(screen.getByText('failed')).toBeTruthy();
    expect(screen.getByText('GitHub didn’t respond')).toBeTruthy();
    expect(container.querySelector('[data-state="live"]')).toBeNull();
  });
});

describe('WidgetFrame push history (design-reference §5)', () => {
  function fakeSocket() {
    const handlers = new Map<string, (payload: unknown) => void>();
    return {
      emit: vi.fn(),
      on: vi.fn((event: string, handler: (payload: unknown) => void) => void handlers.set(event, handler)),
      off: vi.fn(),
      /** Delivers one event and lets the batched cache notification render it. */
      trigger: (event: string, payload: unknown) =>
        act(async () => {
          handlers.get(event)?.(payload);
          await new Promise((resolve) => setTimeout(resolve, 0));
        }),
    };
  }

  /** Mounts the real frame (real `useWidgetData`) over a shared query client; returns a remount helper. */
  function mountLive(inst: WidgetInstanceEntry) {
    const socket = fakeSocket();
    const queryClient = new QueryClient();
    const tree = (current = inst) => (
      <QueryClientProvider client={queryClient}>
        <SocketContext.Provider value={socketValue(socket, true)}>
          <MemoryRouter>
            <WidgetFrame instance={current} onConfigure={vi.fn()} onDelete={vi.fn()} onMove={vi.fn()} />
          </MemoryRouter>
        </SocketContext.Provider>
      </QueryClientProvider>
    );
    const view = render(tree());
    return {
      push: (data: unknown, fetchedAt: string) => socket.trigger('widget:data', { instanceId: inst.id, data, fetchedAt }),
      fail: () => socket.trigger('widget:error', { instanceId: inst.id, code: 'UPSTREAM_ERROR', message: 'down' }),
      /** Unmounts and mounts again, optionally with the instance as it is after a Configure save. */
      remount: (next = inst) => {
        view.unmount();
        return render(tree(next));
      },
    };
  }

  /** Query-cache notifications are batched, so wait for the panel to show its sparkline. */
  const sparkLabel = async () => (await screen.findByRole('img')).getAttribute('aria-label');
  const at = (m: number) => new Date(Date.now() - (10 - m) * 1000).toISOString();
  const weather = { ...instance, id: 'w1', service: 'weather', widget: 'current_weather', params: { city: 'Paris' } };
  const temp = (temperature: number) => ({ location: 'Paris, France', temperature, unit: '°C', condition: 'Clear' });

  it('current_weather: the sparkline survives a view remount', async () => {
    const live = mountLive(weather);
    await live.push(temp(17.6), at(1));
    await live.push(temp(18.4), at(2));
    await live.push(temp(19.1), at(3));
    expect(await sparkLabel()).toBe('Temperature, last 3 updates, °C');

    live.remount();
    expect(await sparkLabel()).toBe('Temperature, last 3 updates, °C');
    expect(await screen.findByText(/↑ 1\.5° since/)).toBeTruthy();
  });

  it('current_weather: changing the city starts a new sparkline instead of mixing cities', async () => {
    const live = mountLive(weather);
    await live.push(temp(19.9), at(1));
    await live.push(temp(19.9), at(2));
    expect(await sparkLabel()).toBe('Temperature, last 2 updates, °C');

    live.remount({ ...weather, params: { city: 'Reykjavik' } });
    await live.push({ ...temp(10), location: 'Reykjavik, Iceland' }, at(3));
    await live.push({ ...temp(10.5), location: 'Reykjavik, Iceland' }, at(4));
    expect(await sparkLabel()).toBe('Temperature, last 2 updates, °C');
    expect(screen.queryByText(/↓ 9\.9°/)).toBeNull();
    expect(await screen.findByText(/↑ 0\.5° since/)).toBeTruthy();
  });

  it('current_weather: the sparkline survives an error band and recovery', async () => {
    const live = mountLive(weather);
    await live.push(temp(17.6), at(1));
    await live.push(temp(18.4), at(2));
    await live.fail();
    expect(await sparkLabel()).toBe('Temperature, last 2 updates, °C');
    await live.push(temp(19.1), at(3));
    expect(await sparkLabel()).toBe('Temperature, last 3 updates, °C');
  });

  it('pull_requests: the delta since the previous push survives a view remount', async () => {
    const pr = (n: number) => ({ number: n, title: `t${n}`, state: 'open' as const, author: 'a', url: 'https://x' });
    const prs = { ...instance, id: 'p1', widget: 'pull_requests', params: { repo: 'acme/telemetry', state: 'open' } };
    const live = mountLive(prs);
    await live.push({ repo: 'acme/telemetry', state: 'open', pulls: [pr(1)] }, at(1));
    await live.push({ repo: 'acme/telemetry', state: 'open', pulls: [pr(1), pr(2), pr(3)] }, at(2));
    expect(await screen.findByText(/↑2 since/)).toBeTruthy();

    live.remount();
    expect(await screen.findByText(/↑2 since/)).toBeTruthy();
  });

  it('pull_requests: changing state= does not compare against the old filter', async () => {
    const pr = (n: number) => ({ number: n, title: `t${n}`, state: 'open' as const, author: 'a', url: 'https://x' });
    const prs = { ...instance, id: 'p2', widget: 'pull_requests', params: { repo: 'acme/telemetry', state: 'open' } };
    const live = mountLive(prs);
    await live.push({ repo: 'acme/telemetry', state: 'open', pulls: [pr(1)] }, at(1));

    live.remount({ ...prs, params: { repo: 'acme/telemetry', state: 'all' } });
    await live.push({ repo: 'acme/telemetry', state: 'all', pulls: [pr(1), pr(2), pr(3)] }, at(2));
    expect(await screen.findByText('t3')).toBeTruthy();
    expect(screen.queryByText(/since/)).toBeNull();
  });
});

describe('WidgetFrame live pulse (design-reference §5)', () => {
  it('sets data-pulse on the panel for --dur-pulse on each widget:data, not on mount or on errors', async () => {
    const handlers = new Map<string, (payload: unknown) => void>();
    const socket = { emit: vi.fn(), on: vi.fn((e: string, h: (p: unknown) => void) => void handlers.set(e, h)), off: vi.fn() };
    const queryClient = new QueryClient();
    queryClient.setQueryData<WidgetCacheEntry>(['widget', 'i1'], { data: commits, fetchedAt: secondsAgo(5), error: null });
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <SocketContext.Provider value={socketValue(socket, true)}>
          <MemoryRouter>
            <WidgetFrame instance={instance} onConfigure={vi.fn()} onDelete={vi.fn()} onMove={vi.fn()} />
          </MemoryRouter>
        </SocketContext.Provider>
      </QueryClientProvider>,
    );
    const deliver = (event: string, payload: object) =>
      act(async () => {
        handlers.get(event)?.({ instanceId: 'i1', ...payload });
        // Flush the batched cache notification (a 0 ms timeout) under fake timers.
        await vi.advanceTimersByTimeAsync(0);
      });
    expect(panel(container).hasAttribute('data-pulse')).toBe(false);

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      await deliver('widget:error', { code: 'UPSTREAM_ERROR', message: 'x' });
      expect(panel(container).hasAttribute('data-pulse')).toBe(false);

      await deliver('widget:data', { data: { ...commits }, fetchedAt: secondsAgo(0) });
      expect(panel(container).hasAttribute('data-pulse')).toBe(true);
      act(() => void vi.advanceTimersByTime(899));
      expect(panel(container).hasAttribute('data-pulse')).toBe(true);
      act(() => void vi.advanceTimersByTime(1));
      expect(panel(container).hasAttribute('data-pulse')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
