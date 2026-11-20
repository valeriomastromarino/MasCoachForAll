import { describe, expect, it } from "vitest";
import { demoRide } from "../demoRide";
import { buildRide, type RideDetail, type RidePoint } from "../ride";
import { fitRoute, HIDDEN_METERS, powerProfile, routeMeters, shareCard, shareFileName, timeParts } from "./rideShare";

const demo = (): RideDetail => {
  const { raw, streams } = demoRide("demo-x");
  return buildRide(raw, streams);
};

const ALL = { route: true, hideEnds: true, effort: true };

/** A straight road towards east on the equator, one point every 50 m: x in metres is the distance ridden. */
function straight(km: number): RidePoint[] {
  const pts: RidePoint[] = [];
  for (let m = 0; m <= km * 1000; m += 50) {
    pts.push({ t: m / 10, km: m / 1000, watts: 200, hr: 130, cadence: 90, altitude: 0, dfa: null, lat: 0, lng: (m / 6_371_000) * (180 / Math.PI), zone: 1 });
  }
  return pts;
}

describe("the picture of a ride to share", () => {
  it("leaves out the first and the last 500 m of the route", () => {
    const r = routeMeters(straight(10), HIDDEN_METERS)!;
    expect(r[0][0]).toBeGreaterThanOrEqual(499.9);
    expect(r[r.length - 1][0]).toBeLessThanOrEqual(9500.1);
    const whole = routeMeters(straight(10), 0)!;
    expect(whole[0][0]).toBeCloseTo(0);
    expect(whole[whole.length - 1][0]).toBeCloseTo(10_000, 0);
  });

  it("draws no route without GPS or when almost nothing is left", () => {
    expect(routeMeters(straight(1.2), HIDDEN_METERS)).toBeNull();
    expect(routeMeters(straight(10).map((p) => ({ ...p, lat: null, lng: null })), HIDDEN_METERS)).toBeNull();
    expect(shareCard(demo(), { ...ALL, route: false }).route).toBeNull();
  });

  it("fits the route in its box with north up and the same shape", () => {
    const north = fitRoute([[0, 0], [0, 1000]], { x: 0, y: 0, w: 100, h: 100 });
    expect(north[0][1]).toBeCloseTo(100);
    expect(north[1][1]).toBeCloseTo(0);
    const wide = fitRoute([[0, 0], [2000, 1000]], { x: 10, y: 20, w: 100, h: 100 });
    expect(wide[0]).toEqual([10, 95]);
    expect(wide[1]).toEqual([110, 45]);
  });

  it("puts distance, time and climbing first for a ride outside, the rest in the small line", () => {
    const card = shareCard(demo(), ALL);
    expect(card.big.map((s) => s.id)).toEqual(["distance", "time", "elevation"]);
    expect(card.big[0].parts[1]).toEqual({ t: "km", small: true, space: true });
    expect(card.big[1].parts.map((p) => p.t).join("")).toBe("2h00′");
    expect(card.big[2].parts.map((p) => p.t).join(" ")).toBe("640 m");
    expect(card.more.map((s) => s.id)).toEqual(["np", "tss", "hr", "speed"]);
    expect(card.more[0].line).toEqual({ pre: "NP ", bold: "196 W", post: "" });
    expect(card.route!.length).toBeGreaterThan(100);
  });

  it("leaves out power and heart rate when asked", () => {
    const card = shareCard(demo(), { ...ALL, effort: false });
    const ids = [...card.big, ...card.more].map((s) => s.id);
    expect(ids).not.toContain("np");
    expect(ids).not.toContain("tss");
    expect(ids).not.toContain("hr");
    expect(ids).not.toContain("kj");
    expect(card.profile).toBeNull();
  });

  it("on the trainer says how long and how hard, without the climbing and the speed", () => {
    const card = shareCard({ ...demo(), indoor: true }, ALL);
    expect(card.big.map((s) => s.id)).toEqual(["time", "np", "tss"]);
    expect([...card.big, ...card.more].map((s) => s.id)).not.toContain("elevation");
    expect([...card.big, ...card.more].map((s) => s.id)).not.toContain("speed");
    expect(card.profile).toHaveLength(48);
  });

  it("writes the day in words and a file name every app accepts", () => {
    const card = shareCard({ ...demo(), date: "2026-11-01T07:28:00", name: "Fondo Z2 3h · Città" }, ALL);
    expect(card.when).toBe("Domenica 1 novembre · 7:28");
    expect(card.whenShort).toBe("dom 1 nov");
    expect(card.fileName).toBe("mascoach-2026-11-01-fondo-z2-3h-citta");
    expect(shareFileName({ date: "2026-11-01T07:28:00", name: "···" })).toBe("mascoach-2026-11-01");
  });

  it("writes times in hours and minutes", () => {
    expect(timeParts(3 * 3600 + 53 * 60).map((p) => p.t).join("")).toBe("3h53′");
    expect(timeParts(47 * 60).map((p) => p.t).join("")).toBe("47′");
    expect(timeParts(59 * 60 + 40).map((p) => p.t).join("")).toBe("1h00′");
  });

  it("makes the power profile from 0 to 1", () => {
    const p = powerProfile(demo().points)!;
    expect(p).toHaveLength(48);
    expect(Math.max(...p)).toBe(1);
    expect(Math.min(...p)).toBeGreaterThanOrEqual(0.04);
    expect(powerProfile(straight(10).map((x) => ({ ...x, watts: null })))).toBeNull();
  });
});
