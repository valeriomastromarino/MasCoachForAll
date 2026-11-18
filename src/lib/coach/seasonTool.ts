// piano_stagione: the season as the app computes it, for the coach in Claude. Until 12 November 2026 the connector gave
// only the season's settings, and the coach rebuilt the phases from the dates: it could propose a week the app did not
// have. Read only: the setup comes from the copy the app keeps on Intervals.icu (lib/profile/cloud.ts), the weeks from
// the same functions the Stagione page uses.
import type { CalendarData, LibraryData } from "../api/handlers";
import type { LibraryWorkout } from "../calendar";
import type { DashboardData } from "../dashboard";
import { addDays, weekStart } from "../dates";
import type { CloudPayload } from "../profile/cloud";
import { CLASS_SAY } from "../training/classify";
import { recentFromRides } from "../training/done";
import type { LifeEvent } from "../training/life";
import { PHASE_INFO, planFromToday, type PlanWeek, RAMP_TARGET } from "../training/season";
import { type DayView, seasonWeeks } from "../training/weeks";

const RIDE_CATEGORIES = ["strada", "offroad", "rulli"];
const DAY_STATE: Record<DayView["kind"], string> = {
  done: "fatto",
  cal: "già su Intervals",
  mine: "scelto dall'atleta nell'app",
  prop: "proposta dell'app",
  rest: "riposo",
  off: "non è tra i suoi giorni",
  stop: "stop",
  race: "gara",
};

export type SeasonToolInput = {
  payload: CloudPayload;
  dash: DashboardData;
  library: LibraryData;
  /** Planned workouts from this week's Monday for two weeks. */
  calendar: CalendarData["workouts"];
  life: LifeEvent[];
  /** How many weeks of the plan to list. */
  weeks: number;
};

const weekRow = (w: PlanWeek, fixed: boolean) => ({
  da: w.start,
  a: w.end,
  fase: PHASE_INFO[w.phase].label,
  tipo: w.kind === "scarico" ? "leggera" : w.kind,
  tss: w.tssTarget,
  ore: w.hoursApprox,
  ctl_fine: Math.round(w.ctlEnd * 10) / 10,
  qualita_max: w.qualityMax,
  duri_max: w.hardMax,
  ...(w.block ? { blocco: true } : {}),
  ...(w.raceDay ? { gara_A: w.raceDay } : {}),
  ...(w.stopDays ? { giorni_di_stop: w.stopDays } : {}),
  ...(w.easyDays ? { giorni_solo_z1_z2: w.easyDays } : {}),
  ...(w.limitedByTime ? { limitata_dalle_ore: true } : {}),
  ...(fixed ? { fissata_dall_atleta: true } : {}),
  ...(w.note ? { nota: w.note } : {}),
});

function dayRow(d: DayView) {
  return {
    data: d.date,
    stato: DAY_STATE[d.kind],
    ...(d.name ? { nome: d.name } : {}),
    ...(d.c ? { tipo: CLASS_SAY[d.c.cls] } : {}),
    ...(d.mins != null ? { durata_min: d.mins } : {}),
    ...(d.tss != null ? { tss: d.tss } : {}),
    ...(d.indoor !== undefined && d.name ? { rulli: d.indoor } : {}),
    ...(d.doneQuality || d.c?.quality ? { qualita: true } : {}),
    ...(d.event ? { id_calendario: d.event.id } : {}),
    ...(d.reason ? { motivo: d.reason } : {}),
  };
}

