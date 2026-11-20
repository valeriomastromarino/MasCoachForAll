import { describe, expect, it } from "vitest";
import type { CalendarWorkout } from "./calendar";
import { changedDays, dropMoves, seasonAfter, undoMoves } from "./calendarMove";
import type { SeasonSetup } from "./training/season";

const w = (id: string, date: string, name: string, type: string | null = "Ride"): CalendarWorkout => ({
  id,
  date,
  name,
  type,
  secs: 3600,
  tss: 50,
  description: null,
  blocks: [],
  coach: null,
});

// A Friday: Pilates today, a long ride on Saturday, a shorter one on Sunday (example data).
const TODAY = "2026-11-20";
const pilates = w("p", "2026-11-20", "Pilates", "Pilates");
const sat = w("s", "2026-11-21", "Z2 + 6 sprint");
const sun = w("d", "2026-11-22", "Long Endurance 2h");

const setup = (weekPlans?: SeasonSetup["weekPlans"]): SeasonSetup => ({
  start: "2026-10-26",
  raceA: null,
  peak: { start: "2027-04-17", weeks: 6 },
  ramp: "prudente",
  maxHours: 8,
  stops: [],
  horizonWeeks: 30,
  weekPlans,
});

describe("dropMoves", () => {
  it("moves a session to a free day", () => {
    expect(dropMoves(sat, "2026-11-24", [], TODAY)).toEqual([{ id: "s", name: "Z2 + 6 sprint", from: "2026-11-21", to: "2026-11-24", bike: true }]);
  });

  it("swaps two rides: the one already there goes to the day the other leaves", () => {
    expect(dropMoves(sat, "2026-11-22", [sun], TODAY).map((m) => `${m.id} ${m.from}→${m.to}`)).toEqual(["s 2026-11-21→2026-11-22", "d 2026-11-22→2026-11-21"]);
  });

  it("never swaps with weights or Pilates, and never swaps a missed session into the past", () => {
    expect(dropMoves(sat, TODAY, [pilates], TODAY)).toHaveLength(1);
    expect(dropMoves(pilates, "2026-11-21", [sat], TODAY)).toHaveLength(1);
    const missed = w("m", "2026-11-18", "Tempo 3x10");
    expect(dropMoves(missed, "2026-11-21", [sat], TODAY)).toEqual([{ id: "m", name: "Tempo 3x10", from: "2026-11-18", to: "2026-11-21", bike: true }]);
  });

  it("does nothing on its own day or on a day gone", () => {
    expect(dropMoves(sat, "2026-11-21", [sat], TODAY)).toEqual([]);
    expect(dropMoves(sat, "2026-11-19", [], TODAY)).toEqual([]);
  });

  it("undoes a swap in reverse order", () => {
    const moves = dropMoves(sat, "2026-11-22", [sun], TODAY);
    expect(undoMoves(moves).map((m) => `${m.id} ${m.from}→${m.to}`)).toEqual(["d 2026-11-21→2026-11-22", "s 2026-11-22→2026-11-21"]);
  });
});

describe("changedDays", () => {
  const planned = [pilates, sat, sun];

  it("a move empties the day it leaves", () => {
    expect(changedDays(planned, dropMoves(sat, "2026-11-24", [], TODAY))).toEqual({ emptied: ["2026-11-21"], filled: ["2026-11-24"] });
  });

  it("a swap empties nothing", () => {
    expect(changedDays(planned, dropMoves(sat, "2026-11-22", [sun], TODAY)).emptied).toEqual([]);
  });

  it("a day keeps its ride when another stays there, and Pilates never counts", () => {
    const second = w("x", "2026-11-21", "Recupero 45'");
    expect(changedDays([...planned, second], dropMoves(sat, "2026-11-24", [], TODAY)).emptied).toEqual([]);
    expect(changedDays(planned, dropMoves(pilates, "2026-11-23", [], TODAY))).toEqual({ emptied: [], filled: [] });
  });

  it("removing a ride empties its day", () => {
    expect(changedDays(planned, [], sat)).toEqual({ emptied: ["2026-11-21"], filled: [] });
    expect(changedDays(planned, [], pilates)).toEqual({ emptied: [], filled: [] });
  });
});

describe("seasonAfter", () => {
  it("makes an emptied day rest chosen by the athlete, in its own week", () => {
    const next = seasonAfter(setup(), { emptied: ["2026-11-21"], filled: [] }, TODAY);
    expect(next.weekPlans).toEqual({ "2026-11-16": [{ date: "2026-11-21", id: null, mine: true }] });
  });

  it("drops what the Stagione page fixed on a day that receives a ride, and leaves days gone alone", () => {
    const before = setup({
      "2026-11-23": [
        { date: "2026-11-24", id: 7, mine: true },
        { date: "2026-11-25", id: 9, mine: false },
      ],
    });
    const next = seasonAfter(before, { emptied: ["2026-11-19"], filled: ["2026-11-24"] }, TODAY);
    expect(next.weekPlans).toEqual({ "2026-11-23": [{ date: "2026-11-25", id: 9, mine: false }] });
  });

  it("removes a week left without choices", () => {
    const before = setup({ "2026-11-23": [{ date: "2026-11-24", id: null, mine: true }] });
    expect(seasonAfter(before, { emptied: [], filled: ["2026-11-24"] }, TODAY).weekPlans).toEqual({});
  });
});
