import type { WidgetDataMap } from '@dashboard/shared';
import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Sun, type LucideIcon } from 'lucide-react';
import { hhmm } from '@/lib/time.js';
import { Channel, Delta, Sparkline, Stat, pushTrail } from './parts.js';
import type { WidgetViewProps } from './registry.js';

type CurrentWeather = WidgetDataMap['weather.current_weather'];

/** Icon for an Open-Meteo condition label (server/src/services/weather/open-meteo.ts). */
const CONDITION_ICONS: [RegExp, LucideIcon][] = [
  [/thunder/i, CloudLightning],
  [/snow/i, CloudSnow],
  [/drizzle/i, CloudDrizzle],
  [/rain/i, CloudRain],
  [/fog/i, CloudFog],
  [/overcast/i, Cloud],
  [/clear/i, Sun],
];

function ConditionIcon({ condition }: { condition: string }) {
  const Icon = CONDITION_ICONS.find(([re]) => re.test(condition))?.[1] ?? CloudSun;
  return <Icon aria-hidden="true" className="text-muted-foreground size-3.5 shrink-0" />;
}

/**
 * View for `weather.current_weather`: temperature plus a trend over the cached pushes for the same location and unit.
 * Until a second push arrives, shows a placeholder instead of the trend.
 */
export function CurrentWeatherView({ data, fetchedAt, history, compact }: WidgetViewProps) {
  const { location, temperature, unit, condition } = data as CurrentWeather;
  const trail = pushTrail(
    { data, fetchedAt, history },
    (d: CurrentWeather) => `${d.location} ${d.unit}`,
    (d) => d.temperature,
  );
  const values = trail.map((p) => p.value);
  const delta = trail[trail.length - 1].value - trail[0].value;
  return (
    <>
      <Channel>
        <span>{location}</span>
      </Channel>
      {!compact && (
        <Stat
          value={temperature.toFixed(1)}
          unit={unit}
          label={
            <span className="flex items-center gap-1.5">
              <ConditionIcon condition={condition} />
              {condition}
            </span>
          }
        />
      )}
      {trail.length > 1 ? (
        <div className="grid gap-1">
          <Sparkline points={trail} label={`Temperature, last ${trail.length} updates, ${unit}`} unit="°" />
          <div
            aria-label="Temperature range"
            className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[0.6875rem]"
          >
            <span>
              Now <b className="text-foreground font-medium">{temperature.toFixed(1)}°</b>
            </span>
            <span>
              Min <b className="text-foreground font-medium">{Math.min(...values).toFixed(1)}°</b>
            </span>
            <span>
              Max <b className="text-foreground font-medium">{Math.max(...values).toFixed(1)}°</b>
            </span>
          </div>
          <Delta>
            {delta >= 0 ? '↑' : '↓'} {Math.abs(delta).toFixed(1)}° since {trail[0].at ? hhmm(trail[0].at) : ''}
          </Delta>
        </div>
      ) : (
        <div className="mt-auto grid gap-1 border-t pt-2 @max-[260px]:sr-only">
          <span className="font-mono text-[0.8125rem]">
            Now {temperature.toFixed(1)}
            {unit}
          </span>
          <span className="text-muted-foreground text-xs">Trend available after the next update</span>
        </div>
      )}
    </>
  );
}

const WEEKDAY = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' });

/** "2026-09-22" → "Tue", or "Today". The date is already local to the forecast location. */
function dayName(date: string, today: string): string {
  return date === today ? 'Today' : WEEKDAY.format(new Date(`${date}T00:00:00Z`));
}

/** Browser-local `YYYY-MM-DD`, compared with the forecast dates to find "Today". */
function localIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** View for `weather.forecast`: one row per day with its min-max range drawn against the whole period's range. */
export function ForecastView({ data }: WidgetViewProps) {
  const { location, days } = data as WidgetDataMap['weather.forecast'];
  const lo = Math.round(Math.min(...days.map((d) => d.min)));
  const hi = Math.round(Math.max(...days.map((d) => d.max)));
  const span = hi - lo || 1;
  const today = localIsoDate(new Date());
  return (
    <>
      <Channel>
        <span>{location}</span>
        {days.length > 0 && (
          <span className="font-mono">
            {lo}–{hi}°C
          </span>
        )}
      </Channel>
      <ul role="list" className="grid">
        {days.map((day) => {
          const min = Math.round(day.min);
          const max = Math.round(day.max);
          const isToday = day.date === today;
          return (
            <li
              key={day.date}
              className="grid grid-cols-[5.5ch_16px_minmax(0,1.2fr)_3.5ch_minmax(40px,2fr)_3.5ch] items-center gap-2 border-t py-1.25 first:border-t-0 @max-[380px]:grid-cols-[5.5ch_16px_3.5ch_1fr_3.5ch]"
            >
              <span className={isToday ? 'font-mono font-semibold' : 'text-muted-foreground font-mono'}>
                {dayName(day.date, today)}
              </span>
              <ConditionIcon condition={day.condition} />
              <span className="text-muted-foreground truncate text-xs @max-[380px]:hidden">{day.condition}</span>
              <span className="text-muted-foreground text-right font-mono">
                <span className="sr-only">low </span>
                {min}°
              </span>
              <span aria-hidden="true" className="bg-muted relative h-1 rounded-xs">
                <span
                  className="bg-foreground/55 absolute inset-y-0 rounded-xs"
                  style={{ left: `${((min - lo) / span) * 100}%`, right: `${100 - ((max - lo) / span) * 100}%` }}
                />
              </span>
              <span className="font-mono">
                <span className="sr-only">high </span>
                {max}°
              </span>
            </li>
          );
        })}
      </ul>
    </>
  );
}
