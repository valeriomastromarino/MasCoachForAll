"use client";

// Data the training engine and the chat share, loaded once and refreshed after a write: the Intervals.icu library, the
// workouts on the next days, the calendar's holidays/illness/injuries, the history, and what the athlete asked for today.
import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { CalendarData, HistoryData } from "@/lib/api/handlers";
import { isBikeSession, type LibraryWorkout } from "@/lib/calendar";
import { parseOverrides, OVERRIDES_EVENT, overridesSnapshot } from "@/lib/coach/chat/store";
import type { TodayOverrides } from "@/lib/coach/chat/context";
import { addDays } from "@/lib/dates";
import { type LifeEvent, lifeFrom } from "@/lib/training/life";
import { loadSeason } from "@/lib/training/seasonStore";
import { onRefresh } from "./remote";
import { apiFetch } from "./transport";

function createStore<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (v: T) => {
      value = v;
      listeners.forEach((l) => l());
    },
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const r = await apiFetch(url);
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}

/** A failed read is tried again this long after (no network when the app opens, Intervals.icu busy). */
const RETRY_MS = 30_000;
const MAX_TRIES = 20;

// ── Library ──────────────────────────────────────────────────────────────────────────────────────
const library = createStore<LibraryWorkout[] | null>(null);
let libraryState: "idle" | "loading" | "ok" = "idle";
let libraryTries = 0;
/** Until 18 November 2026 a failed read left an empty library for the whole session ("nothing fits today" until a restart). */
function loadLibrary() {
  libraryState = "loading";
  void getJson<{ folders: { workouts: LibraryWorkout[] }[] }>("/api/library").then((j) => {
    if (j) {
      libraryState = "ok";
      library.set(j.folders.flatMap((f) => f.workouts));
      return;
    }
    libraryState = "idle";
    if (++libraryTries < MAX_TRIES) setTimeout(() => libraryState === "idle" && loadLibrary(), RETRY_MS);
  });
}
export function useLibrary(): LibraryWorkout[] | null {
  const v = useSyncExternalStore(library.subscribe, library.get, () => null);
  useEffect(() => {
    if (libraryState === "idle") loadLibrary();
  }, []);
  return v;
}

// ── Workouts on the next days ────────────────────────────────────────────────────────────────────
type Planned = { key: string; list: CalendarData["workouts"] | null };
const planned = createStore<Planned>({ key: "", list: null });
let plannedKey = "";
let plannedTries = 0;
async function loadPlanned(key: string) {
  const [today, ftp] = key.split("|");
  const c = await getJson<CalendarData>(`/api/calendar?from=${today}&to=${addDays(today, 7)}&ftp=${ftp}`);
  // A newer day was asked meanwhile: its answer wins.
  if (plannedKey !== key) return;
  // Weights, Pilates and other sports are on the calendar too, but they are not rides: the day's card, the week and the
  // chat count bike sessions and races only (a day with «Pesi» looked like a day with a ride already planned).
  // A failed read again («Aggiorna dati», a write) keeps what was read before for the same day.
  const cur = planned.get();
  if (c) planned.set({ key, list: c.workouts.filter(isBikeSession) });
  else if (cur.key !== key || cur.list === null) planned.set({ key, list: [] });
  // Without the calendar the card ignores what is already planned: read it again in a while.
  if (!c && ++plannedTries < MAX_TRIES) setTimeout(() => plannedKey === key && void loadPlanned(key), RETRY_MS);
  if (c) plannedTries = 0;
}
export function usePlanned(today: string, ftp: number | null): CalendarData["workouts"] | null {
  const key = `${today}|${ftp ?? ""}`;
  const v = useSyncExternalStore(planned.subscribe, planned.get, () => ({ key: "", list: null }));
  useEffect(() => {
    if (plannedKey !== key) {
      plannedKey = key;
      plannedTries = 0;
      void loadPlanned(key);
    }
  }, [key]);
  return v.key === key ? v.list : null;
}
/** After the chat or a button changed the calendar. */
export function refreshPlanned() {
  if (plannedKey) void loadPlanned(plannedKey);
}

