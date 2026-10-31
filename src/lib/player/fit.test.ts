import { Decoder, Stream } from "@garmin/fitsdk";
import { describe, expect, it } from "vitest";
import { encodeFit } from "./fit";
import { newRecording, type Recording } from "./recording";

function sampleRecording(): Recording {
  const t0 = Date.UTC(2026, 9, 31, 17, 0, 0);
  const rec = newRecording("123", "Prova rulli", t0);
  let distance = 0;
  for (let i = 0; i < 120; i++) {
    if (i >= 60 && i < 70) continue; // 10 s paused
    distance += 30 / 3.6;
    rec.samples.push({ t: t0 + i * 1000, power: i < 60 ? 150 : 220, hr: 120 + Math.floor(i / 10), cadence: 90, speed: 30, distance, target: 150 });
  }
  rec.laps = [0, 60];
  rec.pauses = [{ from: t0 + 60_000, to: t0 + 70_000 }];
  for (let ms = 0; ms < 120_000; ms += 750) rec.rr.push({ t: t0 + ms, ms: 750 });
  rec.status = "finished";
  return rec;
}

describe("FIT writer", () => {
  it("writes a file Garmin's decoder reads without errors", () => {
    const bytes = encodeFit(sampleRecording());
    const decoder = new Decoder(Stream.fromByteArray(Array.from(bytes)));
    expect(decoder.isFIT()).toBe(true);
    expect(decoder.checkIntegrity()).toBe(true);
    const { messages: read, errors } = decoder.read();
    const messages = read as Required<typeof read>;
    expect(errors).toEqual([]);

    expect(messages.fileIdMesgs[0].type).toBe("activity");
    expect(messages.recordMesgs).toHaveLength(110);
    expect(messages.recordMesgs[0].power).toBe(150);
    expect(messages.recordMesgs[0].heartRate).toBe(120);
    expect(messages.recordMesgs[0].speed).toBeCloseTo(30 / 3.6, 2);
    expect(messages.lapMesgs).toHaveLength(2);
    expect(messages.lapMesgs[1].avgPower).toBe(220);

    const session = messages.sessionMesgs[0];
    expect(session.sport).toBe("cycling");
    expect(session.subSport).toBe("indoorCycling");
    expect(session.totalTimerTime).toBe(110);
    expect(session.numLaps).toBe(2);

    // 160 RR intervals of 0.75 s, five per message.
    const rr = messages.hrvMesgs.flatMap((m) => m.time ?? []).filter((x) => x > 0 && x < 60);
    expect(rr).toHaveLength(160);
    expect(rr[0]).toBeCloseTo(0.75, 3);

    const timer = messages.eventMesgs.map((e) => e.eventType);
    expect(timer).toEqual(["start", "stopAll", "start"]);
    expect(messages.activityMesgs[0].numSessions).toBe(1);
  });
});