/** The answer of piano_stagione, from data already read (pure: tested with the demo data). */
export function seasonPlanView(input: SeasonToolInput) {
  const { payload, dash, life } = input;
  const setup = payload.season;
  if (!setup) {
    return { disponibile: false, nota: "L'atleta non ha ancora impostato la stagione nell'app (pagina Stagione), o l'app non l'ha ancora salvata su Intervals.icu." };
  }
  const today = dash.today;
  const monday = weekStart(today);
  const plan = planFromToday(setup, today, dash.status.ctl, life);
  const library: LibraryWorkout[] = input.library.folders.flatMap((f) => f.workouts);
  const names = new Map(library.map((w) => [w.id, w.name]));
  const done = dash.activities
    .filter((a) => a.date.slice(0, 10) >= monday && a.date.slice(0, 10) < today && RIDE_CATEGORIES.includes(a.category))
    .map((a) => ({ date: a.date.slice(0, 10), name: a.name, mins: Math.round(a.movingTime / 60), tss: a.tss, indoor: a.indoor }));
  // The two weeks that hold the next seven days, laid out exactly as the Stagione page does.
  const views = seasonWeeks({
    plan,
    setup,
    today,
    calendar: input.calendar,
    done,
    weeks: 2,
    base: {
      readiness: dash.status.readiness.level,
      tsbYesterday: dash.status.tsbYesterday,
      ctl: dash.status.ctl,
      recent: recentFromRides(dash.activities, library),
      library,
      profile: payload.profile ?? undefined,
      phenotype: payload.phenotype,
      place: "any",
      ftp: dash.athlete.ftp,
      indoorFtp: dash.athlete.indoorFtp,
      rampRate: dash.status.rampRate,
      life,
      gym: [...(dash.gymDays ?? []), ...input.calendar.filter((w) => w.type === "WeightTraining").map((w) => w.date)],
      feeling: null,
    },
  });
  const until = addDays(today, 6);
  const fixed = setup.weekPlans ?? {};

  return {
    disponibile: true,
    oggi: today,
    salvata_dall_app_il: payload.savedAt.slice(0, 10),
    nota:
      "È il piano che l'app mostra nella pagina Stagione, ricalcolato adesso dal CTL di oggi con le impostazioni salvate dall'app su Intervals.icu. " +
      "Le settimane lontane sono una mappa (cambiano col CTL vero); i prossimi 7 giorni sono la proposta dell'app, con la prontezza di oggi e verde per i giorni dopo. " +
      "Non comprende ciò che l'atleta ha chiesto solo per oggi nella chat dell'app. Sola lettura: il piano si cambia dall'app.",
    leve: {
      inizio_stagione: setup.start,
      gara_A: setup.raceA,
      periodo_di_picco: setup.peak ? { inizio: setup.peak.start, settimane: setup.peak.weeks } : null,
      ramp_rate: { scelta: setup.ramp, ctl_a_settimana: RAMP_TARGET[setup.ramp] },
      ore_massime_settimana: setup.maxHours,
      stop: setup.stops,
      limiti_di_ore_per_settimana: setup.weekCaps ?? [],
      settimane_leggere_chieste: setup.lightWeeks ?? [],
      settimane_di_blocco_chieste: setup.blockWeeks ?? [],
    },
    ctl: { oggi: dash.status.ctl === null ? null : Math.round(dash.status.ctl * 10) / 10, fine_piano: Math.round(plan.ctlEnd * 10) / 10, al_picco: plan.ctlPeak === null ? null : Math.round(plan.ctlPeak * 10) / 10 },
    finestra_di_picco: plan.peakWindow,
    avvisi_del_piano: plan.warnings,
    settimane_totali: plan.weeks.length,
    settimane: plan.weeks.slice(0, input.weeks).map((w) => weekRow(w, !!fixed[w.start]?.length)),
    giorni_fissati: Object.entries(fixed)
      .filter(([start, days]) => days.length && addDays(start, 6) >= today)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([start, days]) => ({
        settimana_dal: start,
        giorni: days.map((d) => ({ data: d.date, allenamento: d.id === null ? "riposo" : (names.get(d.id) ?? `allenamento ${d.id} (non più in libreria)`), scelto_dall_atleta: d.mine })),
      })),
    prossimi_7_giorni: views.flatMap((v) => v.days.filter((d) => d.date >= today && d.date <= until)).map(dayRow),
    avvisi_delle_settimane: views.filter((v) => v.warnings.length).map((v) => ({ settimana_dal: v.week.start, avvisi: v.warnings })),
  };
}