// ── Workouts on the calendar over the whole season (the Stagione weeks) ────────────────────────────
type SeasonCalendar = { key: string; list: CalendarData["workouts"] | null };
const seasonCalendar = createStore<SeasonCalendar>({ key: "", list: null });
let seasonCalendarKey = "";
async function loadSeasonCalendar(key: string) {
  const [from, weeks, ftp] = key.split("|");
  // The API gives at most 70 days per call.
  const chunks = Math.ceil((Number(weeks) * 7) / 70);
  const parts = await Promise.all(
    Array.from({ length: chunks }, (_, i) => getJson<CalendarData>(`/api/calendar?from=${addDays(from, i * 70)}&to=${addDays(from, i * 70 + 69)}&ftp=${ftp}`)),
  );
  const seen = new Set<string>();
  const list: CalendarData["workouts"] = [];
  for (const p of parts) {
    for (const w of p?.workouts ?? []) {
      if (seen.has(w.id)) continue;
      seen.add(w.id);
      list.push(w);
    }
  }
  // A newer season was asked meanwhile: its answer wins. (Weights stay in this list: the gym rule reads them.)
  if (seasonCalendarKey !== key) return;
  // A part that could not be read again keeps the whole list read before (a refresh never empties the weeks).
  const cur = seasonCalendar.get();
  if (parts.some((p) => !p) && cur.key === key && cur.list) return;
  seasonCalendar.set({ key, list });
}
/** Planned workouts from the Monday `from` for `weeks` weeks; null while loading. */
export function useSeasonCalendar(from: string, weeks: number, ftp: number | null): CalendarData["workouts"] | null {
  const key = `${from}|${weeks}|${ftp ?? ""}`;
  const v = useSyncExternalStore(seasonCalendar.subscribe, seasonCalendar.get, () => ({ key: "", list: null }));
  useEffect(() => {
    if (seasonCalendarKey !== key) {
      seasonCalendarKey = key;
      void loadSeasonCalendar(key);
    }
  }, [key]);
  return v.key === key ? v.list : null;
}
/** After a workout was written, moved or removed on Intervals.icu from the Stagione page; resolves once the season's calendar is read again. */
export function refreshSeasonCalendar(): Promise<void> {
  refreshPlanned();
  return seasonCalendarKey ? loadSeasonCalendar(seasonCalendarKey) : Promise.resolve();
}

// ── Holidays, illness, injuries ──────────────────────────────────────────────────────────────────
const life = createStore<LifeEvent[]>([]);
let lifeKey = "";
async function loadLife(today: string) {
  // From the start of the season: an old stop still decides where the light weeks fall (see lifeFrom).
  const list = await getJson<LifeEvent[]>(`/api/life?from=${lifeFrom(today, loadSeason()?.start)}&to=${addDays(today, 400)}`);
  if (list) life.set(list);
}
export function useLife(today: string): LifeEvent[] {
  const v = useSyncExternalStore(life.subscribe, life.get, () => []);
  useEffect(() => {
    if (lifeKey !== today) {
      lifeKey = today;
      void loadLife(today);
    }
  }, [today]);
  return v;
}
export function refreshLife() {
  if (lifeKey) void loadLife(lifeKey);
}

// ── History (two years, for the comparisons) ─────────────────────────────────────────────────────
const history = createStore<HistoryData | null>(null);
let historyStarted = false;
export function useHistory(): HistoryData | null {
  const v = useSyncExternalStore(history.subscribe, history.get, () => null);
  useEffect(() => {
    if (historyStarted) return;
    historyStarted = true;
    void getJson<HistoryData>("/api/history?years=2").then((j) => history.set(j));
  }, []);
  return v;
}

// «Aggiorna dati» (the symbol by the logo): what is already loaded is read again; what no page asked for stays unloaded.
onRefresh(() => {
  if (libraryState === "ok") {
    libraryTries = 0;
    loadLibrary();
  }
  plannedTries = 0;
  refreshPlanned();
  if (seasonCalendarKey) void loadSeasonCalendar(seasonCalendarKey);
  refreshLife();
});

// ── What the athlete asked for today ─────────────────────────────────────────────────────────────
const subscribeOverrides = (cb: () => void) => {
  window.addEventListener(OVERRIDES_EVENT, cb);
  return () => window.removeEventListener(OVERRIDES_EVENT, cb);
};
export function useOverrides(today: string): TodayOverrides {
  const raw = useSyncExternalStore(subscribeOverrides, overridesSnapshot, () => "");
  return useMemo(() => parseOverrides(raw, today), [raw, today]);
}
