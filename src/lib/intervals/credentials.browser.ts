// Single-file build: the Intervals.icu API key lives only in this browser's storage, never inside the file.

const KEY = "mascoach-intervals-key";
const ATHLETE = "mascoach-intervals-athlete";

function read(name: string): string | null {
  try {
    return localStorage.getItem(name) || null;
  } catch {
    return null;
  }
}

export function apiKey(): string | null {
  return read(KEY);
}

export function athleteId(): string {
  return read(ATHLETE) || "0";
}

export function saveCredentials(key: string | null, athlete: string | null = null) {
  try {
    if (key) localStorage.setItem(KEY, key);
    else localStorage.removeItem(KEY);
    if (athlete) localStorage.setItem(ATHLETE, athlete);
    else localStorage.removeItem(ATHLETE);
  } catch {
    // Storage blocked: the app keeps showing demo data.
  }
}
