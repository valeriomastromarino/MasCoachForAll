"use client";

// Keeps the athlete sheet and the season also in the Intervals.icu account (lib/profile/cloud.ts), and finds them again
// after a reinstall. Saving is automatic a moment after a change; restoring is offered, never forced.
import { useEffect, useSyncExternalStore } from "react";
import { type CloudPayload, mergeWithCloud, type SyncDecision, syncDecision } from "@/lib/profile/cloud";
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

// ── Keeping the devices in step (phone, computer) ────────────────────────────────────────────────
// `seen` = the savedAt of the copy on Intervals.icu this device last wrote or took; `dirty` = when it last changed
// something that is not saved there yet. See syncDecision in lib/profile/cloud.ts.
const SEEN_KEY = "mascoach-cloud-seen";
const DIRTY_KEY = "mascoach-cloud-dirty";
const get = (k: string): string | null => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const put = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    // Storage blocked: the devices just don't follow each other.
  }
};
/** The copy on Intervals.icu and this device now hold the same thing. */
const inStep = (savedAt: string) => {
  put(SEEN_KEY, savedAt);
  put(DIRTY_KEY, null);
};

/**
 * Writes the copy to Intervals.icu; returns an error text or null. When another device saved a later change in the
 * meantime, that one is taken instead of overwriting it (`force` = "Salva ora": this device's data goes up whatever is there).
 */
export async function pushCloud(opts: { seasonCleared?: boolean; force?: boolean } = {}): Promise<string | null> {
  setStatus({ state: "saving", error: "" });
  try {
    const existing = await pullCloud();
    if (!opts.force && existing && syncDecision({ hasLocal: true, cloud: existing, seen: get(SEEN_KEY), dirtyAt: get(DIRTY_KEY) ?? new Date().toISOString() }) === "apply") {
      applyCloud(existing);
      return null;
    }
    const payload = mergeWithCloud(currentPayload(), existing, opts);
    const res = await apiFetch("/api/cloud", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      const error = json.error ?? res.statusText;
      setStatus({ state: "error", error });
      return error;
    }
    inStep(payload.savedAt);
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
  // Remembered on the device: a change made without network still wins over an older copy when the app comes back.
  put(DIRTY_KEY, new Date().toISOString());
  clearTimeout(timer);
  timer = setTimeout(() => void pushCloud(opts), delayMs);
}

/**
 * When the app opens: takes the copy another device saved in the meantime, or sends up a change of this device that had
 * not reached Intervals.icu. A device without data does nothing here (the first launch offers the restore).
 */
export async function syncWithCloud(): Promise<SyncDecision> {
  const local = currentPayload();
  const hasLocal = Boolean(local.profile || local.season);
  if (!hasLocal) return "none";
  const cloud = await pullCloud();
  const decision = syncDecision({ hasLocal, cloud, seen: get(SEEN_KEY), dirtyAt: get(DIRTY_KEY) });
  if (decision === "apply" && cloud) applyCloud(cloud);
  else if (decision === "push") await pushCloud({ force: true });
  return decision;
}

const SYNC_EVERY_MS = 5 * 60_000;
let lastSync = 0;
/** Runs the sync once when the app opens, and again when it comes back to the front after a while. */
export function useCloudSync() {
  useEffect(() => {
    const run = () => {
      if (document.visibilityState !== "visible" || Date.now() - lastSync < SYNC_EVERY_MS) return;
      lastSync = Date.now();
      void syncWithCloud();
    };
    run();
    document.addEventListener("visibilitychange", run);
    return () => document.removeEventListener("visibilitychange", run);
  }, []);
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
  inStep(p.savedAt);
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
