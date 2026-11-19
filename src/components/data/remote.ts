"use client";

// Data loaded once and shared by every section page, so moving between sections doesn't refetch.
import { useEffect, useSyncExternalStore } from "react";
import type { DurabilityData } from "@/lib/api/handlers";
import type { DashboardData } from "@/lib/dashboard";
import { apiFetch } from "./transport";

export type RemoteState<T> = { data: T | null; error: string | null; loading: boolean };

function createRemote<T>(url: string) {
  let state: RemoteState<T> = { data: null, error: null, loading: false };
  let started = false;
  const listeners = new Set<() => void>();
  const SERVER: RemoteState<T> = { data: null, error: null, loading: false };

  const set = (patch: Partial<RemoteState<T>>) => {
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
  };

  /** True when the data arrived. */
  async function load(refresh = false): Promise<boolean> {
    started = true;
    set({ loading: true });
    try {
      const res = await apiFetch(url + (refresh ? "?refresh=1" : ""));
      const json = await res.json();
      if (res.ok) set({ data: json as T, error: null, loading: false });
      else set({ error: json.error ?? res.statusText, loading: false });
      return res.ok;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e), loading: false });
      return false;
    }
  }

  /** Reloads only what a page has already asked for (the durability streams are heavy: not without the Potenza page). */
  const reload = (): Promise<boolean> => (started ? load(true) : Promise.resolve(true));

  function useRemote(): RemoteState<T> {
    const s = useSyncExternalStore(
      (l) => {
        listeners.add(l);
        return () => listeners.delete(l);
      },
      () => state,
      () => SERVER,
    );
    useEffect(() => {
      if (!started) load();
    }, []);
    return s;
  }

  return { load, reload, useRemote };
}

const dashboard = createRemote<DashboardData>("/api/dashboard");
const durability = createRemote<DurabilityData>("/api/durability");

export const useDashboard = dashboard.useRemote;
export const useDurability = durability.useRemote;

/** After a change saved on Intervals.icu (calendar edits): reload the dashboard numbers in the background. */
export function refreshDashboard() {
  void dashboard.load(true);
}

// ── «Aggiorna dati» ──────────────────────────────────────────────────────────────────────────────
// The symbol by the logo reloads every page's data, not only the dashboard: the stores of other modules register here
// (onRefresh), and pages with their own loading read `useRefreshTick` (a counter that grows at every refresh).
let tick = 0;
const tickListeners = new Set<() => void>();
const refreshers = new Set<() => void>();

/** Runs `fn` at every «Aggiorna dati»; for data kept outside React (the training stores). */
export function onRefresh(fn: () => void): () => void {
  refreshers.add(fn);
  return () => refreshers.delete(fn);
}

/** Grows at every «Aggiorna dati» (0 before the first): put it among the dependencies of a page's own loading. */
export function useRefreshTick(): number {
  return useSyncExternalStore(
    (l) => {
      tickListeners.add(l);
      return () => tickListeners.delete(l);
    },
    () => tick,
    () => 0,
  );
}

/** «Aggiorna dati»: reload everything from Intervals.icu. False when the dashboard could not be read. */
export async function refreshAll(): Promise<boolean> {
  tick++;
  tickListeners.forEach((l) => l());
  refreshers.forEach((fn) => fn());
  const [ok] = await Promise.all([dashboard.load(true), durability.reload()]);
  return ok;
}
