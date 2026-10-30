// Analysis of field fitness tests recorded at 1 Hz.
//
// FTP:
//   - ramp / incremental tests: 0.75 × the best 1-minute power (MAP) is only a population average, so the
//     estimate combines two individual readings (see rampFtp):
//       · the fraction of MAP, moved within ~0.72–0.80 by where the HR deflection falls (late and close
//         to HRmax → the rider sustains a higher fraction);
//       · the HR deflection corrected for cardiac lag: HR trails power by ~60–90 s in a ramp, so the
//         steady-state threshold ≈ deflection power − ramp slope × 1–1.5 min.
//     The result is a value with a range plus the field test that would confirm it. With slow ramps
//     (long steps) MAP is lower relative to threshold and 0.75 underestimates FTP, so we flag it.
//   - 20' test: 95% of the 20' average (Allen & Coggan).
//   - 2×8' test: 90% of the best 8' (Carmichael / CTS).
//
// Threshold HR:
//   - Heart-rate deflection point (Conconi), detected objectively with the Dmax method (Kara et al.):
//     fit HR vs power with a cubic, draw the chord between its ends, take the point of the curve farthest
//     *above* the chord. Many athletes show no deflection (Jeukendrup 1997; Bodner & Rhodes 2000), so a
//     weak bend is reported as "not evident" rather than forced.
//   - DFA α1 thresholds (Rogers & Gronwald): α1 = 0.75 ≈ first ventilatory threshold (HRVT1),
//     α1 = 0.5 ≈ second (HRVT2), from a linear fit of α1 against HR / power over the ramp.
import { isNum, linearFit, mean } from "./stats";

export type HrPowerPoint = { watts: number; hr: number };

export type FtpEstimate = { method: string; watts: number; basis: string; low?: number; high?: number };

/** How a ramp FTP was built, step by step, so the card and the coach can show the reasoning. */
export type RampFtp = {
  /** The textbook value, 0.75 × MAP. */
  standard: number;
  fraction: { low: number; high: number; why: string };
  /** MAP × the individual fraction. */
  fromMap: { low: number; high: number };
  /** Deflection power minus slope × 1–1.5 min; null without a clear deflection. */
  fromDeflection: { low: number; high: number } | null;
  /** HR on the ramp curve at 0.75 × MAP. */
  hrAtStandard: number | null;
  /** Field tests that would confirm the estimate. */
  validation: string[];
};

export type HrDeflection = {
  found: boolean;
  /** HR and power at the deflection point (null when not found). */
  hr: number | null;
  watts: number | null;
  /** Normalised distance of the bend from the chord (0–1 scale on both axes). */
  strength: number;
  points: HrPowerPoint[];
  fit: HrPowerPoint[];
};

export type DfaThreshold = { hr: number; watts: number };

export type DfaThresholds = { vt1: DfaThreshold | null; vt2: DfaThreshold | null; r2: number };

export type TestProtocol = "rampa" | "20 minuti" | "2×8 minuti" | "sconosciuto";

export type TestResult = {
  protocol: TestProtocol;
  ftp: FtpEstimate | null;
  best1: number | null;
  best5: number | null;
  best8: number | null;
  best20: number | null;
  /** Average ramp slope, W/min (ramp tests only). */
  rampRate: number | null;
  hrMax: number | null;
  deflection: HrDeflection | null;
  /** Ramp tests: HR on the fitted HR–power curve at the estimated FTP. Indicative only (HR lags in a ramp). */
  hrAtFtp: number | null;
  /** Ramp tests: the individual FTP estimate and its reasoning. */
  ramp: RampFtp | null;
  dfa: DfaThresholds | null;
  warnings: string[];
};

/** Cardiac lag behind power in a ramp, minutes (≈ 60–90 s). */
export const HR_LAG_MIN = [1, 1.5] as const;

const round5 = (w: number, dir: "down" | "up") => (dir === "down" ? Math.floor(w / 5) * 5 : Math.ceil(w / 5) * 5);

