// DFA α1 (detrended fluctuation analysis, short-term exponent) from beat-to-beat RR intervals, for the live
// view of the trainer player. Method as used by Rogers & Gronwald: 2-minute window, artefacts corrected first,
// box sizes 4–16 beats. α1 ≈ 1 at easy intensity, 0.75 ≈ first ventilatory threshold (HRVT1),
// 0.5 ≈ second (HRVT2); below 0.5 the signal is uncorrelated. Valid only with an ECG chest strap (e.g. Polar H10).
import { linearFit } from "./stats";

export const DFA_VT1 = 0.75;
export const DFA_VT2 = 0.5;
export const DFA_WINDOW_SECS = 120;
/** Above this share of corrected beats the value is shown as unreliable. */
export const DFA_MAX_ARTIFACT_PCT = 5;

const MIN_RR_MS = 250; // 240 bpm
const MAX_RR_MS = 2000; // 30 bpm
/** A beat further than this from the local median is an artefact (missed or extra beat). */
const ARTIFACT_TOLERANCE = 0.2;
const MIN_BOX = 4;
const MAX_BOX = 16;
/** Fewer beats than this in the window: not enough boxes for the largest scale. */
const MIN_BEATS = 4 * MAX_BOX;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Replaces artefacts (out-of-range beats and beats far from the local median) with that median. */
export function correctArtifacts(rr: number[]): { rr: number[]; artifacts: number } {
  const out = [...rr];
  let artifacts = 0;
  for (let i = 0; i < rr.length; i++) {
    const near = rr.slice(Math.max(0, i - 5), i).concat(rr.slice(i + 1, i + 6)).filter((x) => x >= MIN_RR_MS && x <= MAX_RR_MS);
    if (near.length < 3) continue;
    const m = median(near);
    if (rr[i] < MIN_RR_MS || rr[i] > MAX_RR_MS || Math.abs(rr[i] - m) > ARTIFACT_TOLERANCE * m) {
      out[i] = m;
      artifacts++;
    }
  }
  return { rr: out, artifacts };
}

/** Short-term scaling exponent α1 of a series of RR intervals (ms); null when the series is too short. */
export function dfaAlpha1(rr: number[]): number | null {
  const n = rr.length;
  if (n < MIN_BEATS) return null;
  const avg = rr.reduce((s, x) => s + x, 0) / n;
  // Integrated (profile) series.
  const y: number[] = [];
  let acc = 0;
  for (const x of rr) y.push((acc += x - avg));

  const logN: number[] = [];
  const logF: number[] = [];
  for (let box = MIN_BOX; box <= MAX_BOX; box++) {
    const boxes = Math.floor(n / box);
    let sq = 0;
    let count = 0;
    // Boxes from the start and from the end, so the leftover beats are used too.
    for (const fromEnd of [false, true]) {
      for (let b = 0; b < boxes; b++) {
        const start = fromEnd ? n - (b + 1) * box : b * box;
        const xs = Array.from({ length: box }, (_, k) => k);
        const ys = y.slice(start, start + box);
        const { intercept, slope } = linearFit(xs, ys);
        for (let k = 0; k < box; k++) sq += (ys[k] - (intercept + slope * k)) ** 2;
        count += box;
      }
    }
    const f = Math.sqrt(sq / count);
    if (f > 0) {
      logN.push(Math.log10(box));
      logF.push(Math.log10(f));
    }
  }
  if (logN.length < 3) return null;
  return linearFit(logN, logF).slope;
}

export type DfaLive = {
  alpha1: number | null;
  /** Corrected beats in the window, %. */
  artifactPct: number;
  beats: number;
  /** Seconds of RR data in the window (less than the full window at the start). */
  coveredSecs: number;
  /** Still filling the first window. */
  warmingUp: boolean;
  reliable: boolean;
};

/** α1 of the last `windowSecs` of RR intervals (ms, oldest first). */
export function dfaLive(rr: number[], windowSecs = DFA_WINDOW_SECS): DfaLive {
  const win: number[] = [];
  let secs = 0;
  for (let i = rr.length - 1; i >= 0 && secs < windowSecs; i--) {
    win.unshift(rr[i]);
    secs += rr[i] / 1000;
  }
  const { rr: clean, artifacts } = correctArtifacts(win);
  const artifactPct = win.length ? (100 * artifacts) / win.length : 0;
  const warmingUp = secs < windowSecs * 0.95;
  const alpha1 = warmingUp ? null : dfaAlpha1(clean);
  return {
    alpha1,
    artifactPct,
    beats: win.length,
    coveredSecs: secs,
    warmingUp,
    reliable: alpha1 !== null && artifactPct <= DFA_MAX_ARTIFACT_PCT,
  };
}

/** Where α1 sits against the thresholds. */
export function dfaZone(alpha1: number): "sotto VT1" | "tra VT1 e VT2" | "sopra VT2" {
  if (alpha1 >= DFA_VT1) return "sotto VT1";
  if (alpha1 >= DFA_VT2) return "tra VT1 e VT2";
  return "sopra VT2";
}
