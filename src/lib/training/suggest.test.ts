import { describe, expect, it } from "vitest";
import type { LibraryWorkout } from "@/lib/calendar";
import { addDays } from "@/lib/dates";
import { workoutBlocks, zoneOfFraction } from "@/lib/workout";
import { QUALITY } from "./classify";
import { planSeason, type SeasonSetup } from "./season";
import { carbsFor, classifyWorkout, fuelFor, parseCap, planWeek, suggestWorkout, toleratedCarbs, type RecentActivity, type SuggestInput, type SuggestProfile } from "./suggest";

let id = 0;
/** Blocks are [minutes, zone] pairs. */
function wk(name: string, blocks: [number, number][], tss: number): LibraryWorkout {
  return { id: ++id, name, type: "Ride", secs: blocks.reduce((s, b) => s + b[0] * 60, 0), tss, description: null, blocks: blocks.map(([m, zone]) => ({ secs: m * 60, zone })) };
}
const rep = (n: number, work: [number, number], rest: [number, number]) => Array.from({ length: n }, () => [work, rest]).flat() as [number, number][];

const LIB: LibraryWorkout[] = [
  wk("Active Recovery Spin 45", [[5, 1], [35, 1], [5, 1]], 14),
  wk("Zone 2 Endurance 90", [[10, 2], [70, 2], [10, 1]], 62),
  wk("Zone 2 Endurance 150", [[10, 2], [130, 2], [10, 1]], 100),
  wk("Zone 2 Endurance 60 Indoor", [[10, 2], [45, 2], [5, 1]], 38),
  wk("Sweet Spot 3x12", [[10, 2], ...rep(3, [12, 3], [5, 1]), [5, 1]], 78),
  wk("Threshold 4x8", [[15, 2], ...rep(4, [8, 4], [4, 1]), [10, 1]], 85),
  wk("Threshold 3x10 Indoor", [[15, 2], ...rep(3, [10, 4], [5, 1]), [10, 1]], 75),
  wk("VO2 Max 5x4", [[15, 2], ...rep(5, [4, 5], [4, 1]), [10, 1]], 88),
  wk("MTB VO2 5x4 Climbs", [[15, 2], ...rep(5, [4, 5], [4, 1]), [10, 1]], 88),
  wk("Anaerobic 10x45sec", [[15, 2], ...rep(10, [0.75, 6], [2.5, 1]), [10, 1]], 52),
  wk("Flying Sprints 8x20sec", [[20, 1], ...rep(8, [0.33, 7], [4, 1]), [15, 1]], 61),
  wk("RCA Benchmark Test", [[15, 2], [20, 5], [10, 1]], 60),
  wk("MTB Race Week Spin Indoor", [[10, 1], [20, 2], [5, 1]], 20),
  wk("Fasted MTB 90", [[10, 2], [70, 2], [10, 1]], 60),
];

const base: SuggestInput = {
  date: "2026-11-04", // Wednesday
  readiness: "verde",
  tsbYesterday: -5,
  ctl: 40,
  recent: [],
  library: LIB,
  phenotype: null,
  ftp: 260,
  indoorFtp: 250,
};
const act = (date: string, name: string, IF: number, tss: number): RecentActivity => ({ date, name, IF, tss, movingTime: 3600 });

describe("classifyWorkout", () => {
  const cls = (name: string) => classifyWorkout(LIB.find((w) => w.name === name)!);
  it("reads the type from the zones and the name", () => {
    expect(cls("Active Recovery Spin 45").cls).toBe("recupero");
    expect(cls("Zone 2 Endurance 90").cls).toBe("z2");
    expect(cls("Sweet Spot 3x12").cls).toBe("sweetspot");
    expect(cls("Threshold 4x8").cls).toBe("soglia");
    expect(cls("VO2 Max 5x4").cls).toBe("vo2");
    expect(cls("Anaerobic 10x45sec").cls).toBe("anaerobico");
    expect(cls("Flying Sprints 8x20sec").cls).toBe("sprint");
    expect(cls("Flying Sprints 8x20sec").hard).toBe(false);
    expect(cls("RCA Benchmark Test").cls).toBe("test");
    expect(cls("MTB Race Week Spin Indoor").cls).toBe("gara");
  });
  it("flags place, discipline and the longest block above Z2", () => {
    expect(cls("Zone 2 Endurance 60 Indoor").indoor).toBe(true);
    expect(cls("MTB VO2 5x4 Climbs").mtb).toBe(true);
    expect(cls("Fasted MTB 90").fasted).toBe(true);
    expect(cls("Threshold 4x8").longestWork).toBe(8);
  });
});

