// The tools the MasCoach connector gives Claude (the coach): read the same numbers the dashboard shows,
// and write workouts on the Intervals.icu calendar. Reads go through handleApi, exactly like the pages.
import { type CalendarData, type DurabilityData, handleApi, type LibraryData } from "../api/handlers";
import type { ActivitiesPage, HistoryData } from "../api/handlers";
import type { DashboardData } from "../dashboard";
import { addDays, toIsoDate } from "../dates";
import { RIDE_TYPES } from "../activities";
import { calendarEvents, type CalendarEvent } from "../calendar";
import { cached, invalidate } from "../intervals/cache";
import {
  createEvent,
  deleteEvent,
  deleteLibraryWorkout,
  fetchActivities,
  fetchActivity,
  fetchEvent,
  fetchEvents,
  fetchStreams,
  intervalsConfigured,
  saveLibraryWorkout,
  updateActivity,
  updateEvent,
} from "../intervals/client";
import type { IcuActivity, IcuEvent } from "../intervals/types";
import type { RideDetail } from "../ride";
import { type CoachMark, coachMarkOf, coachTags, newCoachExternalId } from "./marks";

type Args = Record<string, unknown>;
type JsonSchema = Record<string, unknown>;

export type CoachTool = {
  name: string;
  title: string;
  description: string;
  inputSchema: JsonSchema;
  annotations: { readOnlyHint: boolean; destructiveHint?: boolean; idempotentHint?: boolean; openWorldHint: false };
  run: (args: Args) => Promise<unknown>;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const BIKE_TYPES = ["Ride", "VirtualRide", "GravelRide", "MountainBikeRide"];
/** How far around today cancella_prove looks for test workouts. */
const PROVA_WINDOW = { before: 30, after: 400 };

async function api<T>(path: string): Promise<T> {
  const r = await handleApi("GET", path);
  if (r.status !== 200) throw new Error((r.json as { error?: string })?.error ?? `Errore ${r.status}`);
  return r.json as T;
}

const r1 = (x: number | null | undefined) => (x == null ? null : Math.round(x * 10) / 10);
const ms = (ln: number | null | undefined) => (ln == null ? null : Math.round(Math.exp(ln)));
const today = () => toIsoDate(new Date());

function str(args: Args, key: string, max = 200): string | undefined {
  const v = args[key];
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v !== "string") throw new Error(`"${key}" deve essere un testo`);
  return v.trim().slice(0, max);
}

function date(args: Args, key: string, fallback?: string): string {
  const v = str(args, key) ?? fallback;
  if (!v || !ISO_DATE.test(v)) throw new Error(`"${key}" deve essere una data AAAA-MM-GG`);
  return v;
}

function int(args: Args, key: string, fallback: number, min: number, max: number): number {
  const v = args[key] ?? fallback;
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`"${key}" deve essere un numero`);
  return Math.min(max, Math.max(min, Math.round(v)));
}

function requireIntervals() {
  if (!intervalsConfigured()) throw new Error("MasCoach non è collegato a Intervals.icu (manca INTERVALS_API_KEY).");
}

// ── Reads ───────────────────────────────────────────────────────────────────────────────────────────

async function statoDiOggi() {
  const d = await api<DashboardData>("/api/dashboard");
  const s = d.status;
  const pmc = new Map(d.pmc.map((p) => [p.date, p]));
  const sleep = new Map(d.sleep.map((n) => [n.date, n.hours]));
  return {
    oggi: d.today,
    dati: d.source === "demo" ? "DEMO (Intervals non collegato)" : "Intervals.icu",
    atleta: {
      nome: d.athlete.name,
      ftp_impostata_W: d.athlete.ftp,
      ftp_rulli_W: d.athlete.indoorFtp,
      fc_soglia: d.athlete.lthr,
      fc_max: d.athlete.maxHr,
      peso_kg: r1(d.athlete.weight),
      w_prime_impostato_J: d.athlete.wPrime,
    },
    prontezza: s.readiness,
    carico: {
      fitness_ctl: r1(s.ctl),
      fatica_atl: r1(s.atl),
      forma_tsb: r1(s.tsb),
      zona_forma: s.formZone,
      ramp_rate: r1(s.rampRate),
    },
    hrv_altini: {
      nota: "rMSSD notturna da Garmin, in ln; media 7 giorni confrontata con il range normale dei 60 giorni.",
      media_7gg_ms: ms(s.hrv.baseline7),
      range_normale_ms: [ms(s.hrv.low), ms(s.hrv.high)],
      stato: s.hrv.status,
      calo_acuto_stanotte: s.hrv.acuteDrop,
      cv_7gg_pct: r1(s.hrv.cv7),
      cv_7gg_settimana_prima_pct: r1(s.hrv.cv7Prev),
    },
    fc_riposo: {
      oggi: s.rhr.today,
      media_7gg: r1(s.rhr.baseline7),
      range_normale: [r1(s.rhr.low), r1(s.rhr.high)],
    },
    sistema_nervoso_autonomo: s.autonomic,
    sonno_stanotte_ore: r1(s.sleepHours),
    ultimi_14_giorni: d.recovery.slice(-14).map((x) => ({
      data: x.date,
      rmssd_ms: x.rmssd,
      fc_riposo: x.rhr,
      notte_anomala: x.anomaly,
      sonno_ore: r1(sleep.get(x.date)),
      carico_tss: Math.round(pmc.get(x.date)?.load ?? 0),
      forma_tsb: r1(pmc.get(x.date)?.tsb),
    })),
    uscite_ultimi_7_giorni: d.activities.filter((a) => a.date.slice(0, 10) >= addDays(d.today, -6)).map(rideRow),
  };
}