/** Fraction of MAP sustained at threshold, from where the HR deflection falls. */
function mapFraction(map: number, deflection: HrDeflection | null, hrMax: number | null): RampFtp["fraction"] {
  if (!deflection?.found || deflection.watts === null || deflection.hr === null) {
    return { low: 0.73, high: 0.77, why: "nessun flesso della FC: frazione media di popolazione" };
  }
  const atMap = deflection.watts / map;
  const atHrMax = hrMax ? deflection.hr / hrMax : null;
  const where = `flesso al ${Math.round(atMap * 100)}% del MAP${atHrMax !== null ? ` e al ${Math.round(atHrMax * 100)}% della FC max` : ""}`;
  if (atMap >= 0.85 && atHrMax !== null && atHrMax >= 0.94) return { low: 0.78, high: 0.8, why: `${where}: soglia alta rispetto al MAP` };
  if (atMap < 0.78) return { low: 0.72, high: 0.75, why: `${where}: soglia bassa rispetto al MAP` };
  return { low: 0.75, high: 0.78, why: `${where}: frazione intermedia` };
}

/** Individual ramp FTP: MAP fraction and lag-corrected HR deflection, averaged, with a range of at least ±5 W. */
export function rampFtp(
  map: number,
  rampRate: number | null,
  deflection: HrDeflection | null,
  hrMax: number | null,
): RampFtp & { watts: number; low: number; high: number } {
  const fraction = mapFraction(map, deflection, hrMax);
  const fromMap = { low: map * fraction.low, high: map * fraction.high };
  const fromDeflection =
    deflection?.found && deflection.watts !== null && rampRate !== null && rampRate > 0
      ? { low: deflection.watts - rampRate * HR_LAG_MIN[1], high: deflection.watts - rampRate * HR_LAG_MIN[0] }
      : null;
  const mids = [fromMap, fromDeflection].filter((r) => r !== null).map((r) => (r.low + r.high) / 2);
  const watts = Math.round(mids.reduce((a, b) => a + b, 0) / mids.length);
  const low = round5(Math.min(...mids, watts - 5), "down");
  const high = round5(Math.max(...mids, watts + 5), "up");
  const standard = Math.round(map * 0.75);
  const twenty = round5(watts / 0.95, "down");
  const validation = hrMax
    ? [
        `20' da fresco a ritmo uniforme intorno a ${twenty}–${twenty + 5} W: la stima è confermata se la FC resta stabile sotto ${Math.round(hrMax * 0.97)} bpm (FTP = 95% della media).`,
        `Se a ${watts} W la FC supera ${Math.round(hrMax * 0.98)} bpm prima di 15–20', la soglia è più bassa: scendi di 5–10 W.`,
      ]
    : [`20' da fresco a ritmo uniforme intorno a ${twenty}–${twenty + 5} W (FTP = 95% della media).`];
  validation.push(`In alternativa 2×20' a ${watts - 5}–${watts} W: se reggono senza deriva della FC, la soglia è corretta.`);
  return {
    watts,
    low,
    high,
    standard,
    fraction,
    fromMap: { low: Math.round(fromMap.low), high: Math.round(fromMap.high) },
    fromDeflection: fromDeflection && { low: Math.round(fromDeflection.low), high: Math.round(fromDeflection.high) },
    hrAtStandard: deflection ? hrOnCurve(deflection.fit, standard) : null,
    validation,
  };
}

/** Below this ramp slope the 75%-of-MAP rule tends to underestimate FTP. */
export const FAST_RAMP_W_PER_MIN = 10;
/** Minimum normalised bend for a heart-rate deflection to count as real. */
export const DEFLECTION_MIN_STRENGTH = 0.03;

