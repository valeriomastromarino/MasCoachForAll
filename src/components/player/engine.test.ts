import { afterEach, describe, expect, it, vi } from "vitest";
import { demoWorkout } from "@/lib/player/load";
import type { PlayerWorkout } from "@/lib/player/timeline";
import { PlayerEngine } from "./engine";

// The engine's clock is private: drive it like the 1-second timer does, with trainer and strap readings set by hand.
type Inside = {
  step: () => void;
  trainerData: { power: number | null; cadence: number | null; speedKmh: number | null } | null;
  trainerAt: number;
  hrStrap: { onBeat: (hr: number, rr: number[]) => void; status: string };
};

/** Seconds on the trainer without the strap sending anything. */
function rideNoBeats(engine: PlayerEngine, secs: number, power: number, cadence: number) {
  const e = engine as unknown as Inside;
  for (let i = 0; i < secs; i++) {
    e.trainerData = { power, cadence, speedKmh: 30 };
    e.trainerAt = Date.now();
    e.step();
  }
}

function ride(engine: PlayerEngine, secs: number, power: number, cadence: number, hr = 130) {
  const e = engine as unknown as Inside;
  for (let i = 0; i < secs; i++) {
    e.trainerData = { power, cadence, speedKmh: 30 };
    e.trainerAt = Date.now();
    e.hrStrap.onBeat(hr, [60000 / hr]);
    e.step();
  }
}

describe("player engine", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("records only the seconds ridden, pauses by itself and keeps the RR intervals", () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 503 })));
    const engine = new PlayerEngine(demoWorkout(250, "2026-10-31"));
    engine.play(); // pressing play before pedalling must not lose the start
    ride(engine, 20, 150, 90);
    ride(engine, 6, 0, 0); // stopped: 3 s later the session pauses by itself
    ride(engine, 10, 160, 88);
    const v = engine.getView();
    expect(v.recording).toBe(true);
    expect(v.session.autoPaused).toBe(false);
    const rec = engine.recording()!;
    expect(rec.samples.length).toBe(20 + 2 + 10); // two still seconds ridden before the pause
    expect(rec.pauses).toHaveLength(1);
    expect(rec.pauses[0].to).not.toBeNull();
    expect(rec.rr.length).toBe(35); // every beat from the first second ridden on
    expect(v.session.pos).toBe(32);
  });

  it("moves the ERG target and the resistance step from the buttons", () => {
    const engine = new PlayerEngine(demoWorkout(250, "2026-10-31"));
    const base = engine.getView().target;
    engine.adjust(1);
    engine.adjust(1);
    expect(engine.getView().target).toBe(base + 10);
    engine.setMode("resistance");
    engine.adjust(-1);
    expect(engine.getView().session.level).toBe(2);
  });

  it("finishes: keeps the session when the upload fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "offline" }), { status: 502 })));
    const engine = new PlayerEngine(demoWorkout(250, "2026-10-31"));
    ride(engine, 30, 200, 90);
    await engine.finish();
    const v = engine.getView();
    expect(v.session.status).toBe("done");
    expect(v.finished?.status).toBe("finished");
    expect(v.finished?.error).toBe("offline");
  });

  it("ends and keeps the ride when the last step is skipped", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "offline" }), { status: 502 })));
    const engine = new PlayerEngine(demoWorkout(250, "2026-10-31"));
    ride(engine, 20, 150, 90);
    for (let i = 0; i < 20 && engine.getView().session.status !== "done"; i++) engine.skip(1);
    expect(engine.getView().session.status).toBe("done");
    await vi.waitFor(() => expect(engine.getView().finished?.status).toBe("finished"));
    expect(engine.getView().finished?.samples).toHaveLength(20);
  });

  it("drops the DFA α1 when the strap is not connected, instead of showing and recording a stale one", () => {
    const engine = new PlayerEngine(demoWorkout(250, "2026-10-31"));
    const e = engine as unknown as Inside;
    e.hrStrap.status = "connected";
    ride(engine, 10, 150, 90);
    expect(engine.getView().dfa).not.toBeNull();
    e.hrStrap.status = "lost";
    rideNoBeats(engine, 5, 150, 90);
    expect(engine.getView().dfa).toBeNull();
    expect(engine.recording()!.samples.at(-1)?.dfa ?? null).toBeNull();
  });

  it("keeps the ridden-power line to the profile's resolution on long rides", () => {
    const long: PlayerWorkout = {
      id: "lunga",
      name: "Lunga",
      date: "2026-10-31",
      ftp: 250,
      description: null,
      steps: [{ index: 0, start: 0, secs: 10800, from: 150, to: 150, ramp: false, cadence: null, label: null, zone: 2 }],
      totalSecs: 10800,
    };
    const engine = new PlayerEngine(long);
    rideNoBeats(engine, 3600, 160, 90);
    const trace = engine.getView().trace;
    expect(trace.length).toBeLessThanOrEqual(Math.ceil(3600 / 10.8) + 1);
    expect(trace.every((p) => p.w === 160)).toBe(true);
    expect(engine.recording()!.samples).toHaveLength(3600);
  });
});