async function andamento(args: Args) {
  const giorni = int(args, "giorni", 42, 7, 120);
  const d = await api<DashboardData>("/api/dashboard");
  const pmc = new Map(d.pmc.map((p) => [p.date, p]));
  const sleep = new Map(d.sleep.map((n) => [n.date, n.hours]));
  return {
    giorni: d.recovery.slice(-giorni).map((x) => {
      const p = pmc.get(x.date);
      return {
        data: x.date,
        rmssd_ms: x.rmssd,
        hrv_media_7gg_ms: r1(x.hrvBaseline),
        hrv_range_ms: x.hrvRange?.map(Math.round) ?? null,
        fc_riposo: x.rhr,
        fc_riposo_media: r1(x.rhrBaseline),
        notte_anomala: x.anomaly,
        sonno_ore: r1(sleep.get(x.date)),
        carico_tss: Math.round(p?.load ?? 0),
        ctl: r1(p?.ctl),
        atl: r1(p?.atl),
        tsb: r1(p?.tsb),
      };
    }),
    settimane: d.weekly.slice(-Math.ceil(giorni / 7)).map((w) => ({ settimana: w.week, tss: Math.round(w.load), ore: r1(w.hours) })),
    pianificato_vs_fatto: d.plan.hasPlan ? d.plan.weeks : "nessun allenamento pianificato",
    distribuzione_intensita: { ...d.distribution },
    tempo_per_zona_coggan: d.zoneShares.map((z) => ({ zona: z.id, quota_pct: r1(z.share * 100) })),
    eftp_intervals: d.eftp.slice(-12),
  };
}

async function storico(args: Args) {
  const anni = int(args, "anni", 4, 1, 4);
  return api<HistoryData>(`/api/history?years=${anni}`);
}

function rideRow(a: DashboardData["activities"][number]) {
  return {
    id: a.id,
    data: a.date.slice(0, 10),
    nome: a.name,
    tipo: a.type,
    test: a.isTest,
    rulli: a.indoor,
    durata_min: Math.round(a.movingTime / 60),
    km: r1(a.distanceKm),
    watt_medi: a.avgWatts,
    np: a.np,
    if: a.IF,
    tss: a.tss,
    fc_media: a.avgHr,
    disaccoppiamento_pct: r1(a.decoupling),
    ef: a.ef,
  };
}

async function uscite(args: Args) {
  const a = date(args, "a", today());
  const da = date(args, "da", addDays(a, -27));
  if (da > a) throw new Error('"da" deve venire prima di "a"');
  if (da < addDays(a, -364)) throw new Error("Massimo un anno per richiesta: dividi il periodo in più chiamate");
  const page = await api<ActivitiesPage>(`/api/activities?before=${a}`);
  return page.rows.filter((r) => r.date.slice(0, 10) >= da).map(rideRow);
}

async function dettaglioUscita(args: Args) {
  const id = str(args, "id");
  if (!id) throw new Error('Serve "id" (lo trovi con uscite o calendario)');
  // The point-by-point streams are for the charts: the coach gets the summary.
  const ride = await api<RideDetail>(`/api/activity/${encodeURIComponent(id)}`);
  return { ...ride, points: undefined };
}

async function profiloPotenza(args: Args) {
  const d = await api<DashboardData>("/api/dashboard");
  const out: Record<string, unknown> = {
    ftp_impostata_W: d.athlete.ftp,
    w_prime_impostato_J: d.athlete.wPrime,
    curva_84gg: d.mmp,
    potenza_critica: d.cp,
    modelli_intervals: d.icuModels,
    record_del_mese: d.records,
    eftp_intervals: d.eftp.slice(-12),
    zone_potenza: d.powerZones,
    zone_fc: d.hrZones,
  };
  if (args.con_durability === true) out.durability = await api<DurabilityData>("/api/durability");
  return out;
}

