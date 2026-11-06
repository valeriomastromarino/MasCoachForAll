"use client";

// Where the athlete is and the forecast there, for the calendar's weather and wind map.
// The position stays on this device (localStorage); the forecast comes straight from Open-Meteo (free, no key).
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { type DayWeather, forecastUrl, parseForecast } from "@/lib/weather";

const PLACE_KEY = "mascoach-place";
const FORECAST_KEY = "mascoach-forecast";
const CHANGED = "mascoach-weather";
/** A saved position older than this is refreshed quietly when the permission is already granted. */
const PLACE_MAX_AGE_MS = 3600_000;
const FORECAST_MAX_AGE_MS = 60 * 60_000;

export type Place = { lat: number; lon: number; at: number };
export type PlaceStatus = "idle" | "asking" | "denied" | "unavailable";

const subscribe = (cb: () => void) => {
  window.addEventListener(CHANGED, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(CHANGED, cb);
    window.removeEventListener("storage", cb);
  };
};
const snapshotOf = (key: string) => () => {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
};
const placeSnapshot = snapshotOf(PLACE_KEY);
const forecastSnapshot = snapshotOf(FORECAST_KEY);

function parse<T>(raw: string): T | null {
  try {
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage blocked: the weather is just fetched again next time.
  }
  window.dispatchEvent(new Event(CHANGED));
}

function currentPosition(): Promise<Place> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return reject(new Error("unavailable"));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude, at: Date.now() }),
      (e) => reject(e.code === 1 ? new Error("denied") : new Error("unavailable")),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 10 * 60_000 },
    );
  });
}

/** Ticks every minute and when the app comes back to the front, so position and forecast are checked while it stays open. */
function useTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    const id = setInterval(bump, 60_000);
    const onVisible = () => document.visibilityState === "visible" && bump();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return tick;
}

/** The saved position (if any) and a function that asks for it: the phone shows its permission prompt only then. */
export function usePlace(): { place: Place | null; status: PlaceStatus; ask: () => void } {
  const raw = useSyncExternalStore(subscribe, placeSnapshot, () => "");
  const place = useMemo(() => {
    const p = parse<Place>(raw);
    return p && Number.isFinite(p.lat) && Number.isFinite(p.lon) ? p : null;
  }, [raw]);
  const [status, setStatus] = useState<PlaceStatus>("idle");
  const tick = useTick();

  const ask = useCallback(() => {
    setStatus("asking");
    currentPosition()
      .then((p) => {
        save(PLACE_KEY, p);
        setStatus("idle");
      })
      .catch((e: Error) => setStatus(e.message === "denied" ? "denied" : "unavailable"));
  }, []);

  // Old position and the permission already given: refresh it without asking anything.
  const savedAt = place?.at ?? null;
  useEffect(() => {
    if (savedAt === null || Date.now() - savedAt < PLACE_MAX_AGE_MS || !navigator.permissions?.query) return;
    navigator.permissions
      .query({ name: "geolocation" })
      .then((r) => {
        if (r.state === "granted") ask();
      })
      .catch(() => {});
  }, [savedAt, ask, tick]);

  return { place, status, ask };
}

type Cached = { key: string; at: number; days: DayWeather[] };
const keyOf = (lat: number, lon: number) => `${lat.toFixed(1)},${lon.toFixed(1)}`;

/** The daily forecast for the place: kept for an hour, and shown from the saved copy when the network fails. */
export function useForecast(place: Place | null): { days: DayWeather[]; error: boolean } {
  const raw = useSyncExternalStore(subscribe, forecastSnapshot, () => "");
  const [error, setError] = useState(false);
  const lat = place?.lat;
  const lon = place?.lon;
  const key = lat === undefined || lon === undefined ? null : keyOf(lat, lon);
  const tick = useTick();

  const cached = useMemo(() => {
    const c = parse<Cached>(raw);
    return c && key !== null && c.key === key ? c : null;
  }, [raw, key]);
  const fetchedAt = cached?.at ?? 0;

  useEffect(() => {
    if (lat === undefined || lon === undefined || key === null) return;
    if (Date.now() - fetchedAt < FORECAST_MAX_AGE_MS) return;
    const ctrl = new AbortController();
    fetch(forecastUrl(lat, lon), { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((json) => {
        const days = parseForecast(json);
        if (!days.length) throw new Error("vuoto");
        setError(false);
        save(FORECAST_KEY, { key, at: Date.now(), days } satisfies Cached);
      })
      .catch((e: Error) => {
        if (e.name !== "AbortError") setError(true);
      });
    return () => ctrl.abort();
  }, [lat, lon, key, fetchedAt, tick]);

  return { days: cached?.days ?? [], error };
}
