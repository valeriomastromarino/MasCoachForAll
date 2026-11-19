// From what the athlete asked (parse.ts) to the session to ride: the method's defaults where the words say nothing
// (warm-up with activation before hard work, recoveries by type of work, cool-down), the ride around the work when a
// total time is given, the dose by season phase for a session asked by type only, and the changes to a session already
// on the calendar (sprints spread in its Z2, a block of work in the middle). Every default it takes is listed in
// `assumptions`, so the chat can say it.
import type { WorkoutClass } from "@/lib/training/classify";
import type { PhaseId } from "@/lib/training/season";
import { BAND, estimateTss, mergeSteps, mid, type Section, type Step, type Target, totalSecs } from "./model";
import { type BandName, bandOf, classOfBand, type Intensity, type SetSpec, type Spec } from "./parse";

export type ComposeOptions = {
  /** The FTP the session is ridden on (the trainer one indoors). */
  ftp: number | null;
  phase?: PhaseId | null;
  /** How far the week is into its part of the season, 0–1 (the plan's dose). */
  step?: number | null;
  /** The last session of the same type, for the reply ("Ultima soglia: …"). */
  last?: { name: string; date: string } | null;
};

export type Composed = {
  name: string;
  sections: Section[];
  secs: number;
  tss: number;
  cls: WorkoutClass;
  assumptions: string[];
  /** One line on how the dose was chosen (sessions asked by type only). */
  dose: string | null;
};

const BAND_LABEL: Record<BandName, string> = { z1: "Recupero", z2: "Z2", tempo: "Tempo", sweetspot: "Sweet spot", soglia: "Soglia", vo2: "VO2max", anaerobico: "Anaerobico", sprint: "Sprint" };
const HARD_BANDS: BandName[] = ["soglia", "vo2", "anaerobico", "sprint"];
const EASY_REC: Target = { lo: 0.55, hi: 0.55 };

export function targetOf(i: Intensity, ftp: number | null): Target {
  if (i.kind === "band") return BAND[i.band];
  if (i.kind === "pct") return { lo: i.lo, hi: i.hi };
  const f = ftp ?? 250;
  return { lo: Math.round((i.lo / f) * 100) / 100, hi: Math.round((i.hi / f) * 100) / 100 };
}

/** 750 → 12'30", 600 → 10', 30 → 30". */
export function durLabel(secs: number): string {
  if (secs < 60) return `${secs}"`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return s ? `${m}'${String(s).padStart(2, "0")}"` : `${m}'`;
}
const totalLabel = (mins: number) => (mins < 90 ? `${mins}'` : `${Math.floor(mins / 60)}h${mins % 60 ? String(mins % 60).padStart(2, "0") : ""}`);

/** An all-out effort: 200 % up to 15", 150 % beyond (as the library writes them); an intensity said is kept. */
function effortTarget(s: SetSpec, ftp: number | null): Target {
  if (s.work && !(s.work.kind === "band" && s.work.band === "sprint")) return targetOf(s.work, ftp);
  return s.workSecs > 15 ? { lo: 1.5, hi: 1.5 } : BAND.sprint;
}

/** What a set is made of when the words don't say it: by the length of the effort. */
function workBand(set: SetSpec, ftp: number | null): { band: BandName; said: boolean } {
  const b = bandOf(set.work, ftp);
  if (b) return { band: b, said: true };
  const s = set.workSecs;
  if (set.recSecs !== null && s <= 60 && s >= 15) return { band: "vo2", said: false };
  if (s <= 30) return { band: "sprint", said: false };
  if (s <= 120) return { band: "anaerobico", said: false };
  if (s <= 360) return { band: "vo2", said: false };
  if (s <= 720) return { band: "soglia", said: false };
  return { band: "sweetspot", said: false };
}

/** The method's recovery between repeats, by the kind of work. */
function defaultRec(band: BandName, workSecs: number): number {
  switch (band) {
    case "sprint":
      return Math.max(120, 300 - workSecs);
    case "anaerobico":
      return Math.min(300, Math.max(180, workSecs * 3));
    case "vo2":
      return Math.min(300, Math.max(120, workSecs));
    case "soglia":
      return Math.min(360, Math.max(180, Math.round(workSecs / 2 / 60) * 60));
    case "sweetspot":
      return Math.min(360, Math.max(180, Math.round(workSecs / 3 / 60) * 60));
    default:
      return 300;
  }
}

