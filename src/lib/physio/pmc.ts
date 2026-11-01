// Performance Management Chart (Banister impulse-response, as popularised by Coggan):
// CTL = 42-day exponentially weighted load ("fitness"), ATL = 7-day ("fatigue"), TSB = CTL − ATL ("form").

export type DailyLoad = { date: string; load: number };
export type PmcPoint = { date: string; load: number; ctl: number; atl: number; tsb: number };

export const CTL_DAYS = 42;
export const ATL_DAYS = 7;

/**
 * Computes CTL/ATL day by day. TSB is the day's own CTL − ATL (end of day, that day's load included):
 * what Intervals.icu shows as Form. After a hard ride it is already low; TrainingPeaks uses the day before.
 * `days` must be consecutive and sorted; missing days should be passed with load 0.
 */
export function computePmc(days: DailyLoad[], seed = { ctl: 0, atl: 0 }): PmcPoint[] {
  const kCtl = 1 - Math.exp(-1 / CTL_DAYS);
  const kAtl = 1 - Math.exp(-1 / ATL_DAYS);
  let ctl = seed.ctl;
  let atl = seed.atl;
  return days.map(({ date, load }) => {
    ctl = ctl + (load - ctl) * kCtl;
    atl = atl + (load - atl) * kAtl;
    return { date, load, ctl, atl, tsb: ctl - atl };
  });
}

/** CTL change over the last 7 days. ~3–7/week is a sustainable build for most amateurs; >8 is aggressive. */
export function rampRate(points: { ctl: number }[]): number {
  if (points.length < 8) return NaN;
  return points[points.length - 1].ctl - points[points.length - 8].ctl;
}

export type FormZone = "transizione" | "fresco" | "grigia" | "ottimale" | "alto rischio";

/** Form bands on the TSB number shown in the app: optimal −10 to −30, high risk below −30 (the athlete's choice). */
export function formZone(tsb: number): FormZone {
  if (tsb > 20) return "transizione";
  if (tsb > 5) return "fresco";
  if (tsb > -10) return "grigia";
  if (tsb >= -30) return "ottimale";
  return "alto rischio";
}
