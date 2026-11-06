// Picks the day's workout from the Intervals.icu library (never invents one) with the coach's rules (prompt v8.0-p):
// readiness first, then the week so far, the days and hours the athlete gave, the place (indoor/outdoor) and the
// power profile. Pure and deterministic: the same inputs give the same workout, and every choice comes with its reasons.
import { addDays } from "@/lib/dates";
import type { LibraryWorkout } from "@/lib/calendar";
import { type LifeEvent, restrictionOn } from "./life";
import { PHASE_INFO, type SeasonPlan, weekFor } from "./season";

export type WorkoutClass = "recupero" | "z2" | "tempo" | "sweetspot" | "soglia" | "vo2" | "anaerobico" | "sprint" | "test" | "gara";

export const CLASS_LABEL: Record<WorkoutClass, string> = {
  recupero: "Recupero",
  z2: "Fondo Z2",
  tempo: "Tempo",
  sweetspot: "Sweet spot",
  soglia: "Soglia",
  vo2: "VO2max",
  anaerobico: "Anaerobico",
  sprint: "Sprint",
  test: "Test",
  gara: "Gara",
};

const HARD: WorkoutClass[] = ["soglia", "vo2", "anaerobico"];

/** The type as a person says it in a sentence. */
export const CLASS_SAY: Record<WorkoutClass, string> = { recupero: "recupero", z2: "fondo Z2", tempo: "tempo", sweetspot: "sweet spot", soglia: "soglia", vo2: "VO2max", anaerobico: "anaerobico", sprint: "sprint", test: "test", gara: "gara" };

export type Classified = {
  w: LibraryWorkout;
  cls: WorkoutClass;
  mins: number;
  tss: number;
  hard: boolean;
  mtb: boolean;
  indoor: boolean;
  fasted: boolean;
  /** Longest single block above Z2, minutes: short for repeats, long for steady work. */
  longestWork: number;
};

const mins = (secs: number) => secs / 60;

/** Several efforts of 30 s or less above 120 % of FTP: neuromuscular work that costs little, unlike repeated anaerobic efforts. */
function isSprintSession(blocks: LibraryWorkout["blocks"], anaerobicMins: number): boolean {
  const efforts = blocks.filter((b) => b.zone >= 6);
  return efforts.length >= 3 && efforts.every((b) => b.secs <= 30) && anaerobicMins < 6;
}

export function classifyWorkout(w: LibraryWorkout): Classified {
  const blocks = w.blocks ?? [];
  const total = w.secs ?? blocks.reduce((s, b) => s + b.secs, 0);
  const z = [0, 0, 0, 0, 0, 0, 0, 0]; // minutes per Coggan zone, index 1–7
  for (const b of blocks) z[b.zone] += mins(b.secs);
  let longest = 0;
  let run = 0;
  for (const b of blocks) {
    if (b.zone >= 3) {
      run += mins(b.secs);
      longest = Math.max(longest, run);
    } else run = 0;
  }
  const name = w.name;
  const sweet = /sweet|\bSS\b/i.test(name);
  let cls: WorkoutClass;
  if (/\b(test|benchmark|tt)\b/i.test(name)) cls = "test";
  else if (/\b(race|taper|openers?)\b/i.test(name) && !/threshold|vo2|sweet|tempo|\bSS\b/i.test(name)) cls = "gara";
  else if (isSprintSession(blocks, z[6] + z[7])) cls = "sprint";
  else if (z[6] + z[7] >= 2) cls = "anaerobico";
  else if (z[5] >= 5) cls = "vo2";
  else if (z[3] + z[4] >= 15 && sweet) cls = "sweetspot";
  else if (z[4] >= 10) cls = "soglia";
  else if (z[3] + z[4] >= 15) cls = "tempo";
  else if (z[2] + z[1] >= mins(total) * 0.5 && mins(total) >= 40 && z[2] >= 15) cls = "z2";
  else cls = "recupero";
  return {
    w,
    cls,
    mins: mins(total),
    tss: w.tss ?? 0,
    hard: HARD.includes(cls),
    mtb: /\b(mtb|xc)\b/i.test(name),
    indoor: /indoor/i.test(name),
    fasted: /fasted/i.test(name),
    longestWork: longest,
  };
}