function workoutRow(w: CalendarData["workouts"][number]) {
  return {
    id: w.id,
    data: w.date,
    nome: w.name,
    tipo: w.type,
    durata_min: w.secs ? Math.round(w.secs / 60) : null,
    tss: w.tss,
    testo: w.description,
    creato_dal_coach: w.coach,
  };
}

async function calendario(args: Args) {
  const da = date(args, "da", addDays(today(), -7));
  const a = date(args, "a", addDays(today(), 14));
  const cal = await api<CalendarData>(`/api/calendar?from=${da}&to=${a}`);
  return {
    fatto: cal.activities.map((x) => ({
      id: x.id,
      data: x.date,
      nome: x.name,
      tipo: x.type,
      test: x.isTest,
      durata_min: Math.round(x.secs / 60),
      tss: x.tss,
      watt_medi: x.avgWatts,
      fc_media: x.avgHr,
      rpe: x.rpe,
      note: x.description,
    })),
    pianificato: cal.workouts.map(workoutRow),
    gare_impegni_note: cal.events.map(eventRow),
  };
}

function eventRow(e: CalendarEvent) {
  return {
    id: e.id,
    data: e.date,
    ...(e.endDate ? { fino_al: e.endDate } : {}),
    tipo: e.label,
    nome: e.name,
    note: e.description,
    ...(e.loadTarget !== null ? { tss_obiettivo: e.loadTarget } : {}),
    ...(e.timeTarget !== null ? { durata_obiettivo_min: Math.round(e.timeTarget / 60) } : {}),
    ...(e.distanceKm !== null ? { km_obiettivo: r1(e.distanceKm) } : {}),
  };
}

/** Races, holidays, illness, notes, season start and week targets, up to two years ahead. */
async function eventi(args: Args) {
  requireIntervals();
  const da = date(args, "da", today());
  const a = date(args, "a", addDays(da, 365));
  if (da > a) throw new Error('"da" deve venire prima di "a"');
  if (a > addDays(da, 730)) throw new Error("Massimo due anni per richiesta");
  return calendarEvents(await fetchEvents(da, a), da, a).map(eventRow);
}

// ── W′ and fueling (raw activities: these fields aren't in the dashboard rows) ───────────────────────

const ACTIVITIES_TTL_MS = 2 * 60_000;

function rawRides(da: string, a: string): Promise<IcuActivity[]> {
  return cached(`coach-acts:${da}:${a}`, ACTIVITIES_TTL_MS, () => fetchActivities(da, a)).then((list) =>
    list.filter((x) => x.type && RIDE_TYPES.has(x.type)).sort((x, y) => y.start_date_local.localeCompare(x.start_date_local)),
  );
}

const kj = (j: number | null | undefined) => (j ? Math.round(j / 1000) : null);
const pct = (part: number | null | undefined, whole: number | null | undefined) =>
  part != null && whole ? Math.round((part / whole) * 100) : null;

type Drop = { inizio_min: number; minimo_J: number; minimo_pct: number; secondi_sotto_50pct: number; recupero_a_80pct_s: number | null };

/** Whole W′bal stream → depletions below half of W′, time spent low, and a short series to read the shape. */
function wbalSummary(wbal: (number | null)[], wPrime: number) {
  const MAX_POINTS = 120;
  const values = wbal.map((v) => v ?? wPrime);
  let min = wPrime;
  let minAt = 0;
  let below50 = 0;
  let below25 = 0;
  const drops: Drop[] = [];
  let open: { start: number; min: number; secs: number; bottom: number } | null = null;
  const close = (o: { start: number; min: number; secs: number }, recovery: number | null) =>
    drops.push({
      inizio_min: r1(o.start / 60)!,
      minimo_J: Math.round(o.min),
      minimo_pct: pct(o.min, wPrime)!,
      secondi_sotto_50pct: o.secs,
      recupero_a_80pct_s: recovery,
    });
  values.forEach((v, i) => {
    if (v < min) {
      min = v;
      minAt = i;
    }
    if (v < wPrime * 0.25) below25++;
    if (v < wPrime * 0.5) {
      below50++;
      if (!open) open = { start: i, min: v, secs: 0, bottom: i };
      open.secs++;
      if (v < open.min) {
        open.min = v;
        open.bottom = i;
      }
    } else if (open && v >= wPrime * 0.8) {
      close(open, i - open.bottom);
      open = null;
    }
  });
  if (open) close(open, null);
  const step = Math.max(1, Math.ceil(values.length / MAX_POINTS));
  return {
    minimo_J: Math.round(min),
    minimo_pct: pct(min, wPrime),
    minimo_al_minuto: r1(minAt / 60),
    minuti_sotto_50pct: r1(below50 / 60),
    minuti_sotto_25pct: r1(below25 / 60),
    svuotamenti_sotto_50pct: drops.slice(0, 20),
    serie: {
      ogni_secondi: step,
      w_bal_pct: values.filter((_, i) => i % step === 0).map((v) => pct(v, wPrime)),
    },
  };
}

