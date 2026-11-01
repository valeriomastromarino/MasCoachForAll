// Compact DFA α1 summary of a whole ride, for the coach: the point-by-point stream stays out of the connector,
// so without this the coach only knew "there is DFA" and never saw a number.
// Thresholds follow Rogers & Gronwald: α1 ≈ 0.75 at the first threshold (VT1), ≈ 0.5 at the second (VT2).
import { isNum } from "./stats";

export type DfaPoint = { t: number; watts: number | null; hr: number | null; dfa: number | null };

export type DfaSummary = {
  nota: string;
  durata_con_dfa_min: number;
  /** Share of the ride that has a DFA value (the rest: strap off, artefacts, warm-up). */
  copertura_pct: number;
  media: number;
  minuti: { sopra_075: number; tra_075_e_05: number; sotto_05: number };
  /** Average power and HR while α1 sat within ±0.05 of a threshold; null when it never did. */
  vicino_a_075: { minuti: number; watt_medi: number | null; fc_media: number | null } | null;
  vicino_a_05: { minuti: number; watt_medi: number | null; fc_media: number | null } | null;
  /** One row per window (about 5 minutes; wider on very long rides). */
  serie: { minuto: number; watt: number | null; fc: number | null; dfa: number | null }[];
};

const NEAR = 0.05;
const MAX_ROWS = 80;

const round = (x: number, d: number) => {
  const k = 10 ** d;
  return Math.round(x * k) / k;
};
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const meanOf = (xs: (number | null)[]) => mean(xs.filter(isNum));

function nearThreshold(valid: DfaPoint[], threshold: number, stepMin: number): DfaSummary["vicino_a_075"] {
  const pts = valid.filter((p) => Math.abs(p.dfa! - threshold) <= NEAR);
  if (!pts.length) return null;
  const w = meanOf(pts.map((p) => p.watts));
  const h = meanOf(pts.map((p) => p.hr));
  return { minuti: round(pts.length * stepMin, 1), watt_medi: w === null ? null : Math.round(w), fc_media: h === null ? null : Math.round(h) };
}

/** `points` are the ride buckets (`bucketSecs` apart, ordered by time). Returns null when there is no DFA at all. */
export function summarizeDfa(points: DfaPoint[], bucketSecs: number): DfaSummary | null {
  const valid = points.filter((p) => isNum(p.dfa));
  if (!valid.length || !points.length) return null;
  const stepMin = bucketSecs / 60;
  const count = (f: (d: number) => boolean) => valid.filter((p) => f(p.dfa!)).length;

  const totalSecs = Math.max(...points.map((p) => p.t)) + bucketSecs;
  const winSecs = Math.max(300, Math.ceil(totalSecs / MAX_ROWS / 60) * 60);
  const rows = new Map<number, DfaPoint[]>();
  for (const p of points) {
    const k = Math.floor(p.t / winSecs);
    rows.set(k, [...(rows.get(k) ?? []), p]);
  }
  const serie = [...rows]
    .sort((a, b) => a[0] - b[0])
    .map(([k, ps]) => {
      const w = meanOf(ps.map((p) => p.watts));
      const h = meanOf(ps.map((p) => p.hr));
      const d = meanOf(ps.map((p) => p.dfa));
      return { minuto: Math.round((k * winSecs) / 60), watt: w === null ? null : Math.round(w), fc: h === null ? null : Math.round(h), dfa: d === null ? null : round(d, 2) };
    });

  return {
    nota:
      "DFA α1 da fascia con RR: 0,75 ≈ soglia aerobica (VT1), 0,5 ≈ VT2. Affidabile solo con artefatti < 5%, che da qui non si misurano: " +
      "valuta la qualità dalla fascia e dai tratti senza dato. Il tempo sotto 0,75 in un fondo lungo indica deriva sopra la soglia aerobica.",
    durata_con_dfa_min: round(valid.length * stepMin, 0),
    copertura_pct: Math.round((valid.length / points.length) * 100),
    media: round(mean(valid.map((p) => p.dfa!))!, 2),
    minuti: {
      sopra_075: round(count((d) => d > 0.75) * stepMin, 0),
      tra_075_e_05: round(count((d) => d <= 0.75 && d >= 0.5) * stepMin, 0),
      sotto_05: round(count((d) => d < 0.5) * stepMin, 0),
    },
    vicino_a_075: nearThreshold(valid, 0.75, stepMin),
    vicino_a_05: nearThreshold(valid, 0.5, stepMin),
    serie,
  };
}
