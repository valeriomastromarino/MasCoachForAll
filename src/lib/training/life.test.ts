import { describe, expect, it } from "vitest";
import { AFTER_INJURY_DAYS, AFTER_SICK_DAYS, EASY_DAY_LOAD, type LifeEvent, lifeBetween, loadFactor, openLife, restrictionOn } from "./life";

const holiday: LifeEvent = { id: "1", category: "HOLIDAY", from: "2026-11-14", to: "2026-11-15", name: "Viaggio" };
const sick: LifeEvent = { id: "2", category: "SICK", from: "2026-12-01", to: "2026-12-03" };
const injured: LifeEvent = { id: "3", category: "INJURED", from: "2027-01-10", to: "2027-01-20", name: "ginocchio" };

describe("restrictionOn", () => {
  it("rests on holidays and during the fever", () => {
    expect(restrictionOn("2026-11-14", [holiday])?.kind).toBe("rest");
    expect(restrictionOn("2026-12-02", [sick])?.kind).toBe("rest");
    expect(restrictionOn("2026-11-16", [holiday])).toBeNull();
  });
  it("gives Z1-Z2 only for a week after the fever, then frees the day", () => {
    const after = restrictionOn("2026-12-04", [sick]);
    expect(after).toMatchObject({ kind: "easy", maxMins: 45 });
    expect(restrictionOn("2026-12-10", [sick])?.kind).toBe("easy");
    expect(restrictionOn("2026-12-11", [sick])).toBeNull();
    expect(AFTER_SICK_DAYS).toBe(7);
  });
  it("keeps an injury at Z1-Z2 while it lasts, and for a few days after", () => {
    expect(restrictionOn("2027-01-15", [injured])).toMatchObject({ kind: "easy", maxMins: 60 });
    expect(restrictionOn("2027-01-23", [injured])?.kind).toBe("easy");
    expect(restrictionOn(`2027-01-${20 + AFTER_INJURY_DAYS + 1}`, [injured])).toBeNull();
  });
  it("takes the strictest rule when events overlap", () => {
    expect(restrictionOn("2026-12-02", [holiday, sick, { ...injured, from: "2026-11-28", to: "2026-12-05" }])?.kind).toBe("rest");
    const both = restrictionOn("2026-12-05", [sick, { ...injured, from: "2026-11-28", to: "2026-12-08" }]);
    expect(both?.kind).toBe("easy");
    expect(both?.maxMins).toBe(45);
  });
});

describe("loadFactor, lifeBetween, openLife", () => {
  it("weighs days for the plan", () => {
    expect(loadFactor("2026-11-14", [holiday])).toBe(0);
    expect(loadFactor("2027-01-15", [injured])).toBe(EASY_DAY_LOAD);
    expect(loadFactor("2027-02-01", [holiday, sick, injured])).toBe(1);
  });
  it("lists what touches a period, in order", () => {
    expect(lifeBetween([injured, holiday, sick], "2026-11-01", "2026-12-31").map((e) => e.id)).toEqual(["1", "2"]);
  });
  it("finds the illness or injury open today, never a holiday", () => {
    expect(openLife([holiday, sick], "2026-12-02")?.id).toBe("2");
    expect(openLife([holiday], "2026-11-14")).toBeNull();
    expect(openLife([sick, injured], "2026-12-02", "INJURED")).toBeNull();
  });
});
