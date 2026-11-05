"use client";

// Runs what the chat asked for after a "sì": the writes to Intervals.icu, to the athlete sheet and to the season.
// Each one says what happened, and gives back what it takes to undo it when it can be undone.
import type { Action, UndoInfo } from "@/lib/coach/chat/context";
import { sheetText, type AthleteProfile, loadProfile, notifyProfile, saveProfile, type SheetAthlete } from "@/lib/profile/profile";
import type { Phenotype } from "@/lib/profile/phenotype";
import { loadSeason, saveSeason } from "@/lib/training/seasonStore";
import { scheduleCloudPush } from "../data/cloud";
import { refreshLife, refreshPlanned } from "../data/trainingData";
import { apiFetch } from "../data/transport";

export type ActionResult = { ok: boolean; message: string; undo?: UndoInfo };

async function call(url: string, method: string, body?: unknown): Promise<{ ok: boolean; json: Record<string, unknown>; error: string }> {
  try {
    const res = await apiFetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok, json, error: res.ok ? "" : String(json.error ?? res.statusText) };
  } catch (e) {
    return { ok: false, json: {}, error: e instanceof Error ? e.message : String(e) };
  }
}

export type SheetContext = { athlete: SheetAthlete; pheno: Phenotype | null; today: string };

export async function runAction(action: Action, sheet: SheetContext): Promise<ActionResult> {
  switch (action.type) {
    case "schedule": {
      for (const id of action.replace ?? []) {
        const r = await call(`/api/calendar/events/${encodeURIComponent(id)}`, "DELETE");
        if (!r.ok) return { ok: false, message: `Non sono riuscito a togliere quello che c'era già: ${r.error}` };
      }
      const ids: string[] = [];
      for (const item of action.items) {
        const r = await call("/api/calendar/events", "POST", { workoutId: item.workoutId, date: item.date });
        if (!r.ok) {
          refreshPlanned();
          return { ok: false, message: `Non sono riuscito a scrivere ${item.name}: ${r.error}${ids.length ? ` (ne ho scritti ${ids.length} prima)` : ""}.`, undo: ids.length ? { kind: "remove_event", ids, label: `${ids.length} allenamenti appena scritti` } : undefined };
        }
        ids.push(String(r.json.id ?? ""));
      }
      refreshPlanned();
      return { ok: true, message: action.items.length === 1 ? "Fatto: è sul calendario di Intervals. Da lì lo apri sul Garmin o sul rullo." : `Fatto: ${action.items.length} allenamenti sul calendario di Intervals.`, undo: { kind: "remove_event", ids: ids.filter(Boolean), label: action.label } };
    }
    case "move": {
      const r = await call(`/api/calendar/events/${encodeURIComponent(action.eventId)}`, "PATCH", { date: action.to });
      refreshPlanned();
      return r.ok ? { ok: true, message: "Spostato." } : { ok: false, message: `Non sono riuscito a spostarlo: ${r.error}` };
    }
    case "remove": {
      const r = await call(`/api/calendar/events/${encodeURIComponent(action.eventId)}`, "DELETE");
      refreshPlanned();
      return r.ok ? { ok: true, message: "Cancellato da Intervals." } : { ok: false, message: `Non sono riuscito a cancellarlo: ${r.error}` };
    }
    case "life_add": {
      const r = await call("/api/life", "POST", { category: action.category, from: action.from, to: action.to, name: action.name });
      refreshLife();
      return r.ok ? { ok: true, message: "Segnato su Intervals: il piano e l'allenamento di oggi ne tengono conto.", undo: { kind: "life_delete", id: String(r.json.id ?? ""), label: action.label } } : { ok: false, message: `Non sono riuscito a scriverlo: ${r.error}` };
    }
    case "life_close": {
      const r = await call(`/api/life/${encodeURIComponent(action.id)}`, "PATCH", { to: action.to });
      refreshLife();
      return r.ok ? { ok: true, message: "Chiuso su Intervals: parte il rientro graduale." } : { ok: false, message: `Non sono riuscito a chiuderlo: ${r.error}` };
    }
    case "set_profile": {
      const stored = loadProfile();
      const profile: AthleteProfile = { ...(stored?.profile ?? {}), ...action.patch };
      // The sheet text is rebuilt with today's numbers so the Project and the Intervals copy stay in step.
      const text = sheetText(profile, sheet.athlete, sheet.pheno, sheet.today);
      saveProfile(profile, text, stored?.phenotype ?? sheet.pheno?.verdict ?? null);
      notifyProfile();
      scheduleCloudPush();
      return { ok: true, message: "Salvato nella scheda (e, tra un attimo, su Intervals)." };
    }
    case "set_season": {
      const setup = loadSeason();
      if (!setup) return { ok: false, message: "Non c'è ancora un piano di stagione: impostalo dalla pagina Stagione." };
      saveSeason({ ...setup, ...action.patch });
      scheduleCloudPush();
      return { ok: true, message: "Piano aggiornato: lo vedi in Stagione e nell'allenamento di oggi." };
    }
    case "rpe": {
      const r = await call(`/api/activity/${encodeURIComponent(action.activityId)}`, "PATCH", { rpe: action.rpe });
      return r.ok ? { ok: true, message: "RPE salvato su Intervals." } : { ok: false, message: `Non sono riuscito a salvarlo: ${r.error}` };
    }
    case "carbs": {
      const r = await call(`/api/activity/${encodeURIComponent(action.activityId)}`, "PATCH", { carbs_ingested: action.grams ?? 0 });
      return r.ok ? { ok: true, message: "Carboidrati registrati su Intervals." } : { ok: false, message: `Non sono riuscito a registrarli: ${r.error}` };
    }
  }
}

/** Takes back the last write. */
export async function runUndo(undo: UndoInfo): Promise<ActionResult> {
  if (undo.kind === "remove_event") {
    let failed = 0;
    for (const id of undo.ids) {
      const r = await call(`/api/calendar/events/${encodeURIComponent(id)}`, "DELETE");
      if (!r.ok) failed++;
    }
    refreshPlanned();
    return failed ? { ok: false, message: `Ne ho tolti ${undo.ids.length - failed} su ${undo.ids.length}: controlla il calendario.` } : { ok: true, message: "Tolto da Intervals." };
  }
  const r = await call(`/api/life/${encodeURIComponent(undo.id)}`, "DELETE");
  refreshLife();
  return r.ok ? { ok: true, message: "Tolto da Intervals." } : { ok: false, message: `Non sono riuscito a toglierlo: ${r.error}` };
}
