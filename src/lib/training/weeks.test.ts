import { describe, expect, it } from "vitest";
import type { LibraryWorkout } from "@/lib/calendar";
import { addDays } from "@/lib/dates";
import { zoneOfFraction } from "@/lib/workout";
import { planSeason, type SeasonSetup } from "./season";
import { suggestWorkout, type SuggestInput, type SuggestProfile } from "./suggest";
import { choicesOf, freezeWeek, moveChoice, seasonWeeks, setChoice } from "./weeks";

let id = 0;
/** Blocks as [minutes, fraction of FTP]. */
function wp(name: string, blocks: [number, number][], tss: number): LibraryWorkout {
  return { id: ++id, name, type: "Ride", secs: Math.round(blocks.reduce((s, b) => s + b[0] * 60, 0)), tss, description: null, blocks: blocks.map(([m, pct]) => ({ secs: Math.round(m * 60), zone: zoneOfFraction(pct), pct })) };
}
const rep = (n: number, work: [number, number], rest: [number, number]) => Array.from({ length: n }, () => [work, rest]).flat() as [number, number][];
const LIB: LibraryWorkout[] = [
  wp("Recovery 45", [[45, 0.5]], 18),
  wp("Zone 2 Endurance 60 Indoor", [[10, 0.55], [45, 0.68], [5, 0.5]], 41),
  wp("Zone 2 Endurance 90", [[10, 0.55], [70, 0.68], [10, 0.5]], 63),
  wp("Zone 2 Endurance 120", [[15, 0.55], [95, 0.68], [10, 0.5]], 85),
  wp("Long Z2 3h", [[15, 0.55], [150, 0.68], [15, 0.5]], 130),
  wp("Long Z2 3h + finale SST", [[15, 0.55], [120, 0.68], ...rep(2, [12, 0.9], [6, 0.6]), [9, 0.5]], 150),
  wp("30/15 3x13 Indoor", [[15, 0.6], ...rep(13, [0.5, 1.2], [0.25, 0.55]), [2, 0.5], ...rep(13, [0.5, 1.2], [0.25, 0.55]), [2, 0.5], ...rep(13, [0.5, 1.2], [0.25, 0.55]), [9, 0.5]], 70),
  wp("VO2 5x3 Indoor", [[15, 0.6], ...rep(5, [3, 1.15], [3, 0.5]), [10, 0.5]], 62),
  wp("Sweet Spot 3x10 Indoor", [[12, 0.6], ...rep(3, [10, 0.9], [4, 0.5]), [5, 0.5]], 57),
  wp("Sweet Spot 2x20 Indoor", [[10, 0.6], ...rep(2, [20, 0.9], [5, 0.5]), [5, 0.5]], 64),
  wp("Threshold 2x15 Indoor", [[12, 0.6], ...rep(2, [15, 0.98], [5, 0.5]), [8, 0.5]], 66),
];
const SHEET: SuggestProfile = { giorni: [1, 2, 3, 5, 6], lunga: "Domenica", intervalliDove: "Rulli", z2Dove: "Fuori", ruliMax: "1 h", sedutaMin: "45 min", durataFeriali: "2 h", durataWeekend: "5 h", disciplina: "Strada" };
const TODAY = "2026-11-10"; // a Tuesday
const setup: SeasonSetup = { start: "2026-11-05", horizonWeeks: 20, raceA: null, peak: { start: "2027-03-01", weeks: 4 }, ramp: "prudente", stops: [], maxHours: 10 };
const base: SuggestInput = { date: TODAY, readiness: "verde", tsbYesterday: -5, ctl: 40, recent: [], library: LIB, profile: SHEET, phenotype: null, ftp: 260, indoorFtp: 250 };
const weeksOf = (s: SeasonSetup) => seasonWeeks({ plan: planSeason({ ...s, start: TODAY }, 40, [], s.start), setup: s, today: TODAY, base, calendar: [], done: [], weeks: 4 });