export function bestAverage(values: (number | null)[], window: number): { avg: number; end: number } | null {
  if (values.length < window) return null;
  let sum = 0;
  let best = -Infinity;
  let end = -1;
  for (let i = 0; i < values.length; i++) {
    sum += values[i] ?? 0;
    if (i >= window) sum -= values[i - window] ?? 0;
    if (i >= window - 1 && sum / window > best) {
      best = sum / window;
      end = i;
    }
  }
  return end < 0 ? null : { avg: best, end };
}

function windowMean(values: (number | null)[] | undefined, from: number, to: number): number | null {
  if (!values) return null;
  const xs = values.slice(from, to).filter(isNum);
  return xs.length ? mean(xs) : null;
}

/** Solves a small dense linear system (Gaussian elimination with partial pivoting). */
function solve(a: number[][], b: number[]): number[] {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r;
    [m[c], m[p]] = [m[p], m[c]];
    for (let r = c + 1; r < n; r++) {
      const f = m[r][c] / m[c][c];
      for (let k = c; k <= n; k++) m[r][k] -= f * m[c][k];
    }
  }
  const x = Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = m[r][n];
    for (let k = r + 1; k < n; k++) s -= m[r][k] * x[k];
    x[r] = s / m[r][r];
  }
  return x;
}

/** Least-squares polynomial fit; returns coefficients c0..cdeg. */
export function polyfit(xs: number[], ys: number[], deg: number): number[] {
  const n = deg + 1;
  const ata = Array.from({ length: n }, () => Array(n).fill(0));
  const aty = Array(n).fill(0);
  for (let i = 0; i < xs.length; i++) {
    const pows = Array.from({ length: 2 * n - 1 }, (_, k) => xs[i] ** k);
    for (let r = 0; r < n; r++) {
      aty[r] += pows[r] * ys[i];
      for (let c = 0; c < n; c++) ata[r][c] += pows[r + c];
    }
  }
  return solve(ata, aty);
}

const evalPoly = (c: number[], x: number) => c.reduce((s, ck, k) => s + ck * x ** k, 0);

/** Dmax heart-rate deflection on HR–power pairs from an incremental test. */
export function hrDeflection(points: HrPowerPoint[]): HrDeflection | null {
  if (points.length < 8) return null;
  const wMin = Math.min(...points.map((p) => p.watts));
  const wMax = Math.max(...points.map((p) => p.watts));
  const hMin = Math.min(...points.map((p) => p.hr));
  const hMax = Math.max(...points.map((p) => p.hr));
  if (wMax - wMin < 50 || hMax - hMin < 10) return null;
  // Normalise both axes so the result does not depend on W vs bpm scales.
  const nx = (w: number) => (w - wMin) / (wMax - wMin);
  const ny = (h: number) => (h - hMin) / (hMax - hMin);
  const c = polyfit(points.map((p) => nx(p.watts)), points.map((p) => ny(p.hr)), 3);
  const y0 = evalPoly(c, 0);
  const y1 = evalPoly(c, 1);
  // Signed distance from the chord (0, y0)–(1, y1); positive = curve above the chord (HR bends down).
  const len = Math.hypot(1, y1 - y0);
  let best = { x: 0, d: -Infinity };
  for (let k = 0; k <= 200; k++) {
    const x = k / 200;
    const d = (evalPoly(c, x) - (y0 + (y1 - y0) * x)) / len;
    if (d > best.d) best = { x, d };
  }
  const toW = (x: number) => wMin + x * (wMax - wMin);
  const toH = (y: number) => hMin + y * (hMax - hMin);
  const found = best.d >= DEFLECTION_MIN_STRENGTH && best.x > 0.05 && best.x < 0.95;
  return {
    found,
    hr: found ? Math.round(toH(evalPoly(c, best.x))) : null,
    watts: found ? Math.round(toW(best.x)) : null,
    strength: Math.max(0, best.d),
    points,
    fit: Array.from({ length: 41 }, (_, k) => ({ watts: toW(k / 40), hr: toH(evalPoly(c, k / 40)) })),
  };
}

