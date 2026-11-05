// The season setup asked on the first planning screen, kept on this device (like the athlete sheet).
import type { SeasonSetup } from "./season";

const KEY = "mascoach-season";
export const SEASON_EVENT = "mascoach-season";

function read(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export const seasonSnapshot = (): string => read() ?? "";

export function loadSeason(): SeasonSetup | null {
  const raw = read();
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as SeasonSetup;
    return typeof s?.start === "string" && typeof s.horizonWeeks === "number" ? s : null;
  } catch {
    return null;
  }
}

function notify() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(SEASON_EVENT));
}

export function saveSeason(setup: SeasonSetup) {
  try {
    localStorage.setItem(KEY, JSON.stringify(setup));
  } catch {
    // Storage blocked: the plan is asked again next time.
  }
  notify();
}

export function clearSeason() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nothing to clear
  }
  notify();
}
