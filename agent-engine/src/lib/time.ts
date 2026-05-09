/**
 * Timezone-aware helpers — quiet hours, business hours, local clock.
 * Defaults to Africa/Accra; per-tenant overrides come from business_settings.timezone.
 */
import { config } from '../config.js';

/** Returns { hour, minute, dow } in the given IANA timezone. */
export function localTime(tz: string = config.DEFAULT_TIMEZONE): { hour: number; minute: number; dow: number } {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dow = dowMap[parts.find((p) => p.type === 'weekday')?.value ?? 'Mon'] ?? 1;
  return { hour, minute, dow };
}

/** True if the current local time is in the quiet window. */
export function isQuietHour(tz?: string): boolean {
  const { hour } = localTime(tz);
  const start = config.QUIET_HOUR_START; // 22
  const end = config.QUIET_HOUR_END; // 7
  // Quiet window wraps midnight: [start..23] or [0..end-1]
  if (start > end) return hour >= start || hour < end;
  return hour >= start && hour < end;
}