/** HR and power where DFA α1 crosses 0.75 and 0.5, from linear fits over the ramp. */
export function dfaThresholds(samples: { watts: number; hr: number; dfa: number }[]): DfaThresholds | null {
  // Rogers et al. fit the roughly linear decline of α1; very high (> 1.5) and collapsed (< 0.25) values are excluded.
  const s = samples.filter((p) => p.dfa >= 0.25 && p.dfa <= 1.5);
  if (s.length < 6) return null;
  const byHr = linearFit(s.map((p) => p.hr), s.map((p) => p.dfa));
  const byW = linearFit(s.map((p) => p.watts), s.map((p) => p.dfa));
  if (byHr.slope >= 0 || byW.slope >= 0 || byHr.r2 < 0.4) return null;
  const hrRange = [Math.min(...s.map((p) => p.hr)) - 10, Math.max(...s.map((p) => p.hr)) + 10];
  const at = (alpha: number): DfaThreshold | null => {
    const hr = (alpha - byHr.intercept) / byHr.slope;
    const watts = (alpha - byW.intercept) / byW.slope;
    // Do not extrapolate far beyond what the test actually covered.
    if (hr < hrRange[0] || hr > hrRange[1]) return null;
    return { hr: Math.round(hr), watts: Math.round(watts) };
  };
  return { vt1: at(0.75), vt2: at(0.5), r2: byHr.r2 };
}

/** Linear interpolation of HR at a given power on a curve sorted by power. */
export function hrOnCurve(curve: HrPowerPoint[], watts: number): number | null {
  for (let i = 1; i < curve.length; i++) {
    const a = curve[i - 1];
    const b = curve[i];
    if (watts >= a.watts && watts <= b.watts) {
      const f = b.watts === a.watts ? 0 : (watts - a.watts) / (b.watts - a.watts);
      return Math.round(a.hr + f * (b.hr - a.hr));
    }
  }
  return null;
}

export const RAMP_NAME = /\b(ramp|rampa|incrementale|conconi|step test)\b/i;

