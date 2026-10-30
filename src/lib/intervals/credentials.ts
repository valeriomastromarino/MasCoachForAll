// Where the Intervals.icu API key comes from. On the Next.js server: .env.local.
// The single-file build replaces this module with credentials.browser.ts (key saved in the browser).

export function apiKey(): string | null {
  return process.env.INTERVALS_API_KEY || null;
}

/** "0" means "the athlete who owns the API key". */
export function athleteId(): string {
  return process.env.INTERVALS_ATHLETE_ID || "0";
}
