// Calendar-day helpers working on local YYYY-MM-DD strings (no time zones involved, except for "today" on the server).

export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Where the athlete lives, for the server's idea of "today" (set APP_TIMEZONE to change it). */
export const DEFAULT_TIMEZONE = "Europe/Rome";

/**
 * Today as the athlete's calendar day. In the browser and in the Android app it is the device's own day. On the server
 * the clock is UTC (Vercel), so between midnight and 1 or 2 in the morning the site, the connector and the widget still
 * saw yesterday: there the day is read in the athlete's time zone.
 */
export function todayIso(now = new Date()): string {
  if (typeof window !== "undefined") return toIsoDate(now);
  const zone = (typeof process !== "undefined" && process.env?.APP_TIMEZONE) || DEFAULT_TIMEZONE;
  try {
    // The Canadian English format is YYYY-MM-DD.
    return new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return toIsoDate(now);
  }
}

export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return toIsoDate(new Date(y, m - 1, d + n));
}

/** Inclusive list of consecutive dates. */
export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Monday of the ISO week containing `iso`. */
export function weekStart(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dow = (new Date(y, m - 1, d).getDay() + 6) % 7;
  return addDays(iso, -dow);
}
