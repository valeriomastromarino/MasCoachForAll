// Minimal FIT activity writer (FIT protocol 2.0): file id, timer events, records (power, heart rate, cadence,
// speed, distance), HRV messages with the RR intervals (Intervals.icu computes DFA α1 from them), a lap per
// workout step, session and activity. Checked against Garmin's own decoder in fit.test.ts.
import { type Recording, type Sample, summarize } from "./recording";

/** FIT time starts at 1989-12-31T00:00:00Z. */
const FIT_EPOCH_S = 631065600;
const fitTime = (ms: number) => Math.round(ms / 1000) - FIT_EPOCH_S;

const CRC_TABLE = [0x0000, 0xcc01, 0xd801, 0x1400, 0xf001, 0x3c00, 0x2800, 0xe401, 0xa001, 0x6c00, 0x7800, 0xb401, 0x5000, 0x9c01, 0x8801, 0x4400];

function crc16(bytes: Uint8Array, crc = 0): number {
  for (const b of bytes) {
    let tmp = CRC_TABLE[crc & 0xf];
    crc = (crc >> 4) & 0x0fff;
    crc = crc ^ tmp ^ CRC_TABLE[b & 0xf];
    tmp = CRC_TABLE[crc & 0xf];
    crc = (crc >> 4) & 0x0fff;
    crc = crc ^ tmp ^ CRC_TABLE[(b >> 4) & 0xf];
  }
  return crc;
}

type BaseType = "enum" | "uint8" | "uint16" | "uint32" | "uint32z";
const BASE: Record<BaseType, { id: number; size: number; invalid: number }> = {
  enum: { id: 0x00, size: 1, invalid: 0xff },
  uint8: { id: 0x02, size: 1, invalid: 0xff },
  uint16: { id: 0x84, size: 2, invalid: 0xffff },
  uint32: { id: 0x86, size: 4, invalid: 0xffffffff },
  uint32z: { id: 0x8c, size: 4, invalid: 0 },
};

/** [field number, base type, array length] */
type Field = [number, BaseType, number?];
type MessageDef = { global: number; fields: Field[] };

const MSG = {
  fileId: { global: 0, fields: [[0, "enum"], [1, "uint16"], [2, "uint16"], [3, "uint32z"], [4, "uint32"]] },
  event: { global: 21, fields: [[253, "uint32"], [0, "enum"], [1, "enum"]] },
  record: { global: 20, fields: [[253, "uint32"], [3, "uint8"], [4, "uint8"], [7, "uint16"], [6, "uint16"], [5, "uint32"]] },
  hrv: { global: 78, fields: [[0, "uint16", 5]] },
  lap: {
    global: 19,
    fields: [[253, "uint32"], [254, "uint16"], [0, "enum"], [1, "enum"], [2, "uint32"], [7, "uint32"], [8, "uint32"], [9, "uint32"],
      [15, "uint8"], [16, "uint8"], [17, "uint8"], [19, "uint16"], [20, "uint16"], [24, "enum"], [25, "enum"], [39, "enum"]],
  },
  session: {
    global: 18,
    fields: [[253, "uint32"], [254, "uint16"], [0, "enum"], [1, "enum"], [2, "uint32"], [5, "enum"], [6, "enum"], [7, "uint32"], [8, "uint32"],
      [9, "uint32"], [16, "uint8"], [17, "uint8"], [18, "uint8"], [20, "uint16"], [21, "uint16"], [25, "uint16"], [26, "uint16"], [28, "enum"]],
  },
  activity: { global: 34, fields: [[253, "uint32"], [0, "uint32"], [1, "uint16"], [2, "enum"], [3, "enum"], [4, "enum"], [5, "uint32"]] },
} satisfies Record<string, MessageDef>;

type MsgName = keyof typeof MSG;

const SPORT_CYCLING = 2;
const SUB_SPORT_INDOOR_CYCLING = 6;
const EVENT = { timer: 0, lap: 9, session: 8, activity: 26 };
const EVENT_TYPE = { start: 0, stop: 1, stopAll: 4 };

class Writer {
  private chunks: number[] = [];
  private defined = new Map<MsgName, number>();

  private bytes(n: number, size: number) {
    for (let i = 0; i < size; i++) this.chunks.push((n / 2 ** (8 * i)) & 0xff);
  }

  write(name: MsgName, values: (number | null | (number | null)[])[]) {
    const def: MessageDef = MSG[name];
    let local = this.defined.get(name);
    if (local === undefined) {
      local = this.defined.size;
      this.defined.set(name, local);
      this.chunks.push(0x40 | local, 0, 0); // definition header, reserved, little endian
      this.bytes(def.global, 2);
      this.chunks.push(def.fields.length);
      for (const [num, type, n = 1] of def.fields) this.chunks.push(num, BASE[type].size * n, BASE[type].id);
    }
    this.chunks.push(local);
    def.fields.forEach(([, type, n = 1], i) => {
      const v = values[i];
      const list = Array.isArray(v) ? v : [v];
      for (let k = 0; k < n; k++) {
        const x = list[k];
        const ok = x !== null && x !== undefined && Number.isFinite(x);
        this.bytes(ok ? Math.max(0, Math.round(x)) : BASE[type].invalid, BASE[type].size);
      }
    });
  }

