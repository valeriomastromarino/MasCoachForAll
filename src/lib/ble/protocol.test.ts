import { describe, expect, it } from "vitest";
import {
  crankCadence,
  ftmsCommand,
  parseControlResponse,
  parseCyclingPower,
  parseFtmsFeatures,
  parseHeartRate,
  parseIndoorBikeData,
  parseResistanceRange,
  resistanceSteps,
} from "./protocol";

const view = (...b: number[]) => new DataView(new Uint8Array(b).buffer);

describe("FTMS", () => {
  it("reads speed, cadence and power from Indoor Bike Data", () => {
    // flags 0x0044: speed present (bit 0 = 0), cadence (bit 2), power (bit 6)
    const d = parseIndoorBikeData(view(0x44, 0x00, 0xc4, 0x09, 0xb4, 0x00, 0xd2, 0x00));
    expect(d.speedKmh).toBe(25);
    expect(d.cadence).toBe(90);
    expect(d.power).toBe(210);
    expect(d.heartRate).toBeNull();
  });

  it("skips optional fields it does not use", () => {
    // flags 0x0254: speed, cadence (bit 2), distance (bit 4), power (bit 6), heart rate (bit 9)
    const d = parseIndoorBikeData(view(0x54, 0x02, 0x10, 0x27, 0xa0, 0x00, 0xe8, 0x03, 0x00, 0xfa, 0x00, 0x8c));
    expect(d.speedKmh).toBe(100);
    expect(d.cadence).toBe(80);
    expect(d.distanceM).toBe(1000);
    expect(d.power).toBe(250);
    expect(d.heartRate).toBe(140);
  });

  it("reads which targets the trainer accepts", () => {
    // target settings: resistance (bit 2) + power (bit 3)
    expect(parseFtmsFeatures(view(0, 0, 0, 0, 0x0c, 0, 0, 0))).toEqual({ resistance: true, power: true, simulation: false });
  });

  it("reads the resistance range in tenths", () => {
    expect(parseResistanceRange(view(0x00, 0x00, 0xe8, 0x03, 0x0a, 0x00))).toEqual({ min: 0, max: 100, step: 1 });
  });

  it("encodes the control point commands", () => {
    expect([...ftmsCommand.requestControl()]).toEqual([0x00]);
    expect([...ftmsCommand.power(215)]).toEqual([0x05, 215, 0]);
    expect([...ftmsCommand.power(300)]).toEqual([0x05, 0x2c, 0x01]);
    expect([...ftmsCommand.resistance(40)]).toEqual([0x04, 0x90, 0x01]);
    expect([...ftmsCommand.simulation(-2)]).toEqual([0x11, 0, 0, 0x38, 0xff, 40, 51]);
    expect([...ftmsCommand.stop(true)]).toEqual([0x08, 2]);
  });

  it("reads the control point answer", () => {
    expect(parseControlResponse(view(0x80, 0x05, 0x01))).toEqual({ op: 5, result: 1, ok: true });
    expect(parseControlResponse(view(0x80, 0x04, 0x02))?.ok).toBe(false);
    expect(parseControlResponse(view(0x05, 0x01))).toBeNull();
  });
});

describe("Heart rate", () => {
  it("reads heart rate and RR intervals", () => {
    // flags 0x10: 8-bit HR, RR present; RR 1024 → 1000 ms, 768 → 750 ms
    const m = parseHeartRate(view(0x10, 72, 0x00, 0x04, 0x00, 0x03));
    expect(m.heartRate).toBe(72);
    expect(m.rr).toEqual([1000, 750]);
  });

  it("handles 16-bit heart rate and energy expended", () => {
    const m = parseHeartRate(view(0x19, 0x8c, 0x00, 0x10, 0x00, 0x00, 0x04));
    expect(m.heartRate).toBe(140);
    expect(m.rr).toEqual([1000]);
  });

  it("works without RR", () => {
    expect(parseHeartRate(view(0x00, 120))).toEqual({ heartRate: 120, rr: [] });
  });
});

describe("Cycling power", () => {
  it("reads power and crank data", () => {
    // flags 0x20 (crank data), power 230, revs 10, time 2048
    const m = parseCyclingPower(view(0x20, 0x00, 0xe6, 0x00, 0x0a, 0x00, 0x00, 0x08));
    expect(m.power).toBe(230);
    expect(m.crank).toEqual({ revs: 10, time: 2048 });
  });

  it("computes cadence across counter wrap", () => {
    expect(crankCadence({ revs: 10, time: 0 }, { revs: 11, time: 683 })).toBeCloseTo(90, 0);
    expect(crankCadence({ revs: 65535, time: 65000 }, { revs: 0, time: 147 })).toBeCloseTo(90, 0);
    expect(crankCadence({ revs: 5, time: 100 }, { revs: 5, time: 900 })).toBeNull();
  });
});

describe("Resistance steps", () => {
  it("makes 10 equal steps out of a fine scale", () => {
    expect(resistanceSteps({ min: 0, max: 100, step: 1 })).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
  });
  it("keeps the trainer's own steps when they are few", () => {
    expect(resistanceSteps({ min: 1, max: 9, step: 1 })).toHaveLength(9);
  });
  it("falls back to 0–100 without a range", () => {
    expect(resistanceSteps(null)).toHaveLength(11);
  });
});
