import { describe, expect, it } from "vitest";
import { categoryOf, toActivityRow } from "./activities";

const row = (name: string, type = "Ride", trainer = false) =>
  toActivityRow({ id: "x", start_date_local: "2026-01-16T18:00:00", type, name, trainer });

describe("activity rows", () => {
  it("recognises fitness tests by name", () => {
    expect(row("cyclonlab ramp test").isTest).toBe(true);
    expect(row("Giro del lago - CYCLON LAB TEST FTP short").isTest).toBe(true);
    expect(row("Test incrementale").isTest).toBe(true);
    expect(row("CP12 a tutta").isTest).toBe(true);
  });

  it("does not mistake threshold workouts for tests", () => {
    expect(row("Giro del lago - ftp 3x10min").isTest).toBe(false);
    expect(row("CYCLONLAB HIIT 41").isTest).toBe(false);
    expect(row("Lungo con salite").isTest).toBe(false);
  });

  it("sorts activities into categories", () => {
    expect(categoryOf({ type: "VirtualRide", trainer: true })).toBe("rulli");
    expect(categoryOf({ type: "Ride", trainer: true })).toBe("rulli");
    expect(categoryOf({ type: "Ride", trainer: false })).toBe("strada");
    expect(categoryOf({ type: "GravelRide" })).toBe("offroad");
    expect(categoryOf({ type: "Pilates" })).toBe("altro");
    expect(categoryOf({})).toBe("nascosta");
  });
});
