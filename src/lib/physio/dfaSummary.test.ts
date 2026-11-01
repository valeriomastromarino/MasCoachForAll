import { describe, expect, it } from "vitest";
import { summarizeDfa, type DfaPoint } from "./dfaSummary";

// 60 minutes in 10-second buckets: first half comfortable (α1 0.9), second half drifting to 0.6, last 5 min near VT2.
function ride(): DfaPoint[] {
  const pts: DfaPoint[] = [];
  for (let i = 0; i < 360; i++) {
    const min = (i * 10) / 60;
    const dfa = min < 30 ? 0.9 : min < 55 ? 0.6 : 0.5;
    pts.push({ t: i * 10, watts: min < 30 ? 150 : 190, hr: min < 30 ? 120 : 140, dfa });
  }
  return pts;
}

describe("DFA α1 summary", () => {
  it("returns null when the ride has no DFA", () => {
    expect(summarizeDfa([{ t: 0, watts: 100, hr: 100, dfa: null }], 10)).toBeNull();
    expect(summarizeDfa([], 10)).toBeNull();
  });

  it("counts minutes in each zone and the average", () => {
    const s = summarizeDfa(ride(), 10)!;
    expect(s.minuti).toEqual({ sopra_075: 30, tra_075_e_05: 30, sotto_05: 0 });
    expect(s.copertura_pct).toBe(100);
    expect(s.durata_con_dfa_min).toBe(60);
    expect(s.media).toBeCloseTo((30 * 0.9 + 25 * 0.6 + 5 * 0.5) / 60, 2);
  });

  it("reports power and HR near the thresholds", () => {
    const s = summarizeDfa(ride(), 10)!;
    expect(s.vicino_a_05).toEqual({ minuti: 5, watt_medi: 190, fc_media: 140 });
    expect(s.vicino_a_075).toBeNull(); // never within ±0.05 of 0.75
  });

  it("builds a series of about five-minute windows", () => {
    const s = summarizeDfa(ride(), 10)!;
    expect(s.serie).toHaveLength(12);
    expect(s.serie[0]).toEqual({ minuto: 0, watt: 150, fc: 120, dfa: 0.9 });
    expect(s.serie[11].dfa).toBe(0.5);
  });

  it("keeps long rides to at most 80 rows and ignores gaps in the coverage", () => {
    const long: DfaPoint[] = Array.from({ length: 2000 }, (_, i) => ({ t: i * 30, watts: 140, hr: 125, dfa: i % 4 === 0 ? null : 0.8 }));
    const s = summarizeDfa(long, 30)!;
    expect(s.serie.length).toBeLessThanOrEqual(80);
    expect(s.copertura_pct).toBe(75);
  });
});
