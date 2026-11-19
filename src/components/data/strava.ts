"use client";

// Strava in the app (19 November 2026): the connection is made once on the website and lives on the server; every
// device then sends its trainer sessions through the website (the phone with the app password). Each device has its own
// «Manda in automatico» switch.
import { useEffect, useSyncExternalStore } from "react";
import { serverFetch } from "./transport";

export type StravaStatus =
  | { configured: boolean; connected: boolean; athlete: string | null; last: { name: string; at: string; id: number | null } | null }
  | { error: string };

let status: StravaStatus | null = null;
let started = false;
const listeners = new Set<() => void>();
const set = (s: StravaStatus) => {
  status = s;
  listeners.forEach((l) => l());
};

export async function loadStravaStatus(): Promise<void> {
  started = true;
  try {
    const res = await serverFetch("/api/strava/status");
    const json = (await res.json().catch(() => ({}))) as StravaStatus;
    set(res.ok ? json : { error: "error" in json ? json.error : res.statusText });
  } catch (e) {
    set({ error: e instanceof Error ? e.message : "Nessuna connessione" });
  }
}

export function useStravaStatus(): StravaStatus | null {
  const s = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => status,
    () => null,
  );
  useEffect(() => {
    if (!started) void loadStravaStatus();
  }, []);
  return s;
}

const AUTO_KEY = "mascoach-strava-auto";
const AUTO_EVENT = "mascoach-strava-auto";

/** «Manda in automatico le sedute dei rulli»: on unless switched off on this device. */
export function stravaAuto(): boolean {
  try {
    return localStorage.getItem(AUTO_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setStravaAuto(on: boolean) {
  try {
    localStorage.setItem(AUTO_KEY, on ? "1" : "0");
  } catch {
    // Not remembered.
  }
  window.dispatchEvent(new Event(AUTO_EVENT));
}

export function useStravaAuto(): boolean {
  return useSyncExternalStore(
    (l) => {
      window.addEventListener(AUTO_EVENT, l);
      return () => window.removeEventListener(AUTO_EVENT, l);
    },
    stravaAuto,
    () => true,
  );
}

/** `off`: Strava is not set up or not connected (or the phone has no app password): nothing to try again later. */
export type StravaSend = { ok: true; id: number | null } | { ok: false; off: boolean; error: string };

export async function sendToStrava(fit: string, name: string, externalId: string): Promise<StravaSend> {
  try {
    const res = await serverFetch("/api/strava/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fit, name, externalId }) });
    const json = (await res.json().catch(() => ({}))) as { id?: number | null; error?: string };
    if (res.ok) return { ok: true, id: json.id ?? null };
    return { ok: false, off: res.status === 412 || res.status === 501, error: json.error ?? res.statusText };
  } catch (e) {
    return { ok: false, off: false, error: e instanceof Error ? e.message : "Nessuna connessione" };
  }
}
