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

  async function load(refresh = false) {
    started = true;
    set({ loading: true });
    try {
      const res = await apiFetch(url + (refresh ? "?refresh=1" : ""));
      const json = await res.json();
      if (res.ok) set({ data: json as T, error: null, loading: false });
      else set({ error: json.error ?? res.statusText, loading: false });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e), loading: false });
    }
  }

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

  return { load, useRemote };
}

const dashboard = createRemote<DashboardData>("/api/dashboard");
const durability = createRemote<DurabilityData>("/api/durability");

export const useDashboard = dashboard.useRemote;
export const useDurability = durability.useRemote;

/** After a change saved on Intervals.icu (calendar edits): reload the dashboard numbers in the background. */
export function refreshDashboard() {
  void dashboard.load(true);
}

/** "Aggiorna": reload everything from Intervals.icu. */
export async function refreshAll() {
  await Promise.all([dashboard.load(true), durability.load(true)]);
}
