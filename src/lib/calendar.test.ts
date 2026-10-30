import { describe, expect, it } from "vitest";
import { buildCalendar, buildLibrary, calendarEvents, eventFromLibrary } from "./calendar";
import { workoutBlocks, zoneOfFraction } from "./workout";

describe("workoutBlocks", () => {
  it("reads power zones, %FTP, watts and ramps, and expands repeats", () => {
    const blocks = workoutBlocks(
      [
        { duration: 600, power: { units: "power_zone", value: 1 } },
        { reps: 3, steps: [{ duration: 300, power: { units: "%ftp", value: 110 } }, { duration: 120, power: { units: "%ftp", value: 50 } }] },
        { duration: 900, power: { units: "w", start: 200, end: 240 } },
        { duration: 0, power: { units: "power_zone", value: 4 } },
        { duration: 300, freeride: true },
      ],
      250,
    );
    expect(blocks.map((b) => [b.secs, b.zone])).toEqual([
      [600, 1],
      [300, 5],
      [120, 1],
      [300, 5],
      [120, 1],
      [300, 5],
      [120, 1],
      [900, 3],
      [300, 2],
    ]);
  });

  it("maps FTP fractions on Coggan zones", () => {
    expect([0.5, 0.7, 0.85, 1, 1.1, 1.3, 2].map(zoneOfFraction)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});

describe("buildCalendar", () => {
  it("keeps the range, planned workouts only, and activity fields", () => {
    const cal = buildCalendar(
      [
        {
          id: "a1",
          start_date_local: "2026-10-27T18:00:00",
          type: "VirtualRide",
          name: "Rullo",
          moving_time: 3000,
          icu_training_load: 41,
          icu_rpe: 6,
          icu_average_watts: 171,
          average_heartrate: 128,
        },
        { id: "a0", start_date_local: "2026-09-01T18:00:00", type: "Ride" },
        { id: "a2", start_date_local: "2026-10-28T18:00:00", type: "Ride", icu_rpe: 0 },
      ],
      [
        { id: 7, start_date_local: "2026-10-31T00:00:00", category: "WORKOUT", type: "Ride", name: "Endurance", description: " Z2 \n" },
        { id: 8, start_date_local: "2026-10-31T00:00:00", category: "NOTE", name: "nota" },
        { id: 9, start_date_local: "2026-11-01T00:00:00", category: "WORKOUT", name: "SS", external_id: "mascoach-prova-x" },
        { id: 10, start_date_local: "2026-11-02T00:00:00", category: "WORKOUT", name: "Z2", external_id: "rot-123" },
      ],
      "2026-10-12",
      "2026-11-08",
      250,
    );
    expect(cal.activities).toHaveLength(2);
    expect(cal.activities[0]).toMatchObject({ id: "a1", category: "rulli", rpe: 6, tss: 41, date: "2026-10-27", avgWatts: 171, avgHr: 128 });
    expect(cal.activities[1]).toMatchObject({ avgWatts: null, avgHr: null });
    // RPE 0 is how a cleared value comes back from Intervals.icu.
    expect(cal.activities[1].rpe).toBeNull();
    expect(cal.workouts[0]).toEqual({
      id: "7",
      date: "2026-10-31",
      name: "Endurance",
      type: "Ride",
      secs: null,
      tss: null,
      description: "Z2",
      blocks: [],
      coach: null,
    });
    // Only workouts written by MasCoach Coach get the label; other apps' external ids don't count.
    expect(cal.workouts.map((w) => w.coach)).toEqual([null, "prova", null]);
  });
});

describe("library", () => {
  it("groups workouts by folder and builds the event to add", () => {
    const workouts = [
      { id: 2, name: "B", folder_id: 1, moving_time: 3600, icu_training_load: 50, description: "x" },
      { id: 1, name: "A", folder_id: 1 },
      { id: 3, name: "C", folder_id: 99 },
    ];
    const folders = buildLibrary(workouts, [{ id: 1, name: "Workouts" }], null);
    expect(folders.map((f) => [f.name, f.workouts.map((w) => w.name)])).toEqual([
      ["Workouts", ["A", "B"]],
      ["Senza cartella", ["C"]],
    ]);
    expect(eventFromLibrary(workouts[0], "2026-11-03")).toMatchObject({
      category: "WORKOUT",
      start_date_local: "2026-11-03T00:00:00",
      type: "Ride",
      name: "B",
      description: "x",
      moving_time: 3600,
    });
  });
});

describe("calendar events", () => {
  it("keeps races, holidays and notes, with multi-day ends and targets", () => {
    const events = calendarEvents(
      [
        { id: 1, start_date_local: "2026-11-14T00:00:00", end_date_local: "2026-11-15T00:00:00", category: "HOLIDAY", name: "Viaggio" },
        { id: 2, start_date_local: "2026-12-20T00:00:00", end_date_local: "2026-12-27T00:00:00", category: "HOLIDAY", name: "Natale" },
        { id: 3, start_date_local: "2027-06-07T00:00:00", category: "RACE_A", name: "granfondo", time_target: 14400 },
        { id: 4, start_date_local: "2026-11-02T00:00:00", category: "WORKOUT", name: "Z2" },
        { id: 5, start_date_local: "2026-10-01T00:00:00", category: "NOTE", name: "vecchia" },
      ],
      "2026-11-01",
      "2027-12-31",
    );
    expect(events.map((e) => e.id)).toEqual(["1", "2", "3"]);
    // A single-day event ends at midnight of the next day: no end date.
    expect(events[0]).toMatchObject({ label: "Vacanza / impegno", endDate: null });
    expect(events[1].endDate).toBe("2026-12-26");
    expect(events[2]).toMatchObject({ label: "Gara A", name: "Granfondo", timeTarget: 14400 });
  });
});
