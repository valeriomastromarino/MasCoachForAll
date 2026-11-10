// Season planner: from today to 8-9 months ahead, in weeks. It works backwards from the goal windows (a peak period of
// up to 8 weeks, an optional A race with its taper), builds the weeks before them in base and build blocks, and sets each
// week's TSS from the ramp rate the athlete accepts (CTL gained per week), with a lighter week every 4th load week.
// The plan is a map, not a calendar: it is rebuilt from the real CTL, so a week that went badly moves everything after it.
//
// Intensity (proposal of 10 November 2026, docs/motore-allenamenti-proposta-2026-11-10.md): pyramidal all year, two
// quality sessions in every load week of every phase, VO2max never gone for long (it is kept by intensity, not volume);
// the phases move the accent, from short VO2max and long sweet spot in the base to threshold, VO2max and long rides with
// work in their last hour as the goal gets closer.
import { addDays, weekStart } from "@/lib/dates";
import type { WorkoutClass } from "./classify";
import { type LifeEvent, loadFactor, restrictionOn } from "./life";

export type PhaseId = "base_1" | "base_2" | "base_3" | "build_1" | "build_2" | "peak" | "taper" | "recupero" | "mantenimento";

export type PhaseInfo = {
  label: string;
  focus: string;
  /** Types the phase plans; others can still be asked for, with a warning. */
  classes: WorkoutClass[];
  /** Quality sessions (anything above Z2) in a normal load week. */
  qualityMax: number;
  /** Of those, how many may be hard (threshold, VO2max, anaerobic). */
  hardMax: number;
  /** The two quality days: A is the VO2max side, B the threshold side; types in order of preference. */
  slotA: WorkoutClass[];
  slotB: WorkoutClass[];
  /** Highest dose (0–1, share of the library's range) for the B day, when the long ride already carries the specific work. */
  bDose?: number;
  /** The long ride, minutes, and whether it carries work in its last part (durability, from the build on). */
  long: { min: number; max: number; late: boolean };
};

