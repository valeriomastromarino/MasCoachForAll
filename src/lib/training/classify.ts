// What a library workout is, read from its blocks (time at each fraction of FTP) and, for tests and race-week sessions,
// from its name. The class decides where a workout can go in a week: anything with work above Z2 is a "quality" session,
// threshold, VO2max and anaerobic ones are also "hard" (proposal of 10 November 2026, docs/motore-allenamenti-…).
import type { LibraryWorkout } from "@/lib/calendar";
import { ZONE_MID, zoneOfFraction } from "@/lib/workout";

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

/** The type as a person says it in a sentence. */
export const CLASS_SAY: Record<WorkoutClass, string> = { recupero: "recupero", z2: "fondo Z2", tempo: "tempo", sweetspot: "sweet spot", soglia: "soglia", vo2: "VO2max", anaerobico: "anaerobico", sprint: "sprint", test: "test", gara: "gara" };

/** Threshold, VO2max and anaerobic: the "hard" sessions of the prompt (§10.3). */
export const HARD: WorkoutClass[] = ["soglia", "vo2", "anaerobico"];
/** Everything with work above Z2: the week's quality sessions (at most two in a normal week). */
export const QUALITY: WorkoutClass[] = ["tempo", "sweetspot", "soglia", "vo2", "anaerobico"];

export type Classified = {
  w: LibraryWorkout;
  cls: WorkoutClass;
  mins: number;
  tss: number;
  /** Threshold, VO2max or anaerobic. */
  hard: boolean;
  /** Work above Z2 that counts as one of the week's quality sessions (a long ride with some tempo does not). */
  quality: boolean;
  mtb: boolean;
  indoor: boolean;
  fasted: boolean;
  /** Longest single block above Z2, minutes: short for repeats, long for steady work. */
  longestWork: number;
  /** Minutes of work in the band that sets the class: what grows week after week. */
  work: number;
  /** Minutes above Z2 (tempo and up, sprints included). */
  aboveZ2: number;
  /** Highest Coggan zone the workout reaches. */
  maxZone: number;
  /** VO2max made of efforts of a minute or less (30"/15", 40"/20", 30"/30"). */
  shortIntervals: boolean;
  /** A ride of 2,5 h or more with its work in the last part (durability). */
  lateWork: boolean;
};

// Bands as fractions of FTP (Coggan zones; sweet spot 88–94 %).
const TEMPO = 0.76;
const SWEET = 0.875;
const THRESHOLD = 0.945;
const VO2 = 1.055;
const ANAEROBIC = 1.2;
const SPRINT = 1.5;

type Block = LibraryWorkout["blocks"][number];
/** A block's target as a fraction of FTP: the written value, or the middle of its zone. A short step without target is an all-out effort. */
const fraction = (b: Block): number => b.pct ?? (b.free && b.secs <= 30 ? 1.6 : ZONE_MID[b.zone] ?? 0.5);

// The season's weeks classify the same library thousands of times: each workout is read once.
const seen = new WeakMap<LibraryWorkout, Classified>();

export function classifyWorkout(w: LibraryWorkout): Classified {
  const hit = seen.get(w);
  if (hit) return hit;
  const out = classify(w);
  seen.set(w, out);
  return out;
}

