// Planned workouts from Intervals.icu: flatten workout_doc steps into blocks for the profile drawing.
import { COGGAN_POWER_ZONES } from "./physio/power";
import { isNum } from "./physio/stats";

type Target = { units?: string; value?: number; start?: number; end?: number } | null | undefined;

export type RawStep = {
  duration?: number | null;
  reps?: number | null;
  steps?: RawStep[] | null;
  power?: Target;
  hr?: Target;
  ramp?: boolean;
  warmup?: boolean;
  cooldown?: boolean;
  freeride?: boolean;
};

/** One block of the profile: how long, and which Coggan zone (1–7) it targets. */
export type WorkoutBlock = { secs: number; zone: number };

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

function stepZone(s: RawStep, ftp: number | null): number {
  const p = targetValue(s.power);
  const units = s.power?.units;
  if (p !== null) {
    if (units === "power_zone") return Math.min(7, Math.max(1, Math.round(p)));
    if (units === "%ftp") return zoneOfFraction(p / 100);
    if (units === "w" && ftp) return zoneOfFraction(p / ftp);
  }
  // Heart-rate zones line up roughly with the first five power zones.
  const h = targetValue(s.hr);
  if (h !== null && s.hr?.units === "hr_zone") return Math.min(5, Math.max(1, Math.round(h)));
  return s.freeride ? 2 : 1;
}

export function workoutBlocks(steps: RawStep[] | null | undefined, ftp: number | null = null, depth = 0): WorkoutBlock[] {
  if (!steps || depth > 3) return [];
  const out: WorkoutBlock[] = [];
  for (const s of steps) {
    if (s.steps?.length) {
      const inner = workoutBlocks(s.steps, ftp, depth + 1);
      for (let r = 0; r < Math.max(1, s.reps ?? 1); r++) out.push(...inner);
    } else if (isNum(s.duration) && s.duration > 0) {
      out.push({ secs: s.duration, zone: stepZone(s, ftp) });
    }
  }
  return out;
}
