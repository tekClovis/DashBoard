import type { WidgetDataMap, WidgetInstanceEntry } from '@dashboard/shared';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SocketContext } from '@/realtime/SocketProvider.js';
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

const secondsAgo = (s: number) => new Date(Date.now() - s * 1000).toISOString();

function renderFrame(
  entry: WidgetCacheEntry | undefined,
  { connected = true, inst = instance, onConfigure = vi.fn() } = {},
) {
  vi.spyOn(widgetData, 'useWidgetData').mockReturnValue({ data: entry } as ReturnType<
    typeof widgetData.useWidgetData
  >);
  return render(
    <SocketContext.Provider value={{ socket: null, connected }}>
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
    expect(screen.getByText('No update for 3m. Expected every 1m.')).toBeTruthy();
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
