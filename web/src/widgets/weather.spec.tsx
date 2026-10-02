import type { WidgetDataMap } from '@dashboard/shared';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getView } from './registry.js';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const stat = (c: HTMLElement) => c.querySelector('[data-slot="widget-stat"]');
const channel = (c: HTMLElement) => c.querySelector('[data-slot="widget-channel"]');

const now: WidgetDataMap['weather.current_weather'] = {
  location: 'Paris, France',
  temperature: 17.6,
  unit: '°C',
  condition: 'Partly cloudy',
};

describe('weather views', () => {
  it('current_weather: location channel, temperature + unit stat with the condition', () => {
    const View = getView('weather', 'current_weather');
    const { container } = render(<View data={now} fetchedAt={new Date().toISOString()} />);

    expect(channel(container)?.textContent).toBe('Paris, France');
    expect(stat(container)?.textContent).toBe('17.6°CPartly cloudy');
    expect(stat(container)?.querySelector('svg.lucide-cloud-sun')).toBeTruthy();
    // One push: nothing to draw a trend from.
    expect(container.querySelector('svg[role="img"]')).toBeNull();
  });

  it('current_weather: sparkline of the cached pushes, with a delta since the first one', () => {
    const View = getView('weather', 'current_weather');
    const t = (m: number) => new Date(2026, 9, 1, 13, m).toISOString();
    const history = [
      { data: now, fetchedAt: t(32) },
      { data: { ...now, temperature: 18.4 }, fetchedAt: t(37) },
    ];
    // The latest payload is appended when the history does not end on it yet.
    const { container } = render(<View data={{ ...now, temperature: 19.1 }} fetchedAt={t(42)} history={history} />);

    expect(screen.getByRole('img').getAttribute('aria-label')).toBe('Temperature, last 3 updates, °C');
    expect(screen.getByText('↑ 1.5° since 13:32')).toBeTruthy();
    const cells = [...container.querySelectorAll('table td')].map((td) => td.textContent);
    expect(cells).toEqual(['13:32', '17.6°', '13:37', '18.4°', '13:42', '19.1°']);
  });

  it('current_weather: the trend restarts when the location changes', () => {
    const View = getView('weather', 'current_weather');
    const t = (m: number) => new Date(2026, 9, 1, 13, m).toISOString();
    const history = [
      { data: { ...now, location: 'Reykjavik, Iceland', temperature: 10 }, fetchedAt: t(32) },
      { data: { ...now, temperature: 20 }, fetchedAt: t(37) },
    ];
    const { container } = render(<View data={{ ...now, temperature: 20.5 }} fetchedAt={t(42)} history={history} />);

    expect(screen.getByRole('img').getAttribute('aria-label')).toBe('Temperature, last 2 updates, °C');
    expect(screen.getByText('↑ 0.5° since 13:37')).toBeTruthy();
    expect(container.textContent).not.toContain('10°');
  });

  it('forecast: location and overall min–max channel, one range row per day', () => {
    vi.useFakeTimers({ now: new Date(2026, 8, 21, 9), toFake: ['Date'] });
    const data: WidgetDataMap['weather.forecast'] = {
      location: 'Paris, France',
      days: [
        { date: '2026-09-21', min: 9, max: 17.2, condition: 'Clear sky' },
        { date: '2026-09-22', min: 10, max: 19, condition: 'Overcast' },
      ],
    };
    const View = getView('weather', 'forecast');
    const { container } = render(<View data={data} />);

    expect(channel(container)?.textContent).toBe('Paris, France9–19°C');
    expect(stat(container)).toBeNull();
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'TodayClear skylow 9°high 17°',
      'TueOvercastlow 10°high 19°',
    ]);
    const icons = screen.getAllByRole('listitem').map((li) => li.querySelector('svg')?.getAttribute('class'));
    expect(icons[0]).toContain('lucide-sun');
    expect(icons[1]).toContain('lucide-cloud');
  });
});