export type Place = "indoor" | "outdoor" | "any";
export type Level = "verde" | "giallo" | "rosso" | "grigio";

/** `hard` is set for sessions this engine planned itself; real activities are judged by their intensity factor. */
export type RecentActivity = { date: string; name: string; IF: number | null; tss: number | null; movingTime: number; hard?: boolean };

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
  /** The season plan: phase, weekly TSS and hard-session limit for the week of `date`. */
  season?: SeasonPlan | null;
  /** CTL gained over the last 7 days (the app's ramp rate). */
  rampRate?: number | null;
  /** Holidays, illness and injury from the calendar: they can forbid or limit the day. */
  life?: LifeEvent[];
  /** How the athlete says they feel today: it lowers the readiness by one level (prompt §5.5), never raises it. */
  feeling?: { drop: boolean; note?: string } | null;
  /** Library workouts already offered today: "un altro" never repeats one. */
  exclude?: number[];
  /** What the athlete asked for today only. */
  override?: { maxMins?: number; easier?: boolean; wantClass?: WorkoutClass; restToday?: boolean };
};

const lowerLevel = (l: Level): Level => (l === "verde" ? "giallo" : l === "giallo" ? "rosso" : l === "grigio" ? "giallo" : "rosso");

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

/** Carbohydrates per hour for a session (prompt §8.2): none under an hour, more with duration and intensity. */
export function carbsFor(c: { mins: number; cls: WorkoutClass }): string {
  if (c.mins < 60) return "0 g/h (solo acqua)";
  if (c.mins > 150) return "60-90 g/h";
  return c.cls === "recupero" || c.cls === "z2" ? "30-45 g/h" : "45-60 g/h";
}

/** Food and drink for a session: carbohydrates (prompt §8.2), about 0,6 L of water an hour, and a word on what to eat before. An indication, not a recorded value. */
export function fuelFor(c: { mins: number; cls: WorkoutClass }): { carbs: string; water: string; before: string } {
  const hard = !(c.cls === "recupero" || c.cls === "z2");
  const litres = Math.max(0.5, Math.round((c.mins / 60) * 0.6 * 10) / 10);
  const before = c.mins < 60 ? "niente di particolare" : hard || c.mins > 120 ? "spuntino con carboidrati 1-2 h prima" : "colazione normale, anche a digiuno se ti trovi bene";
  return { carbs: carbsFor(c), water: `${litres.toString().replace(".", ",")} L`, before };
}

function hardOrder(p: SuggestInput["phenotype"]): WorkoutClass[][] {
  // The weak end first: a glycolytic profile gains most from threshold and aerobic work, a diesel one from VO2 and bursts.
  if (p === "glicolitico") return [["soglia", "sweetspot"], ["vo2", "anaerobico"]];
  if (p === "diesel") return [["vo2", "anaerobico"], ["soglia", "sweetspot"]];
  return [["soglia", "vo2"], ["sweetspot", "vo2"]];
}

const isHardDay = (a: RecentActivity) => a.hard ?? (a.IF !== null && a.IF >= 0.85 && a.movingTime >= 1200);

