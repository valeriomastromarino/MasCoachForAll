// Critical Power model (Monod & Scherrer; Skiba for W′ applications).
// Two-parameter linear work–time model: W(t) = CP·t + W′, fitted on mean-maximal efforts of 3–20 min,
// where the model is valid. Shorter efforts are dominated by Pmax, longer ones by fatigue/drift.
// CP sits slightly above FTP for most riders; Coggan's FTP ≈ 0.95–0.97·CP is a reasonable bridge.
//
// The model assumes every point is a maximal effort. A power curve built from normal riding often isn't
// (e.g. a hard 5' but no all-out 20'), which drags CP down. We therefore also fit the short end alone
// (3–8 min) and flag the estimate as unreliable when the two disagree.
import { linearFit } from "./stats";

export type MmpPoint = { secs: number; watts: number };

export type CpFit = {
  cp: number;
  wPrime: number;
  r2: number;
  /** Estimated FTP derived from CP. */
  eftp: number;
  pointsUsed: number;
  /** CP from 3–8 min efforts only; null when there aren't enough. */
  shortCp: number | null;
  /** False when long efforts look sub-maximal compared with short ones. */
  reliable: boolean;
};

export const CP_MIN_SECS = 180;
export const CP_MAX_SECS = 1200;
export const CP_SHORT_MAX_SECS = 480;
export const FTP_FROM_CP = 0.96;
/** Relative CP disagreement (short vs full window) above which the estimate is flagged. */
export const CP_DISAGREEMENT = 0.07;

function fitWindow(mmp: MmpPoint[], minSecs: number, maxSecs: number, minSpan: number) {
  const pts = mmp.filter((p) => p.secs >= minSecs && p.secs <= maxSecs && p.watts > 0);
  // Need efforts spread over the window, not just a cluster of similar durations.
  if (pts.length < 3) return null;
  const span = Math.max(...pts.map((p) => p.secs)) / Math.min(...pts.map((p) => p.secs));
  if (span < minSpan) return null;
  const fit = linearFit(
    pts.map((p) => p.secs),
    pts.map((p) => p.secs * p.watts),
  );
  if (fit.slope <= 0 || fit.intercept <= 0) return null;
  return { cp: fit.slope, wPrime: fit.intercept, r2: fit.r2, n: pts.length };
}

export function fitCriticalPower(mmp: MmpPoint[]): CpFit | null {
  const full = fitWindow(mmp, CP_MIN_SECS, CP_MAX_SECS, 2.5);
  if (!full) return null;
  const short = fitWindow(mmp, CP_MIN_SECS, CP_SHORT_MAX_SECS, 2);
  const reliable = !short || (short.cp - full.cp) / short.cp <= CP_DISAGREEMENT;
  return {
    cp: full.cp,
    wPrime: full.wPrime,
    r2: full.r2,
    eftp: full.cp * FTP_FROM_CP,
    pointsUsed: full.n,
    shortCp: short?.cp ?? null,
    reliable,
  };
}

/** Power the model predicts can be held for `secs` (valid roughly 2–20 min). */
export function cpPredict(fit: Pick<CpFit, "cp" | "wPrime">, secs: number): number {
  return fit.cp + fit.wPrime / secs;
}