function warmup(mins: number | null, hard: boolean): { steps: Step[]; mins: number } {
  if (mins === 0) return { steps: [], mins: 0 };
  const total = mins ?? (hard ? 15 : 12);
  if (hard && total >= 12) {
    // Warm-up with an activation: the hard work starts on legs already opened.
    return { steps: [{ secs: (total - 5) * 60, target: { lo: 0.5, hi: 0.75 }, ramp: true }, { secs: 180, target: { lo: 0.88, hi: 0.88 } }, { secs: 120, target: EASY_REC }], mins: total };
  }
  return { steps: [{ secs: total * 60, target: { lo: 0.5, hi: 0.75 }, ramp: true }], mins: total };
}

function cooldown(mins: number | null, long: boolean): { steps: Step[]; mins: number } {
  if (mins === 0) return { steps: [], mins: 0 };
  const total = mins ?? (long ? 10 : 8);
  return { steps: [{ secs: total * 60, target: { lo: 0.6, hi: 0.45 }, ramp: true }], mins: total };
}

/** The sections of one set of work, with its title, its recoveries and, for "2 serie", the rest between the series. */
function setSections(set: SetSpec, ftp: number | null, assumptions: string[]): { sections: Section[]; band: BandName; label: string } {
  const { band, said } = workBand(set, ftp);
  // All-out: 200 % for a sprint of 15" or less, 150 % for a longer one (as the library writes them).
  const work = band === "sprint" && set.workSecs > 15 && (!set.work || set.work.kind === "band") ? { lo: 1.5, hi: 1.5 } : targetOf(set.work ?? { kind: "band", band }, ftp);
  const reps = Math.max(1, set.reps || (set.recSecs !== null && set.workSecs <= 60 ? 10 : 1));
  if (!set.reps) assumptions.push(`Ripetute non indicate: ne metto ${reps}.`);
  if (!said) assumptions.push(`Intensità non indicata: ${BAND_LABEL[band].toLowerCase()} (${Math.round(work.lo * 100)}-${Math.round(work.hi * 100)}% FTP).`);
  if (set.guessedUnit) assumptions.push(`«${set.reps}x${set.workSecs >= 60 ? set.workSecs / 60 : set.workSecs}» letto come ${durLabel(set.workSecs)}.`);
  const recSecs = reps > 1 ? (set.recSecs ?? defaultRec(band, set.workSecs)) : 0;
  if (reps > 1 && set.recSecs === null) assumptions.push(`Recupero non indicato: ${durLabel(recSecs)} facile, come vuole il metodo per ${BAND_LABEL[band].toLowerCase()}.`);
  const rec = set.rec ? targetOf(set.rec, ftp) : set.recSecs !== null && set.workSecs <= 60 && band !== "sprint" ? { lo: 0.5, hi: 0.5 } : EASY_REC;
  const steps: Step[] = [{ secs: set.workSecs, target: work, ...(set.rpm ? { rpm: set.rpm } : {}) }];
  if (recSecs) steps.push({ secs: recSecs, target: rec });
  const label = set.recSecs !== null && set.workSecs <= 60 && reps > 1 ? `${reps}×${set.workSecs}/${recSecs}` : reps > 1 ? `${reps}×${durLabel(set.workSecs)}` : durLabel(set.workSecs);
  const title = BAND_LABEL[band];
  const sections: Section[] = [];
  const series = Math.max(1, set.series);
  const rest = set.seriesRestSecs ?? 360;
  if (series > 1 && set.seriesRestSecs === null) assumptions.push(`Tra le serie ${durLabel(rest)} facili.`);
  for (let s = 0; s < series; s++) {
    if (s) sections.push({ title: "Recupero tra le serie", reps: 1, steps: [{ secs: rest, target: EASY_REC }] });
    sections.push({ title, reps, steps });
  }
  return { sections, band, label: `${series > 1 ? `${series} serie ${label}` : label}` };
}

