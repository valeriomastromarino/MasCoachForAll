import { describe, expect, it } from "vitest";
import type { RawStep } from "../workout";
import { adjust, ergTarget, initialSession, pause, setMode, skip, start, stepRemaining, tick } from "./session";
import { workoutNotes } from "./notes";
import { buildTimeline, targetAt, totalSecs } from "./timeline";

// Shape of workout_doc.steps as Intervals.icu returns it with resolve=true.
const STEPS: RawStep[] = [
  { duration: 600, ramp: true, power: { start: 40, end: 60, units: "%ftp" }, _power: { value: 125, start: 100, end: 150 } },
  {
    text: "Sweet spot 2x",
    reps: 2,
    steps: [
      { duration: 300, power: { start: 88, end: 92, units: "%ftp" }, _power: { value: 225, start: 220, end: 230 }, cadence: { start: 85, end: 90, units: "rpm" } },
      { duration: 120, power: { value: 125, units: "w" } },
    ],
  },
  { duration: 60, freeride: true },
  { duration: 300, power: { value: 2, units: "power_zone" } },
];

describe("timeline", () => {
  const tl = buildTimeline(STEPS, 250);

  it("expands repeats and labels them", () => {
    expect(tl).toHaveLength(7);
    expect(tl.map((s) => s.label)).toEqual([null, "Sweet spot · 1 di 2", "Sweet spot · 1 di 2", "Sweet spot · 2 di 2", "Sweet spot · 2 di 2", null, null]);
    expect(totalSecs(tl)).toBe(600 + 2 * 420 + 60 + 300);
  });

  it("uses the watts resolved by Intervals, else %FTP, watts and zones", () => {
    expect(tl[0]).toMatchObject({ from: 100, to: 150, ramp: true });
    expect(tl[1]).toMatchObject({ from: 225, to: 225, ramp: false, cadence: { lo: 85, hi: 90 } });
    expect(tl[2].from).toBe(125);
    expect(tl[6].from).toBe(163); // middle of Z2 (55–75%)
  });

  it("keeps the previous target for a step without power", () => {
    expect(tl[5].from).toBe(125);
  });

  it("interpolates ramps", () => {
    expect(targetAt(tl, 0)).toBe(100);
    expect(targetAt(tl, 300)).toBe(125);
    expect(targetAt(tl, 650)).toBe(225);
  });
});

describe("session", () => {
  const tl = buildTimeline(STEPS, 250);

  it("starts when you pedal and pauses by itself when you stop", () => {
    let s = initialSession();
    s = tick(s, 1, false, tl);
    expect(s.status).toBe("ready");
    s = tick(s, 1, true, tl);
    expect(s.status).toBe("running");
    for (let i = 0; i < 10; i++) s = tick(s, 1, true, tl);
    expect(s.pos).toBe(10);
    for (let i = 0; i < 5; i++) s = tick(s, 1, false, tl);
    expect(s.autoPaused).toBe(true);
    expect(s.pos).toBe(12); // two seconds ridden before the pause kicked in
    s = tick(s, 1, true, tl);
    expect(s.autoPaused).toBe(false);
    expect(s.pos).toBe(13);
  });

  it("moves the ERG target by 5 W for the current step only", () => {
    let s = { ...start(initialSession()), pos: 610, stepIndex: 1 };
    s = adjust(s, 1, 11, tl);
    s = adjust(s, 1, 11, tl);
    expect(ergTarget(s, tl)).toBe(235);
    s = tick({ ...s, pos: 899 }, 1, true, tl); // into the recovery
    expect(s.stepIndex).toBe(2);
    expect(ergTarget(s, tl)).toBe(125);
  });

  it("moves one resistance step in resistance mode", () => {
    let s = setMode(initialSession(3), "resistance");
    s = adjust(s, 1, 11, tl);
    expect(s.level).toBe(4);
    s = adjust({ ...s, level: 10 }, 1, 11, tl);
    expect(s.level).toBe(10);
  });

  it("skips forward and back", () => {
    let s = { ...start(initialSession()), pos: 700, stepIndex: 1 };
    s = skip(s, 1, tl);
    expect(s.pos).toBe(900);
    s = skip({ ...s, pos: 902 }, -1, tl);
    expect(s.pos).toBe(600);
    s = skip({ ...s, pos: 660 }, -1, tl);
    expect(s.pos).toBe(600);
    expect(stepRemaining({ ...s, pos: 660 }, tl)).toBe(240);
  });

  it("ends after the last step and ignores manual pause after that", () => {
    let s = { ...start(initialSession()), pos: totalSecs(tl) - 1, stepIndex: tl.length - 1 };
    s = tick(s, 1, true, tl);
    expect(s.status).toBe("done");
    expect(pause(s).status).toBe("done");
  });
});

describe("workout notes", () => {
  it("keeps the free text and drops the steps", () => {
    expect(workoutNotes("Ripetute brevi e pulite.\n\nRiscaldamento\n- 10m ramp 50-70%\n\nSweet spot 3x\n- 12m 90%")).toBe("Ripetute brevi e pulite.");
    expect(workoutNotes("Riscaldamento\n- 10m 50%")).toBeNull();
    expect(workoutNotes("Solo testo")).toBe("Solo testo");
    expect(workoutNotes(null)).toBeNull();
  });
});
