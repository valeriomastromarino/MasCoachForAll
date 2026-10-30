// HRV interpretation following Marco Altini (HRV4Training) and Plews/Buchheit:
// - work on ln(rMSSD), never on raw rMSSD;
// - judge the 7-day rolling average against a "normal range" built from ~60 days of history;
// - a single day is noise unless it is a large deviation; trends drive decisions;
// - values ABOVE the normal range are not automatically "good" (possible parasympathetic saturation
//   during heavy load), so they are flagged for context rather than celebrated.
// Garmin's overnight HRV (what Intervals.icu stores in `hrv`) is a different measurement from a morning
// spot check: never mix the two in the same baseline.
import { band, type BaselinePoint, rollingBaseline } from "./baseline";
import { isNum, mean, sd } from "./stats";

export type HrvDay = { date: string; rmssd: number | null };

export type HrvStatus = "nella norma" | "sotto la norma" | "sopra la norma" | "dati insufficienti";

export type HrvPoint = {
  date: string;
  ln: number | null;
  baseline7: number | null;
  low: number | null;
  high: number | null;
  z: number | null;
};

export type HrvAnalysis = {
  points: HrvPoint[];
  today: {
    ln: number | null;
    baseline7: number | null;
    low: number | null;
    high: number | null;
    status: HrvStatus;
    /** Last night far below normal: an acute stressor worth acting on today. */
    acuteDrop: boolean;
    /** Coefficient of variation of ln rMSSD over 7 days, %. Rising CV = less stable autonomic state. */
    cv7: number | null;
    cv7Prev: number | null;
  };
};

/** Single-night drop below the 60-day mean (in SDs) considered meaningful. */
export const HRV_ACUTE_SD = 1.5;

export function hrvStatus(p: BaselinePoint | undefined): HrvStatus {
  const b = band(p);
  return b === null ? "dati insufficienti" : b === "sotto" ? "sotto la norma" : b === "sopra" ? "sopra la norma" : "nella norma";
}

/** `days` must be consecutive calendar days, sorted ascending. */
export function analyzeHrv(days: HrvDay[]): HrvAnalysis {
  const lns = days.map((d) => (isNum(d.rmssd) && d.rmssd > 0 ? Math.log(d.rmssd) : null));
  const base = rollingBaseline(lns);
  const points: HrvPoint[] = base.map((p, i) => ({
    date: days[i].date,
    ln: p.value,
    baseline7: p.baseline7,
    low: p.low,
    high: p.high,
    z: p.z,
  }));

  const last = base.length - 1;
  const t = base[last];
  const cv = (end: number) => {
    const w = lns.slice(Math.max(0, end - 6), end + 1).filter(isNum);
    return w.length >= 4 ? (sd(w) / mean(w)) * 100 : null;
  };

  return {
    points,
    today: {
      ln: t?.value ?? null,
      baseline7: t?.baseline7 ?? null,
      low: t?.low ?? null,
      high: t?.high ?? null,
      status: hrvStatus(t),
      acuteDrop: t?.z !== null && t?.z !== undefined && t.z <= -HRV_ACUTE_SD,
      cv7: last >= 0 ? cv(last) : null,
      cv7Prev: last >= 7 ? cv(last - 7) : null,
    },
  };
}
