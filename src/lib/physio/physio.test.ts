import { describe, expect, it } from "vitest";
import { cpPredict, fitCriticalPower } from "./criticalPower";
import { classifyDistribution, seilerDistribution } from "./distribution";
import { hrZones } from "./hrZones";
import { assessAutonomic } from "./autonomic";
import { analyzeHrv } from "./hrv";
import { computePmc, formZone, rampRate } from "./pmc";
import { normalizedPower, powerZones, tss } from "./power";
import { assessReadiness } from "./readiness";

describe("power (Coggan)", () => {
  it("builds the 7 zones for FTP 250", () => {
    const z = powerZones(250);
    expect(z.map((x) => x.max)).toEqual([138, 188, 225, 263, 300, 375, null]);
    expect(z[1].min).toBe(139);
  });

  it("NP equals average for steady power", () => {
    expect(normalizedPower(Array(600).fill(200))).toBeCloseTo(200, 6);
  });

  it("NP exceeds average for variable power", () => {
    const w = Array.from({ length: 1200 }, (_, i) => (Math.floor(i / 60) % 2 ? 300 : 100));
    expect(normalizedPower(w)).toBeGreaterThan(200);
  });

  it("one hour at FTP is 100 TSS", () => {
    expect(tss(3600, 250, 250)).toBeCloseTo(100, 6);
  });
});

describe("HR zones (Friel)", () => {
  it("anchors to LTHR", () => {
    const z = hrZones(170);
    expect(z[0].max).toBe(138);
    expect(z[3].max).toBe(168);
  });
});

describe("PMC", () => {
  it("converges toward a constant daily load", () => {
    const days = Array.from({ length: 400 }, (_, i) => ({ date: String(i), load: 60 }));
    const pmc = computePmc(days);
    const last = pmc[pmc.length - 1];
    expect(last.ctl).toBeCloseTo(60, 0);
    expect(last.atl).toBeCloseTo(60, 3);
    expect(last.tsb).toBeCloseTo(0, 0);
  });

  it("TSB is form going into the day (uses yesterday's values)", () => {
    const pmc = computePmc([{ date: "d", load: 100 }], { ctl: 50, atl: 70 });
    expect(pmc[0].tsb).toBe(-20);
  });

  it("ramp rate is the 7-day CTL change", () => {
    const pts = Array.from({ length: 10 }, (_, i) => ({ ctl: i * 2 }));
    expect(rampRate(pts)).toBe(14);
  });

  it("form zones scale with CTL", () => {
    expect(formZone(-15, 60)).toBe("ottimale");
    expect(formZone(-20, 60)).toBe("alto rischio");
    expect(formZone(-20, 100)).toBe("ottimale");
    expect(formZone(10, 60)).toBe("fresco");
    expect(formZone(15, 60)).toBe("transizione");
  });
});

describe("HRV (Altini)", () => {
  const day = (i: number) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
  // Deterministic noise around 60 ms.
  const noise = (i: number) => Math.sin(i * 1.7) * 4;

  it("needs enough history", () => {
    const a = analyzeHrv(Array.from({ length: 10 }, (_, i) => ({ date: day(i), rmssd: 60 })));
    expect(a.today.status).toBe("dati insufficienti");
  });

  it("is in normal range for stable data", () => {
    const a = analyzeHrv(Array.from({ length: 70 }, (_, i) => ({ date: day(i), rmssd: 60 + noise(i) })));
    expect(a.today.status).toBe("nella norma");
    expect(a.today.acuteDrop).toBe(false);
  });

  it("flags a suppressed 7-day baseline", () => {
    const data = Array.from({ length: 70 }, (_, i) => ({ date: day(i), rmssd: (i >= 63 ? 45 : 60) + noise(i) }));
    const a = analyzeHrv(data);
    expect(a.today.status).toBe("sotto la norma");
    expect(a.today.acuteDrop).toBe(true);
  });

  it("ignores missing nights", () => {
    const data = Array.from({ length: 70 }, (_, i) => ({ date: day(i), rmssd: i % 5 === 0 ? null : 60 + noise(i) }));
    expect(analyzeHrv(data).today.status).toBe("nella norma");
  });

});

