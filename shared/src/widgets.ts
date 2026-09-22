// Per-widget data shapes — see docs/Architecture.md §3.
//
// Maps 'service.widget' → data shape, so a view and its server fetch() cannot
// drift apart. Shapes the web client renders live here; test-only fixtures
// augment it via `declare module`.

export interface WidgetDataMap {
  'weather.current_weather': CurrentWeatherData;
  'weather.forecast': ForecastData;
}

// weather — server/src/services/weather/
export interface CurrentWeatherData {
  /** Resolved place name, e.g. "Paris, France". */
  location: string;
  temperature: number;
  unit: '°C' | '°F';
  condition: string;
}

export interface ForecastDay {
  /** ISO date (YYYY-MM-DD), local to the location. Temperatures are °C. */
  date: string;
  min: number;
  max: number;
  condition: string;
}

export interface ForecastData {
  location: string;
  days: ForecastDay[];
}
