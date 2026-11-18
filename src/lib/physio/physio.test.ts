import { describe, expect, it } from "vitest";
import { cpPredict, fitCriticalPower } from "./criticalPower";
import { classifyDistribution, seilerDistribution } from "./distribution";
import { hrZones } from "./hrZones";
import { assessAutonomic } from "./autonomic";
import { analyzeHrv } from "./hrv";
import { computePmc, formZone, rampRate } from "./pmc";
import { normalizedPower, powerZones, tss } from "./power";
import { assessReadiness, highRiskForm } from "./readiness";

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

  it("TSB is the day's own CTL − ATL, that day's load included (as Intervals.icu)", () => {
    const pmc = computePmc([{ date: "d", load: 100 }], { ctl: 50, atl: 70 });
    expect(pmc[0].tsb).toBeCloseTo(pmc[0].ctl - pmc[0].atl, 10);
    expect(pmc[0].tsb).toBeLessThan(-20 + 8); // the 100-TSS day pushes ATL up faster than CTL
    expect(pmc[0].tsb).toBeGreaterThan(-20 - 8);
  });

  it("ramp rate is the 7-day CTL change", () => {
    const pts = Array.from({ length: 10 }, (_, i) => ({ ctl: i * 2 }));
    expect(rampRate(pts)).toBe(14);
  });

  it("form zones: optimal −10 to −30, high risk below −30", () => {
    expect(formZone(-13)).toBe("ottimale");
    expect(formZone(-30)).toBe("ottimale");
    expect(formZone(-31)).toBe("alto rischio");
    expect(formZone(-9)).toBe("grigia");
    expect(formZone(10)).toBe("fresco");
    expect(formZone(25)).toBe("transizione");
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

  it("keeps the run of anomalous nights when last night was not measured", () => {
    // Two bad nights, then the watch not worn (or not synced yet): the run is read up to the night before.
    const sick = (i: number) => i === N - 3 || i === N - 2;
    const a = assessAutonomic(
      dates,
      dates.map((_, i) => (i === N - 1 ? null : sick(i) ? Math.log(42) : ln(i))),
      dates.map((_, i) => (i === N - 1 ? null : sick(i) ? 53 : hr(i))),
    );
    expect([a.nightMissing, a.anomalyToday, a.anomalyStreak]).toEqual([true, false, 2]);
    const measured = assessAutonomic(dates, dates.map((_, i) => (sick(i) ? Math.log(42) : ln(i))), dates.map((_, i) => (sick(i) ? 53 : hr(i))));
    expect([measured.nightMissing, measured.anomalyStreak]).toEqual([false, 0]);
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
    expect(a.pattern).toBe("adattamento_positivo");
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

  it("fits the three efforts of the classic test, and is not dragged down by an easy 20 minutes", () => {
    // A power curve from normal riding: hard 3' to 12', but nothing all-out near 20'.
    const curve = [[180, 290], [240, 277], [300, 268], [420, 245], [480, 241], [600, 231], [720, 227], [900, 211], [1200, 197], [1800, 179]];
    const fit = fitCriticalPower(curve.map(([secs, watts]) => ({ secs, watts })))!;
    expect(Math.round(fit.cp)).toBe(206);
    expect(fit.wPrime / 1000).toBeCloseTo(15.6, 1);
    expect([fit.pointsUsed, fit.upToSecs, fit.reliable]).toEqual([3, 720, true]);
  });

  it("takes the best 20 minutes in when they are an all-out effort", () => {
    const truth = { cp: 250, wPrime: 18000 };
    const secs = [180, 300, 420, 600, 720, 1200];
    const allOut = fitCriticalPower(secs.map((s) => ({ secs: s, watts: cpPredict(truth, s) * (s === 1200 ? 0.97 : 1) })))!;
    expect([allOut.pointsUsed, allOut.upToSecs]).toEqual([4, 1200]);
    expect(allOut.cp).toBeLessThan(250);
    expect(allOut.cp).toBeGreaterThan(240);
    const easy = fitCriticalPower(secs.map((s) => ({ secs: s, watts: cpPredict(truth, s) * (s === 1200 ? 0.9 : 1) })))!;
    expect([easy.pointsUsed, easy.upToSecs]).toEqual([3, 720]);
    expect(easy.cp).toBeCloseTo(250, 3);
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
  const base = { ln: 4.1, baseline7: 4.1, low: 4.0, high: 4.2, acuteDrop: false, sd7: 0.08, sd60: 0.1 };
  const calm = { pattern: "stabile" as const, explanation: "ok", severity: 0 as const, anomalyToday: false, anomalyStreak: 0 };
  const stress = { pattern: "stress" as const, explanation: "stress", severity: 2 as const, anomalyToday: false, anomalyStreak: 0 };
  const fine = { tsb: -5, tsbYesterday: -5, sleepNights: [7.5, 7, 7.2] };
  it("is green when all is normal", () => {
    const r = assessReadiness({ hrv: { ...base, status: "nella norma" }, autonomic: calm, ...fine });
    expect(r.level).toBe("verde");
  });
  it("is red with a stress response and repeated anomalies", () => {
    const r = assessReadiness({
      hrv: { ...base, status: "sotto la norma", acuteDrop: true },
      autonomic: { ...stress, anomalyToday: true, anomalyStreak: 2 },
      ...fine,
    });
    expect(r.level).toBe("rosso");
  });
  it("is yellow with HRV down only", () => {
    const r = assessReadiness({
      hrv: { ...base, status: "sotto la norma" },
      autonomic: { ...calm, pattern: "hrv_basso", severity: 1 },
      ...fine,
    });
    expect(r.level).toBe("giallo");
  });
  it("counts short sleep only when it happens in two of the last three nights", () => {
    const hrvDown = { hrv: { ...base, status: "sotto la norma" as const }, autonomic: { ...calm, pattern: "hrv_basso" as const, severity: 1 as const } };
    const once = assessReadiness({ ...hrvDown, ...fine, sleepNights: [7, 5.5, 7] });
    const twice = assessReadiness({ ...hrvDown, ...fine, sleepNights: [5.5, 7, 5] });
    expect(once.reasons.some((x) => x.includes("ultime 3 notti"))).toBe(false);
    expect(twice.reasons.some((x) => x.includes("ultime 3 notti"))).toBe(true);
    expect(twice.level).toBe("giallo"); // 1 (pattern) + 1 (sleep) = 2
    const twiceAndForm = assessReadiness({ ...hrvDown, ...fine, sleepNights: [5.5, 7, 5], tsbYesterday: -31 });
    expect(twiceAndForm.level).toBe("rosso"); // 1 + 1 + 1
  });
  it("judges high risk on yesterday's form with the app zone: TSB below −30, whatever the CTL", () => {
    expect(highRiskForm(-31)).toBe(true);
    expect(highRiskForm(-30)).toBe(false);
    expect(highRiskForm(-19)).toBe(false); // used to count as high risk at CTL 60 (−31.7 %)
    expect(highRiskForm(-16)).toBe(false); // used to count as high risk at CTL 30
    expect(highRiskForm(null)).toBe(false);
  });
  it("does not add the form on top of a stress pattern, but keeps the sleep", () => {
    const risky = { ...fine, tsbYesterday: -31 };
    const noSleep = assessReadiness({ hrv: { ...base, status: "sotto la norma" }, autonomic: stress, ...risky });
    expect(noSleep.level).toBe("giallo"); // 2, form not counted
    const withSleep = assessReadiness({
      hrv: { ...base, status: "sotto la norma" },
      autonomic: stress,
      ...risky,
      sleepNights: [5, 5.5, 7],
    });
    expect(withSleep.level).toBe("rosso"); // 2 + 1
  });
  it("caps a stable pattern with a single acute signal at yellow", () => {
    const r = assessReadiness({
      hrv: { ...base, status: "nella norma", acuteDrop: true },
      autonomic: calm,
      tsb: -35,
      tsbYesterday: -31,
      sleepNights: [5, 5, 7],
    });
    expect(r.level).toBe("giallo"); // 1 + 1 + 1 would be red
  });
  it("adds a point when the 7-day SD is far above the 60-day SD and HRV is down", () => {
    const hrvDown = { ...base, status: "sotto la norma" as const };
    const hrvBasso = { ...calm, pattern: "hrv_basso" as const, severity: 1 as const };
    const steady = assessReadiness({ hrv: { ...hrvDown, sd7: 0.1 }, autonomic: hrvBasso, ...fine });
    const unstable = assessReadiness({ hrv: { ...hrvDown, sd7: 0.2 }, autonomic: hrvBasso, ...fine });
    expect(steady.reasons.some((x) => x.includes("instabile"))).toBe(false);
    expect(unstable.reasons.some((x) => x.includes("instabile"))).toBe(true);
  });
});