const flatOf = (sections: Section[]) => sections.reduce((a, s) => a + s.reps * s.steps.reduce((b, x) => b + x.secs, 0), 0);

/**
 * Short efforts spread evenly in the easy riding of the ridden-once sections (repeats are left as they are), each one
 * in place of the same seconds of easy riding, away from the first `skipStart` and the last `skipEnd` seconds.
 */
function spreadInto(sections: Section[], efforts: { secs: number; target: Target }[], skipStart: number, skipEnd: number): { sections: Section[]; gap: number; placed: number } {
  const easy = (st: Step) => !st.ramp && mid(st.target) < 0.76;
  const total = totalSecs(sections);
  const spans: [number, number][] = [];
  let t = 0;
  for (const sec of sections) {
    for (let r = 0; r < sec.reps; r++)
      for (const st of sec.steps) {
        if (sec.reps === 1 && easy(st)) {
          const a = Math.max(t, skipStart);
          const b = Math.min(t + st.secs, total - skipEnd);
          if (b - a >= 30) spans.push([a, b]);
        }
        t += st.secs;
      }
  }
  const room = spans.reduce((x, [a, b]) => x + (b - a), 0);
  if (!room || !efforts.length) return { sections, gap: 0, placed: 0 };
  const gap = room / efforts.length;
  // Each effort in the middle of its share of the easy time.
  const at = efforts.map((_, i) => {
    let left = gap * (i + 0.5);
    for (const [a, b] of spans) {
      if (left <= b - a) return Math.round(a + left);
      left -= b - a;
    }
    return Math.round(spans[spans.length - 1][1] - 1);
  });
  let k = 0;
  t = 0;
  const out = sections.map((sec): Section => {
    if (sec.reps > 1) {
      t += sec.reps * sec.steps.reduce((x, st) => x + st.secs, 0);
      return sec;
    }
    const steps: Step[] = [];
    for (const st of sec.steps) {
      let cur = t;
      const end = t + st.secs;
      while (k < at.length && easy(st) && at[k] >= cur && at[k] < end) {
        const len = Math.min(efforts[k].secs, end - at[k]);
        steps.push({ ...st, secs: at[k] - cur }, { secs: len, target: efforts[k].target });
        cur = at[k] + len;
        k++;
      }
      steps.push({ ...st, secs: end - cur });
      t = end;
    }
    return { ...sec, steps: mergeSteps(steps) };
  });
  return { sections: out, gap, placed: k };
}

// ── Sessions asked by type only: the dose by season phase ──────────────────────────────────────────────────────────

type Rung = { reps: number; work: number; rec: number };
const m = (x: number) => x * 60;
/** Each type from the lightest dose to the heaviest (minutes of work grow, then the repeats get longer). */
const LADDER: Partial<Record<WorkoutClass, Rung[]>> = {
  sweetspot: [{ reps: 3, work: m(10), rec: m(5) }, { reps: 3, work: m(12), rec: m(5) }, { reps: 3, work: m(15), rec: m(5) }, { reps: 2, work: m(20), rec: m(5) }, { reps: 3, work: m(20), rec: m(5) }, { reps: 2, work: m(30), rec: m(8) }],
  soglia: [{ reps: 4, work: m(6), rec: m(3) }, { reps: 3, work: m(8), rec: m(4) }, { reps: 3, work: m(10), rec: m(5) }, { reps: 4, work: m(10), rec: m(5) }, { reps: 3, work: m(12), rec: m(5) }, { reps: 2, work: m(20), rec: m(8) }],
  vo2: [{ reps: 5, work: m(3), rec: m(3) }, { reps: 4, work: m(4), rec: m(4) }, { reps: 5, work: m(4), rec: m(4) }, { reps: 6, work: m(4), rec: m(4) }, { reps: 5, work: m(5), rec: m(5) }],
  tempo: [{ reps: 2, work: m(15), rec: m(5) }, { reps: 3, work: m(15), rec: m(5) }, { reps: 2, work: m(20), rec: m(5) }, { reps: 3, work: m(20), rec: m(5) }, { reps: 2, work: m(30), rec: m(8) }],
  anaerobico: [{ reps: 6, work: m(1), rec: m(4) }, { reps: 8, work: m(1), rec: m(4) }, { reps: 6, work: 90, rec: m(5) }, { reps: 8, work: 90, rec: m(5) }],
  sprint: [{ reps: 6, work: 10, rec: 290 }, { reps: 8, work: 10, rec: 290 }, { reps: 8, work: 15, rec: 285 }, { reps: 10, work: 15, rec: 285 }],
};
const CLASS_BAND: Partial<Record<WorkoutClass, BandName>> = { sweetspot: "sweetspot", soglia: "soglia", vo2: "vo2", tempo: "tempo", anaerobico: "anaerobico", sprint: "sprint", z2: "z2", recupero: "z1" };
const PHASE_LABEL: Record<PhaseId, string> = { base_1: "Base 1", base_2: "Base 2", base_3: "Base 3", build_1: "Build 1", build_2: "Build 2", peak: "Picco", taper: "Tapering", recupero: "Recupero", mantenimento: "Mantenimento" };
/** Where each phase starts on the ladder: the base begins low, the build and the peak higher. */
const PHASE_START: Record<PhaseId, number> = { base_1: 0, base_2: 0.15, base_3: 0.3, build_1: 0.45, build_2: 0.6, peak: 0.7, taper: 0.4, recupero: 0, mantenimento: 0.35 };

