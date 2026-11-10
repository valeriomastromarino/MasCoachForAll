// Picks the day's workout from the Intervals.icu library (never invents one) with the coach's rules (prompt v8.1-p) and
// the training method approved on 10 November 2026 (docs/motore-allenamenti-proposta-2026-11-10.md).
//
// First the week, then the day: the week's remaining quality sessions (two in a load week, never on consecutive days,
// at least a day apart from each other), the long ride on the athlete's long day and easy days around them are laid out
// from today to Sunday, counting what was already ridden and what is already on the calendar. Then the day's place in
// that layout is filled from the library, with a dose that grows through the season and variety. Readiness and the
// prompt's safety rules decide last: red = Z1 ≤ 45', yellow = Z2 with nothing above Z2, grey = no hard work.
// Pure and deterministic: the same inputs give the same workout, and every choice comes with its reasons.
import { addDays, weekStart } from "@/lib/dates";
import type { LibraryWorkout } from "@/lib/calendar";
import { CLASS_LABEL, CLASS_SAY, type Classified, classifyWorkout, HARD, type WorkoutClass } from "./classify";
import { type LifeEvent, restrictionOn } from "./life";
import { PHASE_INFO, type PhaseInfo, type PlanWeek, type SeasonPlan, weekFor } from "./season";

export { CLASS_LABEL, CLASS_SAY, classifyWorkout, type Classified, type WorkoutClass };

export type Place = "indoor" | "outdoor" | "any";
export type Level = "verde" | "giallo" | "rosso" | "grigio";

/**
 * `hard` and `quality` are set for sessions this engine planned itself (and for workouts already on the calendar);
 * real activities are judged by their intensity factor.
 */
export type RecentActivity = { date: string; name: string; IF: number | null; tss: number | null; movingTime: number; hard?: boolean; quality?: boolean; cls?: WorkoutClass };

export type SuggestProfile = {
  giorni?: number[];
  durataFeriali?: string;
  durataWeekend?: string;
  rischio?: string;
  disciplina?: string;
  digiuno?: string;
  sedutaMin?: string;
  ruliMax?: string;
  lunga?: string;
  /** Where the athlete rides the long Z2 and the hard intervals ("Fuori", "Rulli", "Indifferente"). */
  z2Dove?: string;
  intervalliDove?: string;
  /** Carbohydrates the athlete tolerates now ("Meno di 30", "30-60", "60-90", "Oltre 90", "Non so"). */
  carboTollerati?: string;
};

export type SuggestInput = {
  date: string;
  readiness: Level;
  /** Yesterday's form, as readiness uses it. */
  tsbYesterday: number | null;
  ctl: number | null;
  recent: RecentActivity[];
  library: LibraryWorkout[];
  profile?: SuggestProfile;
  phenotype?: "diesel" | "all_rounder" | "glicolitico" | null;
  place?: Place;
  ftp?: number | null;
  indoorFtp?: number | null;
  /** The season plan: phase, weekly TSS and quality sessions for the week of `date`. */
  season?: SeasonPlan | null;
  /** CTL gained over the last 7 days (the app's ramp rate). */
  rampRate?: number | null;
  /** Holidays, illness and injury from the calendar: they can forbid or limit the day. */
  life?: LifeEvent[];
  /** Workouts already on the Intervals.icu calendar: the week is laid out around them. */
  planned?: { date: string; workout: LibraryWorkout }[];
  /** How the athlete says they feel today: it lowers the readiness by one level (prompt §5.5), never raises it. */
  feeling?: { drop: boolean; note?: string } | null;
  /** Library workouts already offered today: "un altro" never repeats one. */
  exclude?: number[];
  /** What the athlete asked for today only. */
  override?: { maxMins?: number; easier?: boolean; wantClass?: WorkoutClass; restToday?: boolean };
};

const lowerLevel = (l: Level): Level => (l === "verde" ? "giallo" : l === "giallo" ? "rosso" : l === "grigio" ? "giallo" : "rosso");

/** Where the day sits in the week: a quality day (A = VO2max side, B = threshold side, C = the third of a block), the long ride or an easy day. */
export type SlotKind = "A" | "B" | "C" | "long" | "easy";

export type Proposal = {
  workout: LibraryWorkout;
  cls: WorkoutClass;
  label: string;
  mins: number;
  tss: number;
  indoor: boolean;
  reasons: string[];
  /** Carbohydrates to take, g/h (prompt §8.2): an indication, not a recorded value. */
  carbs: string;
  /** Which FTP the percentages apply to. */
  ftpNote: string | null;
  /** Things the athlete should know before taking it (for example a hard session asked on a bad day). */
  warnings: string[];
  /** The day's place in the week. */
  slot?: SlotKind;
};

export type Suggestion = { kind: "rest"; reason: string } | { kind: "workout"; main: Proposal; alternatives: Proposal[] };

/** "45 min", "1,5 h", "Oltre" → minutes. */
export function parseCap(s: string | undefined): number | null {
  if (!s) return null;
  if (/oltre/i.test(s)) return 600;
  const m = s.match(/([\d,.]+)\s*(min|h)/i);
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  return Math.round(/h/i.test(m[2]) ? n * 60 : n);
}