export function analyzeTest(
  name: string,
  streams: { watts?: (number | null)[]; hr?: (number | null)[]; dfa?: (number | null)[] },
): TestResult | null {
  const watts = streams.watts;
  if (!watts || watts.length < 600) return null;
  const hr = streams.hr;
  const b1 = bestAverage(watts, 60);
  const b5 = bestAverage(watts, 300);
  const b8 = bestAverage(watts, 480);
  const b20 = bestAverage(watts, 1200);
  const hrVals = (hr ?? []).filter(isNum);
  const warnings: string[] = [];

  const base: TestResult = {
    protocol: "sconosciuto",
    ftp: null,
    best1: b1 ? Math.round(b1.avg) : null,
    best5: b5 ? Math.round(b5.avg) : null,
    best8: b8 ? Math.round(b8.avg) : null,
    best20: b20 ? Math.round(b20.avg) : null,
    rampRate: null,
    hrMax: hrVals.length ? Math.max(...hrVals) : null,
    deflection: null,
    hrAtFtp: null,
    ramp: null,
    dfa: null,
    warnings,
  };

  if (RAMP_NAME.test(name) && b1) {
    const peakEnd = b1.end;
    // Ramp start: last moment before the peak with 30 s power below half of MAP.
    let start = 0;
    for (let i = peakEnd; i >= 30; i--) {
      const m = windowMean(watts, i - 30, i);
      if (m !== null && m < 0.5 * b1.avg) {
        start = i;
        break;
      }
    }
    const pairs: HrPowerPoint[] = [];
    const dfaSamples: { watts: number; hr: number; dfa: number }[] = [];
    for (let i = start; i + 30 <= peakEnd + 1; i += 30) {
      const w = windowMean(watts, i, i + 30);
      const h = windowMean(hr, i, i + 30);
      if (w === null || h === null) continue;
      pairs.push({ watts: w, hr: h });
      const d = windowMean(streams.dfa, i, i + 30);
      if (d !== null) dfaSamples.push({ watts: w, hr: h, dfa: d });
    }
    const startW = windowMean(watts, start, start + 60) ?? 0;
    const minutes = (peakEnd - start) / 60;
    const rampRate = minutes > 0 ? (b1.avg - startW) / minutes : null;
    if (rampRate !== null && rampRate < FAST_RAMP_W_PER_MIN)
      warnings.push(
        `Rampa lenta (circa ${rampRate.toFixed(0)} W/min): la regola del 75% nasce per rampe rapide da 1 minuto per gradino e con gradini lunghi tende a sottostimare la FTP.`,
      );
    const deflection = hrDeflection(pairs);
    const dfa = dfaThresholds(dfaSamples);
    const { watts: ftpWatts, low, high, ...ramp } = rampFtp(b1.avg, rampRate, deflection, base.hrMax);
    if (deflection?.found && deflection.hr !== null && ramp.hrAtStandard !== null && deflection.hr - ramp.hrAtStandard >= 10)
      warnings.push(
        `A ${ramp.standard} W (0,75 × MAP) la FC era ${ramp.hrAtStandard} bpm, ${deflection.hr - ramp.hrAtStandard} sotto il flesso: lì eri ancora sotto soglia, la regola standard sottostima.`,
      );
    if (b20 && b20.end - 1199 < start)
      warnings.push(
        `Il miglior 20' (${Math.round(b20.avg)} W) comprende il riscaldamento: non è uno sforzo massimale e non si usa. Anche 5' e 8' sono pezzi di rampa.`,
      );
    if (!hr) warnings.push("Nessuna frequenza cardiaca registrata: impossibile cercare la soglia FC.");
    else if (!streams.dfa || dfaSamples.length === 0)
      warnings.push("DFA α1 non disponibile: per averlo serve una fascia che registri gli intervalli RR (come la Polar H10) collegata al Garmin.");
    return {
      ...base,
      protocol: "rampa",
      ftp: {
        method: deflection?.found ? "Frazione del MAP e flesso FC corretto" : "Frazione del MAP",
        watts: ftpWatts,
        basis: `MAP ${Math.round(b1.avg)} W`,
        low,
        high,
      },
      rampRate,
      deflection,
      hrAtFtp: deflection ? hrOnCurve(deflection.fit, ftpWatts) : null,
      ramp,
      dfa,
    };
  }

  // Steady-state tests: a real 20' effort averages close to the best 8'; a 2×8' test does not.
  if (b20 && b8 && b20.avg >= 0.93 * b8.avg) {
    const effortHr = windowMean(hr, b20.end - 1199, b20.end + 1);
    const lastTenHr = windowMean(hr, b20.end - 599, b20.end + 1);
    if (lastTenHr !== null)
      warnings.push(
        `FC media negli ultimi 10' dello sforzo: ${Math.round(lastTenHr)} bpm (FC media dei 20': ${Math.round(effortHr ?? 0)} bpm). Con un 20' a tutta è una buona stima della soglia FC (Friel).`,
      );
    return {
      ...base,
      protocol: "20 minuti",
      ftp: { method: "95% dei migliori 20'", watts: Math.round(b20.avg * 0.95), basis: `20' a ${Math.round(b20.avg)} W` },
    };
  }
  if (b8) {
    const effortHr = windowMean(hr, b8.end - 479, b8.end + 1);
    warnings.push(
      `FC media nel miglior 8': ${Math.round(effortHr ?? 0)} bpm. Su sforzi così brevi la FC non arriva a regime: non usarla come soglia.`,
    );
    return {
      ...base,
      protocol: "2×8 minuti",
      ftp: { method: "90% del miglior 8'", watts: Math.round(b8.avg * 0.9), basis: `8' a ${Math.round(b8.avg)} W` },
    };
  }
  return base;
}