async function wBalance(args: Args) {
  requireIntervals();
  const id = str(args, "id");
  if (!id) {
    const giorni = int(args, "giorni", 28, 7, 120);
    const rides = await rawRides(addDays(today(), -giorni + 1), today());
    return {
      nota: "Svuotamento massimo del W′ per uscita, calcolato da Intervals.icu con il W′ indicato. Per il dettaglio di una uscita chiama di nuovo con il suo id.",
      uscite: rides
        .filter((x) => (x.icu_max_wbal_depletion ?? 0) > 0)
        .map((x) => ({
          id: x.id,
          data: x.start_date_local.slice(0, 10),
          nome: x.name,
          durata_min: Math.round((x.moving_time ?? 0) / 60),
          w_prime_usato_J: x.icu_w_prime ?? null,
          svuotamento_max_J: x.icu_max_wbal_depletion,
          svuotamento_max_pct: pct(x.icu_max_wbal_depletion, x.icu_w_prime),
          kj_sopra_ftp: kj(x.icu_joules_above_ftp),
        })),
    };
  }
  const [act, streams] = await Promise.all([fetchActivity(id), fetchStreams(id, "w_bal")]);
  const wPrime = act.icu_w_prime ?? null;
  const wbal = streams.find((x) => x.type === "w_bal")?.data ?? [];
  if (!wPrime || !wbal.length) throw new Error("Questa uscita non ha il W′bal (serve la potenza e un W′ impostato su Intervals).");
  return {
    id: act.id,
    data: act.start_date_local.slice(0, 10),
    nome: act.name,
    durata_min: Math.round((act.moving_time ?? 0) / 60),
    w_prime_usato_J: wPrime,
    svuotamento_max_J: act.icu_max_wbal_depletion ?? null,
    kj_sopra_ftp: kj(act.icu_joules_above_ftp),
    nota: "W′bal calcolato da Intervals.icu (modello di Skiba) con il W′ indicato: è una stima di modello.",
    ...wbalSummary(wbal, wPrime),
  };
}

async function fuelingLog(args: Args) {
  requireIntervals();
  const a = date(args, "a", today());
  const da = date(args, "da", addDays(a, -27));
  if (da > a) throw new Error('"da" deve venire prima di "a"');
  if (da < addDays(a, -364)) throw new Error("Massimo un anno per richiesta");
  const minMin = int(args, "minimo_minuti", 90, 30, 600);
  const rides = (await rawRides(da, a)).filter((x) => (x.moving_time ?? 0) >= minMin * 60);
  return {
    nota:
      "carboidrati_assunti_g li inserisce l'atleta (su Intervals o con registra_carboidrati); null = non registrati. " +
      "carboidrati_consumati_stima_g è una stima di Intervals.icu dal lavoro svolto.",
    uscite: rides.map((x) => {
      const hours = (x.moving_time ?? 0) / 3600;
      return {
        id: x.id,
        data: x.start_date_local.slice(0, 10),
        nome: x.name,
        durata_min: Math.round(hours * 60),
        kj: kj(x.icu_joules),
        np: x.icu_weighted_avg_watts ?? null,
        if: x.icu_intensity != null ? Math.round(x.icu_intensity) / 100 : null,
        disaccoppiamento_pct: r1(x.decoupling),
        rpe: x.icu_rpe && x.icu_rpe > 0 ? x.icu_rpe : null,
        carboidrati_assunti_g: x.carbs_ingested ?? null,
        carboidrati_assunti_g_h: x.carbs_ingested != null && hours > 0 ? Math.round(x.carbs_ingested / hours) : null,
        carboidrati_consumati_stima_g: x.carbs_used ?? null,
      };
    }),
  };
}

async function libreria() {
  const lib = await api<LibraryData>("/api/library");
  return lib.folders.map((f) => ({
    cartella: f.name,
    allenamenti: f.workouts.map((w) => ({
      nome: w.name,
      durata_min: w.secs ? Math.round(w.secs / 60) : null,
      tss: w.tss,
      testo: w.description,
    })),
  }));
}

// ── Writes ──────────────────────────────────────────────────────────────────────────────────────────

/**
 * What went wrong when Intervals.icu read the workout text, if anything. A repeat header ("Sweet spot 3x")
 * only works after a blank line: without it the block is read once and the workout comes out shorter.
 */