export function vagueSets(cls: WorkoutClass, mins: number | null, o: ComposeOptions): { sets: SetSpec[]; dose: string; steadyMins: number | null } {
  const band = CLASS_BAND[cls] ?? "z2";
  const ladder = LADDER[cls];
  if (!ladder) {
    // Z2 and recovery: one steady ride.
    const steady = mins ?? (cls === "recupero" ? 45 : 90);
    return { sets: [], dose: cls === "recupero" ? "Recupero: tutto facile, sotto il 55%." : "Fondo: tutto in Z2, costante.", steadyMins: steady };
  }
  const phase = o.phase ?? null;
  const start = phase ? PHASE_START[phase] : 0.2;
  const pos = Math.min(1, start + (o.step ?? 0) * (1 - start) * 0.6);
  let idx = Math.round(pos * (ladder.length - 1));
  const fits = (r: Rung) => 15 + (r.reps * (r.work + r.rec)) / 60 + 5 <= (mins ?? 999);
  const wanted = idx;
  while (idx > 0 && !fits(ladder[idx])) idx--;
  const r = ladder[idx];
  const why = phase ? `${PHASE_LABEL[phase]}, ${Math.round((o.step ?? 0) * 100)}% del blocco` : "senza piano di stagione: dose media";
  const cut = idx < wanted ? ` (ridotta per stare in ${mins}')` : "";
  const sets = [{ reps: r.reps, workSecs: r.work, work: { kind: "band", band } as Intensity, recSecs: r.rec, rec: null, rpm: null, series: 1, seriesRestSecs: null, spread: false, guessedUnit: false }];
  return { sets, dose: `Dose scelta dal motore: ${why}, livello ${idx + 1} di ${ladder.length}${cut}.`, steadyMins: null };
}

// ── New sessions ──────────────────────────────────────────────────────────────────────────────────────────────────

