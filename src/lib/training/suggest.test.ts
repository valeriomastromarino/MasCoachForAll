import { describe, expect, it } from "vitest";
import type { LibraryWorkout } from "@/lib/calendar";
import { addDays } from "@/lib/dates";
import { planSeason, type SeasonSetup } from "./season";
import { carbsFor, classifyWorkout, parseCap, planWeek, suggestWorkout, type RecentActivity, type SuggestInput } from "./suggest";

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
    const s = pick({ recent: [act("2026-10-30", "x", 0.9, 80), act("2026-10-28", "y", 0.88, 80)] });
    expect(s.main.cls).not.toMatch(/soglia|vo2|anaerobico/);
    const aggressive = pick({ profile: { rischio: "Aggressivo" }, recent: [act("2026-10-30", "x", 0.9, 80), act("2026-10-28", "y", 0.88, 80)] });
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

  it("gives alternatives of other types and says when the library has nothing that fits", () => {
    const s = pick();
    expect(new Set([s.main.cls, ...s.alternatives.map((a) => a.cls)]).size).toBe(1 + s.alternatives.length);
    const none = suggestWorkout({ ...base, library: [], readiness: "verde" });
    expect(none.kind).toBe("rest");
  });
});

describe("planWeek", () => {
  it("builds seven days that respect the hard limit and leave a day off", () => {
    const week = planWeek({ ...base, date: "2026-11-02", profile: { rischio: "Bilanciato" } });
    expect(week).toHaveLength(7);
    const hard = week.filter((d) => d.suggestion?.kind === "workout" && /soglia|vo2|anaerobico/.test(d.suggestion.main.cls));
    expect(hard.length).toBeLessThanOrEqual(2);
    expect(week.some((d) => d.suggestion?.kind === "rest")).toBe(true);
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

  it("keeps hard work out of the base and brings it in with the build", () => {
    for (const phase of ["base_1", "base_2"]) {
      const c = cls(at(midweek(weekOf(phase))));
      expect(["z2", "recupero", "tempo", "sprint"]).toContain(c);
    }
    expect(["soglia", "vo2", "anaerobico", "sweetspot"]).toContain(cls(at(midweek(weekOf("build_2")))));
  });

  it("allows no hard session in a lighter week, and says which phase and TSS it follows", () => {
    const light = plan.weeks.find((w) => w.kind === "scarico" && w.hardMax === 0 && w.phase !== "recupero")!;
    const s = at(midweek(light));
    expect(["soglia", "vo2", "anaerobico"]).not.toContain(cls(s));
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
