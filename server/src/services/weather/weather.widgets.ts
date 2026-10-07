// Weather widget definitions (Open-Meteo, no connection) — see docs/Architecture.md §8.1.

import type { ParamSpec } from '@dashboard/shared';
import type { Params, WidgetDefinition } from '../../catalog/widget-definition.js';
import {
  conditionFor,
  getForecast,
  type CurrentResponse,
  type DailyResponse,
  type GeoLocation,
  type Geocoder,
} from './open-meteo.js';

const COORDINATE = '^-?\\d+(\\.\\d+)?$';

/** The city picker's param plus the place details it fills in on pick (absent on widgets saved by name only). */
const CITY_PARAMS: ParamSpec[] = [
  { name: 'city', type: 'string', required: true, label: 'City', search: 'weather.city' },
  { name: 'region', type: 'string', hidden: true },
  { name: 'country', type: 'string', hidden: true },
  { name: 'latitude', type: 'string', hidden: true, pattern: COORDINATE },
  { name: 'longitude', type: 'string', hidden: true, pattern: COORDINATE },
];

/** The picked candidate's coordinates when saved, otherwise the first geocoding match for the city name. */
async function locate(geocoder: Geocoder, params: Params): Promise<GeoLocation> {
  const { city, country, latitude, longitude } = params;
  if (latitude !== undefined && longitude !== undefined)
    return { name: country ? `${city}, ${country}` : String(city), latitude: Number(latitude), longitude: Number(longitude) };
  return geocoder.resolve(String(city));
}

/** Builds the weather widget definitions; both resolve their location through `geocoder`. */
export function weatherWidgets(geocoder: Geocoder): [
  WidgetDefinition<'weather.current_weather'>,
  WidgetDefinition<'weather.forecast'>,
] {
  const currentWeather: WidgetDefinition<'weather.current_weather'> = {
    service: 'weather',
    name: 'current_weather',
    description: 'Current temperature and conditions for a city.',
    params: [
      ...CITY_PARAMS,
      { name: 'units', type: 'string', required: true, enum: ['metric', 'imperial'], default: 'metric', label: 'Units' },
    ],
    minRefreshSec: 300,
    auth: 'none',
    fetch: async (params) => {
      const geo = await locate(geocoder, params);
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
      ...CITY_PARAMS,
      { name: 'days', type: 'integer', required: true, min: 1, max: 7, default: 3, label: 'Days' },
    ],
    minRefreshSec: 900,
    auth: 'none',
    fetch: async (params) => {
      const geo = await locate(geocoder, params);
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