export function composeNew(spec: Spec, o: ComposeOptions): Composed {
  const assumptions: string[] = [];
  let sets = spec.sets;
  let dose: string | null = null;
  let totalMins = spec.totalMins;
  let base = spec.base;
  if (!sets.length && spec.vague) {
    const v = vagueSets(spec.vague.cls, spec.vague.mins, o);
    sets = v.sets;
    dose = v.dose;
    if (v.steadyMins) {
      totalMins = v.steadyMins;
      base = { kind: "band", band: spec.vague.cls === "recupero" ? "z1" : "z2" };
    } else if (spec.vague.mins) totalMins = spec.vague.mins;
  }
  // Sprints alone ("6 sprint"): a Z2 ride with the sprints spread in it, long enough for 5' between them.
  const allSpread = sets.length > 0 && sets.every((s) => s.spread);

  const built = sets.filter((s) => !s.spread).map((s) => setSections(s, o.ftp, assumptions));
  const spreads = sets.filter((s) => s.spread);
  const bands = [...built.map((b) => b.band), ...spreads.map(() => "sprint" as BandName)];
  const hard = bands.some((b) => HARD_BANDS.includes(b));
  const longRide = (totalMins ?? 0) >= 90;
  const wu = warmup(spec.warmupMins, hard && !longRide);
  if (allSpread && !totalMins) {
    // Warm-up, cool-down, 5' of Z2 on each side and 5' for each sprint.
    const efforts = sets.reduce((a, s) => a + Math.max(1, s.reps), 0);
    totalMins = Math.ceil((wu.mins + 10 + 10 + efforts * 5) / 5) * 5;
    assumptions.push(`Durata non indicata: ${totalMins}' in Z2 con gli sprint distribuiti.`);
  }
  const cd = cooldown(spec.cooldownMins, (totalMins ?? 0) >= 75 || hard);
  if (spec.warmupMins === null && wu.mins) assumptions.push(hard && !longRide ? `Riscaldamento ${wu.mins}' con 3' all'88% per attivare le gambe.` : `Riscaldamento ${wu.mins}' progressivo.`);

  const main = built.flatMap((b, i) => (i ? [{ title: "Recupero", reps: 1, steps: [{ secs: 300, target: EASY_REC }] }, ...b.sections] : b.sections));
  const mainSecs = flatOf(main);
  const fixed = (wu.mins + cd.mins) * 60 + mainSecs;
  const baseTarget = base ? targetOf(base, o.ftp) : BAND.z2;
  let filler = totalMins ? totalMins * 60 - fixed : 0;
  // A few minutes over: the cool-down gives them back (never below 5').
  if (totalMins && filler < 0 && -filler <= 5 * 60 && cd.steps.length && cd.mins * 60 + filler >= 300) {
    cd.steps[0].secs += filler;
    cd.mins = Math.round(cd.steps[0].secs / 60);
    filler = 0;
  }
  if (totalMins && filler < 0) {
    assumptions.push(`Il lavoro non sta in ${totalLabel(totalMins)}: la seduta dura ${totalLabel(Math.round(fixed / 60))}.`);
    filler = 0;
  }
  if (spec.cooldownMins === null && cd.mins) assumptions.push(`Defaticamento ${cd.mins}'.`);
  if (filler > 0 && !base && spec.totalMins) assumptions.push(`Il resto in Z2 (${Math.round(baseTarget.lo * 100)}-${Math.round(baseTarget.hi * 100)}%).`);

  // Where the work goes in a longer ride.
  let before = 0;
  if (filler > 0 && main.length) {
    const where = spec.where ?? "meta";
    if (where === "inizio") before = 0;
    else if (where === "fine") before = filler;
    else if (where === "meta") before = Math.round(filler / 2 / 60) * 60;
    else before = Math.min(filler, Math.max(0, where.afterMins * 60 - wu.mins * 60));
    if (!spec.where) assumptions.push(`Il lavoro a metà uscita (dopo ${totalLabel(Math.round((wu.mins * 60 + before) / 60))}).`);
  }

  const sections: Section[] = [];
  if (wu.steps.length) sections.push({ title: "Riscaldamento", reps: 1, steps: wu.steps });
  const pre: Step[] = before > 0 ? [{ secs: before, target: baseTarget }] : [];
  const post: Step[] = filler - before > 0 ? [{ secs: filler - before, target: baseTarget }] : [];
  if (!main.length && !spreads.length && filler > 0) post.push(...pre.splice(0));
  if (pre.length) sections.push({ title: base?.kind === "band" && base.band === "z1" ? "Facile" : "Fondo", reps: 1, steps: pre });
  sections.push(...main);
  if (post.length) sections.push({ title: base?.kind === "band" && base.band === "z1" ? "Facile" : "Fondo", reps: 1, steps: post });
  if (cd.steps.length) sections.push({ title: "Defaticamento", reps: 1, steps: cd.steps });

  // Short efforts spread in the easy riding (after the warm-up, not in the last 10').
  let spreadLabel = "";
  if (spreads.length) {
    const efforts = spreads.flatMap((s) => Array.from({ length: Math.max(1, s.reps) }, () => ({ secs: s.workSecs, target: effortTarget(s, o.ftp) })));
    const done = spreadInto(sections, efforts, wu.mins * 60 + 5 * 60, (cd.mins + 5) * 60);
    sections.splice(0, sections.length, ...done.sections);
    if (done.gap && done.gap < 180) assumptions.push(`Tra uno sprint e l'altro solo ${durLabel(Math.round(done.gap))}: pochi per recuperare del tutto.`);
    assumptions.push(`${done.placed} sprint da ${durLabel(efforts[0].secs)} a tutta, uno ogni ${durLabel(Math.max(60, Math.round(done.gap / 60) * 60))} circa nella parte in Z2.`);
    spreadLabel = `${done.placed} sprint`;
  }

  const secs = totalSecs(sections);
  const mins = Math.round(secs / 60);
  const mainLabel = built.map((b) => `${BAND_LABEL[b.band]} ${b.label}`).join(" + ");
  const isLong = mins >= 90 || (spec.totalMins !== null && filler > 0);
  let name: string;
  if (spec.name) name = spec.name;
  else if (!built.length && !spreads.length) name = `${base?.kind === "band" && base.band === "z1" ? "Recupero" : "Z2"} ${totalLabel(mins)}`;
  else if (spreadLabel && !built.length) name = `Z2 ${totalLabel(mins)} con ${spreadLabel}`;
  else if (isLong) name = `Z2 ${totalLabel(mins)} con ${[...built.map(workLabel), spreadLabel].filter(Boolean).join(" e ")}`;
  else name = [mainLabel, spreadLabel].filter(Boolean).join(" + ");
  if (o.ftp === null) assumptions.push("FTP non nota: i watt non si possono calcolare.");

  const cls = classOfSession(bands, isLong);
  return { name, sections, secs, tss: estimateTss(sections), cls, assumptions, dose };
}

