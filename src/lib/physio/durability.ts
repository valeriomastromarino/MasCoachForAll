// Durability (Maunder et al. 2021, "The importance of durability in the physiological profiling of endurance
// athletes"): how much of your fresh power is still there after hours of riding.
// We look for the best efforts done *after* 2 h and 3 h of riding and compare them with the fresh power profile.
import { isNum } from "./stats";

/** Effort durations compared, in seconds. */
export const DURABILITY_DURATIONS = [60, 300, 600, 1200];
/** Riding time after which efforts count as "tired", in seconds. */
export const DURABILITY_MARKS = [7200, 10800];

/**
 * Best mean power over `win` consecutive samples starting at or after index `from` (1 Hz stream).
 * Missing samples count as 0 W, like coasting.
 */
export function bestMeanFrom(watts: (number | null)[], from: number, win: number): number | null {
  if (win <= 0 || watts.length - from < win) return null;
  let sum = 0;
  for (let i = from; i < from + win; i++) sum += isNum(watts[i]) ? watts[i]! : 0;
  let best = sum;
  for (let i = from + win; i < watts.length; i++) {
    sum += (isNum(watts[i]) ? watts[i]! : 0) - (isNum(watts[i - win]) ? watts[i - win]! : 0);
    if (sum > best) best = sum;
  }
  return best / win;
}

export type RideDurability = {
  /** Work done (kJ) by each mark, so the time marks can be read as energy too. */
  kjAt: (number | null)[];
  /** best[m][d] = best power over DURABILITY_DURATIONS[d] after DURABILITY_MARKS[m]. */
  best: (number | null)[][];
};

/** Samples are treated as seconds of riding: Garmin files are 1 Hz and pause with auto-pause. */
export function rideDurability(watts: (number | null)[]): RideDurability {
  let kj = 0;
  const cumKj: number[] = [];
  for (const w of watts) {
    kj += isNum(w) ? w / 1000 : 0;
    cumKj.push(kj);
  }
  return {
    kjAt: DURABILITY_MARKS.map((m) => (watts.length > m ? Math.round(cumKj[m - 1]) : null)),
    best: DURABILITY_MARKS.map((m) => DURABILITY_DURATIONS.map((d) => bestMeanFrom(watts, m, d))),
  };
}

export type DurabilityMark = {
  afterSecs: number;
  /** Rides long enough to reach this mark. */
  rides: number;
  /** Average work done by the mark across those rides. */
  avgKj: number | null;
  /** Best power for each duration after the mark, over all rides. */
  watts: (number | null)[];
};

export function combineDurability(rides: RideDurability[]): DurabilityMark[] {
  return DURABILITY_MARKS.map((afterSecs, m) => {
    const reached = rides.filter((r) => r.kjAt[m] !== null);
    const kjs = reached.map((r) => r.kjAt[m]!);
    return {
      afterSecs,
      rides: reached.length,
      avgKj: kjs.length ? Math.round(kjs.reduce((a, b) => a + b, 0) / kjs.length) : null,
      watts: DURABILITY_DURATIONS.map((_, d) => {
        const vals = reached.map((r) => r.best[m][d]).filter(isNum);
        return vals.length ? Math.round(Math.max(...vals)) : null;
      }),
    };
  });
}

/** Share of fresh power kept when tired, with the usual reading of the literature. */
export function durabilityLevel(ratio: number): "ottima" | "buona" | "da migliorare" {
  if (ratio >= 0.95) return "ottima";
  if (ratio >= 0.9) return "buona";
  return "da migliorare";
}
