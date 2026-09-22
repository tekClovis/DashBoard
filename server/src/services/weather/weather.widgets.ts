// Weather widget definitions (Open-Meteo, no connection) — see docs/Architecture.md §3.

import type { WidgetDefinition } from '../../catalog/widget-definition.js';
import { conditionFor, getForecast, type CurrentResponse, type DailyResponse, type Geocoder } from './open-meteo.js';

export function weatherWidgets(geocoder: Geocoder): [
  WidgetDefinition<'weather.current_weather'>,
  WidgetDefinition<'weather.forecast'>,
] {
  const currentWeather: WidgetDefinition<'weather.current_weather'> = {
    service: 'weather',
    name: 'current_weather',
    description: 'Current temperature and conditions for a city.',
    params: [
      { name: 'city', type: 'string', required: true, label: 'City' },
      { name: 'units', type: 'string', required: true, enum: ['metric', 'imperial'], default: 'metric', label: 'Units' },
    ],
    minRefreshSec: 300,
    auth: 'none',
    fetch: async (params) => {
      const geo = await geocoder.resolve(String(params['city']));
      const imperial = params['units'] === 'imperial';
      const { current } = await getForecast<CurrentResponse>(geo, {
        current: 'temperature_2m,weather_code',
        temperature_unit: imperial ? 'fahrenheit' : 'celsius',
      });
      return {
        location: geo.name,
        temperature: current.temperature_2m,
        unit: imperial ? '°F' : '°C',
        condition: conditionFor(current.weather_code),
      };
    },
  };

  const forecast: WidgetDefinition<'weather.forecast'> = {
    service: 'weather',
    name: 'forecast',
    description: 'Daily min/max temperature and conditions for the next days.',
    params: [
      { name: 'city', type: 'string', required: true, label: 'City' },
      { name: 'days', type: 'integer', required: true, min: 1, max: 7, default: 3, label: 'Days' },
    ],
    minRefreshSec: 900,
    auth: 'none',
    fetch: async (params) => {
      const geo = await geocoder.resolve(String(params['city']));
      const { daily } = await getForecast<DailyResponse>(geo, {
        daily: 'weather_code,temperature_2m_max,temperature_2m_min',
        forecast_days: Number(params['days']),
      });
      return {
        location: geo.name,
        days: daily.time.map((date, i) => ({
          date,
          min: daily.temperature_2m_min[i],
          max: daily.temperature_2m_max[i],
          condition: conditionFor(daily.weather_code[i]),
        })),
      };
    },
  };

  return [currentWeather, forecast];
}
