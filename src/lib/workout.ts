// Planned workouts from Intervals.icu: flatten workout_doc steps into blocks for the profile drawing.
import { COGGAN_POWER_ZONES } from "./physio/power";
import { isNum } from "./physio/stats";

export type Target = { units?: string; value?: number; start?: number; end?: number } | null | undefined;

export type RawStep = {
  duration?: number | null;
  reps?: number | null;
  steps?: RawStep[] | null;
  /** Section title ("Sweet spot 3x" → "Sweet spot"). */
  text?: string | null;
  power?: Target;
  /** Power resolved in watts by Intervals.icu (events read with resolve=true). */
  _power?: Target;
  hr?: Target;
  cadence?: Target;
  ramp?: boolean;
  warmup?: boolean;
  cooldown?: boolean;
  freeride?: boolean;
};

/**
 * One block of the profile: how long, which Coggan zone (1–7) it targets and, when the step says it, the target as a
 * fraction of FTP (`pct`). `free` marks a step without a power target ("freeride"): in a short step it is an all-out effort.
 */
export type WorkoutBlock = { secs: number; zone: number; pct?: number | null; free?: boolean };

function targetValue(t: Target): number | null {
  if (!t) return null;
  if (isNum(t.value)) return t.value;
  if (isNum(t.start) && isNum(t.end)) return (t.start + t.end) / 2;
  return null;
}

/** Fraction of FTP → Coggan zone number. */
export function zoneOfFraction(f: number): number {
  const i = COGGAN_POWER_ZONES.findIndex((z) => z.upper === null || f <= z.upper);
  return i < 0 ? 7 : i + 1;
}

/** Middle of each Coggan zone as a fraction of FTP, for steps written by zone (index = zone). */
export const ZONE_MID = [0, 0.5, 0.66, 0.83, 0.98, 1.13, 1.35, 1.6];

/** The step's target as a fraction of FTP, when it can be known. */
function stepFraction(s: RawStep, ftp: number | null): number | null {
  const p = targetValue(s.power);
  const units = s.power?.units;
  if (p !== null) {
    if (units === "%ftp") return p / 100;
    if (units === "w" && ftp) return p / ftp;
    if (units === "power_zone") return ZONE_MID[Math.min(7, Math.max(1, Math.round(p)))];
  }
  const h = targetValue(s.hr);
  // Heart-rate zones line up roughly with the first five power zones.
  if (h !== null && s.hr?.units === "hr_zone") return ZONE_MID[Math.min(5, Math.max(1, Math.round(h)))];
  return null;
}

export function workoutBlocks(steps: RawStep[] | null | undefined, ftp: number | null = null, depth = 0): WorkoutBlock[] {
  if (!steps || depth > 3) return [];
  const out: WorkoutBlock[] = [];
  for (const s of steps) {
    if (s.steps?.length) {
      const inner = workoutBlocks(s.steps, ftp, depth + 1);
      for (let r = 0; r < Math.max(1, s.reps ?? 1); r++) out.push(...inner);
    } else if (isNum(s.duration) && s.duration > 0) {
      const pct = stepFraction(s, ftp);
      const zone = pct !== null ? zoneOfFraction(pct) : s.freeride ? 2 : 1;
      out.push({ secs: s.duration, zone, pct: pct !== null ? Math.round(pct * 1000) / 1000 : null, ...(s.freeride ? { free: true } : {}) });
    }
  }
  return out;
}
