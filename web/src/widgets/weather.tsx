import type { WidgetDataMap } from '@dashboard/shared';
import { hhmm } from '@/lib/time.js';
import { Channel, Delta, Sparkline, Stat, usePushTrail } from './parts.js';
import type { WidgetViewProps } from './registry.js';

export function CurrentWeatherView({ data, fetchedAt, compact }: WidgetViewProps) {
  const { location, temperature, unit, condition } = data as WidgetDataMap['weather.current_weather'];
  const trail = usePushTrail(fetchedAt, temperature);
  const delta = trail[trail.length - 1].value - trail[0].value;
  return (
    <>
      <Channel>
        <span>{location}</span>
      </Channel>
      {!compact && <Stat value={temperature.toFixed(1)} unit={unit} label={condition} />}
      {trail.length > 1 && (
        <div className="grid gap-1">
          <Sparkline points={trail} label={`Temperature, last ${trail.length} updates, ${unit}`} unit="°" />
          <Delta>
            {delta >= 0 ? '↑' : '↓'} {Math.abs(delta).toFixed(1)}° since {trail[0].at ? hhmm(trail[0].at) : ''}
          </Delta>
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

function localIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

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
              className="grid grid-cols-[5.5ch_minmax(0,1.2fr)_3.5ch_minmax(40px,2fr)_3.5ch] items-center gap-2 border-t py-1.25 first:border-t-0 @max-[380px]:grid-cols-[5.5ch_3.5ch_1fr_3.5ch]"
            >
              <span className={isToday ? 'font-mono font-semibold' : 'text-muted-foreground font-mono'}>
                {dayName(day.date, today)}
              </span>
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
