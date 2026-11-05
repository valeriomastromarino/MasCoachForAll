// Season planner: from today to 8-9 months ahead, in weeks. It works backwards from the goal windows (a peak period of
// up to 8 weeks, an optional A race with its taper), builds the weeks before them in base and build blocks, and sets each
// week's TSS from the ramp rate the athlete accepts (CTL gained per week), with a lighter week every 4th load week.
// The plan is a map, not a calendar: it is rebuilt from the real CTL, so a week that went badly moves everything after it.
import { addDays, weekStart } from "@/lib/dates";
import { type LifeEvent, loadFactor, restrictionOn } from "./life";
import type { WorkoutClass } from "./suggest";

export type PhaseId = "base_1" | "base_2" | "base_3" | "build_1" | "build_2" | "peak" | "taper" | "recupero" | "mantenimento";

export const PHASE_INFO: Record<PhaseId, { label: string; focus: string; classes: WorkoutClass[]; hardMax: number }> = {
  base_1: { label: "Base 1", focus: "Fondazione aerobica", classes: ["recupero", "z2", "sprint"], hardMax: 0 },
  base_2: { label: "Base 2", focus: "Più volume, entra il tempo", classes: ["recupero", "z2", "tempo", "sprint"], hardMax: 0 },
  base_3: { label: "Base 3", focus: "Entra lo sweet spot", classes: ["recupero", "z2", "tempo", "sweetspot", "sprint"], hardMax: 1 },
  build_1: { label: "Build 1", focus: "Sweet spot e soglia", classes: ["recupero", "z2", "tempo", "sweetspot", "soglia", "sprint"], hardMax: 1 },
  build_2: { label: "Build 2", focus: "Soglia e VO2max", classes: ["recupero", "z2", "sweetspot", "soglia", "vo2", "sprint"], hardMax: 2 },
  peak: { label: "Picco", focus: "Forma alta: VO2max, anaerobico, soglia", classes: ["recupero", "z2", "soglia", "vo2", "anaerobico", "sprint"], hardMax: 2 },
  taper: { label: "Tapering", focus: "Meno volume, stessa intensità", classes: ["recupero", "z2", "soglia", "vo2", "sprint"], hardMax: 1 },
  recupero: { label: "Recupero", focus: "Scarico dopo il picco o la gara", classes: ["recupero", "z2"], hardMax: 0 },
  mantenimento: { label: "Mantenimento", focus: "Tieni la forma senza spingere", classes: ["recupero", "z2", "tempo", "sweetspot", "soglia", "sprint"], hardMax: 1 },
};

export type RampLevel = "prudente" | "bilanciato" | "aggressivo";
/** CTL points gained per week on a load week. */
export const RAMP_TARGET: Record<RampLevel, number> = { prudente: 2.5, bilanciato: 3.5, aggressivo: 5.5 };

export type SeasonSetup = {
  /** First day of the plan (usually today). */
  start: string;
  horizonWeeks: number;
  raceA: { date: string; name?: string; tipo?: string } | null;
  /** Peak-form period: starts in the week of `start`, lasts `weeks` (1–8). */
  peak: { start: string; weeks: number } | null;
  ramp: RampLevel;
  /** Holidays, trips, illness: days without training. */
  stops: { from: string; to: string; label?: string }[];
  /** Most hours the athlete can ride in a week; caps the weekly TSS. */
  maxHours: number | null;
  /** One-off limits: "questa settimana solo 5 ore" (week start → hours). */
  weekCaps?: { start: string; hours: number }[];
  /** Weeks (Monday dates) the athlete wants as a light week: "questa settimana faccio scarico". The load then picks up after it. */
  lightWeeks?: string[];
};

export type WeekKind = "carico" | "scarico" | "stop" | "taper" | "gara";