describe("suggestWorkout", () => {
  const pick = (over: Partial<SuggestInput> = {}) => {
    const s = suggestWorkout({ ...base, ...over });
    if (s.kind !== "workout") throw new Error(`atteso un allenamento, ricevuto: ${s.reason}`);
    return s;
  };

  it("proposes a hard session when green, rested and no hard work this week", () => {
    const s = pick({ profile: { disciplina: "Strada" } });
    expect(["soglia", "vo2"]).toContain(s.main.cls);
    expect(s.main.workout.name).not.toMatch(/MTB/);
  });

  it("gives only Z1 for 45 minutes when red", () => {
    const s = pick({ readiness: "rosso" });
    expect(s.main.cls).toBe("recupero");
    expect(s.main.mins).toBeLessThanOrEqual(45);
  });

  it("gives Z2 when yellow and no hard work when grey", () => {
    expect(pick({ readiness: "giallo" }).main.cls).toBe("z2");
    expect(pick({ readiness: "grigio" }).main.cls).not.toMatch(/soglia|vo2|anaerobico/);
  });

  it("does not stack hard days: easy the day after a hard one", () => {
    const s = pick({ recent: [act("2026-11-03", "Threshold 4x8", 0.9, 85)] });
    expect(["z2", "recupero"]).toContain(s.main.cls);
  });

  it("stops at the weekly limit of hard sessions", () => {
    const s = pick({ recent: [act("2026-10-30", "x", 0.9, 80), act("2026-11-01", "y", 0.88, 80)] });
    expect(s.main.cls).not.toMatch(/soglia|vo2|anaerobico/);
    const aggressive = pick({ profile: { rischio: "Aggressivo" }, recent: [act("2026-10-30", "x", 0.9, 80), act("2026-11-01", "y", 0.88, 80)] });
    expect(aggressive.main.cls).toMatch(/soglia|vo2|anaerobico|sweetspot|z2/);
  });

  it("no hard work when yesterday's form is in the high-risk zone", () => {
    expect(pick({ tsbYesterday: -35 }).main.cls).not.toMatch(/soglia|vo2|anaerobico/);
  });

  it("rests on a day the athlete can't train, and after five days in a row", () => {
    const off = suggestWorkout({ ...base, profile: { giorni: [0, 2] } });
    expect(off.kind).toBe("workout"); // Wednesday = 2
    expect(suggestWorkout({ ...base, date: "2026-11-05", profile: { giorni: [0, 2] } })).toMatchObject({ kind: "rest" });
    const streak = ["2026-11-03", "2026-11-02", "2026-11-01", "2026-10-31", "2026-10-30"].map((d) => act(d, "z", 0.6, 50));
    expect(suggestWorkout({ ...base, recent: streak })).toMatchObject({ kind: "rest" });
  });

  it("respects the hours available, the place and the discipline", () => {
    const short = pick({ profile: { durataFeriali: "1 h" }, readiness: "giallo" });
    expect(short.main.mins).toBeLessThanOrEqual(65);
    expect(pick({ place: "indoor", readiness: "giallo" }).main.indoor).toBe(true);
    expect(pick({ place: "outdoor" }).main.indoor).toBe(false);
    const road = pick({ profile: { disciplina: "Strada" } });
    expect(road.main.workout.name).not.toMatch(/MTB/);
    expect(road.alternatives.every((a) => !/MTB/.test(a.workout.name))).toBe(true);
  });

  it("keeps fasted workouts out unless the athlete accepts them, and tests and race-week sessions out always", () => {
    const names = (s: ReturnType<typeof pick>) => [s.main, ...s.alternatives].map((p) => p.workout.name);
    for (const r of ["verde", "giallo", "grigio", "rosso"] as const) {
      const all = names(pick({ readiness: r }));
      expect(all.some((n) => /Fasted|Benchmark|Race Week/.test(n))).toBe(false);
    }
  });

  it("prefers a workout not done in the last days", () => {
    const first = pick({ readiness: "giallo" }).main.workout.name;
    const second = pick({ readiness: "giallo", recent: [act("2026-11-02", first, 0.65, 60)] }).main.workout.name;
    expect(second).not.toBe(first);
  });

  it("takes the weak end first for the power profile", () => {
    expect(pick({ phenotype: "glicolitico" }).main.cls).toMatch(/soglia|sweetspot/);
    expect(pick({ phenotype: "diesel" }).main.cls).toMatch(/vo2|anaerobico/);
  });

  it("says which FTP applies and how many carbs", () => {
    const out = pick({ place: "outdoor" });
    expect(out.main.ftpNote).toContain("260");
    const ind = pick({ place: "indoor" });
    expect(ind.main.ftpNote).toContain("250");
    expect(carbsFor({ mins: 45, cls: "z2" })).toContain("0 g/h");
    expect(carbsFor({ mins: 90, cls: "z2" })).toBe("30-45 g/h");
    expect(carbsFor({ mins: 90, cls: "soglia" })).toBe("45-60 g/h");
    expect(carbsFor({ mins: 180, cls: "z2" })).toBe("60-90 g/h");
  });

  it("never suggests more carbs than the athlete tolerates (prompt §8.2)", () => {
    expect(toleratedCarbs("Meno di 30")).toBe(30);
    expect(toleratedCarbs("30-60")).toBe(60);
    expect(toleratedCarbs("60-90")).toBe(90);
    expect(toleratedCarbs("Oltre 90")).toBeNull();
    expect(toleratedCarbs("Non so")).toBeNull();
    expect(toleratedCarbs(undefined)).toBeNull();
    expect(carbsFor({ mins: 180, cls: "z2" }, 60)).toBe("60 g/h");
    expect(carbsFor({ mins: 90, cls: "soglia" }, 30)).toBe("30 g/h");
    expect(carbsFor({ mins: 90, cls: "z2" }, 30)).toBe("30 g/h");
    expect(carbsFor({ mins: 180, cls: "z2" }, 90)).toBe("60-90 g/h");
    expect(carbsFor({ mins: 45, cls: "z2" }, 30)).toContain("0 g/h");
    expect(fuelFor({ mins: 180, cls: "z2" }, 60).cappedAt).toBe(60);
    expect(fuelFor({ mins: 90, cls: "z2" }, 60).cappedAt).toBeNull();
    const capped = pick({ profile: { carboTollerati: "Meno di 30" } });
    expect(capped.main.carbs).toBe("30 g/h");
  });

  it("gives alternatives of other types and says when the library has nothing that fits", () => {
    const s = pick();
    expect(new Set([s.main.cls, ...s.alternatives.map((a) => a.cls)]).size).toBe(1 + s.alternatives.length);
    const none = suggestWorkout({ ...base, library: [], readiness: "verde" });
    expect(none.kind).toBe("rest");
  });
});