function classOfSession(bands: BandName[], long: boolean): WorkoutClass {
  const order: BandName[] = ["anaerobico", "vo2", "soglia", "sweetspot", "tempo", "sprint", "z2", "z1"];
  for (const b of order) if (bands.includes(b)) return long && (b === "tempo" || b === "sprint") ? "z2" : classOfBand(b);
  return long ? "z2" : "recupero";
}

// ── Changes to a session already on the calendar ─────────────────────────────────────────────────────────────────

/**
 * Puts what the athlete asked inside a planned session: short efforts spread in its easy riding, a block of work in the
 * middle (or where asked) in place of the same minutes of easy riding, so the session keeps its length.
 */
export function composeInsert(base: Section[], baseName: string, spec: Spec, o: ComposeOptions): Composed | null {
  const assumptions: string[] = [];
  const once = base.filter((s) => s.reps === 1);
  const easySecs = once.reduce((a, s) => a + s.steps.filter((x) => !x.ramp && mid(x.target) < 0.76).reduce((b, x) => b + x.secs, 0), 0);
  if (easySecs < 10 * 60) return null;
  const total = totalSecs(base);
  let sections: Section[] = base.map((s) => ({ ...s, steps: s.steps.map((x) => ({ ...x })) }));
  const labels: string[] = [];

  const spreads = spec.sets.filter((s) => s.spread);
  if (spreads.length) {
    const efforts = spreads.flatMap((s) => Array.from({ length: Math.max(1, s.reps) }, () => ({ secs: s.workSecs, target: effortTarget(s, o.ftp) })));
    // In the easy riding of the ridden-once sections, leaving the first 15' and the last 10' of the session alone.
    const done = spreadInto(sections, efforts, 15 * 60, 10 * 60);
    sections = done.sections;
    const n = efforts.length;
    if (done.placed < n) assumptions.push(`Solo ${done.placed} sprint su ${n}: non c'è abbastanza parte facile.`);
    else if (done.gap < 180) assumptions.push(`Tra uno sprint e l'altro solo ${durLabel(Math.round(done.gap))}: pochi per recuperare del tutto.`);
    assumptions.push(`${done.placed} sprint da ${durLabel(efforts[0].secs)} a tutta, uno ogni ${durLabel(Math.max(60, Math.round(done.gap / 60) * 60))} circa nella Z2 (non nei primi 15' né negli ultimi 10'): la durata resta la stessa.`);
    labels.push(`${done.placed} sprint`);
  }

  for (const set of spec.sets.filter((s) => !s.spread)) {
    const b = setSections(set, o.ftp, assumptions);
    const len = flatOf(b.sections);
    const where = spec.where ?? "meta";
    if (!spec.where) assumptions.push("Il blocco a metà seduta, al posto di altrettanta Z2: la durata resta la stessa.");
    const start = where === "inizio" ? 15 * 60 : where === "fine" ? total - 10 * 60 - len : where === "meta" ? Math.round((total - len) / 2) : where.afterMins * 60;
    const placed = insertBlock(sections, b.sections, Math.max(0, start), len);
    if (!placed) return null;
    if (placed.short > 0) assumptions.push(`Non c'era abbastanza Z2 dopo il blocco: la seduta si allunga di ${durLabel(placed.short)}.`);
    sections = placed.sections;
    labels.push(workLabel(b));
  }

  if (!labels.length) return null;
  const secs = totalSecs(sections);
  const name = `${baseName.replace(/\s+Indoor$/i, "")} + ${labels.join(" + ")}${/\bIndoor$/i.test(baseName) ? " Indoor" : ""}`;
  const blocks = spec.sets.filter((s) => !s.spread);
  const cls: WorkoutClass = blocks.length ? classOfSession(blocks.map((s) => workBand(s, o.ftp).band), secs >= 150 * 60) : "sprint";
  return { name, sections, secs, tss: estimateTss(sections), cls, assumptions, dose: null };
}