/** 0 = Monday … 6 = Sunday. */
export function weekday(date: string): number {
  return (new Date(`${date}T12:00:00`).getDay() + 6) % 7;
}

const daysBetween = (a: string, b: string) => Math.round((new Date(`${b}T12:00:00`).getTime() - new Date(`${a}T12:00:00`).getTime()) / 86400000);

/** The most carbohydrates the athlete tolerates now, g/h, from the athlete sheet; null when there is no limit to respect ("Oltre 90", "Non so", no answer). */
export function toleratedCarbs(answer: string | undefined | null): number | null {
  if (!answer) return null;
  if (/meno di 30/i.test(answer)) return 30;
  const m = answer.match(/^\s*(\d+)\s*-\s*(\d+)\s*$/);
  return m ? Number(m[2]) : null;
}

/** The g/h range for a session (prompt §8.2): none under an hour, more with duration and intensity. */
function carbRange(c: { mins: number; cls: WorkoutClass }): [number, number] | null {
  if (c.mins < 60) return null;
  if (c.mins > 150) return [60, 90];
  return c.cls === "recupero" || c.cls === "z2" ? [30, 45] : [45, 60];
}

/** Carbohydrates per hour for a session (prompt §8.2), never above what the athlete tolerates (`cap`, g/h). */
export function carbsFor(c: { mins: number; cls: WorkoutClass }, cap: number | null = null): string {
  const r = carbRange(c);
  if (!r) return "0 g/h (solo acqua)";
  const [lo, hi] = r;
  if (cap === null || cap >= hi) return `${lo}-${hi} g/h`;
  return cap <= lo ? `${cap} g/h` : `${lo}-${cap} g/h`;
}

/** Food and drink for a session: carbohydrates (prompt §8.2, capped at what the athlete tolerates), about 0,6 L of water an hour, and a word on what to eat before. An indication, not a recorded value. */
export function fuelFor(c: { mins: number; cls: WorkoutClass }, cap: number | null = null): { carbs: string; water: string; before: string; cappedAt: number | null } {
  const hard = !(c.cls === "recupero" || c.cls === "z2");
  const litres = Math.max(0.5, Math.round((c.mins / 60) * 0.6 * 10) / 10);
  const before = c.mins < 60 ? "niente di particolare" : hard || c.mins > 120 ? "spuntino con carboidrati 1-2 h prima" : "colazione normale, anche a digiuno se ti trovi bene";
  const r = carbRange(c);
  const cappedAt = r && cap !== null && cap < r[1] ? cap : null;
  return { carbs: carbsFor(c, cap), water: `${litres.toString().replace(".", ",")} L`, before, cappedAt };
}

// ── The week ─────────────────────────────────────────────────────────────────────────────────────

/** Without a season plan: two quality sessions, VO2max side and threshold side, and a long ride. */
const FREE: PhaseInfo = {
  label: "",
  focus: "",
  classes: ["recupero", "z2", "tempo", "sweetspot", "soglia", "vo2", "anaerobico", "sprint"],
  qualityMax: 2,
  hardMax: 2,
  slotA: ["vo2", "anaerobico"],
  slotB: ["soglia", "sweetspot"],
  long: { min: 150, max: 210, late: false },
};

const DAY_NAMES = ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"];

const isHard = (a: RecentActivity) => a.hard ?? (a.IF !== null && a.IF >= 0.85 && a.movingTime >= 1200);
const isQuality = (a: RecentActivity) => a.quality ?? (isHard(a) || (a.IF !== null && a.IF >= 0.8 && a.movingTime >= 1800));

type Slot = {
  kind: SlotKind;
  /** Types wanted, best first. */
  classes: WorkoutClass[];
  /** Minutes: the target and the window. */
  target: number;
  min: number;
  max: number;
  place: Place;
  /** 0–1: which part of the library's range of work (minutes in the band) fits this week. */
  dose: number;
  /** Long ride with its work in the last part. */
  late: boolean;
  why: string;
};

type Layout = { slot: Slot | null; rest: string | null; qualityLeft: number; hardLeft: number; qualityDone: number; hardDone: number; weekDone: number };

const placeFrom = (answer: string | undefined): Place => (/rulli/i.test(answer ?? "") ? "indoor" : /fuori/i.test(answer ?? "") ? "outdoor" : "any");

/** The long day of the sheet (Saturday or Sunday), when the athlete rides that day; otherwise the last day they ride. */
function longDayOf(profile: SuggestProfile, rides: (d: number) => boolean): number | null {
  const named = /sabato/i.test(profile.lunga ?? "") ? 5 : /domenica/i.test(profile.lunga ?? "") ? 6 : null;
  if (named !== null && rides(named)) return named;
  for (const d of [6, 5, 4, 3, 2, 1, 0]) if (rides(d)) return d;
  return null;
}

