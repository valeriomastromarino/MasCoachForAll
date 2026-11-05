"use client";

// Keeps the athlete sheet and the season also in the Intervals.icu account (lib/profile/cloud.ts), and finds them again
// after a reinstall. Saving is automatic a moment after a change; restoring is offered, never forced.
import { useSyncExternalStore } from "react";
import { type CloudPayload, mergeWithCloud } from "@/lib/profile/cloud";
import { loadProfile, notifyProfile, saveProfile } from "@/lib/profile/profile";
import { loadSeason, saveSeason } from "@/lib/training/seasonStore";
import { apiFetch } from "./transport";

export type CloudStatus = { state: "idle" | "saving" | "ok" | "error"; at: string; error: string };
let status: CloudStatus = { state: "idle", at: "", error: "" };
// A string snapshot: `useSyncExternalStore` needs a stable value between changes.
let snap = JSON.stringify(status);
const listeners = new Set<() => void>();
function setStatus(next: Partial<CloudStatus>) {
  status = { ...status, ...next };
  snap = JSON.stringify(status);
  listeners.forEach((l) => l());
}
export function useCloudStatus(): CloudStatus {
  const raw = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => snap,
    () => JSON.stringify({ state: "idle", at: "", error: "" }),
  );
  return JSON.parse(raw) as CloudStatus;
}

/** What the device holds now (empty when nothing is set: that is what a cleared plan saves). */
export function currentPayload(now = new Date()): CloudPayload {
  const stored = loadProfile();
  const season = loadSeason();
  return {
    version: 1,
    savedAt: now.toISOString(),
    profile: stored?.profile ?? null,
    phenotype: stored?.phenotype ?? null,
    sheet: stored?.sheet ?? null,
    season,
  };
}

/** Writes the copy to Intervals.icu; returns an error text or null. */
export async function pushCloud(opts: { seasonCleared?: boolean } = {}): Promise<string | null> {
  setStatus({ state: "saving", error: "" });
  try {
    const payload = mergeWithCloud(currentPayload(), await pullCloud(), opts);
    const res = await apiFetch("/api/cloud", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      const error = json.error ?? res.statusText;
      setStatus({ state: "error", error });
      return error;
    }
    setStatus({ state: "ok", at: payload.savedAt, error: "" });
    return null;
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    setStatus({ state: "error", error });
    return error;
  }
}

let timer: ReturnType<typeof setTimeout> | undefined;
/** A couple of seconds after the last change, so a form saved in steps writes once. */
export function scheduleCloudPush(delayMs = 2000, opts: { seasonCleared?: boolean } = {}) {
  clearTimeout(timer);
  timer = setTimeout(() => void pushCloud(opts), delayMs);
}

/** The copy found in Intervals.icu, or null (none, no key, no network). */
export async function pullCloud(): Promise<CloudPayload | null> {
  try {
    const res = await apiFetch("/api/cloud");
    if (!res.ok) return null;
    const json = (await res.json()) as { payload: CloudPayload | null };
    return json.payload ?? null;
  } catch {
    return null;
  }
}

/** Puts the copy back on this device. Doesn't write to Intervals.icu again. */
export function applyCloud(p: CloudPayload) {
  if (p.season) saveSeason(p.season);
  if (p.profile) saveProfile(p.profile, p.sheet ?? "", p.phenotype, new Date(p.savedAt));
  notifyProfile();
  setStatus({ state: "ok", at: p.savedAt, error: "" });
}

const REDO_KEY = "mascoach-redo-setup";
/** "Rifai la configurazione iniziale": don't offer the saved copy again right away. */
export function markRedo() {
  try {
    sessionStorage.setItem(REDO_KEY, "1");
  } catch {
    // nothing to remember
  }
}
export function isRedo(): boolean {
  try {
    return sessionStorage.getItem(REDO_KEY) === "1";
  } catch {
    return false;
  }
}