describe("planWeek", () => {
  it("builds seven days that respect the hard limit and leave a day off or of active recovery (prompt §11)", () => {
    const week = planWeek({ ...base, date: "2026-11-02", profile: { rischio: "Bilanciato" } });
    expect(week).toHaveLength(7);
    const hard = week.filter((d) => d.suggestion?.kind === "workout" && /soglia|vo2|anaerobico/.test(d.suggestion.main.cls));
    expect(hard.length).toBeLessThanOrEqual(2);
    expect(week.some((d) => d.suggestion?.kind === "rest" || (d.suggestion?.kind === "workout" && d.suggestion.main.cls === "recupero"))).toBe(true);
  });
  it("keeps what is already planned and counts it for the next days", () => {
    const threshold = LIB.find((w) => w.name === "Threshold 4x8")!;
    const week = planWeek({ ...base, date: "2026-11-02" }, [{ date: "2026-11-02", workout: threshold }]);
    expect(week[0].planned?.name).toBe("Threshold 4x8");
    expect(week[0].suggestion).toBeNull();
    // A hard session today, so tomorrow is easy.
    expect(week[1].suggestion).toMatchObject({ kind: "workout" });
    const tomorrow = week[1].suggestion;
    if (tomorrow?.kind === "workout") expect(["z2", "recupero"]).toContain(tomorrow.main.cls);
  });
  it("never puts two hard days back to back", () => {
    const week = planWeek({ ...base, date: "2026-11-02" });
    for (let i = 1; i < week.length; i++) {
      const a = week[i - 1].suggestion;
      const b = week[i].suggestion;
      const hard = (x: typeof a) => x?.kind === "workout" && /soglia|vo2|anaerobico/.test(x.main.cls);
      expect(hard(a) && hard(b)).toBe(false);
    }
  });
});