export const PHASE_INFO: Record<PhaseId, PhaseInfo> = {
  base_1: { label: "Base 1", focus: "Fondazione aerobica e VO2max breve a dose bassa", classes: ["recupero", "z2", "tempo", "sweetspot", "vo2", "sprint"], qualityMax: 2, hardMax: 1, slotA: ["vo2"], slotB: ["sweetspot", "tempo"], long: { min: 150, max: 180, late: false } },
  base_2: { label: "Base 2", focus: "Più volume, sweet spot più lungo, VO2max breve", classes: ["recupero", "z2", "tempo", "sweetspot", "vo2", "sprint"], qualityMax: 2, hardMax: 1, slotA: ["vo2"], slotB: ["sweetspot", "tempo"], long: { min: 165, max: 210, late: false } },
  base_3: { label: "Base 3", focus: "Dallo sweet spot alla soglia, VO2max ogni settimana", classes: ["recupero", "z2", "tempo", "sweetspot", "soglia", "vo2", "sprint"], qualityMax: 2, hardMax: 1, slotA: ["vo2"], slotB: ["sweetspot", "soglia"], long: { min: 180, max: 225, late: false } },
  build_1: { label: "Build 1", focus: "Soglia e VO2max, lunghe con lavoro nel finale", classes: ["recupero", "z2", "tempo", "sweetspot", "soglia", "vo2", "sprint"], qualityMax: 2, hardMax: 2, slotA: ["vo2"], slotB: ["soglia", "sweetspot"], long: { min: 180, max: 240, late: true } },
  build_2: { label: "Build 2", focus: "VO2max e soglia, lunghe più lunghe con lavoro nel finale", classes: ["recupero", "z2", "tempo", "sweetspot", "soglia", "vo2", "anaerobico", "sprint"], qualityMax: 2, hardMax: 2, slotA: ["vo2", "anaerobico"], slotB: ["soglia"], long: { min: 210, max: 270, late: true } },
  peak: { label: "Picco", focus: "Specifico per la gara: lunghe con salite a soglia nel finale e sforzi brevi", classes: ["recupero", "z2", "tempo", "sweetspot", "soglia", "vo2", "anaerobico", "sprint"], qualityMax: 2, hardMax: 2, slotA: ["vo2", "anaerobico"], slotB: ["soglia", "sweetspot"], bDose: 0.5, long: { min: 240, max: 300, late: true } },
  taper: { label: "Tapering", focus: "Meno volume, stessa intensità", classes: ["recupero", "z2", "soglia", "vo2", "sprint"], qualityMax: 2, hardMax: 2, slotA: ["vo2"], slotB: ["soglia", "sprint"], long: { min: 120, max: 150, late: false } },
  recupero: { label: "Recupero", focus: "Scarico dopo il picco o la gara", classes: ["recupero", "z2"], qualityMax: 0, hardMax: 0, slotA: [], slotB: [], long: { min: 90, max: 120, late: false } },
  mantenimento: { label: "Mantenimento", focus: "Tieni la forma con una o due sedute di qualità", classes: ["recupero", "z2", "tempo", "sweetspot", "soglia", "vo2", "sprint"], qualityMax: 2, hardMax: 1, slotA: ["vo2"], slotB: ["sweetspot", "soglia", "tempo"], long: { min: 150, max: 210, late: false } },
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
  /** Load weeks (Monday dates) the athlete wants as a block: three quality sessions instead of two, same load. */
  blockWeeks?: string[];
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
  /** Quality sessions (anything above Z2) this week: 2 in a load week, 3 in a block, 1 short one in a light week. */
  qualityMax: number;
  /** Of those, how many may be hard (threshold, VO2max, anaerobic). */
  hardMax: number;
  /** A block week asked by the athlete. */
  block: boolean;
  /** The A race, when it falls in this week. */
  raceDay: string | null;
  /** How far the week is into its part of the season (0 = first load week of the base, 1 = the last): the dose grows with it. */
  step: number;
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

/**
 * The plan from `setup.start` on. `anchor` is the day the season was set up: phases, light-week cadence and the progress
 * of the doses are laid out from there, so they stay on the same weeks while the plan is rebuilt week after week from the
 * real CTL (before, the base started again from "now" at every rebuild and the build kept sliding later).
 */
export function planSeason(setup: SeasonSetup, ctl0: number | null, life: LifeEvent[] = [], anchor?: string): SeasonPlan {
  const allLife: LifeEvent[] = [...life, ...setup.stops.map((s, i) => ({ id: `stop${i}`, category: "HOLIDAY" as const, from: s.from, to: s.to, name: s.label }))];
  const warnings: string[] = [];
  const ctlStart = Math.max(10, ctl0 ?? 30);
  const first = weekStart(setup.start);
  const origin = anchor && weekStart(anchor) < first ? weekStart(anchor) : first;
  const offset = Math.round(daysBetween(origin, first) / 7);
  // Week indexes are counted from the origin of the layout.
  const idxOf = (date: string) => Math.floor(daysBetween(origin, date) / 7);
  // The plan reaches at least to the end of the goals (the peak, or the race) plus the weeks that follow.
  const peakWeeksAsked = setup.peak ? Math.min(MAX_PEAK_WEEKS, Math.max(1, setup.peak.weeks)) : 0;
  const reach = Math.max(setup.peak ? idxOf(setup.peak.start) + peakWeeksAsked + 2 : 0, setup.raceA ? idxOf(setup.raceA.date) + 2 : 0) - offset;
  const n = Math.max(4, Math.min(MAX_HORIZON_WEEKS, Math.max(setup.horizonWeeks, reach)));
  const total = offset + n;
  const starts = Array.from({ length: total }, (_, i) => addDays(origin, 7 * i));

  // ── Goal windows, as week indexes ────────────────────────────────────────────────────────────
  const phase: (PhaseId | null)[] = Array(total).fill(null);
  const raceIdx = setup.raceA ? idxOf(setup.raceA.date) : null;
  if (setup.raceA && (raceIdx! < offset || raceIdx! >= total)) warnings.push("La gara A è fuori dall'orizzonte del piano: non la considero.");
  const race = raceIdx !== null && raceIdx >= offset && raceIdx < total ? raceIdx : null;

  let peakFrom: number | null = null;
  let peakTo: number | null = null;
  if (setup.peak) {
    const weeks = Math.min(MAX_PEAK_WEEKS, Math.max(1, setup.peak.weeks));
    if (setup.peak.weeks > MAX_PEAK_WEEKS) warnings.push(`Il picco dura al massimo ${MAX_PEAK_WEEKS} settimane: ho accorciato.`);
    const from = idxOf(setup.peak.start);
    if (from + weeks <= offset || from >= total) warnings.push("Il periodo di picco è fuori dall'orizzonte del piano: non lo considero.");
    else {
      peakFrom = Math.max(0, from);
      peakTo = Math.min(total - 1, from + weeks - 1);
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
  const firstGoal = goalIdx.length ? goalIdx[0] : total;
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
  for (let i = lastGoal + 1; i < total && lastGoal >= 0; i++) {
    if (phase[i]) continue;
    const next = goalIdx.find((g) => g > i);
    phase[i] = i === lastGoal + 1 ? "recupero" : next !== undefined && next - i <= 4 ? "build_2" : "mantenimento";
  }
  for (let i = 0; i < total; i++) if (!phase[i]) phase[i] = "mantenimento";

  // ── Days off and kinds of week, over the whole layout (so the light weeks keep their place) ──────────
  const days = starts.map((s) => {
    let stopDays = 0;
    let easyDays = 0;
    let loadSum = 0;
    for (let k = 0; k < 7; k++) {
      const d = addDays(s, k);
      const r = restrictionOn(d, allLife);
      if (r?.kind === "rest") stopDays++;
      else if (r) easyDays++;
      loadSum += loadFactor(d, allLife);
    }
    return { stopDays, easyDays, loadSum };
  });
  const kinds: { kind: WeekKind; why: "stop" | "gara" | "taper" | "recupero" | "richiesta" | "rientro" | "ciclo" | null }[] = [];
  let loadWeeks = 0;
  for (let i = 0; i < total; i++) {
    const ph = phase[i]!;
    const prevStop = i > 0 ? days[i - 1].stopDays >= 5 : false;
    if (days[i].stopDays >= 7) {
      kinds.push({ kind: "stop", why: "stop" });
      loadWeeks = 0;
    } else if (race !== null && i === race) kinds.push({ kind: "gara", why: "gara" });
    else if (ph === "taper") kinds.push({ kind: "taper", why: "taper" });
    else if (ph === "recupero") {
      kinds.push({ kind: "scarico", why: "recupero" });
      loadWeeks = 0;
    } else if (setup.lightWeeks?.includes(starts[i])) {
      kinds.push({ kind: "scarico", why: "richiesta" });
      loadWeeks = 0;
    } else if (prevStop || (loadWeeks >= 3 && phase[i + 1] !== "taper")) {
      // No cadence light week right before the taper: the taper is the unloading, three soft weeks would lose fitness.
      kinds.push({ kind: "scarico", why: prevStop ? "rientro" : "ciclo" });
      loadWeeks = 0;
    } else {
      kinds.push({ kind: "carico", why: null });
      loadWeeks++;
    }
  }

  // ── Progress inside each part of the season: the dose of the quality sessions grows with it ──────
  const family = (p: PhaseId) => p.replace(/_\d$/, "");
  const steps: number[] = Array(total).fill(0);
  for (let i = 0; i < total; ) {
    let j = i;
    while (j + 1 < total && family(phase[j + 1]!) === family(phase[i]!)) j++;
    const load = [];
    for (let k = i; k <= j; k++) if (kinds[k].kind === "carico") load.push(k);
    load.forEach((k, x) => (steps[k] = load.length > 1 ? Math.round((x / (load.length - 1)) * 100) / 100 : 0.5));
    for (let k = i; k <= j; k++) if (kinds[k].kind !== "carico") steps[k] = Math.max(0, Math.round(((k > 0 ? steps[k - 1] : 0) - 0.15) * 100) / 100);
    i = j + 1;
  }

  // ── Weekly TSS from the ramp rate, from this week and today's CTL ──────────────────────────────
  const ramp = RAMP_TARGET[setup.ramp];
  const capacity = setup.maxHours ? setup.maxHours * TSS_PER_HOUR : null;
  const weeks: PlanWeek[] = [];
  let ctl = ctlStart;
  let lastLoad = weeklyTssForRamp(ctl, 0);
  let anyLimited = false;

  for (let i = offset; i < total; i++) {
    const ph = phase[i]!;
    const { kind, why } = kinds[i];
    const { stopDays, easyDays, loadSum } = days[i];
    const end = addDays(starts[i], 6);
    let tss: number;
    let note: string | null = null;
    let limited = false;

    if (kind === "stop") {
      tss = 0;
      note = "Stop: niente allenamento.";
    } else if (kind === "gara") {
      tss = lastLoad * 0.5;
      note = `Settimana della gara${setup.raceA?.name ? `: ${setup.raceA.name}` : ""}.`;
    } else if (kind === "taper") {
      tss = lastLoad * 0.65;
      note = "Tapering: volume giù, intensità invariata.";
    } else if (why === "recupero") {
      tss = lastLoad * 0.5;
      note = "Scarico dopo il picco.";
    } else if (why === "richiesta") {
      tss = lastLoad * 0.6;
      note = "Scarico su tua richiesta: poi il carico riprende.";
    } else if (kind === "scarico") {
      tss = lastLoad * (why === "rientro" ? 0.6 : 0.65);
      note = why === "rientro" ? "Rientro graduale dopo lo stop." : "Settimana leggera: assorbi il carico.";
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
    }
    if ((stopDays > 0 || easyDays > 0) && stopDays < 7) {
      tss *= loadSum / 7;
      const bits = [stopDays > 0 ? `${stopDays} giorni di stop` : "", easyDays > 0 ? `${easyDays} giorni solo Z1-Z2 (malattia o infortunio)` : ""].filter(Boolean);
      note = `${note ? `${note} ` : ""}${bits.join(", ")}.`;
    }
    tss = Math.round(tss);
    ctl = ctlAfter(ctl, tss);
    const info = PHASE_INFO[ph];
    const block = kind === "carico" && info.qualityMax > 0 && !!setup.blockWeeks?.includes(starts[i]);
    if (block) note = `${note ? `${note} ` : ""}Settimana di blocco: tre sedute di qualità, stesso carico.`;
    // Quality sessions: none with illness or injury in the week or after the A race; one short one in a light week
    // (less volume, same intensity: the VO2max stays); two in the taper and in the race week, both short.
    let qualityMax: number;
    let hardMax: number;
    if (easyDays > 0 || kind === "stop" || info.qualityMax === 0) [qualityMax, hardMax] = [0, 0];
    else if (kind === "carico") [qualityMax, hardMax] = block ? [3, Math.min(3, info.hardMax + 1)] : [info.qualityMax, info.hardMax];
    else if (kind === "scarico") [qualityMax, hardMax] = [1, 1];
    else if (kind === "taper") [qualityMax, hardMax] = [2, 2];
    else [qualityMax, hardMax] = [2, 1];
    weeks.push({
      start: starts[i],
      end,
      phase: ph,
      kind,
      tssTarget: tss,
      ctlEnd: Math.round(ctl * 10) / 10,
      hoursApprox: Math.round((tss / TSS_PER_HOUR) * 10) / 10,
      qualityMax,
      hardMax,
      block,
      raceDay: kind === "gara" && setup.raceA ? setup.raceA.date : null,
      step: steps[i],
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
 * weeks already gone never count and a bad stretch moves everything after it. The goals keep the dates the athlete gave,
 * and the phases and light weeks stay where the setup put them.
 */
export function planFromToday(setup: SeasonSetup, today: string, ctl: number | null, life: LifeEvent[] = []): SeasonPlan {
  return planSeason({ ...setup, start: today }, ctl, life, setup.start);
}

/**
 * Signs that the load is not being absorbed (prompt §5, Altini): the "stress" pattern, or night anomalies on 2 or more of
 * the last 7 nights. Then the app suggests making the next week a light one; it is a suggestion, the athlete decides.
 */
export function lightWeekAdvice(nights: { date: string; anomaly: boolean }[], pattern: string | null | undefined, today: string): string | null {
  if (pattern === "stress") return "Il sistema nervoso è in «stress»: ti propongo di rendere leggera la prossima settimana.";
  const bad = nights.filter((x) => x.anomaly && x.date > addDays(today, -7) && x.date <= today).length;
  if (bad >= 2) return `${bad} notti anomale negli ultimi 7 giorni: ti propongo di rendere leggera la prossima settimana.`;
  return null;
}

/** The plan week that contains `date`, if it is inside the plan. */
export function weekFor(plan: SeasonPlan | null | undefined, date: string): PlanWeek | null {
  return plan?.weeks.find((w) => date >= w.start && date <= w.end) ?? null;
}
