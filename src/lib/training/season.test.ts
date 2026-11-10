import { describe, expect, it } from "vitest";
import { lightWeekAdvice, planFromToday, planSeason, type SeasonSetup, weekFor, weeklyTssForRamp } from "./season";

const base: SeasonSetup = {
  start: "2026-11-05",
  horizonWeeks: 40,
  raceA: null,
  peak: { start: "2027-05-31", weeks: 8 },
  ramp: "prudente",
  stops: [],
  maxHours: null,
};

describe("weeklyTssForRamp", () => {
  it("gives the weekly load that raises the CTL by the ramp: about 400 TSS for +3.5 from CTL 36", () => {
    const tss = weeklyTssForRamp(36, 3.5);
    expect(tss).toBeGreaterThan(380);
    expect(tss).toBeLessThan(420);
    // Holding the CTL needs 7 × CTL.
    expect(Math.round(weeklyTssForRamp(36, 0))).toBe(252);
  });
});

describe("planSeason", () => {
  it("builds weeks from Monday of the first week to the horizon", () => {
    const p = planSeason(base, 36);
    expect(p.weeks).toHaveLength(40);
    expect(p.weeks[0].start).toBe("2026-11-02");
    expect(p.weeks[1].start).toBe("2026-11-09");
  });

  it("puts the peak where the athlete asked, up to 8 weeks, and shortens a longer one", () => {
    const p = planSeason(base, 36);
    expect(p.peakWindow?.start).toBe("2027-05-31");
    expect(p.weeks.filter((w) => w.phase === "peak")).toHaveLength(8);
    const long = planSeason({ ...base, peak: { start: "2027-05-31", weeks: 12 } }, 36);
    expect(long.weeks.filter((w) => w.phase === "peak")).toHaveLength(8);
    expect(long.warnings.some((w) => w.includes("massimo 8"))).toBe(true);
  });

  it("goes base → build → peak → recovery → maintenance, in that order", () => {
    const order = planSeason(base, 36).weeks.map((w) => w.phase);
    const firstOf = (p: string) => order.indexOf(p as never);
    expect(firstOf("base_1")).toBe(0);
    expect(firstOf("base_1")).toBeLessThan(firstOf("base_2"));
    expect(firstOf("base_2")).toBeLessThan(firstOf("base_3"));
    expect(firstOf("base_3")).toBeLessThan(firstOf("build_1"));
    expect(firstOf("build_1")).toBeLessThan(firstOf("build_2"));
    expect(firstOf("build_2")).toBeLessThan(firstOf("peak"));
    const lastPeak = order.lastIndexOf("peak");
    expect(order[lastPeak + 1]).toBe("recupero");
    expect(order[lastPeak + 2]).toBe("mantenimento");
  });

  it("raises the CTL by about the chosen ramp on load weeks and never beyond it", () => {
    const p = planSeason(base, 36);
    let prev = p.ctlStart;
    for (const w of p.weeks) {
      if (w.kind === "carico" && w.phase !== "peak" && w.phase !== "mantenimento") {
        expect(w.ctlEnd - prev).toBeGreaterThan(2.3);
        expect(w.ctlEnd - prev).toBeLessThan(2.7);
      }
      expect(w.ctlEnd - prev).toBeLessThanOrEqual(2.65);
      prev = w.ctlEnd;
    }
  });

  it("makes every 4th load week lighter, with a single short quality session", () => {
    const p = planSeason(base, 36);
    const early = p.weeks.slice(0, 8);
    expect(early.map((w) => w.kind).slice(0, 4)).toEqual(["carico", "carico", "carico", "scarico"]);
    const light = early[3];
    expect(light.tssTarget).toBeLessThan(early[2].tssTarget * 0.8);
    expect(light.qualityMax).toBe(1);
    expect(light.hardMax).toBe(1);
  });

  it("a higher ramp climbs faster, and the hours cap the load and say so", () => {
    const slow = planSeason({ ...base, ramp: "prudente" }, 36);
    const fast = planSeason({ ...base, ramp: "aggressivo" }, 36);
    expect(fast.ctlPeak!).toBeGreaterThan(slow.ctlPeak!);
    const capped = planSeason({ ...base, ramp: "aggressivo", maxHours: 6 }, 36);
    expect(capped.weeks.some((w) => w.limitedByTime)).toBe(true);
    expect(Math.max(...capped.weeks.map((w) => w.tssTarget))).toBeLessThanOrEqual(6 * 55);
    expect(capped.warnings.some((w) => w.includes("ore a settimana"))).toBe(true);
  });

  it("tapers before an A race and marks the race week", () => {
    const p = planSeason({ ...base, peak: null, raceA: { date: "2027-05-09", name: "Granfondo" } }, 36);
    const raceWeek = p.weeks.find((w) => w.kind === "gara")!;
    expect(raceWeek.start).toBe("2027-05-03");
    expect(raceWeek.note).toContain("Granfondo");
    const before = p.weeks[p.weeks.indexOf(raceWeek) - 1];
    expect(before.phase).toBe("taper");
    expect(before.tssTarget).toBeLessThan(p.weeks[p.weeks.indexOf(raceWeek) - 3].tssTarget);
    expect(p.weeks.some((w) => w.phase === "peak")).toBe(true);
  });

  it("zeroes a week of holiday and eases back in after it", () => {
    const p = planSeason({ ...base, stops: [{ from: "2026-11-16", to: "2026-11-22", label: "vacanza" }] }, 36);
    const stop = p.weeks.find((w) => w.start === "2026-11-16")!;
    expect(stop.kind).toBe("stop");
    expect(stop.tssTarget).toBe(0);
    const after = p.weeks.find((w) => w.start === "2026-11-23")!;
    expect(after.kind).toBe("scarico");
    expect(after.note).toContain("Rientro");
    const partial = planSeason({ ...base, stops: [{ from: "2026-11-14", to: "2026-11-15" }] }, 36);
    expect(partial.weeks.find((w) => w.start === "2026-11-09")!.note).toContain("2 giorni di stop");
  });

  it("ignores a goal outside the horizon and says so", () => {
    const p = planSeason({ ...base, peak: { start: "2029-01-01", weeks: 4 }, raceA: { date: "2030-01-01" } }, 36);
    expect(p.peakWindow).toBeNull();
    expect(p.warnings.length).toBeGreaterThanOrEqual(2);
    expect(p.weeks.every((w) => w.phase !== "peak")).toBe(true);
  });

  it("finds the week of a date", () => {
    const p = planSeason(base, 36);
    expect(weekFor(p, "2026-11-11")?.start).toBe("2026-11-09");
    expect(weekFor(p, "2020-01-01")).toBeNull();
    expect(weekFor(null, "2026-11-11")).toBeNull();
  });
});

