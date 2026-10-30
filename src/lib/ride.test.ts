import { describe, expect, it } from "vitest";
import { demoRide } from "./demoRide";
import { buildRide, rideLabel, zoneIndex } from "./ride";

describe("ride detail", () => {
  it("labels rides by IF (Coggan ranges)", () => {
    expect(rideLabel(0.5)).toBe("Recupero");
    expect(rideLabel(0.66)).toBe("Endurance");
    expect(rideLabel(0.9)).toBe("Soglia / sweet spot");
    expect(rideLabel(null)).toBeNull();
  });

  it("maps watts to Coggan zones", () => {
    expect(zoneIndex(130, 250)).toBe(0);
    expect(zoneIndex(200, 250)).toBe(2);
    expect(zoneIndex(260, 250)).toBe(3);
    expect(zoneIndex(900, 250)).toBe(6);
  });

  it("down-samples streams and keeps the route aligned with the charts", () => {
    const { raw, streams } = demoRide("demo-x");
    const ride = buildRide(raw, streams);
    expect(ride.points.length).toBeLessThanOrEqual(1500);
    expect(ride.bucketSecs).toBe(5);
    expect(ride.hasRoute).toBe(true);
    // Every chart point carries its own position, so hovering a chart can move the map marker.
    expect(ride.points.every((p) => p.lat !== null && p.lng !== null)).toBe(true);
    expect(ride.efforts).toHaveLength(3);
    expect(ride.efforts[0].durationSec).toBe(480);
  });

  it("colours the route by 1-minute power, not single-second spikes", () => {
    const { raw, streams } = demoRide("demo-x");
    const ride = buildRide(raw, streams);
    // The first 8' effort averages ~238 W on FTP 250: once the 60 s window is inside it, it is mostly Z4.
    const inEffort = ride.points.filter((p) => p.t >= 1800 + 60 && p.t < 1800 + 480);
    const z4 = inEffort.filter((p) => p.zone === 3).length;
    expect(z4 / inEffort.length).toBeGreaterThan(0.6);
    // And no single-second spike paints it as anaerobic or neuromuscular.
    expect(inEffort.every((p) => p.zone !== null && p.zone <= 4)).toBe(true);
  });

  it("handles indoor rides without GPS", () => {
    const { raw, streams } = demoRide("demo-x");
    const ride = buildRide({ ...raw, trainer: true }, streams.filter((s) => s.type !== "latlng"));
    expect(ride.hasRoute).toBe(false);
    expect(ride.indoor).toBe(true);
  });
});
