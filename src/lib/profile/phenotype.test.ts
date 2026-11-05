import { describe, expect, it } from "vitest";
import { assessPhenotype, type PhenotypeInput } from "./phenotype";

const base: PhenotypeInput = {
  weightKg: 69,
  ftp: 260,
  wPrimeSetJ: 20740,
  modelWPrimeJ: 30098,
  modelReliable: false,
  best: { s5: 879, m1: 467, m5: 339, m20: 278 },
  recent20: 219,
};

describe("assessPhenotype", () => {
  it("reads a strong top end over a modest threshold as a moderate glycolytic lean", () => {
    const p = assessPhenotype(base);
    expect(p.verdict).toBe("glicolitico");
    expect(p.moderate).toBe(true);
    expect(p.headline).toBe("Tendenza glicolitica moderata");
    expect(p.position).toBeGreaterThan(55);
  });

  it("flags how far to trust it: a worse recent season and an unreliable model W′", () => {
    const p = assessPhenotype(base);
    expect(p.reliability.level).toBe("media");
    expect(p.reliability.reasons).toHaveLength(2);
  });

  it("reads a high FTP for its 5′ power, low sprint and small W′ as diesel", () => {
    const p = assessPhenotype({
      weightKg: 72,
      ftp: 300,
      wPrimeSetJ: 13000,
      modelWPrimeJ: null,
      modelReliable: true,
      best: { s5: 700, m1: 420, m5: 350, m20: 320 },
      recent20: 315,
    });
    expect(p.verdict).toBe("diesel");
    expect(p.position).toBeLessThan(45);
    expect(p.reliability.level).toBe("alta");
  });

  it("calls a balanced profile an all-rounder", () => {
    const p = assessPhenotype({
      weightKg: 70,
      ftp: 250,
      wPrimeSetJ: 17500,
      modelWPrimeJ: null,
      modelReliable: true,
      best: { s5: 700, m1: 400, m5: 326, m20: 260 },
      recent20: 258,
    });
    expect(p.verdict).toBe("all_rounder");
  });

  it("does not judge without data, and works with only some of them", () => {
    const none = assessPhenotype({ weightKg: null, ftp: null, wPrimeSetJ: null, modelWPrimeJ: null, modelReliable: null, best: { s5: null, m1: null, m5: null, m20: null }, recent20: null });
    expect(none.verdict).toBeNull();
    expect(none.position).toBeNull();
    const some = assessPhenotype({ ...base, wPrimeSetJ: null, best: { s5: 879, m1: null, m5: null, m20: null } });
    expect(some.criteria).toHaveLength(1);
    expect(some.reliability.reasons.some((r) => r.includes("Pochi dati"))).toBe(true);
  });
});
