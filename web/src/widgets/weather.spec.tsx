import type { WidgetDataMap } from '@dashboard/shared';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { getView } from './registry.js';

afterEach(cleanup);

describe('weather views', () => {
  it('current_weather shows the rounded temperature with its unit and the condition', () => {
    const data: WidgetDataMap['weather.current_weather'] = {
      location: 'Paris, France',
      temperature: 17.6,
      unit: '°C',
      condition: 'Partly cloudy',
    };
    const View = getView('weather', 'current_weather');
    render(<View data={data} />);

    expect(screen.getByText('18°C')).toBeTruthy();
    expect(screen.getByText('Partly cloudy')).toBeTruthy();
  });

  it('forecast shows one weekday tile per day with its max temperature', () => {
    const data: WidgetDataMap['weather.forecast'] = {
      location: 'Paris, France',
      days: [
        { date: '2026-09-21', min: 9, max: 17.2, condition: 'Clear sky' },
        { date: '2026-09-22', min: 10, max: 19, condition: 'Overcast' },
      ],
    };
    const View = getView('weather', 'forecast');
    render(<View data={data} />);

    const tiles = screen.getAllByRole('listitem');
    expect(tiles.map((tile) => tile.textContent)).toEqual(['Mon17°', 'Tue19°']);
    expect(tiles[1].getAttribute('title')).toBe('Overcast');
  });
});