export function parseWarning(text: string | null | undefined, steps: { reps?: number | null }[] | null | undefined): string | null {
  if (!steps?.length) return "Intervals.icu non ha riconosciuto nessun passo: controlla il formato del testo.";
  const repeats = (text ?? "").split(/\r?\n/).filter((l) => !/^\s*-/.test(l) && /\b\d+\s*x\s*$/i.test(l)).length;
  const parsed = steps.filter((x) => (x.reps ?? 1) > 1).length;
  if (repeats > parsed)
    return "Intervals.icu non ha letto tutte le ripetute: lascia una riga vuota prima di ogni titolo con \"Nx\" e correggi con modifica_allenamento.";
  return null;
}

function summary(e: IcuEvent) {
  const warning = parseWarning(e.description, e.workout_doc?.steps);
  return {
    id: String(e.id),
    data: e.start_date_local.slice(0, 10),
    nome: e.name,
    durata_min: e.moving_time ? Math.round(e.moving_time / 60) : null,
    tss: e.icu_training_load ?? null,
    creato_dal_coach: coachMarkOf(e.external_id),
    ...(warning ? { attenzione: warning } : {}),
  };
}

function workoutText(args: Args): string | undefined {
  const text = str(args, "testo", 4000);
  if (text !== undefined && !/^\s*-\s/m.test(text)) {
    throw new Error('Il testo non contiene passi: ogni passo è una riga che inizia con "- " (es. "- 10m 55%").');
  }
  return text;
}

async function creaAllenamento(args: Args) {
  requireIntervals();
  const day = date(args, "data");
  if (day < today()) throw new Error("Non si pianifica nel passato");
  const name = str(args, "nome", 120);
  if (!name) throw new Error('Serve "nome"');
  const text = workoutText(args);
  if (!text) throw new Error('Serve "testo" con i passi in formato Intervals.icu');
  const type = str(args, "tipo") ?? "Ride";
  if (!BIKE_TYPES.includes(type)) throw new Error(`"tipo" deve essere uno tra: ${BIKE_TYPES.join(", ")}`);
  const mark: CoachMark = args.prova === false ? "coach" : "prova";
  const created = await createEvent({
    category: "WORKOUT",
    start_date_local: `${day}T00:00:00`,
    type,
    name,
    description: text,
    indoor: type === "VirtualRide" || args.rulli === true,
    external_id: newCoachExternalId(mark),
    tags: coachTags(mark),
  });
  return summary(created);
}

/** The coach may only touch workouts it wrote itself. */
async function ownWorkout(args: Args): Promise<IcuEvent> {
  requireIntervals();
  const id = str(args, "id");
  if (!id) throw new Error('Serve "id" (lo trovi con calendario)');
  const e = await fetchEvent(id);
  if (!coachMarkOf(e.external_id)) {
    throw new Error("Questo allenamento non l'ha creato il coach: lo può cambiare solo l'atleta, da MasCoach o Intervals.icu.");
  }
  return e;
}

async function modificaAllenamento(args: Args) {
  const e = await ownWorkout(args);
  const patch: Partial<IcuEvent> = {};
  const day = str(args, "data");
  if (day !== undefined) {
    if (!ISO_DATE.test(day) || day < today()) throw new Error('"data" deve essere una data AAAA-MM-GG da oggi in poi');
    patch.start_date_local = `${day}T00:00:00`;
  }
  const name = str(args, "nome", 120);
  if (name) patch.name = name;
  const text = workoutText(args);
  if (text) patch.description = text;
  if (!Object.keys(patch).length) throw new Error("Niente da cambiare: indica data, nome o testo");
  return summary(await updateEvent(String(e.id), patch));
}

async function cancellaAllenamento(args: Args) {
  const e = await ownWorkout(args);
  await deleteEvent(String(e.id));
  return { cancellato: summary(e) };
}

/** Records the carbohydrate eaten on a ride (total grams, or g/h × moving time). */
async function registraCarboidrati(args: Args) {
  requireIntervals();
  const id = str(args, "id");
  if (!id) throw new Error('Serve "id" dell\'uscita (lo trovi con fueling_log o uscite)');
  const act = await fetchActivity(id);
  if (!act.type || !RIDE_TYPES.has(act.type)) throw new Error("Si registrano i carboidrati solo sulle uscite in bici");
  const hours = (act.moving_time ?? 0) / 3600;
  let grams: number;
  if (typeof args.grammi === "number") grams = args.grammi;
  else if (typeof args.grammi_ora === "number" && hours > 0) grams = args.grammi_ora * hours;
  else throw new Error('Indica "grammi" (totali) oppure "grammi_ora"');
  grams = Math.round(grams);
  if (!Number.isFinite(grams) || grams < 0 || grams > 1000) throw new Error("Valore fuori scala: tra 0 e 1000 g");
  await updateActivity(id, { carbs_ingested: grams });
  invalidate("coach-acts:");
  return {
    id,
    data: act.start_date_local.slice(0, 10),
    nome: act.name,
    carboidrati_assunti_g: grams,
    carboidrati_assunti_g_h: hours > 0 ? Math.round(grams / hours) : null,
    prima: act.carbs_ingested ?? null,
  };
}