/** Up to `k` quality days among `candidates` (weekday numbers), never adjacent to each other or to a day in `busy`. */
function chooseQualityDays(candidates: number[], k: number, busy: Set<number>, longDay: number | null, block: boolean): number[] {
  const ok = candidates.filter((d) => !busy.has(d - 1) && !busy.has(d + 1));
  for (let size = Math.min(k, ok.length); size > 0; size--) {
    let best: number[] | null = null;
    let bestScore = -Infinity;
    const walk = (start: number, chosen: number[]) => {
      if (chosen.length === size) {
        let s = 0;
        for (const d of chosen) {
          if (longDay !== null && d === longDay - 1) s -= block ? 0.5 : 2;
          if (longDay !== null && d === longDay + 1) s -= 1;
          s -= 0.05 * d;
        }
        for (let i = 1; i < chosen.length; i++) s += Math.min(3, chosen[i] - chosen[i - 1]) * 0.3;
        if (s > bestScore) [best, bestScore] = [[...chosen], s];
        return;
      }
      for (let i = start; i < ok.length; i++) {
        const d = ok[i];
        if (chosen.length && d - chosen[chosen.length - 1] < 2) continue;
        walk(i + 1, [...chosen, d]);
      }
    };
    walk(0, []);
    if (best) return best;
  }
  return [];
}

