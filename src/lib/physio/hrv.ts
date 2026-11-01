// HRV interpretation following Marco Altini (HRV4Training) and Plews/Buchheit:
// - work on ln(rMSSD), never on raw rMSSD;
// - judge the 7-day rolling average against a "normal range" built from ~60 days of history;
// - a single day is noise unless it is a large deviation; trends drive decisions;
// - values ABOVE the normal range are not automatically "good" (possible parasympathetic saturation
//   during heavy load), so they are flagged for context rather than celebrated.
// Garmin's overnight HRV (what Intervals.icu stores in `hrv`) is a different measurement from a morning
// spot check: never mix the two in the same baseline.
import { band, type BaselinePoint, rollingBaseline } from "./baseline";
import { isNum, sd } from "./stats";

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
    /** SD of ln rMSSD over the last 7 days (≥ 4 valid nights). Far above sd60 = less stable autonomic state. */
    sd7: number | null;
    /** The athlete's own SD of ln rMSSD over the last 60 days (≥ 21 valid nights). */
    sd60: number | null;
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
  const sdWindow = (size: number, min: number) => {
    const w = lns.slice(Math.max(0, last - size + 1), last + 1).filter(isNum);
    return w.length >= min ? sd(w) : null;
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
      sd7: last >= 0 ? sdWindow(7, 4) : null,
      sd60: last >= 0 ? sdWindow(60, 21) : null,
    },
  };
}
