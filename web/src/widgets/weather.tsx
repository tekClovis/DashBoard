import type { WidgetDataMap } from '@dashboard/shared';
import type { WidgetViewProps } from './registry.js';

export function CurrentWeatherView({ data }: WidgetViewProps) {
  const { temperature, unit, condition } = data as WidgetDataMap['weather.current_weather'];
  return (
    <div>
      <div className="text-3xl font-bold">
        {Math.round(temperature)}
        {unit}
      </div>
      <div className="text-muted-foreground mt-0.5 text-xs">{condition}</div>
    </div>
  );
}

const WEEKDAY = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' });

/** "2026-09-22" → "Tue". The date is already local to the forecast location. */
function weekday(date: string): string {
  return WEEKDAY.format(new Date(`${date}T00:00:00Z`));
}

export function ForecastView({ data }: WidgetViewProps) {
  const { days } = data as WidgetDataMap['weather.forecast'];
  return (
    <ul className="flex gap-2.5">
      {days.map((day) => (
        <li key={day.date} title={day.condition} className="bg-accent flex-1 rounded-lg px-1 py-2 text-center text-xs">
          <div className="mb-1 font-semibold">{weekday(day.date)}</div>
          {Math.round(day.max)}°
        </li>
      ))}
    </ul>
  );
}
