// Critical Power model (Monod & Scherrer; Skiba for W′ applications).
// Two-parameter linear work–time model: W(t) = CP·t + W′. CP sits slightly above FTP for most riders; Coggan's
// FTP ≈ 0.95–0.97·CP is a reasonable bridge.
//
// The fit follows the classic test of the coach prompt (§5.9): the best efforts of 3, 7 and 12 minutes of the power
// curve. The best 20 minutes join them only when they look like an all-out effort (close to what the three efforts
// predict): a longest effort near 20' gives the most accurate CP (Maturana 2018), but a power curve built from normal
// riding often has a hard 5' and no all-out 20', and until 12 November 2026 every point of the curve between 3 and 20
// minutes went into the fit, so that soft long end dragged CP down (about a tenth below what the three efforts gave) and the
// test of the prompt could never fix it.
//
// The model assumes every point is a maximal effort. As a check the short end alone (3–8 min) is fitted too, and the
// estimate is flagged as unreliable when the two disagree (the 12' was not all-out).
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
  /** False when the longest efforts look sub-maximal compared with the short ones. */
  reliable: boolean;
  /** Longest effort in the fit, seconds: 720 (the classic test), or 1200 when the best 20' are an all-out effort. */
  upToSecs: number;
};

export const CP_MIN_SECS = 180;
/** The efforts of the classic test: 3, 7 and 12 minutes. */
export const CP_TEST_SECS = [180, 420, 720];
export const CP_MAX_SECS = 720;
export const CP_LONG_SECS = 1200;
/** The best 20' count as all-out when they reach this share of what the three efforts predict for 20'. */
export const CP_LONG_MAXIMAL = 0.95;
export const CP_SHORT_MAX_SECS = 480;
export const FTP_FROM_CP = 0.96;
/** Relative CP disagreement (short efforts vs the fit) above which the estimate is flagged. */
export const CP_DISAGREEMENT = 0.07;
/** How far from a wanted duration a point of the curve may be (the curve has a point every 10–60 s there). */
const NEAR = 0.1;

type Fit = { cp: number; wPrime: number; r2: number; n: number };

function fitPoints(pts: MmpPoint[], minSpan: number): Fit | null {
  // Need efforts spread over the window, not just a cluster of similar durations.
  if (pts.length < 3) return null;
  const span = Math.max(...pts.map((p) => p.secs)) / Math.min(...pts.map((p) => p.secs));
  if (span < minSpan) return null;
  const fit = linearFit(
    pts.map((p) => p.secs),
    pts.map((p) => p.secs * p.watts),
  );
  if (!(fit.slope > 0) || !(fit.intercept > 0)) return null;
  return { cp: fit.slope, wPrime: fit.intercept, r2: fit.r2, n: pts.length };
}

const inWindow = (mmp: MmpPoint[], minSecs: number, maxSecs: number) => mmp.filter((p) => p.secs >= minSecs && p.secs <= maxSecs && p.watts > 0);

/** The point of the curve closest to `secs`, within 10%. */
function near(mmp: MmpPoint[], secs: number): MmpPoint | null {
  let best: MmpPoint | null = null;
  for (const p of mmp) {
    if (!(p.watts > 0) || Math.abs(p.secs - secs) > secs * NEAR) continue;
    if (!best || Math.abs(p.secs - secs) < Math.abs(best.secs - secs)) best = p;
  }
  return best;
}

export function fitCriticalPower(mmp: MmpPoint[]): CpFit | null {
  // The three efforts of the test; a curve without those durations (a few points only) gives all it has up to 12'.
  const test = CP_TEST_SECS.map((s) => near(mmp, s));
  const points = test.every((p) => p !== null) ? (test as MmpPoint[]) : inWindow(mmp, CP_MIN_SECS, CP_MAX_SECS);
  const classic = fitPoints(points, 2.5);
  if (!classic) return null;
  // The best 20' join the fit only as an all-out effort.
  const long = near(mmp, CP_LONG_SECS);
  const withLong = long && long.watts >= cpPredict(classic, CP_LONG_SECS) * CP_LONG_MAXIMAL ? fitPoints([...points, long], 2.5) : null;
  const fit = withLong ?? classic;
  const short = fitPoints(inWindow(mmp, CP_MIN_SECS, CP_SHORT_MAX_SECS), 2);
  const reliable = !short || (short.cp - fit.cp) / short.cp <= CP_DISAGREEMENT;
  return {
    cp: fit.cp,
    wPrime: fit.wPrime,
    r2: fit.r2,
    eftp: fit.cp * FTP_FROM_CP,
    pointsUsed: fit.n,
    shortCp: short?.cp ?? null,
    reliable,
    upToSecs: withLong ? CP_LONG_SECS : CP_MAX_SECS,
  };
}

/** Power the model predicts can be held for `secs` (valid roughly 2–20 min). */
export function cpPredict(fit: Pick<CpFit, "cp" | "wPrime">, secs: number): number {
  return fit.cp + fit.wPrime / secs;
}