/** The week from `date` to Sunday, and the place of `date` in it. */
function layoutDay(input: SuggestInput, pw: PlanWeek | null, info: PhaseInfo, date: string): Layout {
  const profile = input.profile ?? {};
  const monday = weekStart(date);
  const today = weekday(date);
  const life = [...(input.life ?? []), ...(input.season?.stops ?? []).map((s, i) => ({ id: `stop${i}`, category: "HOLIDAY" as const, from: s.from, to: s.to }))];
  const dayOf = (d: number) => addDays(monday, d);
  const rides = (d: number) => {
    const iso = dayOf(d);
    if (profile.giorni?.length && !profile.giorni.includes(d)) return false;
    if (restrictionOn(iso, life)?.kind === "rest") return false;
    if (pw?.raceDay === iso) return false;
    return true;
  };
  // What is done (before today) and what is fixed on the calendar (after today).
  const recent = input.recent.filter((a) => a.date.slice(0, 10) >= monday && a.date.slice(0, 10) < date);
  const planned = (input.planned ?? []).filter((p) => p.date > date && p.date <= addDays(monday, 6)).map((p) => ({ date: p.date, c: classifyWorkout(p.workout) }));
  const busyQuality = new Set<number>();
  for (const a of recent) if (isQuality(a)) busyQuality.add(weekday(a.date.slice(0, 10)));
  for (const p of planned) if (p.c.quality) busyQuality.add(weekday(p.date));
  const qualityDone = recent.filter(isQuality).length + planned.filter((p) => p.c.quality).length;
  const hardDone = recent.filter(isHard).length + planned.filter((p) => p.c.hard).length;
  const weekDone = recent.reduce((s, a) => s + (a.tss ?? 0), 0);
  const fixedDays = new Set(planned.map((p) => weekday(p.date)));

  const aggressive = profile.rischio === "Aggressivo";
  const qualityMax = pw ? (pw.kind === "carico" && aggressive && pw.qualityMax >= 2 && !pw.block ? pw.qualityMax + 1 : pw.qualityMax) : aggressive ? 3 : 2;
  const hardMax = pw ? (pw.kind === "carico" && aggressive && pw.hardMax >= 2 && !pw.block ? pw.hardMax + 1 : pw.hardMax) : aggressive ? 3 : 2;
  const qualityLeft = Math.max(0, qualityMax - qualityDone);
  const hardLeft = Math.max(0, hardMax - hardDone);

  const base = { qualityLeft, hardLeft, qualityDone, hardDone, weekDone };
  if (!rides(today)) return { ...base, slot: null, rest: pw?.raceDay === date ? "race" : "off" };

  // The long ride: on the long day, unless already ridden this week or already on the calendar.
  const longMins = Math.max(120, info.long.min * 0.8);
  const longDone = recent.some((a) => a.movingTime >= longMins * 60) || planned.some((p) => p.c.mins >= longMins);
  const noLong = pw?.kind === "gara" || pw?.kind === "stop";
  const longDay = noLong ? null : longDayOf(profile, rides);
  const longToday = longDay === today && !longDone;

  // Quality days from today on.
  const candidates: number[] = [];
  for (let d = today; d <= 6; d++) if (rides(d) && !fixedDays.has(d) && !(longDay !== null && d === longDay && !longDone)) candidates.push(d);
  const qualityDays = chooseQualityDays(candidates, qualityLeft, busyQuality, longDay, !!pw?.block);
  // Which quality sessions are left: A (VO2max side) and B (threshold side). A glycolytic profile does its weak end, B,
  // first in a load week; a light week, the taper and the race week keep the VO2max side.
  const order: SlotKind[] = input.phenotype === "glicolitico" && (!pw || pw.kind === "carico") ? ["B", "A", "C"] : ["A", "B", "C"];
  const usedKinds = order.slice(0, recent.filter(isQuality).length);
  for (const p of planned) {
    if (!p.c.quality) continue;
    const k: SlotKind = info.slotA.includes(p.c.cls) ? "A" : "B";
    const next = usedKinds.includes(k) ? order.find((x) => !usedKinds.includes(x)) : k;
    if (next) usedKinds.push(next);
  }
  const left = order.filter((k) => !usedKinds.includes(k)).slice(0, qualityDays.length);
  const kindOf = new Map(qualityDays.map((d, i) => [d, left[i] ?? "B"]));

  // Minutes: weekday and weekend caps of the sheet, the trainer cap, the shortest session worth riding.
  const weekend = today >= 5;
  const dayCap = parseCap(weekend ? profile.durataWeekend : profile.durataFeriali) ?? (weekend ? 240 : 120);
  const minLen = Math.max(30, parseCap(profile.sedutaMin) ?? 40);
  const trainerCap = parseCap(profile.ruliMax) ?? 75;
  const step = pw?.step ?? 0.5;
  const doseFor = (k: SlotKind) => {
    if (!pw) return 0.5;
    if (pw.kind === "scarico") return 0.1;
    if (pw.kind === "taper") return 0.3;
    if (pw.kind === "gara") return 0.15;
    const d = 0.2 + 0.65 * step;
    return k === "B" && info.bDose !== undefined ? Math.min(d, info.bDose) : d;
  };

  if (kindOf.has(today)) {
    const k = kindOf.get(today)!;
    const classes = k === "A" || k === "C" ? info.slotA : info.slotB;
    const place = input.place && input.place !== "any" ? input.place : placeFrom(profile.intervalliDove);
    const target = Math.min(dayCap, place === "indoor" ? trainerCap : 75);
    const what = k === "A" || k === "C" ? "VO2max" : CLASS_SAY[classes[0] ?? "soglia"];
    const lightWeek = pw?.kind === "scarico" || pw?.kind === "taper" || pw?.kind === "gara";
    return {
      ...base,
      rest: null,
      slot: {
        kind: k,
        classes: classes.length ? classes : ["z2"],
        target,
        min: Math.min(minLen, target),
        max: Math.min(dayCap, place === "indoor" ? trainerCap : dayCap) + 5,
        place,
        dose: doseFor(k),
        late: false,
        why: lightWeek
          ? `${cap(DAY_NAMES[today])}: l'unica seduta di qualità della settimana, corta (meno volume, stessa intensità).`
          : `${cap(DAY_NAMES[today])}: la seduta di ${what} della settimana${k === "C" ? " (la terza del blocco)" : ""}.`,
      },
    };
  }

  // Volume: the long ride and the easy days share what is left of the week's TSS.
  const ahead = { quality: 0, easy: 0 };
  for (let d = today; d <= 6; d++) {
    if (!rides(d) || fixedDays.has(d)) continue;
    if (kindOf.has(d)) ahead.quality++;
    else if (!(longDay === d && !longDone)) ahead.easy++;
  }
  const plannedTss = planned.reduce((s, p) => s + p.c.tss, 0);
  const longRange = pw?.kind === "scarico" ? { min: 90, max: 120 } : info.long;
  const weekendCap = parseCap(profile.durataWeekend) ?? 240;
  let longTarget = Math.round(Math.min(weekendCap, longRange.min + (longRange.max - longRange.min) * step));
  const budget = pw ? pw.tssTarget - weekDone - plannedTss - ahead.quality * 60 - (longDay !== null && longDay >= today && !longDone ? longTarget * 0.8 : 0) : null;

  if (longToday) {
    // A spare budget lengthens the long ride up to the phase's maximum.
    if (budget !== null && budget > ahead.easy * 110) longTarget = Math.round(Math.min(weekendCap, longRange.max, longTarget + (budget - ahead.easy * 110) / 0.8));
    return {
      ...base,
      rest: null,
      slot: {
        kind: "long",
        classes: ["z2"],
        target: longTarget,
        min: Math.max(minLen, Math.round(longTarget * 0.7)),
        max: Math.min(weekendCap, Math.round(longTarget * 1.2)) + 10,
        place: placeFrom(profile.z2Dove),
        dose: step,
        late: info.long.late && pw?.kind === "carico",
        why: info.long.late && pw?.kind === "carico" ? "È la lunga della settimana, con il lavoro nell'ultima parte: allena la tenuta per la gara (durability)." : "È la lunga della settimana, in Z2.",
      },
    };
  }

  // The race week: after the race a short spin, before it short rides only.
  if (pw?.raceDay && date > pw.raceDay) {
    return {
      ...base,
      rest: null,
      slot: { kind: "easy", classes: ["recupero", "z2"], target: 45, min: 30, max: 60, place: "any", dose: 0.5, late: false, why: "Il giorno dopo la gara: solo recupero, se hai voglia di pedalare." },
    };
  }
  // An easy day: what the week still needs, spread over the easy days left, and always shorter than the long ride.
  const perDay = budget !== null && ahead.easy > 0 ? budget / ahead.easy : null;
  const longAhead = longDay !== null && longDay > today && !longDone;
  const easyCap = Math.min(dayCap, longAhead ? Math.round(longTarget * 0.66) : dayCap, pw?.kind === "gara" ? 75 : Infinity);
  const target = Math.round(Math.max(minLen, Math.min(easyCap, perDay !== null ? perDay / 0.72 : weekend ? 120 : 75)));
  const afterQuality = busyQuality.has(today - 1);
  return {
    ...base,
    rest: null,
    slot: {
      kind: "easy",
      classes: afterQuality ? ["z2", "recupero"] : ["z2", "recupero"],
      target,
      min: Math.min(minLen, target),
      max: Math.min(easyCap, Math.round(target * 1.3)) + 5,
      place: "any",
      dose: 0.5,
      late: false,
      why: afterQuality ? "Il giorno dopo una seduta di qualità: facile." : qualityDays.length ? "Giorno facile tra le sedute di qualità." : "Giorno facile: le sedute di qualità della settimana sono già fatte o in calendario.",
    },
  };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ── The day ──────────────────────────────────────────────────────────────────────────────────────

export function suggestWorkout(input: SuggestInput): Suggestion {
  const { date, readiness: readinessIn, profile = {}, phenotype = null } = input;
  const ov = input.override ?? {};
  const readiness = input.feeling?.drop ? lowerLevel(readinessIn) : readinessIn;
  const dow = weekday(date);

  if (profile.giorni && profile.giorni.length > 0 && !profile.giorni.includes(dow)) {
    return { kind: "rest", reason: "Oggi non è tra i giorni in cui puoi allenarti: riposo." };
  }
  const lifeRule = restrictionOn(date, [
    ...(input.life ?? []),
    ...(input.season?.stops ?? []).map((s, i) => ({ id: `stop${i}`, category: "HOLIDAY" as const, from: s.from, to: s.to })),
  ]);
  if (lifeRule?.kind === "rest") return { kind: "rest", reason: lifeRule.reason };
  if (ov.restToday) return { kind: "rest", reason: "Come mi hai detto, oggi non ti alleni: riposo." };
  const pw = weekFor(input.season, date);
  if (pw?.kind === "stop" || input.season?.stops.some((s) => date >= s.from && date <= s.to)) {
    return { kind: "rest", reason: "Sei in un periodo di stop: riposo." };
  }
  if (pw?.raceDay === date) return { kind: "rest", reason: "Oggi c'è la gara A: niente allenamento, solo la gara. Riscaldamento breve con qualche accelerazione, e buona gara." };

  const recent = input.recent.filter((a) => a.date.slice(0, 10) < date && daysBetween(a.date.slice(0, 10), date) <= 14);
  const trainedStreak = (() => {
    let n = 0;
    for (let i = 1; i <= 6; i++) {
      const d = addDays(date, -i);
      if (recent.some((a) => a.date.slice(0, 10) === d && (a.tss ?? 0) >= 20)) n++;
      else break;
    }
    return n;
  })();
  if (trainedStreak >= 5) return { kind: "rest", reason: `Sono ${trainedStreak} giorni di fila in bici: oggi riposo.` };

  const info = pw ? PHASE_INFO[pw.phase] : FREE;
  const layout = layoutDay({ ...input, recent }, pw, info, date);
  if (!layout.slot) return { kind: "rest", reason: layout.rest === "race" ? "Oggi c'è la gara A." : "Oggi non è tra i giorni in cui puoi allenarti: riposo." };
  let slot: Slot = layout.slot;

  const reasons: string[] = [];
  const warnings: string[] = [];
  // A safety net across the week boundary: hard sessions in the six days before today (the same weekday a week ago
  // does not count, so a Tuesday VO2max never blocks the next Tuesday's).
  const hard7 = recent.filter((a) => daysBetween(a.date.slice(0, 10), date) <= 6 && isHard(a)).length;
  const yesterday = recent.filter((a) => a.date.slice(0, 10) === addDays(date, -1));
  const yesterdayQuality = yesterday.some(isQuality);
  const ctl = input.ctl ?? 40;
  const aggressive = profile.rischio === "Aggressivo";
  const hardCap = pw ? (aggressive && pw.hardMax >= 2 ? pw.hardMax + 1 : pw.hardMax) : aggressive ? 3 : 2;
  // Across the week boundary only a real cluster stops a hard day: two (three for an aggressive athlete) in six days.
  const rollCap = Math.max(2, hardCap);
  const weekDone = pw ? input.recent.filter((a) => a.date.slice(0, 10) >= pw.start && a.date.slice(0, 10) < date).reduce((s, a) => s + (a.tss ?? 0), 0) : 0;
  const weekReached = pw !== null && pw.tssTarget > 0 && weekDone >= pw.tssTarget * 1.05;
  const rampHigh = input.season != null && input.rampRate != null && input.rampRate >= input.season.rampTarget + 2;
  const formOk = input.tsbYesterday === null || input.tsbYesterday >= -30;
  const quality = slot.kind === "A" || slot.kind === "B" || slot.kind === "C";

  // Easy versions of a day: the same minutes (a long ride a quarter shorter), nothing above Z2; the reason replaces the slot's.
  let maxZone = 7;
  const whyAt = reasons.push(slot.why) - 1;
  const toEasy = (why: string) => {
    const long = slot.kind === "long";
    // An easy ride goes anywhere: the trainer was only for the intervals.
    slot = { ...slot, kind: long ? "long" : "easy", classes: ["z2", "recupero"], late: false, place: long ? slot.place : "any" };
    if (long) slot = { ...slot, target: Math.round(slot.target * 0.75), max: Math.round(slot.max * 0.8), min: Math.min(slot.min, 60) };
    reasons[whyAt] = why;
  };

  if (readiness === "rosso") {
    slot = { ...slot, kind: "easy", classes: ["recupero"], target: 40, min: 20, max: 45, late: false, place: "any" };
    maxZone = 2;
    reasons.splice(0, reasons.length, "Prontezza rossa: massimo Z1 per 45 minuti, oppure riposo.");
  } else if (readiness === "giallo") {
    maxZone = 2;
    if (quality || slot.late) toEasy("Prontezza gialla: oggi Z2, niente tratti sopra la Z2. La seduta di qualità slitta a un altro giorno.");
    else reasons.push("Prontezza gialla: solo Z2, niente tratti sopra la Z2.");
  } else if (quality) {
    // Hard work needs green readiness, a rested form, no hard day yesterday and room left this week.
    const hardSlot = slot.classes.some((c) => HARD.includes(c));
    if (yesterdayQuality) toEasy("Ieri hai fatto un lavoro di qualità: oggi si smaltisce.");
    else if (weekReached) toEasy("Il carico della settimana è già raggiunto: oggi facile.");
    else if (hardSlot && readiness === "grigio") {
      slot = { ...slot, classes: ["sweetspot", "tempo"] };
      reasons.push("Dati insufficienti sul recupero: nessun lavoro duro, va bene sweet spot o tempo seguendo le sensazioni.");
    } else if (hardSlot && !formOk) {
      slot = { ...slot, classes: ["sweetspot", "tempo"] };
      reasons.push(`Forma di ieri (TSB ${Math.round(input.tsbYesterday!)}) in alto rischio: niente lavoro duro, al massimo sweet spot.`);
    } else if (hardSlot && rampHigh) toEasy(`Il CTL sta salendo di ${input.rampRate!.toFixed(1).replace(".", ",")} a settimana, oltre il tetto di ${String(input.season!.rampTarget).replace(".", ",")}: oggi facile.`);
    else if (hardSlot && (layout.hardLeft === 0 || hard7 >= rollCap)) {
      if (hard7 >= rollCap) toEasy(`Hai già ${hard7} lavori duri negli ultimi 6 giorni: oggi volume facile.`);
      else {
        slot = { ...slot, classes: ["sweetspot", "tempo"] };
        reasons.push("I lavori duri della settimana sono già fatti: la qualità di oggi resta sotto la soglia.");
      }
    }
  } else if (slot.late && (!formOk || readiness === "grigio" || rampHigh)) {
    slot = { ...slot, late: false };
    reasons.push("Oggi la lunga resta tutta in Z2.");
  }

  if (pw) {
    const kind = { carico: "di carico", scarico: "leggera", taper: "di tapering", gara: "della gara", stop: "di stop" }[pw.kind];
    reasons.push(`${info.label}: ${info.focus}. Settimana ${kind}${pw.block ? " (di blocco)" : ""}, TSS di riferimento ${pw.tssTarget} (fatto ${Math.round(weekDone)}).`);
  }
  if (input.feeling?.drop) reasons.unshift(`Hai detto che ${input.feeling.note ?? "non stai bene"}: la prontezza scende di un livello.`);

  // Illness, injury and the athlete's requests for today come last.
  if (lifeRule?.kind === "easy") {
    slot = { ...slot, kind: "easy", classes: ["z2", "recupero"], late: false, place: "any", target: Math.min(slot.target, lifeRule.maxMins ?? 60), max: Math.min(slot.max, lifeRule.maxMins ?? 60), min: Math.min(slot.min, 30) };
    maxZone = 2;
    reasons.unshift(lifeRule.reason);
    if (ov.wantClass && HARD.includes(ov.wantClass)) warnings.push("Ho tenuto Z1-Z2: oggi un lavoro duro non è il caso.");
  } else if (ov.wantClass) {
    slot = { ...slot, classes: [ov.wantClass], late: false };
    maxZone = 7;
    // The engine's own reasons for its pick no longer apply: keep the phase, say what was asked.
    const keep = reasons.filter((r) => /^(Base|Build|Picco|Tapering|Recupero|Mantenimento)[ :\d]/.test(r));
    reasons.length = 0;
    reasons.push(...keep, `Come hai chiesto: ${CLASS_SAY[ov.wantClass]}.`);
    if (pw && !info.classes.includes(ov.wantClass)) warnings.push(`Nella fase ${info.label} il piano non prevede ${CLASS_SAY[ov.wantClass]}.`);
    if (HARD.includes(ov.wantClass)) {
      if (readiness !== "verde") warnings.push(`La prontezza non è verde (${readiness}): è un lavoro duro, lo sconsiglio.`);
      if (yesterdayQuality) warnings.push("Ieri hai già fatto un lavoro di qualità.");
      if (hard7 >= rollCap) warnings.push(`Hai già ${hard7} lavori duri negli ultimi 6 giorni.`);
      if (rampHigh) warnings.push("Il CTL sta già salendo oltre il tetto che hai scelto.");
      if (weekReached) warnings.push("Il carico della settimana è già raggiunto.");
    }
  } else if (ov.easier) {
    slot = { ...slot, classes: ["z2", "recupero"], late: false, place: slot.kind === "long" ? slot.place : "any" };
    maxZone = 2;
    reasons.push("Su tua richiesta: più facile.");
  }
  if (ov.maxMins) {
    slot = { ...slot, target: Math.min(slot.target, ov.maxMins), max: Math.min(slot.max, ov.maxMins + 5), min: Math.min(slot.min, ov.maxMins) };
    reasons.push(`Hai tempo per ${ov.maxMins} minuti.`);
  }
  // When the rules leave nothing in the wanted types, an easy spin beats nothing.
  if (!ov.wantClass && !slot.classes.includes("recupero")) {
    const easyToo: WorkoutClass[] = [...slot.classes, "z2", "recupero"];
    slot = { ...slot, classes: easyToo.filter((c, i, a) => a.indexOf(c) === i) };
  }

  // ── From the library ───────────────────────────────────────────────────────────────────────────
  const place: Place = input.place && input.place !== "any" ? input.place : slot.place;
  const noMtb = profile.disciplina && !/mtb/i.test(profile.disciplina);
  const fastedOk = (c: Classified) => !!profile.digiuno && profile.digiuno !== "Mai" && (!/z1|z2/i.test(profile.digiuno) || c.cls === "z2" || c.cls === "recupero");
  const trainerCap = parseCap(profile.ruliMax);
  const tssCap = slot.kind === "long" ? Math.max(120, 4.5 * ctl) : Math.max(60, 2.2 * ctl + 30);
  const recentNames = new Map(recent.map((a) => [a.name.trim().toLowerCase(), daysBetween(a.date.slice(0, 10), date)]));
  const classified = input.library.map(classifyWorkout).filter((c) => {
    if (c.cls === "test" || c.cls === "gara") return false;
    if (input.exclude?.includes(c.w.id)) return false;
    if (noMtb && c.mtb) return false;
    if (c.fasted && !fastedOk(c)) return false;
    // Structured quality work rides fine on the trainer even when the name does not say "Indoor".
    if (place === "indoor" && !c.indoor && !(c.quality && c.mins <= (trainerCap ?? 60) + 5)) return false;
    if (place === "outdoor" && c.indoor) return false;
    if (c.indoor && trainerCap && c.mins > trainerCap + 5) return false;
    if (c.maxZone > maxZone) return false;
    if (c.tss > tssCap) return false;
    // An easy day is easy: a long Z2 ride with threshold blocks in it is not.
    if (!ov.wantClass && slot.kind === "easy" && c.aboveZ2 > 10) return false;
    return true;
  });
  const fits = (c: Classified, loose: boolean) => (loose ? c.mins <= slot.max + 15 && c.mins >= Math.min(slot.min, 30) : c.mins <= slot.max && c.mins >= slot.min);

  // The dose: the work (minutes in the band) at the slot's share of the library's range for that type.
  const doseOf = new Map<WorkoutClass, number>();
  for (const cls of slot.classes) {
    const works = classified.filter((c) => c.cls === cls && fits(c, true)).map((c) => c.work).sort((a, b) => a - b);
    if (works.length) doseOf.set(cls, works[Math.min(works.length - 1, Math.round(slot.dose * (works.length - 1)))]);
  }
  const shortFirst = !!pw && (pw.phase.startsWith("base") || pw.kind !== "carico");
  const score = (c: Classified, tier: number): number => {
    let s = 100 - 22 * tier;
    s -= Math.abs(c.mins - slot.target) / (slot.kind === "long" ? 6 : 4);
    const want = doseOf.get(c.cls);
    if (want !== undefined && (slot.kind === "A" || slot.kind === "B" || slot.kind === "C")) s -= Math.abs(c.work - want) * 1.2;
    const seen = recentNames.get(c.w.name.trim().toLowerCase());
    if (seen !== undefined) s -= seen <= 7 ? 30 : 12;
    // In the base and in light weeks the VO2max comes as short repeats (30"/15", 40"/20"): high time near VO2max, less cost.
    if ((slot.kind === "A" || slot.kind === "C") && c.cls === "vo2" && shortFirst && c.shortIntervals) s += 6;
    // The long ride: with its work in the last part from the build on, plain Z2 in the base and the taper.
    if (slot.kind === "long") s += slot.late ? (c.lateWork ? 18 : c.aboveZ2 > 0 ? 6 : 0) : -c.aboveZ2 / 2;
    // Easy days and the long ride must also be easy in load: a Z2 ride whose TSS is far above its minutes is not.
    if (slot.kind === "long" || slot.kind === "easy") s -= Math.max(0, c.tss - 1.25 * slot.target * (slot.kind === "long" ? 0.8 : 0.72)) / 3;
    if (c.hard && phenotype === "glicolitico" && c.longestWork >= 10) s += 4;
    if (c.hard && phenotype === "diesel" && c.longestWork <= 5) s += 4;
    if (profile.disciplina && /mtb/i.test(profile.disciplina) && c.mtb) s += 8;
    return s;
  };

  const rank = (loose: boolean) => {
    const out: { c: Classified; s: number }[] = [];
    slot.classes.forEach((cls, tier) => {
      for (const c of classified) if (c.cls === cls && fits(c, loose)) out.push({ c, s: score(c, tier) });
    });
    return out.sort((a, b) => b.s - a.s || a.c.w.name.localeCompare(b.c.w.name, "it"));
  };
  let ranked = rank(false);
  if (!ranked.length) ranked = rank(true);
  if (!ranked.length) {
    return { kind: "rest", reason: `${reasons[0] ?? "Nessun allenamento"} Ma nella libreria non c'è nulla che vada bene per oggi (luogo, durata o tipo): scegli a mano dal calendario.` };
  }

  const build = (c: Classified, why: string[]): Proposal => ({
    workout: c.w,
    cls: c.cls,
    label: CLASS_LABEL[c.cls],
    mins: Math.round(c.mins),
    tss: Math.round(c.tss),
    // Ridden on the trainer when the day asks for it, even if the name does not say "Indoor".
    indoor: c.indoor || place === "indoor",
    reasons: why,
    carbs: carbsFor(c, toleratedCarbs(profile.carboTollerati)),
    warnings,
    slot: slot.kind,
    ftpNote: c.indoor || place === "indoor" ? (input.indoorFtp ? `Percentuali sulla FTP rulli: ${input.indoorFtp} W` : null) : input.ftp ? `Percentuali sulla FTP outdoor: ${input.ftp} W` : null,
  });

  const top = ranked[0];
  const main = build(top.c, [...reasons, `${top.c.w.name}: ${Math.round(top.c.mins)} minuti, TSS ${Math.round(top.c.tss)}.`]);
  // Alternatives: the best of the other types the day allows, then the easiest honest option.
  const alternatives: Proposal[] = [];
  const usedCls = new Set<WorkoutClass>([top.c.cls]);
  for (const r of ranked) {
    if (alternatives.length >= 2) break;
    if (usedCls.has(r.c.cls) || r.c.w.id === top.c.w.id) continue;
    usedCls.add(r.c.cls);
    alternatives.push(build(r.c, [`${r.c.w.name}: ${Math.round(r.c.mins)} minuti, TSS ${Math.round(r.c.tss)}.`]));
  }
  return { kind: "workout", main, alternatives };
}

/** `planned` is what is already on the Intervals.icu calendar that day: it is kept, and counted for the days after it. */
export type WeekDay = { date: string; suggestion: Suggestion | null; planned: LibraryWorkout | null };

/** Seven days from `input.date`: today with the real readiness, the next days assuming green, each one counting what came before. */
export function planWeek(input: SuggestInput, planned: { date: string; workout: LibraryWorkout }[] = []): WeekDay[] {
  const out: WeekDay[] = [];
  // The same workout can arrive from both lists: keep it once.
  const calendar = [...(input.planned ?? []), ...planned].filter((p, i, all) => all.findIndex((q) => q.date === p.date && q.workout.name === p.workout.name) === i);
  let recent = input.recent;
  const count = (date: string, w: LibraryWorkout) => {
    const c = classifyWorkout(w);
    recent = [
      ...recent,
      { date, name: w.name, IF: c.tss > 0 && c.mins > 0 ? Math.sqrt((c.tss * 60) / (c.mins * 100)) : null, tss: c.tss, movingTime: c.mins * 60, hard: c.hard, quality: c.quality, cls: c.cls },
    ];
  };
  for (let i = 0; i < 7; i++) {
    const date = addDays(input.date, i);
    const already = calendar.find((p) => p.date === date);
    if (already) {
      out.push({ date, suggestion: null, planned: already.workout });
      count(date, already.workout);
      continue;
    }
    const s = suggestWorkout({
      ...input,
      date,
      recent,
      planned: calendar,
      readiness: i === 0 ? input.readiness : "verde",
      tsbYesterday: i === 0 ? input.tsbYesterday : null,
      feeling: i === 0 ? input.feeling : null,
      override: i === 0 ? input.override : undefined,
    });
    out.push({ date, suggestion: s, planned: null });
    if (s.kind === "workout") count(date, s.main.workout);
  }
  return out;
}