function classify(w: LibraryWorkout): Classified {
  const blocks = w.blocks ?? [];
  const total = w.secs ?? blocks.reduce((s, b) => s + b.secs, 0);
  const sec = { z1: 0, z2: 0, tempo: 0, sweet: 0, thr: 0, vo2: 0, ana: 0, spr: 0 };
  let longest = 0;
  let run = 0;
  let maxZone = 1;
  let elapsed = 0;
  let late = 0;
  for (const b of blocks) {
    const f = fraction(b);
    if (f < 0.56) sec.z1 += b.secs;
    else if (f < TEMPO) sec.z2 += b.secs;
    else if (f < SWEET) sec.tempo += b.secs;
    else if (f < THRESHOLD) sec.sweet += b.secs;
    else if (f < VO2) sec.thr += b.secs;
    else if (f <= ANAEROBIC) sec.vo2 += b.secs;
    else if (f < SPRINT) sec.ana += b.secs;
    else sec.spr += b.secs;
    maxZone = Math.max(maxZone, zoneOfFraction(f));
    if (f >= TEMPO) {
      run += b.secs;
      longest = Math.max(longest, run);
      if (elapsed >= total * 0.6) late += b.secs;
    } else run = 0;
    elapsed += b.secs;
  }
  const m = (s: number) => s / 60;
  const efforts = blocks.filter((b) => fraction(b) >= VO2);
  const aboveZ2 = m(sec.tempo + sec.sweet + sec.thr + sec.vo2 + sec.ana + sec.spr);
  const name = w.name;
  const named = (re: RegExp) => re.test(name);

  let cls: WorkoutClass;
  let work = 0;
  let shortIntervals = false;
  // Repeats of a minute or less between VO2max and the anaerobic band: 30"/15", 40"/20", 30"/30".
  const short = efforts.filter((b) => b.secs <= 60 && fraction(b) < 1.35);
  // Sprints: a few all-out efforts of 30" or less with long recoveries, and little other work (a warm-up with a few
  // minutes of tempo and threshold is allowed: a Z2 ride with sprints is still a sprint session, not an easy ride).
  const sprints = efforts.filter((b) => b.secs <= 30 && fraction(b) >= ANAEROBIC);
  const sprintSecs = sprints.reduce((s, b) => s + b.secs, 0);
  const otherWork = m(sec.tempo + sec.sweet + sec.thr);
  // Efforts of 30" to 2'30" above the VO2max band.
  const anaerobic = efforts.filter((b) => fraction(b) >= ANAEROBIC && b.secs > 30 && b.secs <= 150).reduce((s, b) => s + b.secs, 0);
  const longRide = m(total) >= 150;

  if (named(/\b(test|benchmark|tt)\b/i)) cls = "test";
  else if (named(/\b(race|taper|openers?)\b/i) && !named(/threshold|vo2|sweet|tempo|\bSS\b/i)) cls = "gara";
  else if (sprints.length >= 3 && sprints.length === efforts.length && sprintSecs < 240 && otherWork < 15) {
    cls = "sprint";
    work = m(sprintSecs);
  } else if (longRide && sec.vo2 + sec.ana === 0 && aboveZ2 <= m(total) * 0.3) {
    // A long ride with some tempo, sweet spot or threshold climbs in it is still the long Z2 ride.
    cls = "z2";
    work = m(sec.tempo + sec.sweet + sec.thr);
  } else if (short.length >= 6 && short.reduce((s, b) => s + b.secs, 0) >= 300) {
    cls = "vo2";
    shortIntervals = true;
    work = m(short.reduce((s, b) => s + b.secs, 0));
  } else if (m(anaerobic) >= 4) {
    cls = "anaerobico";
    work = m(anaerobic);
  } else if (m(sec.vo2) >= 6) {
    cls = "vo2";
    work = m(sec.vo2);
  } else if (m(sec.thr) >= 10) {
    cls = "soglia";
    work = m(sec.thr + sec.vo2);
  } else if (m(sec.sweet) >= 15 || (named(/sweet|\bSS\b/i) && m(sec.sweet + sec.tempo) >= 15)) {
    cls = "sweetspot";
    work = m(sec.sweet + sec.tempo + sec.thr);
  } else if (m(sec.tempo + sec.sweet) >= 15) {
    cls = "tempo";
    work = m(sec.tempo + sec.sweet);
  } else if (m(total) >= 40 && m(sec.z2) >= 15) {
    cls = "z2";
    work = m(sec.z2);
  } else {
    cls = "recupero";
    work = m(sec.z1 + sec.z2);
  }

  return {
    w,
    cls,
    mins: m(total),
    tss: w.tss ?? 0,
    hard: HARD.includes(cls),
    quality: QUALITY.includes(cls),
    mtb: /\b(mtb|xc)\b/i.test(name),
    indoor: /indoor/i.test(name),
    fasted: /fasted/i.test(name),
    longestWork: m(longest),
    work: Math.round(work * 10) / 10,
    aboveZ2: Math.round(aboveZ2 * 10) / 10,
    maxZone,
    shortIntervals,
    lateWork: longRide && m(late) >= 10 && late >= (sec.tempo + sec.sweet + sec.thr + sec.vo2) * 0.5,
  };
}