describe("planFromToday", () => {
  it("starts from the current week and the current CTL, not from the day the setup was made", () => {
    const later = planFromToday(base, "2026-12-14", 41);
    expect(later.weeks[0].start).toBe("2026-12-14");
    expect(later.ctlStart).toBe(41);
    // The weeks already gone are not in it, and the first week is simulated from today's CTL.
    expect(later.weeks[0].ctlEnd - 41).toBeGreaterThan(2);
    expect(later.weeks[0].ctlEnd - 41).toBeLessThan(3);
    // The peak keeps the date the athlete gave.
    expect(later.peakWindow?.start).toBe("2027-05-31");
  });
});

describe("planSeason with illness and injury", () => {
  it("lightens a week with a fever and the week of Z1-Z2 after it, with no hard sessions", () => {
    const life = [{ id: "s", category: "SICK" as const, from: "2026-11-09", to: "2026-11-11" }];
    const p = planFromToday(base, "2026-11-05", 36, life);
    const sick = p.weeks.find((w) => w.start === "2026-11-09")!;
    expect(sick.stopDays).toBe(3);
    expect(sick.easyDays).toBe(4);
    expect(sick.hardMax).toBe(0);
    expect(sick.note).toContain("malattia o infortunio");
    const clear = planFromToday(base, "2026-11-05", 36);
    expect(sick.tssTarget).toBeLessThan(clear.weeks.find((w) => w.start === "2026-11-09")!.tssTarget * 0.5);
    // The peak keeps its date, and the plan says it arrives with less CTL.
    expect(p.peakWindow?.start).toBe(clear.peakWindow?.start);
    expect(p.ctlPeak!).toBeLessThan(clear.ctlPeak!);
  });
  it("keeps an injury at easy days for as long as it lasts", () => {
    const life = [{ id: "i", category: "INJURED" as const, from: "2026-11-16", to: "2026-11-29" }];
    const p = planFromToday(base, "2026-11-05", 36, life);
    const w = p.weeks.find((x) => x.start === "2026-11-23")!;
    expect(w.easyDays).toBeGreaterThanOrEqual(7);
    expect(w.hardMax).toBe(0);
  });
});

