// The tools Sonnet gets inside the app: the connector's read tools as they are, a read of the season plan, and "proponi_…"
// tools that write NOTHING — each one only records an Action that the chat shows with Sì/No (the app runs it after the "sì").
import { handleApi } from "@/lib/api/handlers";
import type { DashboardData } from "@/lib/dashboard";
import { addDays, weekStart } from "@/lib/dates";
import type { AthleteProfile } from "@/lib/profile/profile";
import { type LifeCategory, type LifeEvent } from "@/lib/training/life";
import { planFromToday, type PlanWeek, RAMP_TARGET, type RampLevel, type SeasonSetup } from "@/lib/training/season";
import type { Action, TodayOverrides } from "../chat/context";
import { COACH_TOOLS } from "../tools";

/** What the app sends along with each message: the things that live on the device, not on Intervals.icu. */
export type Snapshot = { today: string; setup: SeasonSetup | null; profile: AthleteProfile | null };

export type ToolContext = { snapshot: Snapshot; actions: Action[]; overrides: Partial<Omit<TodayOverrides, "date">> };
export type AiTool = { name: string; description: string; input_schema: Record<string, unknown>; run: (args: Record<string, unknown>, ctx: ToolContext) => Promise<unknown> };

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const bad = (m: string): never => {
  throw new Error(m);
};
const isoDate = (v: unknown, name: string): string => (typeof v === "string" && ISO.test(v) ? v : bad(`"${name}" deve essere una data AAAA-MM-GG`));
const text = (v: unknown, name: string, max = 120): string => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : bad(`"${name}" è obbligatorio`));

async function ctlAndLife(today: string): Promise<{ ctl: number | null; life: LifeEvent[] }> {
  const dash = await handleApi("GET", "/api/dashboard");
  const ctl = dash.status === 200 ? ((dash.json as DashboardData).status.ctl ?? null) : null;
  const lifeRes = await handleApi("GET", `/api/life?from=${addDays(today, -60)}&to=${addDays(today, 365)}`);
  const life = lifeRes.status === 200 && Array.isArray(lifeRes.json) ? (lifeRes.json as LifeEvent[]) : [];
  return { ctl, life };
}

const weekRow = (w: PlanWeek) => ({ da: w.start, fase: w.phase, tipo: w.kind, tss: w.tssTarget, ore: w.hoursApprox, ctl_fine: w.ctlEnd, ...(w.note ? { nota: w.note } : {}) });

function summary(setup: SeasonSetup, today: string, ctl: number | null, life: LifeEvent[]) {
  const plan = planFromToday(setup, today, ctl, life);
  return { plan, rows: plan.weeks.map(weekRow) };
}

const READ_NAMES = new Set(COACH_TOOLS.filter((t) => t.annotations.readOnlyHint).map((t) => t.name));

const readTools: AiTool[] = COACH_TOOLS.filter((t) => READ_NAMES.has(t.name)).map((t) => ({
  name: t.name,
  description: t.description,
  input_schema: t.inputSchema,
  run: (args) => t.run(args),
}));

const planTool: AiTool = {
  name: "piano_stagione",
  description:
    "Il piano di stagione di oggi, settimana per settimana (fase, tipo di settimana carico/scarico/stop/taper/gara, TSS, ore, CTL a fine settimana), " +
    "più le leve impostate (gara A, picco, ramp rate, ore massime, stop, settimane di scarico). Se non c'è un piano, lo dice.",
  input_schema: { type: "object", properties: { settimane: { type: "number", description: "Quante settimane mostrare da oggi (default 12, max 52)" } }, additionalProperties: false },
  async run(args, { snapshot }) {
    const setup = snapshot.setup;
    if (!setup) return { piano: null, nota: "L'atleta non ha ancora impostato la stagione: serve compilarla nella pagina Stagione." };
    const { ctl, life } = await ctlAndLife(snapshot.today);
    const { plan, rows } = summary(setup, snapshot.today, ctl, life);
    const n = Math.min(52, Math.max(1, Number(args.settimane) || 12));
    return {
      leve: { gara_A: setup.raceA, picco: setup.peak, ramp: setup.ramp, ore_massime: setup.maxHours, stop: setup.stops, scarico_settimane: setup.lightWeeks ?? [], limiti_settimana: setup.weekCaps ?? [], orizzonte_settimane: setup.horizonWeeks },
      ctl_oggi: ctl,
      ctl_fine: plan.ctlEnd,
      avvisi: plan.warnings,
      settimane: rows.slice(0, n),
    };
  },
};

const RAMPS = Object.keys(RAMP_TARGET) as RampLevel[];

