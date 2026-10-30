// Performance Management Chart (Banister impulse-response, as popularised by Coggan):
// CTL = 42-day exponentially weighted load ("fitness"), ATL = 7-day ("fatigue"), TSB = CTL − ATL ("form").

export type DailyLoad = { date: string; load: number };
export type PmcPoint = { date: string; load: number; ctl: number; atl: number; tsb: number };

export const CTL_DAYS = 42;
export const ATL_DAYS = 7;

/**
 * Computes CTL/ATL day by day. TSB is "form going into the day", i.e. yesterday's CTL − ATL,
 * which is the convention used by TrainingPeaks and Intervals.icu.
 * `days` must be consecutive and sorted; missing days should be passed with load 0.
 */
export function computePmc(days: DailyLoad[], seed = { ctl: 0, atl: 0 }): PmcPoint[] {
  const kCtl = 1 - Math.exp(-1 / CTL_DAYS);
  const kAtl = 1 - Math.exp(-1 / ATL_DAYS);
  let ctl = seed.ctl;
  let atl = seed.atl;
  return days.map(({ date, load }) => {
    const tsb = ctl - atl;
    ctl = ctl + (load - ctl) * kCtl;
    atl = atl + (load - atl) * kAtl;
    return { date, load, ctl, atl, tsb };
  });
}

/** CTL change over the last 7 days. ~3–7/week is a sustainable build for most amateurs; >8 is aggressive. */
export function rampRate(points: { ctl: number }[]): number {
  if (points.length < 8) return NaN;
  return points[points.length - 1].ctl - points[points.length - 8].ctl;
}

export type FormZone = "transizione" | "fresco" | "grigia" | "ottimale" | "alto rischio";

/** TSB bands as used in Intervals.icu / common coaching practice. */
export function formZone(tsb: number, ctl: number): FormZone {
  // Expressed relative to CTL so it scales with the athlete's fitness.
  const rel = ctl > 0 ? tsb / ctl : 0;
  if (rel > 0.2) return "transizione";
  if (rel > 0.05) return "fresco";
  if (rel > -0.1) return "grigia";
  if (rel > -0.3) return "ottimale";
  return "alto rischio";
}
