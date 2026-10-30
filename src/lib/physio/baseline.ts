// Rolling baseline vs normal range, the core of Marco Altini's approach to daily physiological markers:
// a short (7-day) baseline tells you where you are now, a long (~60-day) window tells you what is normal
// for *you*. Decisions come from the baseline leaving the normal range, not from single days.
import { isNum, mean, sd } from "./stats";

export const BASELINE_DEFAULTS = {
  shortWindow: 7,
  longWindow: 60,
  /** Minimum valid days needed inside each window. */
  minShort: 4,
  minLong: 21,
  /** Normal range half-width in SDs of daily values (≈ smallest worthwhile change scaled for a 7-day mean). */
  rangeSd: 0.5,
};

export type BaselineOptions = typeof BASELINE_DEFAULTS;

export type BaselinePoint = {
  value: number | null;
  /** Short rolling mean. */
  baseline7: number | null;
  /** Normal range of the baseline, from the long window. */
  low: number | null;
  high: number | null;
  /** Today's value in SDs from the long-window mean of the *previous* days (acute deviation). */
  z: number | null;
};

export type Band = "sotto" | "nella norma" | "sopra" | null;

function windowValues(xs: (number | null)[], end: number, size: number): number[] {
  const out: number[] = [];
  for (let i = Math.max(0, end - size + 1); i <= end; i++) {
    const v = xs[i];
    if (isNum(v)) out.push(v);
  }
  return out;
}

/** `values` must be one per consecutive calendar day, sorted ascending; missing days are null. */
export function rollingBaseline(values: (number | null)[], opts: Partial<BaselineOptions> = {}): BaselinePoint[] {
  const o = { ...BASELINE_DEFAULTS, ...opts };
  return values.map((value, i) => {
    const short = windowValues(values, i, o.shortWindow);
    const long = windowValues(values, i, o.longWindow);
    const prev = windowValues(values, i - 1, o.longWindow);
    let low: number | null = null;
    let high: number | null = null;
    if (long.length >= o.minLong) {
      const m = mean(long);
      const s = sd(long);
      low = m - o.rangeSd * s;
      high = m + o.rangeSd * s;
    }
    let z: number | null = null;
    if (isNum(value) && prev.length >= o.minLong) {
      const s = sd(prev);
      z = s > 0 ? (value - mean(prev)) / s : 0;
    }
    return { value, baseline7: short.length >= o.minShort ? mean(short) : null, low, high, z };
  });
}

export function band(p: BaselinePoint | undefined): Band {
  if (!p || p.baseline7 === null || p.low === null || p.high === null) return null;
  if (p.baseline7 < p.low) return "sotto";
  if (p.baseline7 > p.high) return "sopra";
  return "nella norma";
}