const proposeSeason: AiTool = {
  name: "proponi_stagione",
  description:
    "PROPONE un cambio al piano di stagione (non scrive nulla: l'atleta vede prima/dopo e conferma con «sì»). Passa solo le leve da cambiare. " +
    "Date delle settimane = il LUNEDÌ. Esempi: scarico questa settimana → scarico_aggiungi:[lunedì di questa settimana]; solo 5 ore questa settimana → limite_settimana; ferie → stop_aggiungi. " +
    "Restituisce il piano prima e dopo, solo per le settimane che cambiano, e gli avvisi.",
  input_schema: {
    type: "object",
    properties: {
      descrizione: { type: "string", description: "Una riga che dice cosa cambia, es. «Settimana di scarico dal 9 al 15 novembre»" },
      gara_A: { type: ["object", "null"], properties: { date: { type: "string" }, name: { type: "string" } }, required: ["date"], description: "Gara A, o null per toglierla" },
      picco: { type: ["object", "null"], properties: { start: { type: "string" }, weeks: { type: "number" } }, required: ["start", "weeks"], description: "Periodo di picco (1-8 settimane), o null per toglierlo" },
      ramp: { type: "string", enum: RAMPS, description: "prudente +2,5 / bilanciato +3,5 / aggressivo +5,5 CTL a settimana" },
      ore_massime: { type: ["number", "null"], description: "Ore massime a settimana, o null per nessun tetto" },
      orizzonte_settimane: { type: "number" },
      scarico_aggiungi: { type: "array", items: { type: "string" }, description: "Lunedì delle settimane da rendere di scarico" },
      scarico_togli: { type: "array", items: { type: "string" }, description: "Lunedì delle settimane di scarico forzate da togliere" },
      limite_settimana: { type: "object", properties: { lunedi: { type: "string" }, ore: { type: "number" } }, required: ["lunedi", "ore"], description: "Tetto di ore per una sola settimana" },
      stop_aggiungi: { type: "object", properties: { da: { type: "string" }, a: { type: "string" }, etichetta: { type: "string" } }, required: ["da", "a"], description: "Giorni senza allenamento" },
    },
    required: ["descrizione"],
    additionalProperties: false,
  },
  async run(args, { snapshot, actions }) {
    const setup = snapshot.setup;
    if (!setup) return bad("Non c'è un piano di stagione: L'atleta deve prima impostarlo nella pagina Stagione.");
    const next: SeasonSetup = { ...setup, stops: [...setup.stops], lightWeeks: [...(setup.lightWeeks ?? [])], weekCaps: [...(setup.weekCaps ?? [])] };
    const monday = (v: unknown, name: string) => weekStart(isoDate(v, name));

    if ("gara_A" in args) {
      const g = args.gara_A as { date?: unknown; name?: unknown } | null;
      next.raceA = g ? { date: isoDate(g.date, "gara_A.date"), ...(typeof g.name === "string" ? { name: g.name.slice(0, 80) } : {}) } : null;
    }
    if ("picco" in args) {
      const p = args.picco as { start?: unknown; weeks?: unknown } | null;
      next.peak = p ? { start: isoDate(p.start, "picco.start"), weeks: Math.min(8, Math.max(1, Math.round(Number(p.weeks) || 1))) } : null;
    }
    if (args.ramp !== undefined) {
      if (!RAMPS.includes(args.ramp as RampLevel)) bad(`"ramp" deve essere ${RAMPS.join(", ")}`);
      next.ramp = args.ramp as RampLevel;
    }
    if ("ore_massime" in args) {
      const h = args.ore_massime;
      next.maxHours = h === null ? null : Math.min(30, Math.max(2, Number(h) || bad('"ore_massime" deve essere un numero')));
    }
    if (args.orizzonte_settimane !== undefined) next.horizonWeeks = Math.min(52, Math.max(4, Math.round(Number(args.orizzonte_settimane) || setup.horizonWeeks)));
    for (const d of (args.scarico_aggiungi as unknown[] | undefined) ?? []) {
      const m = monday(d, "scarico_aggiungi");
      if (!next.lightWeeks!.includes(m)) next.lightWeeks!.push(m);
    }
    for (const d of (args.scarico_togli as unknown[] | undefined) ?? []) {
      const m = monday(d, "scarico_togli");
      next.lightWeeks = next.lightWeeks!.filter((x) => x !== m);
    }
    if (args.limite_settimana) {
      const l = args.limite_settimana as { lunedi?: unknown; ore?: unknown };
      const m = monday(l.lunedi, "limite_settimana.lunedi");
      const ore = Math.min(30, Math.max(1, Number(l.ore) || bad('"limite_settimana.ore" deve essere un numero')));
      next.weekCaps = [...next.weekCaps!.filter((c) => c.start !== m), { start: m, hours: ore }];
    }
    if (args.stop_aggiungi) {
      const s = args.stop_aggiungi as { da?: unknown; a?: unknown; etichetta?: unknown };
      const from = isoDate(s.da, "stop_aggiungi.da");
      const to = isoDate(s.a, "stop_aggiungi.a");
      if (from > to) bad("Lo stop finisce prima di cominciare");
      next.stops.push({ from, to, ...(typeof s.etichetta === "string" ? { label: s.etichetta.slice(0, 60) } : {}) });
    }

    // An empty list is the same as none: don't let it count as a change.
    if (!next.lightWeeks!.length && !setup.lightWeeks) delete next.lightWeeks;
    if (!next.weekCaps!.length && !setup.weekCaps) delete next.weekCaps;
    const patch: Partial<SeasonSetup> = {};
    for (const k of Object.keys(next) as (keyof SeasonSetup)[]) if (JSON.stringify(next[k]) !== JSON.stringify(setup[k])) (patch as Record<string, unknown>)[k] = next[k];
    if (Object.keys(patch).length === 0) return { nessun_cambiamento: true, nota: "Il piano è già così: non propongo nulla." };

    const { ctl, life } = await ctlAndLife(snapshot.today);
    const before = summary(setup, snapshot.today, ctl, life);
    const after = summary(next, snapshot.today, ctl, life);
    const changed = after.rows.flatMap((row, i) => (JSON.stringify(row) !== JSON.stringify(before.rows[i]) ? [{ prima: before.rows[i] ?? null, dopo: row }] : []));

    actions.push({ type: "set_season", patch, label: text(args.descrizione, "descrizione", 160) });
    return {
      proposta_registrata: "In attesa del «sì» dell'atleta: non è ancora applicata.",
      settimane_che_cambiano: changed.slice(0, 16),
      altre_settimane_cambiate: Math.max(0, changed.length - 16),
      ctl_fine_prima: before.plan.ctlEnd,
      ctl_fine_dopo: after.plan.ctlEnd,
      avvisi_dopo: after.plan.warnings,
    };
  },
};

