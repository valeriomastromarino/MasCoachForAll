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
        const r = await call("/api/calendar/events", "POST", { workoutId: item.workoutId, date: item.date, indoor: item.indoor });
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
      if (!r.ok) return { ok: false, message: `Non sono riuscito a spostarlo: ${r.error}` };
      return { ok: true, message: "Spostato: lo trovi anche sul Garmin.", undo: action.from ? { kind: "move_back", moves: [{ id: action.eventId, to: action.from }], label: action.label } : undefined };
    }
    case "swap": {
      // Both or neither: if the second move fails the first goes back.
      const first = await call(`/api/calendar/events/${encodeURIComponent(action.a.eventId)}`, "PATCH", { date: action.a.to });
      if (!first.ok) {
        refreshPlanned();
        return { ok: false, message: `Non sono riuscito a scambiarli: ${first.error}` };
      }
      const second = await call(`/api/calendar/events/${encodeURIComponent(action.b.eventId)}`, "PATCH", { date: action.b.to });
      if (!second.ok) {
        await call(`/api/calendar/events/${encodeURIComponent(action.a.eventId)}`, "PATCH", { date: action.a.from });
        refreshPlanned();
        return { ok: false, message: `Non sono riuscito a scambiarli (${second.error}): ho rimesso tutto com'era.` };
      }
      refreshPlanned();
      return { ok: true, message: "Scambiati.", undo: { kind: "move_back", moves: [{ id: action.a.eventId, to: action.a.from }, { id: action.b.eventId, to: action.b.from }], label: action.label } };
    }
    case "remove": {
      const r = await call(`/api/calendar/events/${encodeURIComponent(action.eventId)}`, "DELETE");
      refreshPlanned();
      return r.ok ? { ok: true, message: "Cancellato da Intervals." } : { ok: false, message: `Non sono riuscito a cancellarlo: ${r.error}` };
    }
    case "remove_many": {
      let failed = 0;
      for (const item of action.items) {
        const r = await call(`/api/calendar/events/${encodeURIComponent(item.eventId)}`, "DELETE");
        if (!r.ok) failed++;
      }
      refreshPlanned();
      const n = action.items.length;
      return failed ? { ok: false, message: `Ne ho cancellate ${n - failed} su ${n}: controlla il calendario.` } : { ok: true, message: n === 1 ? "Cancellata da Intervals." : `Cancellate da Intervals: ${n} sedute.` };
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
    case "create_workout": {
      for (const id of action.replace) {
        const r = await call(`/api/calendar/events/${encodeURIComponent(id)}`, "DELETE");
        if (!r.ok) return { ok: false, message: `Non sono riuscito a togliere quello che c'era già: ${r.error}` };
      }
      const r = await call("/api/calendar/events", "POST", { date: action.date, custom: { name: action.name, text: action.text, indoor: action.indoor, secs: action.secs } });
      refreshPlanned();
      if (!r.ok) return { ok: false, message: `Non sono riuscito a scriverla: ${r.error}` };
      const warn = typeof r.json.warning === "string" ? ` Attenzione: ${r.json.warning}` : "";
      return { ok: true, message: `Fatto: «${action.name}» è sul calendario di Intervals. Arriva al Garmin${action.indoor ? " e la trovi in Rulli, pronta da avviare" : ""}.${warn}`, undo: { kind: "remove_event", ids: [String(r.json.id ?? "")].filter(Boolean), label: action.label } };
    }
    case "update_workout": {
      const r = await call(`/api/calendar/events/${encodeURIComponent(action.eventId)}`, "PATCH", { name: action.name, description: action.text, secs: action.secs, ...(action.indoor !== undefined ? { indoor: action.indoor } : {}) });
      refreshPlanned();
      if (!r.ok) return { ok: false, message: `Non sono riuscito a modificarla: ${r.error}` };
      const warn = typeof r.json.warning === "string" ? ` Attenzione: ${r.json.warning}` : "";
      const where = action.indoor === true ? " Ora è sui rulli: la trovi in Pedala." : action.indoor === false ? " Ora è da fare fuori." : "";
      return { ok: true, message: `Fatto: «${action.name}» aggiornata su Intervals (e quindi sul Garmin).${where}${warn}`, undo: { kind: "restore_event", id: action.eventId, name: action.prev.name, text: action.prev.text, secs: action.prev.secs, tss: action.prev.tss, label: action.label, ...(action.indoor !== undefined ? { indoor: action.prev.indoor ?? false } : {}) } };
    }
    case "save_library": {
      const r = await call("/api/library", "POST", { name: action.name, text: action.text, indoor: action.indoor });
      return r.ok ? { ok: true, message: "Salvata in libreria, cartella «MasCoach Coach»: ora la può proporre anche l'app." } : { ok: false, message: `Non sono riuscito a salvarla: ${r.error}` };
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
  if (undo.kind === "restore_event") {
    const r = await call(`/api/calendar/events/${encodeURIComponent(undo.id)}`, "PATCH", { name: undo.name, description: undo.text, secs: undo.secs, ...(undo.indoor !== undefined ? { indoor: undo.indoor } : {}) });
    refreshPlanned();
    return r.ok ? { ok: true, message: "Rimessa com'era su Intervals." } : { ok: false, message: `Non sono riuscito a rimetterla com'era: ${r.error}` };
  }
  if (undo.kind === "move_back") {
    let failed = 0;
    for (const m of undo.moves) {
      const r = await call(`/api/calendar/events/${encodeURIComponent(m.id)}`, "PATCH", { date: m.to });
      if (!r.ok) failed++;
    }
    refreshPlanned();
    return failed ? { ok: false, message: "Non sono riuscito a rimettere tutto com'era: controlla il calendario." } : { ok: true, message: "Rimesso com'era." };
  }
  const r = await call(`/api/life/${encodeURIComponent(undo.id)}`, "DELETE");
  refreshLife();
  return r.ok ? { ok: true, message: "Tolto da Intervals." } : { ok: false, message: `Non sono riuscito a toglierlo: ${r.error}` };
}
