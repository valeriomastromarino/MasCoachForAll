import { describe, expect, it } from "vitest";
import { efficiencyTrend, eftpTrend, monthRecords, planVsDone, sleepSeries, weekDays, weeklyZones } from "./insights";
import type { IcuActivity, IcuEvent } from "./intervals/types";
import { bestMeanFrom, combineDurability, durabilityLevel, rideDurability } from "./physio/durability";

const ride = (date: string, extra: Partial<IcuActivity> = {}): IcuActivity => ({
  id: `a-${date}-${extra.name ?? ""}`,
  start_date_local: `${date}T09:00:00`,
  type: "Ride",
  moving_time: 3600,
  ...extra,
});

describe("eftpTrend", () => {
  it("keeps the last value of each day, in date order", () => {
    const out = eftpTrend([
      ride("2026-10-02", { icu_rolling_ftp: 240 }),
      ride("2026-10-01", { icu_rolling_ftp: 238.4, icu_ftp: 250 }),
      { ...ride("2026-10-02", { icu_rolling_ftp: 242 }), start_date_local: "2026-10-02T18:00:00" },
      ride("2026-10-03"),
    ]);
    expect(out).toEqual([
      { date: "2026-10-01", eftp: 238, ftp: 250 },
      { date: "2026-10-02", eftp: 242, ftp: null },
    ]);
  });
});

describe("monthRecords", () => {
  it("reads the curves at the record durations", () => {
    const curve = (f: number) => ({ secs: [5, 60, 300, 1200, 3600], values: [900, 400, 300, 250, 220].map((v) => v * f) });
    const rows = monthRecords(curve(1), curve(1), curve(0.9));
    expect(rows[2]).toEqual({ secs: 300, current: 300, previous: 270, best84: 300 });
    expect(monthRecords(null, null, null)[0].current).toBeNull();
  });
});

describe("planVsDone", () => {
  const today = "2026-10-29"; // Thursday; week starts Monday 26
  const events: IcuEvent[] = [
    { id: 1, start_date_local: "2026-10-27T00:00:00", category: "WORKOUT", icu_training_load: 60, moving_time: 3600 },
    { id: 2, start_date_local: "2026-10-27T00:00:00", category: "NOTE", icu_training_load: 999 },
    { id: 3, start_date_local: "2026-11-03T00:00:00", category: "WORKOUT", icu_training_load: 80, moving_time: 7200 },
    { id: 4, start_date_local: "2026-10-20T00:00:00", category: "WORKOUT", icu_training_load: 100, moving_time: 7200 },
  ];
  const load = new Map([
    ["2026-10-21", 90],
    ["2026-10-27", 55],
  ]);
  const weeks = planVsDone(events, load, [ride("2026-10-27"), ride("2026-10-21", { moving_time: 5400 })], today, 1, 1);

  it("adds planned workouts only and splits past, current and next week", () => {
    expect(weeks.map((w) => [w.week, w.when, w.planned, w.done])).toEqual([
      ["2026-10-19", "past", 100, 90],
      ["2026-10-26", "current", 60, 55],
      ["2026-11-02", "next", 80, 0],
    ]);
    expect(weeks[0].doneHours).toBe(1.5);
  });

  it("lists the current week day by day", () => {
    const days = weekDays(events, [ride("2026-10-27", { name: "Z2", icu_training_load: 55 })], today);
    expect(days).toHaveLength(7);
    expect(days[1].planned).toHaveLength(1);
    expect(days[1].done[0]).toMatchObject({ name: "Z2", load: 55 });
  });
});

describe("weeklyZones", () => {
  it("sums hours per zone and ignores the overlapping sweet spot", () => {
    const out = weeklyZones(
      [ride("2026-10-27", { icu_zone_times: [{ id: "Z2", secs: 3600 }, { id: "SS", secs: 1800 }, { id: "Z3", secs: 1800 }] })],
      "2026-10-29",
      2,
    );
    expect(out[1]).toMatchObject({ week: "2026-10-26", Z2: 1, Z3: 0.5, total: 1.5 });
    expect(out[0].total).toBe(0);
  });
});

describe("sleepSeries", () => {
  it("converts to hours and averages the last 7 nights once 3 are known", () => {
    const days = ["2026-10-01", "2026-10-02", "2026-10-03"];
    const out = sleepSeries(
      days.map((id, i) => ({ id, sleepSecs: (7 + i) * 3600, sleepScore: 80 })),
      days,
    );
    expect(out[1].avg7).toBeNull();
    expect(out[2]).toMatchObject({ hours: 9, score: 80, avg7: 8 });
  });
});

describe("efficiencyTrend", () => {
  it("keeps endurance rides only and smooths EF over the last 5", () => {
    const out = efficiencyTrend(
      [
        ride("2026-10-01", { icu_intensity: 70, icu_efficiency_factor: 1.4 }),
        ride("2026-10-02", { icu_intensity: 92, icu_efficiency_factor: 1.8 }),
        ride("2026-10-03", { icu_intensity: 68, icu_efficiency_factor: 1.6 }),
      ],
      "2026-09-01",
    );
    expect(out.map((r) => r.date)).toEqual(["2026-10-01", "2026-10-03"]);
    expect(out[1].efAvg).toBeCloseTo(1.5);
  });
});

describe("durability", () => {
  it("finds the best mean power after a given point", () => {
    const w = [100, 100, 300, 300, null, 200];
    expect(bestMeanFrom(w, 0, 2)).toBe(300);
    expect(bestMeanFrom(w, 4, 2)).toBe(100);
    expect(bestMeanFrom(w, 5, 2)).toBeNull();
  });

  it("compares efforts after 2 and 3 hours across rides", () => {
    // 2.5 h ride: steady 150 W, then a 20' effort at 250 W after 2 h.
    const long = Array.from({ length: 9000 }, (_, i) => (i >= 7300 && i < 8500 ? 250 : 150));
    const r = rideDurability(long);
    expect(r.kjAt[0]).toBe(1080);
    expect(r.kjAt[1]).toBeNull();
    expect(r.best[0][3]).toBe(250);
    const [m2, m3] = combineDurability([r, rideDurability(new Array(3600).fill(200))]);
    expect(m2).toMatchObject({ rides: 1, avgKj: 1080 });
    expect(m3.rides).toBe(0);
    expect(durabilityLevel(0.96)).toBe("ottima");
    expect(durabilityLevel(0.85)).toBe("da migliorare");
  });
});