export type PlanWeek = {
  start: string;
  end: string;
  phase: PhaseId;
  kind: WeekKind;
  tssTarget: number;
  ctlEnd: number;
  hoursApprox: number;
  /** Hard sessions allowed this week (phase limit, 0 in a lighter week). */
  hardMax: number;
  /** Days without training (holiday, fever). */
  stopDays: number;
  /** Days of Z1–Z2 only (after a fever, injury). */
  easyDays: number;
  limitedByTime: boolean;
  note: string | null;
};

export type SeasonPlan = {
  weeks: PlanWeek[];
  ctlStart: number;
  ctlEnd: number;
  ctlPeak: number | null;
  peakWindow: { start: string; end: string } | null;
  rampTarget: number;
  stops: SeasonSetup["stops"];
  warnings: string[];
};

/** Share of CTL left after a week at constant load: (41/42)^7. */
const Q = Math.pow(41 / 42, 7);
/** Weekly TSS per hour of riding, to turn a TSS target into hours. */
const TSS_PER_HOUR = 55;
const MAX_PEAK_WEEKS = 8;
const MAX_HORIZON_WEEKS = 52;

const ctlAfter = (ctl: number, weeklyTss: number) => {
  const daily = weeklyTss / 7;
  return daily + (ctl - daily) * Q;
};
/** Weekly TSS that raises the CTL by `ramp` points in a week, starting from `ctl`. */
export const weeklyTssForRamp = (ctl: number, ramp: number) => 7 * (ctl + ramp / (1 - Q));

const daysBetween = (a: string, b: string) => Math.round((new Date(`${b}T12:00:00`).getTime() - new Date(`${a}T12:00:00`).getTime()) / 86400000);

