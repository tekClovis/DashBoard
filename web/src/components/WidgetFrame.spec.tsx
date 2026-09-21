import type { WidgetInstanceEntry } from '@dashboard/shared';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as widgetData from '@/realtime/useWidgetData.js';
import { WidgetFrame } from './WidgetFrame.js';

const instance: WidgetInstanceEntry = {
  id: 'i1',
  dashboardId: 'd',
  service: 'weather',
  widget: 'forecast',
  params: {},
  refreshRate: 60,
  x: 0,
  y: 0,
  w: 4,
  h: 3,
};

function renderFrame(entry: unknown) {
  vi.spyOn(widgetData, 'useWidgetData').mockReturnValue({ data: entry } as ReturnType<
    typeof widgetData.useWidgetData
  >);
  return render(
    <MemoryRouter>
      <WidgetFrame instance={instance} onConfigure={vi.fn()} onDelete={vi.fn()} onMove={vi.fn()} />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('WidgetFrame', () => {
  it('shows a skeleton before the first widget:data', () => {
    renderFrame(undefined);
    expect(screen.getByTestId('widget-skeleton')).toBeTruthy();
  });

  it('renders the JSON fallback inside an aria-live region scoped to the value', () => {
    const { container } = renderFrame({ data: { temp: 18 }, fetchedAt: 'now', error: null });

    const live = container.querySelector('[aria-live="polite"]');
    expect(live?.textContent).toContain('"temp": 18');
    expect(container.querySelectorAll('[aria-live]')).toHaveLength(1);
    expect(container.firstElementChild?.getAttribute('aria-live')).toBeNull();
    expect(screen.queryByTestId('widget-skeleton')).toBeNull();
  });

  it.each(['REAUTH_REQUIRED', 'NOT_CONNECTED'])('shows a Reconnect link to /services on %s', (code) => {
    renderFrame({ data: null, fetchedAt: null, error: { code, message: 'token expired' } });
    expect(screen.getByRole('link', { name: 'Reconnect' }).getAttribute('href')).toBe('/services');
  });
});
