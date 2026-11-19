// A workout built by the app (19 November 2026): sections of steps with targets as fractions of FTP, the same shape as
// the Intervals.icu text ("Sweet spot 3x / - 12m 88-92%"). The chat builds it from the athlete's words (parse.ts,
// compose.ts), shows it and, after a "sì", writes its text on the calendar (intervalsText.ts).
import type { WorkoutBlock } from "@/lib/workout";
import { zoneOfFraction } from "@/lib/workout";

/** A target as a fraction of FTP: a range, a single value (lo = hi) or a ramp from lo to hi. */
export type Target = { lo: number; hi: number };

export type Step = {
  secs: number;
  target: Target;
  ramp?: boolean;
  /** Cadence in rpm, when asked ("a 60 rpm"). */
  rpm?: number | null;
};

/** A titled group of steps, repeated `reps` times (1 = not repeated). */
export type Section = { title: string; reps: number; steps: Step[] };

export type Built = { name: string; sections: Section[] };

/** Targets for the words of a session, as fractions of FTP (Coggan bands; sweet spot 88–93 %). */
export const BAND = {
  z1: { lo: 0.5, hi: 0.55 },
  z2: { lo: 0.65, hi: 0.72 },
  tempo: { lo: 0.8, hi: 0.86 },
  sweetspot: { lo: 0.88, hi: 0.93 },
  soglia: { lo: 0.95, hi: 1.0 },
  vo2: { lo: 1.1, hi: 1.2 },
  anaerobico: { lo: 1.3, hi: 1.5 },
  /** An all-out sprint: written as 200 %, as the library does; on the trainer the player rides it in resistance mode. */
  sprint: { lo: 2.0, hi: 2.0 },
} satisfies Record<string, Target>;

/** The middle of a target (a ramp counts as its average). */
export const mid = (t: Target) => (t.lo + t.hi) / 2;

export const sectionSecs = (s: Section) => s.reps * s.steps.reduce((a, x) => a + x.secs, 0);
export const totalSecs = (sections: Section[]) => sections.reduce((a, s) => a + sectionSecs(s), 0);

/** Every step in the order it is ridden (repeats unrolled). */
export function flatSteps(sections: Section[]): Step[] {
  const out: Step[] = [];
  for (const s of sections) for (let r = 0; r < s.reps; r++) out.push(...s.steps);
  return out;
}

/**
 * Training load estimated the way Intervals.icu does for a planned workout: time × intensity², with a ramp averaged on
 * its squares and the intensity of a sprint counted at most 1,5 (a few seconds all-out weigh little on the day's load).
 */
export function estimateTss(sections: Section[]): number {
  let load = 0;
  for (const st of flatSteps(sections)) {
    const f = (x: number) => Math.min(1.5, x);
    const sq = st.ramp ? (f(st.target.lo) ** 2 + f(st.target.lo) * f(st.target.hi) + f(st.target.hi) ** 2) / 3 : f(mid(st.target)) ** 2;
    load += st.secs * sq;
  }
  return Math.round((load / 3600) * 100);
}

/** The blocks of the profile drawing (and of the engine's classifier). A ramp is drawn in four steps. */
export function blocksOf(sections: Section[]): WorkoutBlock[] {
  const out: WorkoutBlock[] = [];
  for (const st of flatSteps(sections)) {
    const parts = st.ramp && st.target.lo !== st.target.hi && st.secs >= 120 ? 4 : 1;
    for (let k = 0; k < parts; k++) {
      const pct = parts === 1 ? mid(st.target) : st.target.lo + ((st.target.hi - st.target.lo) * (k + 0.5)) / parts;
      out.push({ secs: st.secs / parts, zone: zoneOfFraction(pct), pct: Math.round(pct * 1000) / 1000 });
    }
  }
  return out;
}

/** Joins steps next to each other with the same target (after an insert has cut and stitched a section). */
export function mergeSteps(steps: Step[]): Step[] {
  const out: Step[] = [];
  for (const s of steps) {
    if (s.secs <= 0) continue;
    const last = out[out.length - 1];
    if (last && !last.ramp && !s.ramp && last.target.lo === s.target.lo && last.target.hi === s.target.hi && (last.rpm ?? null) === (s.rpm ?? null)) last.secs += s.secs;
    else out.push({ ...s });
  }
  return out;
}