const LIBRARY_FOLDER = "MasCoach Coach";

async function salvaInLibreria(args: Args) {
  requireIntervals();
  const name = str(args, "nome", 120);
  if (!name) throw new Error('Serve "nome"');
  const text = workoutText(args);
  if (!text) throw new Error('Serve "testo" con i passi in formato Intervals.icu');
  const type = str(args, "tipo") ?? "Ride";
  if (!BIKE_TYPES.includes(type)) throw new Error(`"tipo" deve essere uno tra: ${BIKE_TYPES.join(", ")}`);
  const tags = Array.isArray(args.tag)
    ? args.tag
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.trim().slice(0, 40))
        .filter(Boolean)
        .slice(0, 12)
    : [];
  const { workout, folder } = await saveLibraryWorkout(LIBRARY_FOLDER, {
    name,
    description: text,
    type,
    indoor: type === "VirtualRide" || args.rulli === true,
    tags: ["MasCoach Coach", ...tags],
  });
  const warning = parseWarning(text, workout.workout_doc?.steps);
  if (warning) {
    await deleteLibraryWorkout(workout.id);
    throw new Error(`${warning.replace(/ e correggi con modifica_allenamento\./, ".")} Non ho salvato niente: correggi il testo e riprova.`);
  }
  return {
    id: workout.id,
    cartella: folder,
    nome: workout.name,
    durata_min: workout.moving_time ? Math.round(workout.moving_time / 60) : null,
    tss: workout.icu_training_load ?? null,
  };
}

async function cancellaProve() {
  requireIntervals();
  const t = today();
  const events = await fetchEvents(addDays(t, -PROVA_WINDOW.before), addDays(t, PROVA_WINDOW.after));
  const prove = events.filter((e) => coachMarkOf(e.external_id) === "prova");
  for (const e of prove) await deleteEvent(String(e.id));
  return { cancellati: prove.map(summary) };
}

// ── Catalogue ───────────────────────────────────────────────────────────────────────────────────────

const READ = { readOnlyHint: true, openWorldHint: false } as const;
const noArgs: JsonSchema = { type: "object", properties: {}, additionalProperties: false };

const WORKOUT_FORMAT =
  'Testo in formato Intervals.icu, una riga per passo che inizia con "- ": durata (10m, 30s, 1h) e intensità. ' +
  "Intensità: percentuale dell'FTP impostata su Intervals (es. 88-92%), zone (Z2), watt assoluti (210-220w) se vuoi un " +
  "riferimento diverso dall'FTP impostata, FC (75% LTHR), cadenza (90rpm). Rampe: \"- 10m ramp 50-70%\". " +
  'Ripetute: una riga "Titolo 3x" seguita dai passi da ripetere, sempre con una riga vuota prima del titolo (senza, Intervals ignora la ripetizione). ' +
  'Righe senza "- " sono titoli di sezione. ' +
  "Esempio:\nRiscaldamento\n- 10m ramp 50-70%\n\nSweet spot 3x\n- 12m 88-92%\n- 5m 55%\n\nDefaticamento\n- 10m 50%";