export function planSeason(setup: SeasonSetup, ctl0: number | null, life: LifeEvent[] = []): SeasonPlan {
  const allLife: LifeEvent[] = [...life, ...setup.stops.map((s, i) => ({ id: `stop${i}`, category: "HOLIDAY" as const, from: s.from, to: s.to, name: s.label }))];
  const warnings: string[] = [];
  const ctlStart = Math.max(10, ctl0 ?? 30);
  const first = weekStart(setup.start);
  const idxOf = (date: string) => Math.floor(daysBetween(first, date) / 7);
  // The plan reaches at least to the end of the goals (the peak, or the race) plus the weeks that follow.
  const peakWeeksAsked = setup.peak ? Math.min(MAX_PEAK_WEEKS, Math.max(1, setup.peak.weeks)) : 0;
  const reach = Math.max(setup.peak ? idxOf(setup.peak.start) + peakWeeksAsked + 2 : 0, setup.raceA ? idxOf(setup.raceA.date) + 2 : 0);
  const n = Math.max(4, Math.min(MAX_HORIZON_WEEKS, Math.max(setup.horizonWeeks, reach)));
  const starts = Array.from({ length: n }, (_, i) => addDays(first, 7 * i));

  // ── Goal windows, as week indexes ────────────────────────────────────────────────────────────
  const phase: (PhaseId | null)[] = Array(n).fill(null);
  const raceIdx = setup.raceA ? idxOf(setup.raceA.date) : null;
  if (setup.raceA && (raceIdx! < 0 || raceIdx! >= n)) warnings.push("La gara A è fuori dall'orizzonte del piano: non la considero.");
  const race = raceIdx !== null && raceIdx >= 0 && raceIdx < n ? raceIdx : null;

  let peakFrom: number | null = null;
  let peakTo: number | null = null;
  if (setup.peak) {
    const weeks = Math.min(MAX_PEAK_WEEKS, Math.max(1, setup.peak.weeks));
    if (setup.peak.weeks > MAX_PEAK_WEEKS) warnings.push(`Il picco dura al massimo ${MAX_PEAK_WEEKS} settimane: ho accorciato.`);
    const from = idxOf(setup.peak.start);
    if (from + weeks <= 0 || from >= n) warnings.push("Il periodo di picco è fuori dall'orizzonte del piano: non lo considero.");
    else {
      peakFrom = Math.max(0, from);
      peakTo = Math.min(n - 1, from + weeks - 1);
    }
  } else if (race !== null) {
    // No peak given: three weeks of race-specific work before the two taper weeks.
    peakFrom = Math.max(0, race - 4);
    peakTo = Math.max(peakFrom, race - 2);
  }
  if (peakFrom !== null && peakTo !== null) for (let i = peakFrom; i <= peakTo; i++) phase[i] = "peak";
  if (race !== null) {
    for (let i = Math.max(0, race - 1); i <= race; i++) phase[i] = "taper";
    if (peakTo !== null && peakTo >= race) peakTo = Math.max(0, race - 2);
  }

  // After a window: one recovery week, then maintenance. Before the first window: base and build.
  const goalIdx = phase.map((p, i) => (p ? i : -1)).filter((i) => i >= 0);
  const firstGoal = goalIdx.length ? goalIdx[0] : n;
  const lastGoal = goalIdx.length ? goalIdx[goalIdx.length - 1] : -1;
  const before = firstGoal;
  if (before > 0) {
    const build = before < 4 ? before : Math.min(10, Math.max(4, Math.round(before * 0.4)));
    const base = before - build;
    for (let i = 0; i < before; i++) {
      if (i >= base) phase[i] = i >= before - Math.ceil(build / 2) ? "build_2" : "build_1";
      else {
        const third = Math.max(1, Math.round(base / 3));
        phase[i] = i < third ? "base_1" : i < base - third ? "base_2" : "base_3";
      }
    }
    if (before < 4) for (let i = 0; i < before; i++) phase[i] = "build_1";
  }
  for (let i = lastGoal + 1; i < n && lastGoal >= 0; i++) {
    if (phase[i]) continue;
    const next = goalIdx.find((g) => g > i);
    phase[i] = i === lastGoal + 1 ? "recupero" : next !== undefined && next - i <= 4 ? "build_2" : "mantenimento";
  }
  for (let i = 0; i < n; i++) if (!phase[i]) phase[i] = "mantenimento";

  // ── Weekly TSS from the ramp rate ───────────────────────────────────────────────────────────
  const ramp = RAMP_TARGET[setup.ramp];
  const capacity = setup.maxHours ? setup.maxHours * TSS_PER_HOUR : null;
  const weeks: PlanWeek[] = [];
  let ctl = ctlStart;
  let loadWeeks = 0;
  let lastLoad = weeklyTssForRamp(ctl, 0);
  let anyLimited = false;

  for (let i = 0; i < n; i++) {
    const ph = phase[i]!;
    const end = addDays(starts[i], 6);
    let stopDays = 0;
    let easyDays = 0;
    let loadSum = 0;
    for (let k = 0; k < 7; k++) {
      const d = addDays(starts[i], k);
      const r = restrictionOn(d, allLife);
      if (r?.kind === "rest") stopDays++;
      else if (r) easyDays++;
      loadSum += loadFactor(d, allLife);
    }
    const prevStop = i > 0 ? weeks[i - 1].stopDays >= 5 : false;
    let kind: WeekKind = "carico";
    let tss: number;
    let note: string | null = null;
    let limited = false;

    if (stopDays >= 7) {
      kind = "stop";
      tss = 0;
      note = "Stop: niente allenamento.";
      loadWeeks = 0;
    } else if (race !== null && i === race) {
      kind = "gara";
      tss = lastLoad * 0.5;
      note = `Settimana della gara${setup.raceA?.name ? `: ${setup.raceA.name}` : ""}.`;
    } else if (ph === "taper") {
      kind = "taper";
      tss = lastLoad * 0.65;
      note = "Tapering: volume giù, intensità invariata.";
    } else if (ph === "recupero") {
      kind = "scarico";
      tss = lastLoad * 0.5;
      loadWeeks = 0;
      note = "Scarico dopo il picco.";
    } else if (setup.lightWeeks?.includes(starts[i])) {
      kind = "scarico";
      tss = lastLoad * 0.6;
      loadWeeks = 0;
      note = "Scarico su tua richiesta: poi il carico riprende.";
    } else if (loadWeeks >= 3 || prevStop) {
      kind = "scarico";
      tss = lastLoad * (prevStop ? 0.6 : 0.65);
      loadWeeks = 0;
      note = prevStop ? "Rientro graduale dopo lo stop." : "Settimana leggera: assorbi il carico.";
    } else {
      const factor = ph === "peak" ? 0.5 : ph === "mantenimento" ? 0.3 : 1;
      tss = weeklyTssForRamp(ctl, ramp * factor);
      const oneOff = setup.weekCaps?.find((c) => c.start === starts[i]);
      const cap = oneOff ? Math.min(capacity ?? Infinity, oneOff.hours * TSS_PER_HOUR) : capacity;
      if (cap !== null && tss > cap) {
        tss = cap;
        limited = true;
        if (!oneOff) anyLimited = true;
        note = oneOff ? `Limitata a ${oneOff.hours} h su tua richiesta.` : `Limitata dalle ore: ${setup.maxHours} h a settimana.`;
      }
      lastLoad = tss;
      loadWeeks++;
    }
    if ((stopDays > 0 || easyDays > 0) && stopDays < 7) {
      tss *= loadSum / 7;
      const bits = [stopDays > 0 ? `${stopDays} giorni di stop` : "", easyDays > 0 ? `${easyDays} giorni solo Z1-Z2 (malattia o infortunio)` : ""].filter(Boolean);
      note = `${note ? `${note} ` : ""}${bits.join(", ")}.`;
    }
    tss = Math.round(tss);
    ctl = ctlAfter(ctl, tss);
    weeks.push({
      start: starts[i],
      end,
      phase: ph,
      kind,
      tssTarget: tss,
      ctlEnd: Math.round(ctl * 10) / 10,
      hoursApprox: Math.round((tss / TSS_PER_HOUR) * 10) / 10,
      hardMax: easyDays > 0 ? 0 : kind === "carico" ? PHASE_INFO[ph].hardMax : kind === "stop" || kind === "scarico" ? 0 : Math.min(1, PHASE_INFO[ph].hardMax),
      stopDays,
      easyDays,
      limitedByTime: limited,
      note,
    });
  }

  const peakWeeks = weeks.filter((w) => w.phase === "peak");
  const ctlPeak = peakWeeks.length ? Math.max(...peakWeeks.map((w) => w.ctlEnd)) : null;
  if (anyLimited) warnings.push(`Con ${setup.maxHours} ore a settimana il carico non arriva al tetto di ${String(ramp).replace(".", ",")} punti di CTL a settimana: il CTL previsto è più basso.`);
  if (ctlPeak !== null && ctlPeak - ctlStart < 5) warnings.push("Il CTL previsto nel picco cresce poco rispetto a oggi: serve più tempo, più ore o un ramp rate più alto.");
  return {
    weeks,
    ctlStart,
    ctlEnd: weeks[weeks.length - 1]?.ctlEnd ?? ctlStart,
    ctlPeak,
    peakWindow: peakWeeks.length ? { start: peakWeeks[0].start, end: peakWeeks[peakWeeks.length - 1].end } : null,
    rampTarget: ramp,
    stops: setup.stops,
    warnings,
  };
}

/**
 * The plan as of `today`: it starts from this week and from the CTL measured now, whenever the setup was made, so the
 * weeks already gone never count and a bad stretch moves everything after it. The goals keep the dates the athlete gave.
 */
export function planFromToday(setup: SeasonSetup, today: string, ctl: number | null, life: LifeEvent[] = []): SeasonPlan {
  return planSeason({ ...setup, start: today }, ctl, life);
}

/** The plan week that contains `date`, if it is inside the plan. */
export function weekFor(plan: SeasonPlan | null | undefined, date: string): PlanWeek | null {
  return plan?.weeks.find((w) => date >= w.start && date <= w.end) ?? null;
}