const proposeProgram: AiTool = {
  name: "proponi_programma",
  description:
    "PROPONE di programmare sul calendario di Intervals uno o più allenamenti della LIBRERIA (usa libreria_allenamenti per trovare id e nome). Non scrive: serve il «sì» dell'atleta. " +
    "Con sostituisci_ids toglie prima gli allenamenti del coach già presenti (ids da calendario).",
  input_schema: {
    type: "object",
    properties: {
      descrizione: { type: "string", description: "Una riga: cosa viene programmato" },
      allenamenti: { type: "array", items: { type: "object", properties: { libreria_id: { type: "number" }, nome: { type: "string" }, data: { type: "string", description: "AAAA-MM-GG, da oggi in poi" } }, required: ["libreria_id", "nome", "data"] }, minItems: 1, maxItems: 14 },
      sostituisci_ids: { type: "array", items: { type: "string" } },
    },
    required: ["descrizione", "allenamenti"],
    additionalProperties: false,
  },
  async run(args, { snapshot, actions }) {
    const items = ((args.allenamenti as { libreria_id?: unknown; nome?: unknown; data?: unknown }[]) ?? []).map((a) => {
      const date = isoDate(a.data, "data");
      if (date < snapshot.today) bad("Non si programma nel passato");
      const id = Number(a.libreria_id);
      if (!Number.isInteger(id)) bad('"libreria_id" deve essere un numero intero');
      return { workoutId: id, name: text(a.nome, "nome"), date };
    });
    const replace = ((args.sostituisci_ids as unknown[] | undefined) ?? []).map(String);
    actions.push({ type: "schedule", items, replace: replace.length ? replace : undefined, label: text(args.descrizione, "descrizione", 160) });
    return { proposta_registrata: "In attesa del «sì» dell'atleta: non è ancora sul calendario.", allenamenti: items.map((i) => `${i.date} ${i.name}`) };
  },
};

const proposeMove: AiTool = {
  name: "proponi_sposta",
  description: "PROPONE di spostare un allenamento del calendario a un'altra data (id da calendario). Non scrive: serve il «sì» dell'atleta.",
  input_schema: { type: "object", properties: { id: { type: "string" }, nome: { type: "string" }, data: { type: "string", description: "Nuovo giorno AAAA-MM-GG" } }, required: ["id", "nome", "data"], additionalProperties: false },
  async run(args, { snapshot, actions }) {
    const to = isoDate(args.data, "data");
    if (to < snapshot.today) bad("Non si sposta nel passato");
    const name = text(args.nome, "nome");
    actions.push({ type: "move", eventId: text(args.id, "id", 40), name, to, label: `Sposto ${name} al ${to}` });
    return { proposta_registrata: "In attesa del «sì» dell'atleta." };
  },
};