  file(): Uint8Array {
    const data = new Uint8Array(this.chunks);
    const header = new Uint8Array(14);
    const hv = new DataView(header.buffer);
    hv.setUint8(0, 14);
    hv.setUint8(1, 0x20);
    hv.setUint16(2, 2132, true);
    hv.setUint32(4, data.length, true);
    header.set([0x2e, 0x46, 0x49, 0x54], 8); // ".FIT"
    hv.setUint16(12, crc16(header.subarray(0, 12)), true);
    const out = new Uint8Array(14 + data.length + 2);
    out.set(header, 0);
    out.set(data, 14);
    new DataView(out.buffer).setUint16(14 + data.length, crc16(out.subarray(0, 14 + data.length)), true);
    return out;
  }
}

const scale = (x: number | null, k: number) => (x === null ? null : x * k);

/** FIT file of a recorded session. */
export function encodeFit(rec: Recording): Uint8Array {
  const w = new Writer();
  const samples = rec.samples;
  const first = samples[0]?.t ?? rec.startedAt;
  const last = samples[samples.length - 1]?.t ?? rec.startedAt;
  const total = summarize(samples);
  const elapsedS = Math.max(1, (last - first) / 1000 + 1);

  w.write("fileId", [4, 255, 0, 1, fitTime(rec.startedAt)]);
  w.write("event", [fitTime(first), EVENT.timer, EVENT_TYPE.start]);

  let r = 0;
  const pauses = [...rec.pauses].sort((a, b) => a.from - b.from);
  let p = 0;
  for (const s of samples) {
    while (p < pauses.length && pauses[p].from <= s.t) {
      const pz = pauses[p++];
      w.write("event", [fitTime(pz.from), EVENT.timer, EVENT_TYPE.stopAll]);
      if (pz.to !== null) w.write("event", [fitTime(Math.max(pz.to, pz.from)), EVENT.timer, EVENT_TYPE.start]);
    }
    w.write("record", [fitTime(s.t), s.hr, s.cadence, s.power, scale(s.speed === null ? null : s.speed / 3.6, 1000), s.distance * 100]);
    // RR intervals that arrived up to this second, five per HRV message (in seconds, scale 1000).
    const batch: number[] = [];
    while (r < rec.rr.length && rec.rr[r].t <= s.t) batch.push(rec.rr[r++].ms / 1000);
    for (let i = 0; i < batch.length; i += 5) w.write("hrv", [batch.slice(i, i + 5).map((x) => x * 1000)]);
  }
  const rest = rec.rr.slice(r).map((x) => x.ms);
  for (let i = 0; i < rest.length; i += 5) w.write("hrv", [rest.slice(i, i + 5)]);

  const lapStarts = rec.laps.filter((i) => i < samples.length);
  if (!lapStarts.length) lapStarts.push(0);
  lapStarts.forEach((startIdx, k) => {
    const endIdx = k + 1 < lapStarts.length ? lapStarts[k + 1] : samples.length;
    const part: Sample[] = samples.slice(startIdx, endIdx);
    if (!part.length) return;
    const s = summarize(part);
    const t0 = part[0].t;
    const t1 = part[part.length - 1].t;
    const dist = part[part.length - 1].distance - (startIdx > 0 ? samples[startIdx - 1].distance : 0);
    w.write("lap", [fitTime(t1), k, EVENT.lap, EVENT_TYPE.stop, fitTime(t0), ((t1 - t0) / 1000 + 1) * 1000, part.length * 1000, dist * 100,
      s.avgHr, s.maxHr, s.avgCadence, s.avgPower, s.maxPower, 0, SPORT_CYCLING, SUB_SPORT_INDOOR_CYCLING]);
  });

  w.write("session", [fitTime(last), 0, EVENT.session, EVENT_TYPE.stop, fitTime(first), SPORT_CYCLING, SUB_SPORT_INDOOR_CYCLING,
    elapsedS * 1000, total.secs * 1000, total.distanceKm * 1000 * 100, total.avgHr, total.maxHr, total.avgCadence, total.avgPower,
    total.maxPower, 0, lapStarts.length, 0]);
  const offset = -new Date(last).getTimezoneOffset() * 60;
  w.write("activity", [fitTime(last), total.secs * 1000, 1, 0, EVENT.activity, EVENT_TYPE.stop, fitTime(last) + offset]);
  return w.file();
}
