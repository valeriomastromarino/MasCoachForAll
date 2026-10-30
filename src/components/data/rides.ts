"use client";

// Ride details shared between the calendar pop-up (which starts loading them) and the ride page,
// so the page usually opens with the data already there.
import type { RideDetail } from "@/lib/ride";
import { apiFetch } from "./transport";

export type RideResult = { ride: RideDetail } | { error: string };

// The browser gives up after this long: the server's own call to Intervals.icu times out a bit earlier.
const TIMEOUT_MS = 25_000;
const MAX_CACHED = 40;
const cache = new Map<string, Promise<RideResult>>();

async function fetchRide(id: string): Promise<RideResult> {
  try {
    const res = await apiFetch(`/api/activity/${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    const json = await res.json();
    return res.ok ? { ride: json as RideDetail } : { error: json.error ?? res.statusText };
  } catch (e) {
    if (e instanceof DOMException && e.name === "TimeoutError") {
      return { error: "Intervals.icu non ha risposto in tempo. Di solito basta riprovare." };
    }
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export function loadRide(id: string): Promise<RideResult> {
  let p = cache.get(id);
  if (!p) {
    p = fetchRide(id).then((r) => {
      // Keep successes only: a failure is retried next time.
      if ("error" in r) cache.delete(id);
      return r;
    });
    if (cache.size >= MAX_CACHED) cache.delete(cache.keys().next().value!);
    cache.set(id, p);
  }
  return p;
}

/** Start loading in the background (e.g. when a ride's pop-up opens). */
export function prefetchRide(id: string) {
  void loadRide(id);
}

/** After an edit (name, RPE…), the cached copy is stale. */
export function forgetRide(id: string) {
  cache.delete(id);
}