export const COACH_TOOLS: CoachTool[] = [
  {
    name: "stato_di_oggi",
    title: "Stato di oggi",
    description:
      "Da chiamare per primo. Prontezza di oggi, HRV con il metodo Altini (media 7 gg vs range normale), FC a riposo, " +
      "sistema nervoso autonomo, sonno, fitness/fatica/forma, profilo dell'atleta (FTP, soglie, peso), ultimi 14 giorni e uscite della settimana.",
    inputSchema: noArgs,
    annotations: READ,
    run: statoDiOggi,
  },
  {
    name: "andamento",
    title: "Andamento",
    description:
      "Serie giornaliera di HRV, FC a riposo, sonno, carico e CTL/ATL/TSB, più carico settimanale, pianificato vs fatto, " +
      "distribuzione dell'intensità (Seiler) e eFTP. Utile per tendenze e programmazione.",
    inputSchema: {
      type: "object",
      properties: { giorni: { type: "integer", minimum: 7, maximum: 120, description: "Quanti giorni indietro (default 42)" } },
      additionalProperties: false,
    },
    annotations: READ,
    run: andamento,
  },
  {
    name: "storico",
    title: "Storico",
    description:
      "Lo storico fino a 4 anni: per anno e per mese ore, km, TSS, uscite lunghe, test, CTL (media, picco, fine), eFTP, " +
      "migliori watt per anno (5s, 1m, 5m, 20m, 60m), tempo nelle zone, HRV media, FC a riposo, sonno, notti anomale (Altini); " +
      "più l'elenco dei test. Da usare per la prima analisi dell'atleta e per confrontare stagioni.",
    inputSchema: {
      type: "object",
      properties: { anni: { type: "integer", minimum: 1, maximum: 4, description: "Quanti anni indietro (default 4)" } },
      additionalProperties: false,
    },
    annotations: READ,
    run: storico,
  },
  {
    name: "uscite",
    title: "Uscite",
    description:
      "Elenco delle uscite in un periodo (default ultime 4 settimane, massimo un anno per richiesta, anche negli anni passati): " +
      "durata, NP, IF, TSS, FC, disaccoppiamento, EF, test.",
    inputSchema: {
      type: "object",
      properties: {
        da: { type: "string", format: "date", description: "Primo giorno AAAA-MM-GG" },
        a: { type: "string", format: "date", description: "Ultimo giorno AAAA-MM-GG (default oggi)" },
      },
      additionalProperties: false,
    },
    annotations: READ,
    run: uscite,
  },
  {
    name: "dettaglio_uscita",
    title: "Dettaglio uscita",
    description: "Analisi di una uscita: riepilogo, tempo nelle zone, migliori sforzi e, se è un test, il risultato (FTP stimata, soglie).",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "id dell'uscita (da uscite o calendario)" } },
      required: ["id"],
      additionalProperties: false,
    },
    annotations: READ,
    run: dettaglioUscita,
  },
  {
    name: "profilo_potenza",
    title: "Profilo di potenza",
    description:
      "Curva di potenza degli ultimi 84 giorni, potenza critica (CP, W'), modelli di Intervals, record del mese, eFTP, zone di potenza e FC. " +
      "Con con_durability=true aggiunge il calo di potenza dopo 2 h e 3 h (più lento da calcolare).",
    inputSchema: {
      type: "object",
      properties: { con_durability: { type: "boolean", description: "Includi la durability (default no)" } },
      additionalProperties: false,
    },
    annotations: READ,
    run: profiloPotenza,
  },
  {
    name: "calendario",
    title: "Calendario",
    description:
      "Uscite fatte e allenamenti pianificati in un periodo (default da 7 giorni fa a 14 giorni avanti, massimo 70 giorni), " +
      "con il testo di ogni allenamento, se l'ha creato il coach, e gare, impegni e note del periodo.",
    inputSchema: {
      type: "object",
      properties: {
        da: { type: "string", format: "date", description: "Primo giorno AAAA-MM-GG" },
        a: { type: "string", format: "date", description: "Ultimo giorno AAAA-MM-GG" },
      },
      additionalProperties: false,
    },
    annotations: READ,
    run: calendario,
  },
  {
    name: "eventi",
    title: "Gare, impegni e note",
    description:
      "Tutto quello che sul calendario di Intervals non è un allenamento: gare A/B/C, vacanze e impegni, malattia, infortuni, note, " +
      "inizio stagione, obiettivi della settimana (TSS, ore, km). Default da oggi a 12 mesi, massimo 2 anni. " +
      "Usalo prima di pianificare una settimana, un blocco o la stagione.",
    inputSchema: {
      type: "object",
      properties: {
        da: { type: "string", format: "date", description: "Primo giorno AAAA-MM-GG (default oggi)" },
        a: { type: "string", format: "date", description: "Ultimo giorno AAAA-MM-GG (default da + 12 mesi)" },
      },
      additionalProperties: false,
    },
    annotations: READ,
    run: eventi,
  },
  {
    name: "w_balance",
    title: "W′ balance",
    description:
      "Senza id: svuotamento massimo del W′ in ogni uscita degli ultimi giorni (default 28). " +
      "Con id: W′bal di una uscita (modello di Skiba, calcolato da Intervals.icu): minimo in J e %, minuti sotto 50% e 25%, " +
      "ogni svuotamento sotto il 50% con il tempo per tornare all'80%, e una serie in % del W′ per leggerne l'andamento. " +
      "Il W′ impostato è in stato_di_oggi e profilo_potenza (w_prime_impostato_J).",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "id dell'uscita (da uscite o calendario); senza, elenco delle uscite" },
        giorni: { type: "integer", minimum: 7, maximum: 120, description: "Senza id: quanti giorni indietro (default 28)" },
      },
      additionalProperties: false,
    },
    annotations: READ,
    run: wBalance,
  },
  {
    name: "fueling_log",
    title: "Carboidrati nelle uscite",
    description:
      "Uscite lunghe di un periodo (default ultime 4 settimane, sopra i 90 minuti): durata, kJ, NP, IF, disaccoppiamento, RPE, " +
      "carboidrati assunti (g e g/h, se registrati) e carboidrati consumati stimati da Intervals.",
    inputSchema: {
      type: "object",
      properties: {
        da: { type: "string", format: "date", description: "Primo giorno AAAA-MM-GG" },
        a: { type: "string", format: "date", description: "Ultimo giorno AAAA-MM-GG (default oggi)" },
        minimo_minuti: { type: "integer", minimum: 30, maximum: 600, description: "Durata minima delle uscite (default 90)" },
      },
      additionalProperties: false,
    },
    annotations: READ,
    run: fuelingLog,
  },
  {
    name: "libreria_allenamenti",
    title: "Libreria allenamenti",
    description: "Gli allenamenti salvati nella libreria di Intervals.icu, per cartella, con il loro testo.",
    inputSchema: noArgs,
    annotations: READ,
    run: libreria,
  },
  {
    name: "crea_allenamento",
    title: "Crea allenamento",
    description:
      "Scrive un allenamento sul calendario di Intervals.icu (da lì arriva al Garmin). Prima di usarlo mostra l'anteprima " +
      "e aspetta la conferma esplicita. Con prova=true (default) l'allenamento è marcato \"Prova\" e si cancella in blocco con cancella_prove. " +
      WORKOUT_FORMAT,
    inputSchema: {
      type: "object",
      properties: {
        data: { type: "string", format: "date", description: "Giorno AAAA-MM-GG, da oggi in poi" },
        nome: { type: "string", description: "Nome breve, es. \"Sweet spot 3×12'\"" },
        testo: { type: "string", description: "Passi in formato Intervals.icu (vedi descrizione)" },
        tipo: { type: "string", enum: BIKE_TYPES, description: "Ride (default), VirtualRide per i rulli, GravelRide, MountainBikeRide" },
        rulli: { type: "boolean", description: "Da fare sui rulli (default no; sì se tipo è VirtualRide)" },
        prova: { type: "boolean", description: "Marca come prova (default true). false solo quando l'atleta lo vuole davvero nel piano." },
      },
      required: ["data", "nome", "testo"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    run: creaAllenamento,
  },
  {
    name: "modifica_allenamento",
    title: "Modifica allenamento",
    description:
      "Cambia data, nome o testo di un allenamento creato dal coach (gli altri non si toccano). Chiedi prima conferma. " + WORKOUT_FORMAT,
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "id dell'allenamento (da calendario)" },
        data: { type: "string", format: "date", description: "Nuovo giorno AAAA-MM-GG" },
        nome: { type: "string" },
        testo: { type: "string", description: "Nuovi passi in formato Intervals.icu" },
      },
      required: ["id"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    run: modificaAllenamento,
  },
  {
    name: "cancella_allenamento",
    title: "Cancella allenamento",
    description: "Cancella un allenamento creato dal coach (gli altri non si toccano). Chiedi prima conferma.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "id dell'allenamento (da calendario)" } },
      required: ["id"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    run: cancellaAllenamento,
  },
  {
    name: "registra_carboidrati",
    title: "Registra i carboidrati",
    description:
      "Scrive su Intervals.icu i carboidrati assunti in una uscita, quando l'atleta li riferisce in chat: grammi totali oppure grammi_ora " +
      "(moltiplicati per la durata in movimento). Sostituisce il valore precedente. Chiedi prima conferma del numero.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "id dell'uscita (da fueling_log o uscite)" },
        grammi: { type: "number", minimum: 0, maximum: 1000, description: "Carboidrati totali in grammi" },
        grammi_ora: { type: "number", minimum: 0, maximum: 150, description: "In alternativa: grammi per ora" },
      },
      required: ["id"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    run: registraCarboidrati,
  },
  {
    name: "salva_in_libreria",
    title: "Salva in libreria",
    description:
      'Salva un workout nella libreria di Intervals.icu, nella cartella "MasCoach Coach" (creata la prima volta), con i tag indicati ' +
      "(es. THRESHOLD, GRANFONDO, K2). Non lo mette sul calendario. Chiedi prima conferma. " +
      WORKOUT_FORMAT,
    inputSchema: {
      type: "object",
      properties: {
        nome: { type: "string", description: "Nome del workout" },
        testo: { type: "string", description: "Passi in formato Intervals.icu" },
        tipo: { type: "string", enum: BIKE_TYPES, description: "Ride (default), VirtualRide, GravelRide, MountainBikeRide" },
        rulli: { type: "boolean", description: "Pensato per i rulli (default no; sì se tipo è VirtualRide)" },
        tag: { type: "array", items: { type: "string" }, description: 'Tag del workout, es. ["THRESHOLD", "GRANFONDO", "K2"]' },
      },
      required: ["nome", "testo"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    run: salvaInLibreria,
  },
  {
    name: "cancella_prove",
    title: "Cancella le prove",
    description: "Cancella tutti gli allenamenti marcati \"Prova\" dal coach (da 30 giorni fa a 13 mesi avanti). Chiedi prima conferma.",
    inputSchema: noArgs,
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    run: cancellaProve,
  },
];
