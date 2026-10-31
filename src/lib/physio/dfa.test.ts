import { describe, expect, it } from "vitest";
import { correctArtifacts, dfaAlpha1, dfaLive, dfaZone } from "./dfa";

// Deterministic pseudo-random numbers (Park–Miller) and Gaussian noise.
function rng(seed: number) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
function gauss(r: () => number) {
  return Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
}

describe("DFA α1", () => {
  it("is about 0.5 for uncorrelated beats (white noise)", () => {
    const r = rng(7);
    const rr = Array.from({ length: 300 }, () => 600 + 15 * gauss(r));
    expect(dfaAlpha1(rr)).toBeCloseTo(0.5, 0);
    expect(dfaAlpha1(rr)!).toBeLessThan(0.65);
  });

  it("is about 1.5 for a random walk (Brownian)", () => {
    const r = rng(11);
    let x = 0;
    const rr = Array.from({ length: 300 }, () => 800 + (x += 2 * gauss(r)));
    expect(dfaAlpha1(rr)!).toBeGreaterThan(1.3);
  });

  it("needs enough beats", () => {
    expect(dfaAlpha1(Array(40).fill(800))).toBeNull();
  });

  it("corrects missed and extra beats", () => {
    const rr = Array(30).fill(800);
    rr[10] = 1600; // missed beat
    rr[20] = 400; // extra beat
    const c = correctArtifacts(rr);
    expect(c.artifacts).toBe(2);
    expect(c.rr[10]).toBe(800);
    expect(c.rr[20]).toBe(800);
  });

  it("waits for a full 2-minute window, then reports artefacts", () => {
    const r = rng(3);
    const short = Array.from({ length: 100 }, () => 700 + 10 * gauss(r)); // 70 s
    expect(dfaLive(short).warmingUp).toBe(true);
    expect(dfaLive(short).alpha1).toBeNull();
    const full = Array.from({ length: 200 }, () => 700 + 10 * gauss(r));
    full[150] = 1400;
    const live = dfaLive(full);
    expect(live.warmingUp).toBe(false);
    expect(live.alpha1).not.toBeNull();
    expect(live.artifactPct).toBeGreaterThan(0);
    expect(live.reliable).toBe(true);
  });

  it("labels the thresholds", () => {
    expect(dfaZone(1.1)).toBe("sotto VT1");
    expect(dfaZone(0.6)).toBe("tra VT1 e VT2");
    expect(dfaZone(0.4)).toBe("sopra VT2");
  });
});