describe("parseCap", () => {
  it("reads the durations the sheet offers", () => {
    expect([parseCap("45 min"), parseCap("1 h"), parseCap("1,5 h"), parseCap("Oltre"), parseCap(undefined), parseCap("boh")]).toEqual([45, 60, 90, 600, null, null]);
  });
});

describe("with a season plan", () => {
  const setup: SeasonSetup = { start: "2026-11-05", horizonWeeks: 40, raceA: null, peak: { start: "2027-05-31", weeks: 8 }, ramp: "prudente", stops: [], maxHours: null };
  const plan = planSeason(setup, 36);
  const midweek = (w: { start: string }) => addDays(w.start, 2); // Wednesday
  const weekOf = (phase: string, kind = "carico") => plan.weeks.find((w) => w.phase === phase && w.kind === kind)!;
  const at = (date: string, over: Partial<SuggestInput> = {}) => suggestWorkout({ ...base, date, season: plan, ...over });
  const cls = (s: ReturnType<typeof at>) => (s.kind === "workout" ? s.main.cls : "riposo");

  it("brings quality into the base too, and hard work into the build", () => {
    for (const phase of ["base_1", "base_2"]) expect(["vo2", "sweetspot", "tempo"]).toContain(cls(at(midweek(weekOf(phase)))));
    expect(["soglia", "vo2", "anaerobico", "sweetspot"]).toContain(cls(at(midweek(weekOf("build_2")))));
  });

  it("keeps at most one quality session in a lighter week, and says which phase and TSS it follows", () => {
    const light = plan.weeks.find((w) => w.kind === "scarico" && w.phase !== "recupero")!;
    const days = planWeek({ ...base, date: light.start, season: plan });
    const quality = days.filter((d) => d.suggestion?.kind === "workout" && QUALITY.includes(d.suggestion.main.cls));
    expect(quality.length).toBeLessThanOrEqual(1);
    const s = at(midweek(light));
    if (s.kind === "workout") expect(s.main.reasons.join(" ")).toContain("TSS di riferimento");
  });

  it("goes easy when the CTL already rises faster than the ramp the athlete accepted", () => {
    const w = midweek(weekOf("build_2"));
    const calm = at(w, { rampRate: 1 });
    const fast = at(w, { rampRate: plan.rampTarget + 2.5 });
    expect(["soglia", "vo2", "anaerobico"]).toContain(cls(calm));
    expect(["soglia", "vo2", "anaerobico"]).not.toContain(cls(fast));
    if (fast.kind === "workout") expect(fast.main.reasons.join(" ")).toContain("oltre il tetto");
  });

  it("goes easy once the week's TSS is reached", () => {
    const w = weekOf("build_2");
    const date = addDays(w.start, 4);
    const done = [act(addDays(w.start, 0), "a", 0.7, w.tssTarget), act(addDays(w.start, 2), "b", 0.7, Math.ceil(w.tssTarget * 0.06))];
    const s = at(date, { recent: done });
    expect(["soglia", "vo2", "anaerobico"]).not.toContain(cls(s));
    if (s.kind === "workout") expect(s.main.reasons.join(" ")).toContain("già raggiunto");
  });

  it("rests in a stop week and on stop days", () => {
    const stopped = planSeason({ ...setup, stops: [{ from: "2026-11-16", to: "2026-11-22" }, { from: "2026-12-03", to: "2026-12-03" }] }, 36);
    expect(suggestWorkout({ ...base, date: "2026-11-18", season: stopped })).toMatchObject({ kind: "rest" });
    expect(suggestWorkout({ ...base, date: "2026-12-03", season: stopped })).toMatchObject({ kind: "rest" });
  });

  it("plans a week of days that follow the phase", () => {
    const w = weekOf("build_2");
    const days = planWeek({ ...base, date: w.start, season: plan });
    const hard = days.filter((d) => d.suggestion?.kind === "workout" && /soglia|vo2|anaerobico/.test(d.suggestion.main.cls));
    expect(hard.length).toBeLessThanOrEqual(2);
  });
});

