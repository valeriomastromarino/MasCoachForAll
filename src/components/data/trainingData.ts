"use client";

// Data the training engine and the chat share, loaded once and refreshed after a write: the Intervals.icu library, the
// workouts on the next days, the calendar's holidays/illness/injuries, the history, and what the athlete asked for today.
import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { CalendarData, HistoryData } from "@/lib/api/handlers";
import type { LibraryWorkout } from "@/lib/calendar";
import { parseOverrides, OVERRIDES_EVENT, overridesSnapshot } from "@/lib/coach/chat/store";
import type { TodayOverrides } from "@/lib/coach/chat/context";
import { addDays } from "@/lib/dates";
import type { LifeEvent } from "@/lib/training/life";
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

// ── Library ──────────────────────────────────────────────────────────────────────────────────────
const library = createStore<LibraryWorkout[] | null>(null);
let libraryStarted = false;
export function useLibrary(): LibraryWorkout[] | null {
  const v = useSyncExternalStore(library.subscribe, library.get, () => null);
  useEffect(() => {
    if (libraryStarted) return;
    libraryStarted = true;
    void getJson<{ folders: { workouts: LibraryWorkout[] }[] }>("/api/library").then((j) => library.set(j ? j.folders.flatMap((f) => f.workouts) : []));
  }, []);
  return v;
}

// ── Workouts on the next days ────────────────────────────────────────────────────────────────────
type Planned = { key: string; list: CalendarData["workouts"] | null };
const planned = createStore<Planned>({ key: "", list: null });
let plannedKey = "";
async function loadPlanned(key: string) {
  const [today, ftp] = key.split("|");
  const c = await getJson<CalendarData>(`/api/calendar?from=${today}&to=${addDays(today, 7)}&ftp=${ftp}`);
  planned.set({ key, list: c?.workouts ?? [] });
}
export function usePlanned(today: string, ftp: number | null): CalendarData["workouts"] | null {
  const key = `${today}|${ftp ?? ""}`;
  const v = useSyncExternalStore(planned.subscribe, planned.get, () => ({ key: "", list: null }));
  useEffect(() => {
    if (plannedKey !== key) {
      plannedKey = key;
      void loadPlanned(key);
    }
  }, [key]);
  return v.key === key ? v.list : null;
}
/** After the chat or a button changed the calendar. */
export function refreshPlanned() {
  if (plannedKey) void loadPlanned(plannedKey);
}

// ── Holidays, illness, injuries ──────────────────────────────────────────────────────────────────
const life = createStore<LifeEvent[]>([]);
let lifeKey = "";
async function loadLife(today: string) {
  const list = await getJson<LifeEvent[]>(`/api/life?from=${addDays(today, -30)}&to=${addDays(today, 400)}`);
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

// ── What the athlete asked for today ─────────────────────────────────────────────────────────────
const subscribeOverrides = (cb: () => void) => {
  window.addEventListener(OVERRIDES_EVENT, cb);
  return () => window.removeEventListener(OVERRIDES_EVENT, cb);
};
export function useOverrides(today: string): TodayOverrides {
  const raw = useSyncExternalStore(subscribeOverrides, overridesSnapshot, () => "");
  return useMemo(() => parseOverrides(raw, today), [raw, today]);
}