describe("HRV + resting HR (Altini)", () => {
  const N = 70;
  const dates = Array.from({ length: N }, (_, i) => String(i));
  const ln = (i: number) => Math.log(60 + Math.sin(i * 1.7) * 4);
  const hr = (i: number) => 45 + Math.round(Math.cos(i * 1.3) * 1.5);

  it("is stable when both markers are normal", () => {
    const a = assessAutonomic(dates, dates.map((_, i) => ln(i)), dates.map((_, i) => hr(i)));
    expect(a.pattern).toBe("stabile");
    expect(a.anomalyDates).toEqual([]);
  });

  it("flags a stress response and consecutive anomalous nights", () => {
    const sick = (i: number) => i >= N - 3;
    const a = assessAutonomic(
      dates,
      dates.map((_, i) => (sick(i) ? Math.log(42) : ln(i))),
      dates.map((_, i) => (sick(i) ? 53 : hr(i))),
    );
    expect(a.pattern).toBe("stress");
    expect(a.severity).toBe(2);
    expect(a.anomalyStreak).toBe(3);
    expect(a.anomalyToday).toBe(true);
  });

  it("does not call an HRV-only drop an anomaly", () => {
    const a = assessAutonomic(
      dates,
      dates.map((_, i) => (i >= N - 7 ? Math.log(48) : ln(i))),
      dates.map((_, i) => hr(i)),
    );
    expect(a.pattern).toBe("hrv_basso");
    expect(a.anomalyToday).toBe(false);
  });

  it("reads low HRV with low resting HR as possible saturation", () => {
    const a = assessAutonomic(
      dates,
      dates.map((_, i) => (i >= N - 7 ? Math.log(48) : ln(i))),
      dates.map((_, i) => (i >= N - 7 ? 40 : hr(i))),
    );
    expect(a.pattern).toBe("saturazione");
  });

  it("reads lower resting HR with normal HRV as adaptation", () => {
    const a = assessAutonomic(
      dates,
      dates.map((_, i) => ln(i)),
      dates.map((_, i) => (i >= N - 7 ? 41 : hr(i))),
    );
    expect(a.pattern).toBe("adattamento");
  });
});

describe("Critical Power", () => {
  it("recovers CP and W′ from model-generated efforts", () => {
    const truth = { cp: 265, wPrime: 20000 };
    const mmp = [180, 300, 480, 720, 1200].map((s) => ({ secs: s, watts: cpPredict(truth, s) }));
    const fit = fitCriticalPower(mmp)!;
    expect(fit.cp).toBeCloseTo(265, 3);
    expect(fit.wPrime).toBeCloseTo(20000, 0);
    expect(fit.eftp).toBeCloseTo(254.4, 1);
    expect(fit.reliable).toBe(true);
  });

  it("flags sub-maximal long efforts", () => {
    const truth = { cp: 245, wPrime: 16000 };
    const mmp = [180, 240, 300, 420, 480, 600, 900, 1200].map((s) => ({
      secs: s,
      // Nothing all-out beyond 8 minutes: long efforts fall well below the model.
      watts: cpPredict(truth, s) * (s > 480 ? 0.85 : 1),
    }));
    const fit = fitCriticalPower(mmp)!;
    expect(fit.reliable).toBe(false);
    expect(fit.shortCp!).toBeCloseTo(245, 0);
    expect(fit.cp).toBeLessThan(fit.shortCp!);
  });

  it("refuses a fit without spread of durations", () => {
    expect(fitCriticalPower([{ secs: 300, watts: 300 }, { secs: 360, watts: 295 }, { secs: 400, watts: 290 }])).toBeNull();
  });
});

describe("Seiler distribution", () => {
  it("classifies a pyramidal week", () => {
    const d = seilerDistribution([
      [
        { id: "Z1", secs: 3000 },
        { id: "Z2", secs: 9000 },
        { id: "Z3", secs: 2000 },
        { id: "Z4", secs: 1000 },
        // Sweet spot overlaps Z3/Z4 and must not be double counted.
        { id: "SS", secs: 1500 },
      ],
    ]);
    expect(d.low).toBeCloseTo(0.8, 6);
    expect(classifyDistribution(d)).toBe("piramidale");
  });
});

describe("readiness", () => {
  const base = { ln: 4.1, baseline7: 4.1, low: 4.0, high: 4.2, acuteDrop: false, cv7: 3, cv7Prev: 3 };
  const calm = { pattern: "stabile" as const, explanation: "ok", severity: 0 as const, anomalyToday: false, anomalyStreak: 0 };
  it("is green when all is normal", () => {
    const r = assessReadiness({ hrv: { ...base, status: "nella norma" }, autonomic: calm, ctl: 60, tsb: -5, sleepHours: 7.5 });
    expect(r.level).toBe("verde");
  });
  it("is red with a stress response and repeated anomalies", () => {
    const r = assessReadiness({
      hrv: { ...base, status: "sotto la norma", acuteDrop: true },
      autonomic: { pattern: "stress", explanation: "stress", severity: 2, anomalyToday: true, anomalyStreak: 2 },
      ctl: 60,
      tsb: -30,
      sleepHours: 7,
    });
    expect(r.level).toBe("rosso");
  });
  it("is yellow with HRV down only", () => {
    const r = assessReadiness({
      hrv: { ...base, status: "sotto la norma" },
      autonomic: { ...calm, pattern: "hrv_basso", severity: 1 },
      ctl: 60,
      tsb: -5,
      sleepHours: 7.5,
    });
    expect(r.level).toBe("giallo");
  });
});