describe("life events, feelings and today's requests", () => {
  const pick = (over: Partial<SuggestInput> = {}) => {
    const s = suggestWorkout({ ...base, ...over });
    if (s.kind !== "workout") throw new Error(`atteso un allenamento, ricevuto: ${s.reason}`);
    return s;
  };
  const hard = /soglia|vo2|anaerobico/;

  it("rests during a fever and with holidays, and gives Z1-Z2 up to 45 minutes for a week after the fever", () => {
    const sick = [{ id: "s", category: "SICK" as const, from: "2026-11-02", to: "2026-11-03" }];
    const during = suggestWorkout({ ...base, date: "2026-11-03", life: sick });
    expect(during).toMatchObject({ kind: "rest" });
    const after = pick({ life: sick });
    expect(["z2", "recupero"]).toContain(after.main.cls);
    expect(after.main.mins).toBeLessThanOrEqual(50);
    expect(after.main.reasons.join(" ")).toContain("Dopo la febbre");
    expect(suggestWorkout({ ...base, life: [{ id: "h", category: "HOLIDAY", from: "2026-11-04", to: "2026-11-06" }] })).toMatchObject({ kind: "rest" });
  });

  it("keeps an injury at Z1-Z2 even when the athlete is green and asks for hard work", () => {
    const life = [{ id: "i", category: "INJURED" as const, from: "2026-11-01", to: "2026-11-20" }];
    const s = pick({ life, override: { wantClass: "vo2" } });
    expect(["z2", "recupero"]).toContain(s.main.cls);
    expect(s.main.warnings.join(" ")).toContain("Z1-Z2");
  });

  it("lowers the readiness one level when the athlete says they feel bad", () => {
    const green = pick({});
    expect(green.main.cls).toMatch(hard);
    const tired = pick({ feeling: { drop: true, note: "hai le gambe pesanti" } });
    expect(tired.main.cls).not.toMatch(hard);
    expect(tired.main.reasons.join(" ")).toContain("gambe pesanti");
    const redFromYellow = pick({ readiness: "giallo", feeling: { drop: true } });
    expect(redFromYellow.main.cls).toBe("recupero");
  });

  it("follows what was asked for today: no training, a time limit, easier, a given type with its warning", () => {
    expect(suggestWorkout({ ...base, override: { restToday: true } })).toMatchObject({ kind: "rest" });
    expect(pick({ override: { maxMins: 50 } }).main.mins).toBeLessThanOrEqual(55);
    expect(pick({ override: { easier: true } }).main.cls).not.toMatch(hard);
    const asked = pick({ readiness: "giallo", override: { wantClass: "vo2" } });
    expect(asked.main.cls).toBe("vo2");
    expect(asked.main.warnings.join(" ")).toContain("sconsiglio");
    const fine = pick({ override: { wantClass: "soglia" } });
    expect(fine.main.cls).toBe("soglia");
    expect(fine.main.warnings).toHaveLength(0);
  });
});

// ── The method of 10 November 2026: a week built first, quality all season ─────────────────────────

/** Blocks as [minutes, fraction of FTP]. */
function wp(name: string, blocks: [number, number][], tss: number): LibraryWorkout {
  return { id: ++id, name, type: "Ride", secs: Math.round(blocks.reduce((s, b) => s + b[0] * 60, 0)), tss, description: null, blocks: blocks.map(([m, pct]) => ({ secs: Math.round(m * 60), zone: zoneOfFraction(pct), pct })) };
}
const set3 = (n: number, work: [number, number], rest: [number, number], between: [number, number]) => [...rep(n, work, rest), between, ...rep(n, work, rest), between, ...rep(n, work, rest)];
const LIB2: LibraryWorkout[] = [
  ...LIB,
  wp("Rønnestad 30/15 3x13 Indoor", [[15, 0.6], ...set3(13, [0.5, 1.2], [0.25, 0.55], [2, 0.5]), [9, 0.5]], 70),
  wp("VO2 5x3 Indoor", [[15, 0.6], ...rep(5, [3, 1.15], [3, 0.5]), [10, 0.5]], 62),
  wp("Sweet Spot 3x10 Indoor", [[12, 0.6], ...rep(3, [10, 0.9], [4, 0.5]), [5, 0.5]], 57),
  wp("Sweet Spot 2x20 Indoor", [[10, 0.6], ...rep(2, [20, 0.9], [5, 0.5]), [5, 0.5]], 64),
  wp("Tempo 3x12 Indoor", [[10, 0.6], ...rep(3, [12, 0.82], [4, 0.5]), [2, 0.5]], 58),
  wp("Threshold 2x15 Indoor", [[12, 0.6], ...rep(2, [15, 0.98], [5, 0.5]), [8, 0.5]], 66),
  wp("Long Z2 3h", [[15, 0.55], [150, 0.68], [15, 0.5]], 130),
  wp("Long Z2 3h + finale SST", [[15, 0.55], [120, 0.68], ...rep(2, [12, 0.9], [6, 0.6]), [9, 0.5]], 150),
  wp("Zone 2 Endurance 100", [[10, 0.55], [80, 0.68], [10, 0.5]], 70),
];
/** The athlete of the sheet: Tue, Wed, Thu, Sat, Sun; long ride on Sunday; intervals on the trainer (1 h at most), long Z2 outside. */
const SHEET: SuggestProfile = { giorni: [1, 2, 3, 5, 6], lunga: "Domenica", intervalliDove: "Rulli", z2Dove: "Fuori", ruliMax: "1 h", sedutaMin: "45 min", durataFeriali: "2 h", durataWeekend: "5 h", disciplina: "Strada" };