describe("seasonWeeks", () => {
  it("lays out every week day by day, with the quality days and the long ride, the past days of this week as done or rest", () => {
    const weeks = weeksOf(setup);
    expect(weeks).toHaveLength(4);
    expect(weeks[0].days[0]).toMatchObject({ date: "2026-11-09", kind: "rest" });
    const w1 = weeks[1];
    expect(w1.days).toHaveLength(7);
    expect(w1.quality).toBeLessThanOrEqual(2);
    expect(w1.days[6]).toMatchObject({ kind: "prop", slot: "long" });
    expect(w1.days[4].kind).toBe("off");
  });

  it("keeps the other days as they were when the athlete moves one", () => {
    const before = weeksOf(setup)[2];
    const ids = (w: typeof before) => w.days.map((d) => d.workout?.id ?? null);
    const frozen = freezeWeek(before, TODAY);
    const tue = before.days[1].date;
    const wed = before.days[2].date;
    const moved: SeasonSetup = { ...setup, weekPlans: { [before.week.start]: moveChoice(frozen, tue, wed) } };
    const after = weeksOf(moved)[2];
    expect(after.frozen).toBe(true);
    expect(after.days[2]).toMatchObject({ kind: "mine" });
    expect(after.days[2].workout?.id).toBe(ids(before)[1]);
    expect(after.days[1].workout?.id ?? null).toBe(ids(before)[2]);
    // Thursday to Sunday did not move.
    expect(ids(after).slice(3)).toEqual(ids(before).slice(3));
  });

  it("warns when a change puts two quality days in a row or more quality than the week allows", () => {
    const w = weeksOf(setup)[1];
    const vo2 = LIB.find((x) => x.name === "VO2 5x3 Indoor")!.id;
    const ss = LIB.find((x) => x.name === "Sweet Spot 3x10 Indoor")!.id;
    let plan = freezeWeek(w, TODAY);
    plan = setChoice(plan, w.days[1].date, vo2);
    plan = setChoice(plan, w.days[2].date, ss);
    plan = setChoice(plan, w.days[3].date, vo2);
    const after = weeksOf({ ...setup, weekPlans: { [w.week.start]: plan } })[1];
    expect(after.warnings.some((x) => x.includes("di fila"))).toBe(true);
    expect(after.warnings.some((x) => x.includes("sedute di qualità"))).toBe(true);
  });

  it("collects every fixed day for the engine", () => {
    const s: SeasonSetup = { ...setup, weekPlans: { "2026-11-16": [{ date: "2026-11-17", id: 1, mine: true }], "2026-11-23": [{ date: "2026-11-24", id: null, mine: true }] } };
    expect(choicesOf(s).map((c) => c.date)).toEqual(["2026-11-17", "2026-11-24"]);
    expect(choicesOf(null)).toEqual([]);
  });
});

describe("a day fixed in the Stagione page", () => {
  const vo2 = LIB.find((x) => x.name === "VO2 5x3 Indoor")!;
  const friday = "2026-11-13";
  const chosen = [{ date: friday, id: vo2.id, mine: true }];
  it("is the day's workout when green, even on a day the sheet leaves free", () => {
    const s = suggestWorkout({ ...base, date: friday, chosen });
    expect(s.kind === "workout" && s.main.workout.name).toBe("VO2 5x3 Indoor");
    if (s.kind === "workout") expect(s.main.reasons[0]).toContain("scelto tu");
  });
  it("gives way to a yellow readiness or to today's requests", () => {
    const tue = addDays(friday, -3);
    const yellow = suggestWorkout({ ...base, date: tue, readiness: "giallo", chosen: [{ date: tue, id: vo2.id, mine: true }] });
    expect(yellow.kind === "workout" && yellow.main.cls).toMatch(/z2|recupero/);
    const asked = suggestWorkout({ ...base, date: tue, chosen: [{ date: tue, id: vo2.id, mine: true }], override: { easier: true } });
    expect(asked.kind === "workout" && asked.main.cls).toMatch(/z2|recupero/);
  });
  it("is a rest when the athlete chose rest", () => {
    expect(suggestWorkout({ ...base, date: "2026-11-11", chosen: [{ date: "2026-11-11", id: null, mine: true }] })).toMatchObject({ kind: "rest" });
  });
});
