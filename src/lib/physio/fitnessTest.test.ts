import { describe, expect, it } from "vitest";
import { analyzeTest, bestAverage, dfaThresholds, hrDeflection, polyfit, rampFtp } from "./fitnessTest";

/** Ramp: 10' warm-up at 120 W, then +step W every stepSecs until exhaustion. */
function ramp(opts: { stepW: number; stepSecs: number; steps: number; hrOf: (w: number) => number; dfaOf?: (w: number) => number }) {
  const watts: number[] = [];
  const hr: number[] = [];
  const dfa: number[] = [];
  const push = (w: number) => {
    watts.push(w);
    hr.push(opts.hrOf(w));
    dfa.push(opts.dfaOf ? opts.dfaOf(w) : NaN);
  };
  for (let t = 0; t < 600; t++) push(120);
  for (let s = 0; s < opts.steps; s++) for (let t = 0; t < opts.stepSecs; t++) push(140 + s * opts.stepW);
  for (let t = 0; t < 300; t++) push(80);
  return { watts, hr, dfa: opts.dfaOf ? dfa : undefined };
}

describe("fitness tests", () => {
  it("finds the best rolling average", () => {
    const b = bestAverage([100, 100, 300, 300, 100], 2)!;
    expect(b.avg).toBe(300);
    expect(b.end).toBe(3);
  });

  it("fits a cubic exactly", () => {
    const xs = [0, 0.2, 0.4, 0.6, 0.8, 1];
    const c = polyfit(xs, xs.map((x) => 1 + 2 * x - 3 * x ** 2 + 0.5 * x ** 3), 3);
    expect(c[0]).toBeCloseTo(1, 6);
    expect(c[3]).toBeCloseTo(0.5, 6);
  });

  it("ramp FTP rules on a real ramp: late deflection close to HRmax → ≈ 260 W, not 243", () => {
    // MAP 325 W, measured slope 16 W/min, HR deflection 165 bpm at 284 W, HRmax 173.
    const deflection = { found: true, hr: 165, watts: 284, strength: 0.07, points: [], fit: [] };
    const r = rampFtp(325, 16, deflection, 173);
    expect(r.standard).toBe(244);
    // 284/325 = 87% of MAP and 165/173 = 95% of HRmax → the rider sustains a high fraction of MAP.
    expect(r.fraction).toMatchObject({ low: 0.78, high: 0.8 });
    expect(r.fromMap).toEqual({ low: 254, high: 260 });
    // Lag correction: 284 − 16 × 1.5 … 284 − 16 × 1.
    expect(r.fromDeflection).toEqual({ low: 260, high: 268 });
    expect(r.watts).toBe(260);
    expect([r.low, r.high]).toEqual([255, 265]);
    expect(r.validation[0]).toContain("168 bpm");
  });

  it("ramp with a late HR deflection: the estimate rises above 0.75 × MAP", () => {
    // HR linear up to 330 W, then flattens close to HRmax: threshold high relative to MAP.
    const r = ramp({ stepW: 20, stepSecs: 60, steps: 12, hrOf: (w) => (w <= 330 ? 40 + w * 0.4 : 172 + (w - 330) * 0.1) });
    const t = analyzeTest("Test FTP incrementale", { watts: r.watts, hr: r.hr })!;
    expect(t.best1).toBe(360);
    expect(t.ramp!.standard).toBe(270);
    expect(t.ramp!.fromDeflection).not.toBeNull();
    expect(t.ftp!.watts).toBeGreaterThan(275);
    expect(t.ftp!.watts).toBeLessThan(295);
    expect(t.ftp!.low!).toBeLessThanOrEqual(t.ftp!.watts - 5);
    expect(t.ftp!.high!).toBeGreaterThanOrEqual(t.ftp!.watts + 5);
    expect(t.ramp!.validation).toHaveLength(3);
    // At 270 W the HR was still on the linear part, well below the deflection; the best 20' includes the warm-up.
    expect(t.warnings.some((w) => w.includes("sotto il flesso"))).toBe(true);
    expect(t.warnings.some((w) => w.includes("riscaldamento"))).toBe(true);
  });

  it("ramp without a deflection: population fraction, FTP ≈ 75% of MAP, fast ramp raises no warning", () => {
    // 1-minute steps of 20 W: classic fast ramp.
    const r = ramp({ stepW: 20, stepSecs: 60, steps: 10, hrOf: (w) => 60 + w * 0.4 });
    const t = analyzeTest("Ramp test", { watts: r.watts, hr: r.hr })!;
    expect(t.protocol).toBe("rampa");
    expect(t.best1).toBe(320);
    expect(t.ftp!.watts).toBe(240);
    expect(t.warnings.some((w) => w.startsWith("Rampa lenta"))).toBe(false);
    // HR = 60 + 0.4·W, so at FTP 240 W the curve gives 156 bpm.
    expect(t.hrAtFtp).toBe(156);
  });

  it("ramp: warns when steps are long (slow ramp)", () => {
    const r = ramp({ stepW: 12.5, stepSecs: 180, steps: 13, hrOf: (w) => 60 + w * 0.4 });
    const t = analyzeTest("cyclonlab ramp test", { watts: r.watts, hr: r.hr })!;
    expect(t.warnings.some((w) => w.startsWith("Rampa lenta"))).toBe(true);
  });

  it("finds a clear heart-rate deflection where HR bends", () => {
    // HR linear up to 260 W, then rises at a third of the slope (classic Conconi curve).
    const hrOf = (w: number) => (w <= 260 ? 60 + w * 0.4 : 164 + (w - 260) * 0.13);
    const pts = Array.from({ length: 25 }, (_, i) => 140 + i * 8).map((w) => ({ watts: w, hr: hrOf(w) }));
    const d = hrDeflection(pts)!;
    expect(d.found).toBe(true);
    expect(d.watts!).toBeGreaterThan(235);
    expect(d.watts!).toBeLessThan(285);
    expect(d.hr!).toBeGreaterThan(155);
    expect(d.hr!).toBeLessThan(170);
  });

  it("reports no deflection on a linear HR response", () => {
    const pts = Array.from({ length: 25 }, (_, i) => 140 + i * 8).map((w) => ({ watts: w, hr: 60 + w * 0.4 }));
    expect(hrDeflection(pts)!.found).toBe(false);
  });

  it("does not call an accelerating HR curve a deflection", () => {
    const pts = Array.from({ length: 25 }, (_, i) => 140 + i * 8).map((w) => ({ watts: w, hr: 100 + ((w - 140) / 190) ** 2 * 80 }));
    expect(hrDeflection(pts)!.found).toBe(false);
  });

  it("derives HRVT1/HRVT2 where DFA α1 crosses 0.75 and 0.5", () => {
    // α1 falls linearly with HR: 1.25 at 120 bpm, 0.25 at 170 bpm → 0.75 at 145, 0.5 at 157.5.
    const samples = Array.from({ length: 20 }, (_, i) => {
      const hr = 120 + i * 2.5;
      return { hr, watts: 100 + i * 10, dfa: 1.25 - (hr - 120) * 0.02 };
    });
    const d = dfaThresholds(samples)!;
    expect(d.vt1!.hr).toBe(145);
    expect(d.vt2!.hr).toBe(158);
    expect(d.vt1!.watts).toBeLessThan(d.vt2!.watts);
  });

  it("2×8' test: FTP is 90% of the best 8'", () => {
    const watts: number[] = [];
    const seg = (w: number, s: number) => watts.push(...Array(s).fill(w));
    seg(150, 1200);
    seg(275, 480);
    seg(100, 600);
    seg(270, 480);
    seg(90, 300);
    const t = analyzeTest("TEST FTP short", { watts, hr: watts.map((w) => 90 + w * 0.27) })!;
    expect(t.protocol).toBe("2×8 minuti");
    expect(t.ftp!.watts).toBe(248);
  });

  it("20' test: FTP is 95% of the 20'", () => {
    const watts = [...Array(900).fill(150), ...Array(1200).fill(260), ...Array(600).fill(100)];
    const t = analyzeTest("Test FTP 20 minuti", { watts, hr: watts.map(() => 160) })!;
    expect(t.protocol).toBe("20 minuti");
    expect(t.ftp!.watts).toBe(247);
  });
});
