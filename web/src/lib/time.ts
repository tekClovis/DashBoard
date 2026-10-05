export const WEEK_MS = 7 * 24 * 3_600_000;

/** Compact duration: "9s", "4m", "26h", "9d" (negative clamps to "0s"). */
export function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/** Refresh interval in its largest whole unit: 60 → "1m", 90 → "90s". */
export function every(sec: number): string {
  if (sec % 3600 === 0) return `${sec / 3600}h`;
  if (sec % 60 === 0) return `${sec / 60}m`;
  return `${sec}s`;
}

/** Refresh interval in words: 60 → "every minute", 90 → "every 1 min 30 s"; "" when not a positive number. */
export function humanRefresh(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '';
  if (sec < 60) return `every ${sec} seconds`;
  if (sec % 3600 === 0) return sec === 3600 ? 'every hour' : `every ${sec / 3600} hours`;
  if (sec % 60 === 0) return sec === 60 ? 'every minute' : `every ${sec / 60} minutes`;
  return `every ${Math.floor(sec / 60)} min ${sec % 60} s`;
}

/** Local 24h "HH:MM". */
export function hhmm(date: Date | number | string): string {
  const d = new Date(date);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