describe("quality sessions through the season (method of 10 November 2026)", () => {
  it("has two quality sessions in every load week from the first week of the base, one of them VO2max", () => {
    const p = planSeason(base, 36);
    for (const w of p.weeks.filter((x) => x.kind === "carico" && x.phase !== "recupero")) {
      expect(w.qualityMax).toBe(2);
      expect(w.hardMax).toBeGreaterThanOrEqual(1);
    }
    expect(p.weeks.find((w) => w.phase === "base_1")!.hardMax).toBe(1);
    expect(p.weeks.find((w) => w.phase === "build_2" && w.kind === "carico")!.hardMax).toBe(2);
  });

  it("lets the athlete ask for a block week: three quality sessions, same load", () => {
    const plain = planSeason(base, 36);
    const target = plain.weeks.find((w) => w.phase === "build_1" && w.kind === "carico")!;
    const p = planSeason({ ...base, blockWeeks: [target.start] }, 36);
    const w = p.weeks.find((x) => x.start === target.start)!;
    expect(w.block).toBe(true);
    expect(w.qualityMax).toBe(3);
    expect(w.tssTarget).toBe(target.tssTarget);
    expect(w.note).toContain("blocco");
  });

  it("grows the dose through the base, and steps back a little in a light week", () => {
    const p = planSeason(base, 36);
    const baseWeeks = p.weeks.filter((w) => w.phase.startsWith("base"));
    const load = baseWeeks.filter((w) => w.kind === "carico");
    expect(load[0].step).toBe(0);
    expect(load[load.length - 1].step).toBe(1);
    for (let i = 1; i < load.length; i++) expect(load[i].step).toBeGreaterThanOrEqual(load[i - 1].step);
    const light = baseWeeks.find((w) => w.kind === "scarico")!;
    expect(light.step).toBeLessThan(p.weeks[p.weeks.indexOf(light) - 1].step);
  });

  it("names the race day, and has no quality in the week after the race", () => {
    const p = planSeason({ ...base, peak: null, raceA: { date: "2027-05-09", name: "Granfondo" } }, 36);
    const raceWeek = p.weeks.find((w) => w.kind === "gara")!;
    expect(raceWeek.raceDay).toBe("2027-05-09");
    const after = p.weeks[p.weeks.indexOf(raceWeek) + 1];
    expect(after.phase).toBe("recupero");
    expect(after.qualityMax).toBe(0);
  });
});

describe("planFromToday keeps the season on its dates", () => {
  it("leaves phases, light weeks and doses where they were when the plan is rebuilt weeks later", () => {
    const now = planFromToday(base, "2026-11-05", 36);
    const later = planFromToday(base, "2026-12-14", 41);
    for (const w of later.weeks.slice(0, 16)) {
      const same = now.weeks.find((x) => x.start === w.start)!;
      expect([w.start, w.phase, w.kind, w.step]).toEqual([same.start, same.phase, same.kind, same.step]);
    }
  });
});

describe("lightWeekAdvice", () => {
  const nights = (bad: string[]) => ["2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09", "2026-11-10"].map((date) => ({ date, anomaly: bad.includes(date) }));
  it("suggests a light week after two anomalous nights in 7 days, or with the stress pattern", () => {
    expect(lightWeekAdvice(nights([]), "stabile", "2026-11-10")).toBeNull();
    expect(lightWeekAdvice(nights(["2026-11-08"]), "stabile", "2026-11-10")).toBeNull();
    expect(lightWeekAdvice(nights(["2026-11-06", "2026-11-09"]), "stabile", "2026-11-10")).toContain("2 notti anomale");
    expect(lightWeekAdvice(nights([]), "stress", "2026-11-10")).toContain("stress");
  });
});
