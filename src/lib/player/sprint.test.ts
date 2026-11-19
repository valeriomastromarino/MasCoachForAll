import { describe, expect, it } from "vitest";
import type { RawStep } from "../workout";
import { adjust, ergTarget, initialSession, plannedTarget, recalibrate, start, tick } from "./session";
import { DEFAULT_SPRINT, isSprintStep, readSprintConfig, sprintLevelOn, sprintPhase } from "./sprint";
import { buildTimeline, targetAt } from "./timeline";

describe("recalibrate", () => {
  const raw: RawStep[] = [
    { duration: 600, power: { value: 120, units: "w" } },
    { duration: 300, power: { value: 225, units: "w" } },
    { duration: 120, power: { value: 125, units: "w" } },
    { duration: 300, power: { value: 225, units: "w" } },
  ];
  const tl = buildTimeline(raw, 250);
  const ride = (secs: number) => {
    let s = start(initialSession());
    for (let i = 0; i < secs; i++) s = tick(s, 1, true, tl);
    return s;
  };

  it("scales the current step and the ones after, not the finished ones", () => {
    let s = ride(620); // inside the first 225 W step
    expect(ergTarget(s, tl)).toBe(225);
    s = recalibrate(s, 0.9);
    expect(ergTarget(s, tl)).toBe(Math.round(225 * 0.9));
    expect(plannedTarget(s, tl, 100)).toBe(targetAt(tl, 100)); // warm-up already done: unchanged
    expect(plannedTarget(s, tl, 1100)).toBe(Math.round(targetAt(tl, 1100) * 0.9));
  });

  it("goes back to the plan at 100% and keeps − / + working on top", () => {
    let s = recalibrate(ride(620), 0.85);
    s = adjust(s, 1, 10, tl);
    expect(ergTarget(s, tl)).toBe(Math.round(225 * 0.85) + 5);
    s = recalibrate(s, 1);
    expect(ergTarget(s, tl)).toBe(225);
  });
});

describe("sprint", () => {
  const raw: RawStep[] = [
    { duration: 120, power: { value: 150, units: "w" } },
    { duration: 10, power: { value: 800, units: "w" } },
    { duration: 120, power: { value: 120, units: "w" } },
    { duration: 300, power: { value: 480, units: "w" } },
    { duration: 120, power: { value: 120, units: "w" } },
  ];
  const tl = buildTimeline(raw, 250);
  const cfg = { ...DEFAULT_SPRINT, on: true };
  const at = (pos: number) => {
    let index = 0;
    tl.forEach((x, i) => {
      if (x.start <= pos) index = i;
    });
    return { ...start(initialSession()), pos, stepIndex: index };
  };

  it("counts only short steps at or above the threshold", () => {
    expect(isSprintStep(tl[1], cfg)).toBe(true);
    expect(isSprintStep(tl[3], cfg)).toBe(false); // 5 min at 480 W stays in ERG
    expect(isSprintStep(tl[3], { ...cfg, maxStepSecs: 0 })).toBe(true);
    expect(isSprintStep(tl[1], { ...cfg, on: false })).toBe(false);
    expect(isSprintStep(tl[1], { ...cfg, watts: 900 })).toBe(false);
  });

  it("warns for the lead seconds, then goes, then is off", () => {
    expect(sprintPhase(at(100), tl, cfg).phase).toBe("off");
    expect(sprintPhase(at(117), tl, cfg)).toMatchObject({ phase: "warn", secs: 3, n: 1, total: 1 });
    expect(sprintPhase(at(119), tl, cfg)).toMatchObject({ phase: "warn", secs: 1 });
    expect(sprintPhase(at(120), tl, cfg)).toMatchObject({ phase: "go", secs: 10 });
    expect(sprintPhase(at(129), tl, cfg)).toMatchObject({ phase: "go", secs: 1 });
    expect(sprintPhase(at(130), tl, cfg).phase).toBe("off");
  });

  it("is off when paused, auto-paused or switched off", () => {
    expect(sprintPhase({ ...at(120), status: "paused" }, tl, cfg).phase).toBe("off");
    expect(sprintPhase({ ...at(120), autoPaused: true }, tl, cfg).phase).toBe("off");
    expect(sprintPhase(at(120), tl, { ...cfg, on: false }).phase).toBe("off");
  });

  it("reads saved settings safely", () => {
    expect(readSprintConfig(null)).toEqual(DEFAULT_SPRINT);
    expect(readSprintConfig("not json")).toEqual(DEFAULT_SPRINT);
    expect(readSprintConfig(JSON.stringify({ on: true, watts: 500, leadSecs: 7, maxStepSecs: 60, level: 3, levels: 16 }))).toEqual({ on: true, watts: 500, leadSecs: 3, maxStepSecs: 60, level: 3, levels: 16 });
    expect(readSprintConfig(JSON.stringify({ level: 40, levels: 16 })).level).toBe(16);
  });

  it("rides a level saved on the old 0–10 scale at the same place on the 0–16 one", () => {
    // Settings saved before 19 November 2026 have no scale: their level was one of 0–10.
    const old = readSprintConfig(JSON.stringify({ on: true, watts: 500, leadSecs: 3, maxStepSecs: 30, level: 7 }));
    expect(old).toMatchObject({ on: true, level: 7, levels: 10 });
    expect(sprintLevelOn(old, 16)).toBe(11);
    expect(sprintLevelOn(readSprintConfig(JSON.stringify({ level: 10 })), 16)).toBe(16);
    expect(sprintLevelOn(readSprintConfig(JSON.stringify({ level: 0 })), 16)).toBe(0);
    expect(sprintLevelOn(readSprintConfig(JSON.stringify({ level: 3 })), 16)).toBe(5);
    // Read again after being saved, the value does not move.
    expect(sprintLevelOn(readSprintConfig(JSON.stringify(old)), 16)).toBe(11);
    // A trainer with up to 20 steps of its own kept those before: a level above 10 without its scale is not the hardest one.
    expect(readSprintConfig(JSON.stringify({ level: 15 }))).toMatchObject({ level: DEFAULT_SPRINT.level, levels: DEFAULT_SPRINT.levels });
    expect(readSprintConfig(JSON.stringify({ level: 15, levels: 20 }))).toMatchObject({ level: 15, levels: 20 });
  });

  it("keeps the sprint at the same place on a trainer with its own, shorter scale", () => {
    // The default (11 of 16) is not the top of a trainer with 10 steps, and a level saved there reads back the same.
    expect(sprintLevelOn(DEFAULT_SPRINT, 10)).toBe(7);
    expect(sprintLevelOn({ ...DEFAULT_SPRINT, level: 7, levels: 10 }, 10)).toBe(7);
    expect(sprintLevelOn({ ...DEFAULT_SPRINT, level: 7, levels: 10 }, 16)).toBe(11);
    expect(sprintLevelOn({ ...DEFAULT_SPRINT, level: 16, levels: 16 }, 4)).toBe(4);
    expect(sprintLevelOn(DEFAULT_SPRINT, 0)).toBe(0);
  });
});