export function suggestWorkout(input: SuggestInput): Suggestion {
  const { date, readiness: readinessIn, profile = {}, phenotype = null } = input;
  const place = input.place ?? "any";
  const ov = input.override ?? {};
  const readiness = input.feeling?.drop ? lowerLevel(readinessIn) : readinessIn;
  const dow = weekday(date);
  const weekend = dow >= 5;

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

  const recent = input.recent.filter((a) => a.date.slice(0, 10) < date && daysBetween(a.date.slice(0, 10), date) <= 14);
  const week = recent.filter((a) => daysBetween(a.date.slice(0, 10), date) <= 7);
  const weekHard = week.filter(isHardDay).length;
  const lastHard = recent.filter(isHardDay).map((a) => daysBetween(a.date.slice(0, 10), date));
  const daysSinceHard = lastHard.length ? Math.min(...lastHard) : null;
  const weekTss = week.reduce((s, a) => s + (a.tss ?? 0), 0);
  const ctl = input.ctl ?? 40;
  const trainedStreak = (() => {
    let n = 0;
    for (let i = 1; i <= 6; i++) {
      const d = addDays(date, -i);
      if (recent.some((a) => a.date.slice(0, 10) === d && (a.tss ?? 0) >= 20)) n++;
      else break;
    }
    return n;
  })();

  const aggressive = profile.rischio === "Aggressivo";
  const maxHard = pw ? Math.min(aggressive ? 3 : 2, pw.hardMax + (aggressive && pw.hardMax >= 2 ? 1 : 0)) : aggressive ? 3 : 2;
  // Season: what is left of the week's TSS, spread over the days still available.
  const weekDone = pw ? input.recent.filter((a) => a.date.slice(0, 10) >= pw.start && a.date.slice(0, 10) < date).reduce((s, a) => s + (a.tss ?? 0), 0) : 0;
  let dayTarget: number | null = null;
  if (pw) {
    let left = 0;
    for (let d = date; d <= pw.end; d = addDays(d, 1)) if (!profile.giorni?.length || profile.giorni.includes(weekday(d))) left++;
    dayTarget = Math.max(15, (pw.tssTarget - weekDone) / Math.max(1, left));
  }
  const weekReached = pw !== null && pw.tssTarget > 0 && weekDone >= pw.tssTarget * 1.05;
  const rampHigh = input.season != null && input.rampRate != null && input.rampRate >= input.season.rampTarget + 2;
  const reasons: string[] = [];
  let want: WorkoutClass[][];
  let capMins = parseCap(weekend ? profile.durataWeekend : profile.durataFeriali) ?? (weekend ? 240 : 120);
  let targetMins = weekend ? 150 : 75;
  let longDay = false;

  if (readiness === "rosso") {
    want = [["recupero"]];
    capMins = Math.min(capMins, 45);
    targetMins = 40;
    reasons.push("Prontezza rossa: massimo Z1 per 45 minuti, oppure riposo.");
  } else if (readiness === "giallo") {
    want = [["z2"], ["recupero"]];
    reasons.push("Prontezza gialla: oggi Z2, niente lavoro duro.");
  } else if (trainedStreak >= 5) {
    return { kind: "rest", reason: `Sono ${trainedStreak} giorni di fila in bici: oggi riposo.` };
  } else {
    const formOk = input.tsbYesterday === null || input.tsbYesterday >= -30;
    const hardOk = readiness === "verde" && formOk && daysSinceHard !== 1 && weekHard < maxHard && !rampHigh && !weekReached;
    if (hardOk) {
      const tier = hardOrder(phenotype)[Math.min(weekHard, 1)];
      want = [tier, ["sweetspot"], ["z2"]];
      reasons.push(weekHard === 0 ? "Prontezza verde e nessun lavoro duro negli ultimi 7 giorni: è il momento di un lavoro di qualità." : `Prontezza verde, ${weekHard} lavoro duro negli ultimi 7 giorni: ne entra un secondo, di tipo diverso.`);
    } else {
      longDay = weekend && daysSinceHard !== 1;
      if (readiness === "grigio") reasons.push("Dati insufficienti sul recupero: nessun lavoro duro.");
      else if (!formOk) reasons.push(`Forma di ieri (TSB ${Math.round(input.tsbYesterday!)}) in alto rischio: niente lavoro duro.`);
      else if (rampHigh) reasons.push(`Il CTL sta salendo di ${input.rampRate!.toFixed(1).replace(".", ",")} a settimana, oltre il tetto di ${String(input.season!.rampTarget).replace(".", ",")}: oggi facile.`);
      else if (weekReached) reasons.push("Il carico della settimana è già raggiunto: oggi facile.");
      else if (daysSinceHard === 1) reasons.push("Ieri hai fatto un lavoro duro: oggi si smaltisce.");
      else if (maxHard === 0) reasons.push("In questa fase della stagione non ci sono lavori duri: oggi volume facile.");
      else reasons.push(`Hai già ${weekHard} lavori duri negli ultimi 7 giorni: oggi volume facile.`);
      const lowWeek = weekTss < ctl * 7 * 0.9;
      want = longDay ? [["z2"], ["tempo", "sweetspot"]] : daysSinceHard === 1 ? [["z2"], ["recupero"]] : lowWeek ? [["tempo", "sweetspot"], ["z2"], ["sprint"]] : [["z2"], ["tempo"], ["sprint"]];
      if (longDay) {
        targetMins = 150;
        reasons.push("È il giorno lungo: fondo in Z2.");
      }
    }
  }

  if (pw) {
    const info = PHASE_INFO[pw.phase];
    const filtered = want.map((t) => t.filter((c) => info.classes.includes(c))).filter((t) => t.length > 0);
    want = filtered.length ? filtered : [["z2"], ["recupero"]];
    const kind = { carico: "di carico", scarico: "leggera", taper: "di tapering", gara: "della gara", stop: "di stop" }[pw.kind];
    reasons.push(`${info.label}: ${info.focus}. Settimana ${kind}, TSS di riferimento ${pw.tssTarget} (fatto ${Math.round(weekDone)}).`);
  }

  const warnings: string[] = [];
  if (input.feeling?.drop) reasons.unshift(`Hai detto che ${input.feeling.note ?? "non stai bene"}: la prontezza scende di un livello.`);
  if (lifeRule?.kind === "easy") {
    want = [["z2"], ["recupero"]];
    capMins = Math.min(capMins, lifeRule.maxMins ?? 60);
    targetMins = Math.min(targetMins, lifeRule.maxMins ?? 60);
    reasons.unshift(lifeRule.reason);
    if (ov.wantClass && HARD.includes(ov.wantClass)) warnings.push("Ho tenuto Z1-Z2: oggi un lavoro duro non è il caso.");
  } else if (ov.wantClass) {
    want = [[ov.wantClass]];
    // The engine's own reasons for its pick no longer apply: keep the phase, say what was asked.
    const keep = reasons.filter((r) => /^(Base|Build|Picco|Tapering|Recupero|Mantenimento)[ :\d]/.test(r));
    reasons.length = 0;
    reasons.push(...keep, `Come hai chiesto: ${CLASS_SAY[ov.wantClass]}.`);
    if (pw && !PHASE_INFO[pw.phase].classes.includes(ov.wantClass)) warnings.push(`Nella fase ${PHASE_INFO[pw.phase].label} il piano non prevede ${CLASS_SAY[ov.wantClass]}.`);
    if (HARD.includes(ov.wantClass)) {
      if (readiness !== "verde") warnings.push(`La prontezza non è verde (${readiness}): è un lavoro duro, lo sconsiglio.`);
      if (daysSinceHard === 1) warnings.push("Ieri hai già fatto un lavoro duro.");
      if (weekHard >= maxHard && maxHard > 0) warnings.push(`Hai già ${weekHard} lavori duri negli ultimi 7 giorni.`);
      if (rampHigh) warnings.push("Il CTL sta già salendo oltre il tetto che hai scelto.");
      if (weekReached) warnings.push("Il carico della settimana è già raggiunto.");
    }
  } else if (ov.easier) {
    want = [["z2"], ["recupero"]];
    reasons.push("Su tua richiesta: più facile.");
  }
  if (ov.maxMins) {
    capMins = Math.min(capMins, ov.maxMins);
    targetMins = Math.min(targetMins, ov.maxMins);
    reasons.push(`Hai tempo per ${ov.maxMins} minuti.`);
  }

  // When time or rules leave nothing in the wanted types, an easy spin beats nothing.
  if (!ov.wantClass && !want.some((t) => t.includes("recupero"))) want = [...want, ["recupero"]];

  const noMtb = profile.disciplina && !/mtb/i.test(profile.disciplina);
  const minLen = parseCap(profile.sedutaMin) ?? 0;
  const tssCap = Math.max(60, 2.2 * ctl + 30);
  const recentNames = new Map(recent.map((a) => [a.name.trim().toLowerCase(), daysBetween(a.date.slice(0, 10), date)]));
  const classified = input.library.map(classifyWorkout).filter((c) => {
    if (c.cls === "test" || c.cls === "gara") return false;
    if (input.exclude?.includes(c.w.id)) return false;
    if (noMtb && c.mtb) return false;
    if (c.fasted && (!profile.digiuno || profile.digiuno === "Mai")) return false;
    if (place === "indoor" && !c.indoor) return false;
    if (place === "outdoor" && c.indoor) return false;
    if (c.mins > capMins + 5 || c.mins < Math.min(minLen, capMins)) return false;
    if (c.indoor && profile.ruliMax) {
      const r = parseCap(profile.ruliMax);
      if (r && c.mins > r + 5) return false;
    }
    if (c.tss > tssCap) return false;
    return true;
  });

  const score = (c: Classified, tier: number): number => {
    let s = 100 - 25 * tier;
    s -= Math.abs(c.mins - targetMins) / (dayTarget !== null ? 8 : 4);
    if (dayTarget !== null) s -= Math.abs(c.tss - dayTarget) / 5;
    const seen = recentNames.get(c.w.name.trim().toLowerCase());
    if (seen !== undefined) s -= seen <= 7 ? 30 : 12;
    if (c.hard && phenotype === "glicolitico" && c.longestWork <= 9) s += 6;
    if (c.hard && phenotype === "diesel" && c.longestWork >= 10) s += 6;
    if (profile.disciplina && /mtb/i.test(profile.disciplina) && c.mtb) s += 8;
    return s;
  };

  const build = (c: Classified, why: string[]): Proposal => ({
    workout: c.w,
    cls: c.cls,
    label: CLASS_LABEL[c.cls],
    mins: Math.round(c.mins),
    tss: Math.round(c.tss),
    indoor: c.indoor,
    reasons: why,
    carbs: carbsFor(c),
    warnings,
    ftpNote: c.indoor ? (input.indoorFtp ? `Percentuali sulla FTP rulli: ${input.indoorFtp} W` : null) : input.ftp ? `Percentuali sulla FTP outdoor: ${input.ftp} W` : null,
  });

  const ranked: { c: Classified; s: number }[] = [];
  want.forEach((tier, ti) => {
    for (const c of classified) if (tier.includes(c.cls)) ranked.push({ c, s: score(c, ti) });
  });
  ranked.sort((a, b) => b.s - a.s || a.c.w.name.localeCompare(b.c.w.name, "it"));
  if (ranked.length === 0) {
    return { kind: "rest", reason: `${reasons[0] ?? "Nessun allenamento"}, ma nella libreria non c'è nulla che vada bene per oggi (luogo, durata o disciplina): scegli a mano dal calendario.` };
  }

  const top = ranked[0];
  const main = build(top.c, [...reasons, `${top.c.w.name}: ${Math.round(top.c.mins)} minuti, TSS ${Math.round(top.c.tss)}.`]);
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
  let recent = input.recent;
  const count = (date: string, w: LibraryWorkout) => {
    const c = classifyWorkout(w);
    recent = [
      ...recent,
      { date, name: w.name, IF: c.tss > 0 && c.mins > 0 ? Math.sqrt((c.tss * 60) / (c.mins * 100)) : null, tss: c.tss, movingTime: c.mins * 60, hard: c.hard },
    ];
  };
  for (let i = 0; i < 7; i++) {
    const date = addDays(input.date, i);
    const already = planned.find((p) => p.date === date);
    if (already) {
      out.push({ date, suggestion: null, planned: already.workout });
      count(date, already.workout);
      continue;
    }
    const s = suggestWorkout({ ...input, date, recent, readiness: i === 0 ? input.readiness : "verde", tsbYesterday: i === 0 ? input.tsbYesterday : null, feeling: i === 0 ? input.feeling : null, override: i === 0 ? input.override : undefined });
    out.push({ date, suggestion: s, planned: null });
    if (s.kind === "workout") count(date, s.main.workout);
  }
  return out;
}