const proposeRemove: AiTool = {
  name: "proponi_cancella",
  description: "PROPONE di cancellare un allenamento dal calendario (id da calendario). Non scrive: serve il «sì» dell'atleta.",
  input_schema: { type: "object", properties: { id: { type: "string" }, nome: { type: "string" } }, required: ["id", "nome"], additionalProperties: false },
  async run(args, { actions }) {
    const name = text(args.nome, "nome");
    actions.push({ type: "remove", eventId: text(args.id, "id", 40), name, label: `Cancello ${name}` });
    return { proposta_registrata: "In attesa del «sì» dell'atleta." };
  },
};

const CATEGORY: Record<string, LifeCategory> = { ferie: "HOLIDAY", malattia: "SICK", infortunio: "INJURED" };

const proposeLife: AiTool = {
  name: "proponi_assenza",
  description:
    "PROPONE di segnare su Intervals ferie/trasferta, malattia (= febbre) o infortunio (solo se serio) per un intervallo di date: il piano e l'allenamento di oggi ne tengono conto. Non scrive: serve il «sì» dell'atleta.",
  input_schema: {
    type: "object",
    properties: { categoria: { type: "string", enum: Object.keys(CATEGORY) }, da: { type: "string" }, a: { type: "string" }, nome: { type: "string" } },
    required: ["categoria", "da", "a"],
    additionalProperties: false,
  },
  async run(args, { actions }) {
    const category = CATEGORY[String(args.categoria)] ?? bad('"categoria" deve essere ferie, malattia o infortunio');
    const from = isoDate(args.da, "da");
    const to = isoDate(args.a, "a");
    if (from > to) bad("L'intervallo finisce prima di cominciare");
    const name = typeof args.nome === "string" && args.nome.trim() ? args.nome.trim().slice(0, 80) : String(args.categoria);
    actions.push({ type: "life_add", category, from, to, name, label: `${name}, dal ${from} al ${to}` });
    return { proposta_registrata: "In attesa del «sì» dell'atleta." };
  },
};

const CLASSES = ["recupero", "z2", "tempo", "sweetspot", "soglia", "vo2", "anaerobico", "sprint"] as const;
const PLACES = ["indoor", "outdoor"] as const;

const setToday: AiTool = {
  name: "segna_per_oggi",
  description:
    "Applica SUBITO (niente conferma, non scrive su Intervals, vale solo per oggi) quello che l'atleta dice di oggi: come si sente, poco tempo, allenamento più facile, riposo, tipo di allenamento voluto, rulli o fuori. " +
    "L'allenamento di oggi nell'app ne tiene conto. Usalo quando dice cose come «ho le gambe pesanti», «ho solo 40 minuti», «oggi riposo», «voglio fare soglia», «piove».",
  input_schema: {
    type: "object",
    properties: {
      sensazione: { type: "string", description: "Come si sente, con le sue parole (es. gambe pesanti, ho dormito male)" },
      sensazione_negativa: { type: "boolean", description: "true se abbassa la prontezza di un livello (stanchezza, sonno scarso, dolore lieve)" },
      rpe: { type: "number", description: "RPE 1-10 se l'ha detto" },
      minuti_massimi: { type: "number" },
      piu_facile: { type: "boolean" },
      riposo: { type: "boolean" },
      tipo: { type: "string", enum: CLASSES },
      luogo: { type: "string", enum: PLACES },
    },
    additionalProperties: false,
  },
  async run(args, ctx) {
    const o: ToolContext["overrides"] = {};
    if (typeof args.sensazione === "string" && args.sensazione.trim()) o.feeling = { drop: args.sensazione_negativa === true, note: args.sensazione.trim().slice(0, 120), ...(Number.isFinite(Number(args.rpe)) && args.rpe !== undefined ? { rpe: Math.min(10, Math.max(1, Number(args.rpe))) } : {}) };
    if (args.minuti_massimi !== undefined) o.maxMins = Math.min(600, Math.max(10, Math.round(Number(args.minuti_massimi) || 60)));
    if (args.piu_facile === true) o.easier = true;
    if (args.riposo === true) o.restToday = true;
    if (CLASSES.includes(args.tipo as (typeof CLASSES)[number])) o.wantClass = args.tipo as (typeof CLASSES)[number];
    if (PLACES.includes(args.luogo as (typeof PLACES)[number])) o.place = args.luogo as (typeof PLACES)[number];
    if (Object.keys(o).length === 0) bad("Niente da segnare");
    Object.assign(ctx.overrides, o);
    return { applicato_per_oggi: o };
  },
};

export const AI_TOOLS: AiTool[] = [...readTools, planTool, setToday, proposeSeason, proposeProgram, proposeMove, proposeRemove, proposeLife];