type Item = { kind: "step"; step: Step; title?: string } | { kind: "rep"; section: Section } | { kind: "block"; sections: Section[] };

/**
 * Puts `block` at `start` seconds on the session's clock, inside the first easy step that reaches it, and takes `len`
 * seconds of easy riding from what follows so the session keeps its length. Null when there is no easy step to cut.
 */
function insertBlock(sections: Section[], block: Section[], start: number, len: number): { sections: Section[]; short: number } | null {
  const items: Item[] = sections.flatMap((s): Item[] => (s.reps > 1 ? [{ kind: "rep", section: s }] : s.steps.map((step, i) => ({ kind: "step", step: { ...step }, ...(i === 0 ? { title: s.title } : {}) }))));
  const easy = (x: Step) => !x.ramp && mid(x.target) < 0.76;
  let clock = 0;
  let at = -1;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const d = it.kind === "step" ? it.step.secs : it.kind === "rep" ? it.section.reps * it.section.steps.reduce((a, x) => a + x.secs, 0) : 0;
    if (it.kind === "step" && easy(it.step) && clock + d > start) {
      const cut = Math.max(0, start - clock);
      const rest: Item = { kind: "step", step: { ...it.step, secs: d - cut } };
      it.step.secs = cut;
      items.splice(i + 1, 0, { kind: "block", sections: block }, rest);
      at = i + 2;
      break;
    }
    clock += d;
  }
  if (at < 0) return null;
  let toEat = len;
  for (let i = at; i < items.length && toEat > 0; i++) {
    const it = items[i];
    if (it.kind !== "step" || !easy(it.step)) continue;
    const eat = Math.min(it.step.secs, toEat);
    it.step.secs -= eat;
    toEat -= eat;
  }
  // Back to sections: a run of steps is one section; a repeat and the block stay as they are.
  const out: Section[] = [];
  let cur: Section | null = null;
  for (const it of items) {
    if (it.kind === "step") {
      if (it.step.secs <= 0) continue;
      if (!cur || it.title !== undefined) {
        cur = { title: it.title ?? "", reps: 1, steps: [] };
        out.push(cur);
      }
      cur.steps.push(it.step);
    } else {
      out.push(...(it.kind === "rep" ? [it.section] : it.sections));
      cur = null;
    }
  }
  return { sections: out.map((s) => (s.reps === 1 ? { ...s, steps: mergeSteps(s.steps) } : s)).filter((s) => s.steps.length), short: toEat };
}

/** "3×12' sweet spot", "5×4' VO2max": the work in a phrase. */
function workLabel(b: { band: BandName; label: string }): string {
  const name = BAND_LABEL[b.band];
  return `${b.label} ${b.band === "vo2" || b.band === "z2" ? name : name.toLowerCase()}`;
}
