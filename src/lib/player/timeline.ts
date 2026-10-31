// A planned Intervals.icu workout as the player runs it: a flat list of steps with watts, ramps and cadence.
import { COGGAN_POWER_ZONES } from "../physio/power";
import { isNum } from "../physio/stats";
import { type RawStep, type Target, zoneOfFraction } from "../workout";

export type PlayerStep = {
  index: number;
  /** Seconds from the start of the workout. */
  start: number;
  secs: number;
  /** Target watts at the start and at the end of the step (equal unless it is a ramp). */
  from: number;
  to: number;
  ramp: boolean;
  cadence: { lo: number; hi: number } | null;
  /** "Sweet spot · 2 di 3", or null. */
  label: string | null;
  /** Coggan zone of the (mean) target, for the colours of the profile. */
  zone: number;
};

export type PlayerWorkout = {
  id: string;
  name: string;
  date: string;
  /** FTP the % targets refer to (indoor FTP of the athlete). */
  ftp: number;
  description: string | null;
  steps: PlayerStep[];
  totalSecs: number;
};

/** Middle of a Coggan zone as a fraction of FTP (zone 7: 1.6). */
function zoneMid(zone: number): number {
  const z = Math.min(7, Math.max(1, Math.round(zone)));
  const lower = z === 1 ? 0.4 : COGGAN_POWER_ZONES[z - 2].upper ?? 1.5;
  const upper = COGGAN_POWER_ZONES[z - 1].upper ?? 1.7;
  return (lower + upper) / 2;
}

/** Watts at start and end of a step; null when it has no power target. */
function watts(s: RawStep, ftp: number): { from: number; to: number } | null {
  const pick = (t: Target, conv: (x: number) => number) => {
    if (!t) return null;
    if (s.ramp && isNum(t.start) && isNum(t.end)) return { from: conv(t.start), to: conv(t.end) };
    const v = isNum(t.value) ? t.value : isNum(t.start) && isNum(t.end) ? (t.start + t.end) / 2 : null;
    return v === null ? null : { from: conv(v), to: conv(v) };
  };
  // Intervals.icu already resolved the target in watts.
  const resolved = pick(s._power, (x) => x);
  if (resolved) return resolved;
  const units = s.power?.units;
  if (units === "%ftp") return pick(s.power, (x) => (x * ftp) / 100);
  if (units === "w") return pick(s.power, (x) => x);
  if (units === "power_zone") return pick(s.power, (x) => zoneMid(x) * ftp);
  return null;
}

function cadenceRange(t: Target): { lo: number; hi: number } | null {
  if (!t) return null;
  if (isNum(t.start) && isNum(t.end)) return { lo: t.start, hi: t.end };
  if (isNum(t.value)) return { lo: t.value, hi: t.value };
  return null;
}

/** Section title without the repeat count ("Sweet spot 3x" → "Sweet spot"). */
const sectionName = (text: string | null | undefined) => text?.replace(/\s*\d+\s*x\s*$/i, "").trim() || null;

/** Flattens the workout steps (repeats expanded). A step without a power target keeps the previous target. */
export function buildTimeline(steps: RawStep[] | null | undefined, ftp: number): PlayerStep[] {
  const out: PlayerStep[] = [];
  let t = 0;
  let last = Math.round(ftp * 0.5);
  const walk = (list: RawStep[], label: string | null, depth: number) => {
    for (const s of list) {
      if (s.steps?.length && depth < 3) {
        const reps = Math.max(1, s.reps ?? 1);
        const name = sectionName(s.text) ?? label;
        for (let r = 1; r <= reps; r++) walk(s.steps, reps > 1 ? `${name ?? "Ripetuta"} · ${r} di ${reps}` : name, depth + 1);
        continue;
      }
      if (!isNum(s.duration) || s.duration <= 0) continue;
      const w = watts(s, ftp);
      const from = Math.round(w ? w.from : last);
      const to = Math.round(w ? w.to : last);
      last = to;
      out.push({
        index: out.length,
        start: t,
        secs: s.duration,
        from,
        to,
        ramp: Boolean(s.ramp) && from !== to,
        cadence: cadenceRange(s.cadence),
        label: sectionName(s.text) ?? label,
        zone: zoneOfFraction((from + to) / 2 / ftp),
      });
      t += s.duration;
    }
  };
  walk(steps ?? [], null, 0);
  return out;
}

export function totalSecs(steps: PlayerStep[]): number {
  const last = steps[steps.length - 1];
  return last ? last.start + last.secs : 0;
}

/** Index of the step at `pos` seconds (the last one past the end). */
export function stepIndexAt(steps: PlayerStep[], pos: number): number {
  for (let i = steps.length - 1; i >= 0; i--) if (pos >= steps[i].start) return i;
  return 0;
}

/** Target watts at `pos` seconds (ramps interpolated). */
export function targetAt(steps: PlayerStep[], pos: number): number {
  if (!steps.length) return 0;
  const s = steps[stepIndexAt(steps, pos)];
  if (!s.ramp) return s.from;
  const f = Math.min(1, Math.max(0, (pos - s.start) / s.secs));
  return Math.round(s.from + (s.to - s.from) * f);
}