describe("classifyWorkout with the targets of the steps", () => {
  const c = (name: string) => classifyWorkout(LIB2.find((w) => w.name === name)!);
  it("reads 30/15 as VO2max in short repeats, hard and quality", () => {
    const r = c("Rønnestad 30/15 3x13 Indoor");
    expect([r.cls, r.shortIntervals, r.hard, r.quality]).toEqual(["vo2", true, true, true]);
    expect(c("VO2 5x3 Indoor").shortIntervals).toBe(false);
  });
  it("keeps a long ride with sweet spot in its last part as the long Z2 ride, not a quality session", () => {
    const r = c("Long Z2 3h + finale SST");
    expect([r.cls, r.lateWork, r.quality]).toEqual(["z2", true, false]);
    expect(c("Long Z2 3h").lateWork).toBe(false);
  });
  it("reads short steps without a power target as sprints, and steps in watts with the FTP", () => {
    const efforts = Array.from({ length: 6 }, () => [{ secs: 20, zone: 2, pct: null, free: true }, { secs: 300, zone: 1, pct: 0.5 }]).flat();
    const sprints: LibraryWorkout = { id: 900, name: "Power Sprints 6x", type: "Ride", secs: 3600, tss: 45, description: null, blocks: [{ secs: 1200, zone: 2, pct: 0.6 }, ...efforts, { secs: 480, zone: 1, pct: 0.5 }] };
    expect(classifyWorkout(sprints).cls).toBe("sprint");
    expect(workoutBlocks([{ duration: 600, power: { units: "w", value: 280 } }], 260)[0].zone).toBe(5);
    expect(workoutBlocks([{ duration: 600, power: { units: "w", value: 280 } }], null)[0].zone).toBe(1);
  });
  it("does not call a threshold ride with three short bursts a sprint session", () => {
    const breakaway = wp("Breakaway Simulation", [[15, 0.5], [0.5, 1.6], [8, 1.0], [4, 0.65], [0.5, 1.6], [10, 1.0], [4, 0.65], [0.5, 1.6], [12, 1.0], [15, 0.5]], 81);
    expect(classifyWorkout(breakaway).cls).toBe("soglia");
  });
});

describe("the week is built first", () => {
  const setup: SeasonSetup = { start: "2026-11-05", horizonWeeks: 40, raceA: { date: "2027-07-17", name: "Granfondo" }, peak: { start: "2027-05-31", weeks: 8 }, ramp: "prudente", stops: [], maxHours: 10 };
  const plan = planSeason(setup, 36);
  const loadWeek = (phase: string) => plan.weeks.find((w) => w.phase === phase && w.kind === "carico")!;
  const week = (w: { start: string }, over: Partial<SuggestInput> = {}) => planWeek({ ...base, library: LIB2, date: w.start, season: plan, profile: SHEET, ...over });
  const main = (d: ReturnType<typeof week>[number]) => (d.suggestion?.kind === "workout" ? d.suggestion.main : null);
  const isQ = (d: ReturnType<typeof week>[number]) => !!main(d) && QUALITY.includes(main(d)!.cls);

  it("base: VO2max on Tuesday as short repeats on the trainer, sweet spot or tempo on Thursday, the long ride on Sunday", () => {
    const days = week(loadWeek("base_1"));
    expect(days[0].suggestion).toMatchObject({ kind: "rest" });
    expect(days[4].suggestion).toMatchObject({ kind: "rest" });
    const tue = main(days[1])!;
    expect([tue.slot, tue.cls]).toEqual(["A", "vo2"]);
    expect(classifyWorkout(tue.workout).shortIntervals).toBe(true);
    expect(tue.mins).toBeLessThanOrEqual(65);
    const thu = main(days[3])!;
    expect(thu.slot).toBe("B");
    expect(["sweetspot", "tempo"]).toContain(thu.cls);
    const sun = main(days[6])!;
    expect([sun.slot, sun.cls]).toEqual(["long", "z2"]);
    expect(sun.mins).toBeGreaterThanOrEqual(150);
    for (const i of [2, 5]) expect(["z2", "recupero"]).toContain(main(days[i])!.cls);
  });

  it("never more than two quality sessions in a load week, never on consecutive days, in any phase", () => {
    for (const phase of ["base_1", "base_2", "base_3", "build_1", "build_2", "peak", "mantenimento"]) {
      const w = plan.weeks.find((x) => x.phase === phase && x.kind === "carico");
      if (!w) continue;
      const q = week(w).map(isQ);
      expect(q.filter(Boolean).length).toBeLessThanOrEqual(2);
      for (let i = 1; i < 7; i++) expect(q[i - 1] && q[i]).toBe(false);
    }
  });

  it("build: the long ride carries its work in the last part", () => {
    const sun = main(week(loadWeek("build_2"))[6])!;
    expect(sun.slot).toBe("long");
    expect(classifyWorkout(sun.workout).lateWork).toBe(true);
  });

  it("a light week keeps one short quality session and a shorter long ride", () => {
    const light = plan.weeks.find((w) => w.kind === "scarico" && w.phase.startsWith("base"))!;
    const days = week(light);
    expect(days.filter(isQ)).toHaveLength(1);
    expect(main(days[6])!.mins).toBeLessThanOrEqual(125);
  });

  it("a block week asked by the athlete has three quality sessions, never two days in a row", () => {
    const target = loadWeek("build_1");
    const blockPlan = planSeason({ ...setup, blockWeeks: [target.start] }, 36);
    const q = planWeek({ ...base, library: LIB2, date: target.start, season: blockPlan, profile: SHEET }).map(isQ);
    expect(q.filter(Boolean)).toHaveLength(3);
    for (let i = 1; i < 7; i++) expect(q[i - 1] && q[i]).toBe(false);
  });

  it("moves a missed quality day to the next free day that is not next to another one", () => {
    const w = loadWeek("base_1");
    const wednesday = addDays(w.start, 2);
    const missed = suggestWorkout({ ...base, library: LIB2, date: wednesday, season: plan, profile: SHEET });
    expect(missed.kind === "workout" && missed.main.slot).toBe("A");
    const done = suggestWorkout({ ...base, library: LIB2, date: wednesday, season: plan, profile: SHEET, recent: [{ date: addDays(w.start, 1), name: "VO2 5x3 Indoor", IF: 0.88, tss: 62, movingTime: 3300 }] });
    expect(done.kind === "workout" && done.main.slot).toBe("easy");
  });

  it("yellow keeps everything at Z2 or below, red stays within 45 minutes", () => {
    const w = loadWeek("build_2");
    const yellow = suggestWorkout({ ...base, library: LIB2, date: addDays(w.start, 1), season: plan, profile: SHEET, readiness: "giallo" });
    expect(yellow.kind === "workout" && classifyWorkout(yellow.main.workout).maxZone).toBeLessThanOrEqual(2);
    const yellowLong = suggestWorkout({ ...base, library: LIB2, date: addDays(w.start, 6), season: plan, profile: SHEET, readiness: "giallo" });
    expect(yellowLong.kind === "workout" && classifyWorkout(yellowLong.main.workout).maxZone).toBeLessThanOrEqual(2);
    const red = suggestWorkout({ ...base, library: LIB2, date: addDays(w.start, 1), season: plan, profile: SHEET, readiness: "rosso" });
    expect(red.kind === "workout" && red.main.mins).toBeLessThanOrEqual(45);
  });

  it("the race day is the race", () => {
    const s = suggestWorkout({ ...base, library: LIB2, date: "2027-07-17", season: plan, profile: SHEET });
    expect(s).toMatchObject({ kind: "rest" });
    if (s.kind === "rest") expect(s.reason).toContain("gara");
  });
});
