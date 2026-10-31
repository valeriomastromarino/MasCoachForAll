// Bluetooth LE fitness protocols, as pure byte encoding/decoding (no Web Bluetooth here, so it is testable):
//   - Fitness Machine Service (FTMS, 0x1826): smart trainers — data, ERG target power, resistance level.
//   - Heart Rate Service (0x180D): heart rate and beat-to-beat RR intervals (for DFA α1).
//   - Cycling Power Service (0x1818): power meters (pedals) and trainers — power and crank cadence.
// Layouts from the Bluetooth SIG specifications; cross-checked with Auuki (github.com/dvmarinoff/Auuki).

export const UUID = {
  ftms: 0x1826,
  ftmsFeature: 0x2acc,
  indoorBikeData: 0x2ad2,
  resistanceRange: 0x2ad6,
  powerRange: 0x2ad8,
  controlPoint: 0x2ad9,
  machineStatus: 0x2ada,
  heartRate: 0x180d,
  heartRateMeasurement: 0x2a37,
  cyclingPower: 0x1818,
  cyclingPowerMeasurement: 0x2a63,
  deviceInfo: 0x180a,
} as const;

// ── FTMS ────────────────────────────────────────────────────────────────────────────────────────────

export type IndoorBikeData = {
  speedKmh: number | null;
  cadence: number | null;
  distanceM: number | null;
  resistance: number | null;
  power: number | null;
  heartRate: number | null;
};

/** Indoor Bike Data (0x2AD2). Bit 0 is "More Data": when it is 0 the instantaneous speed is present. */
export function parseIndoorBikeData(v: DataView): IndoorBikeData {
  const flags = v.getUint16(0, true);
  const has = (bit: number) => (flags & (1 << bit)) !== 0;
  let i = 2;
  const out: IndoorBikeData = { speedKmh: null, cadence: null, distanceM: null, resistance: null, power: null, heartRate: null };
  if (!has(0)) {
    out.speedKmh = v.getUint16(i, true) / 100;
    i += 2;
  }
  if (has(1)) i += 2; // average speed
  if (has(2)) {
    out.cadence = v.getUint16(i, true) / 2;
    i += 2;
  }
  if (has(3)) i += 2; // average cadence
  if (has(4)) {
    out.distanceM = v.getUint16(i, true) + (v.getUint8(i + 2) << 16);
    i += 3;
  }
  if (has(5)) {
    out.resistance = v.getInt16(i, true);
    i += 2;
  }
  if (has(6)) {
    out.power = v.getInt16(i, true);
    i += 2;
  }
  if (has(7)) i += 2; // average power
  if (has(8)) i += 5; // energy: total, per hour, per minute
  if (has(9)) {
    out.heartRate = v.getUint8(i);
    i += 1;
  }
  return out;
}

export type FtmsFeatures = { power: boolean; resistance: boolean; simulation: boolean };

/** Fitness Machine Feature (0x2ACC): the second 32-bit field says which targets the machine accepts. */
export function parseFtmsFeatures(v: DataView): FtmsFeatures {
  const target = v.byteLength >= 8 ? v.getUint32(4, true) : 0;
  return { resistance: (target & (1 << 2)) !== 0, power: (target & (1 << 3)) !== 0, simulation: (target & (1 << 13)) !== 0 };
}

export type Range = { min: number; max: number; step: number };

/** Supported Resistance Level Range (0x2AD6): unitless, resolution 0.1 (e.g. 0–100.0 by 1.0 on many trainers). */
export function parseResistanceRange(v: DataView): Range {
  return { min: v.getInt16(0, true) / 10, max: v.getInt16(2, true) / 10, step: v.getUint16(4, true) / 10 };
}

/** Supported Power Range (0x2AD8): watts. */
export function parsePowerRange(v: DataView): Range {
  return { min: v.getInt16(0, true), max: v.getInt16(2, true), step: v.getUint16(4, true) };
}

export const OP = {
  requestControl: 0x00,
  reset: 0x01,
  setResistance: 0x04,
  setPower: 0x05,
  startResume: 0x07,
  stopPause: 0x08,
  setSimulation: 0x11,
  response: 0x80,
} as const;

const bytes = (...b: number[]) => new Uint8Array(b);

export const ftmsCommand = {
  requestControl: () => bytes(OP.requestControl),
  reset: () => bytes(OP.reset),
  start: () => bytes(OP.startResume),
  /** Stop (1) or pause (2). */
  stop: (pause = false) => bytes(OP.stopPause, pause ? 2 : 1),
  /** ERG: target power in watts (sint16). */
  power(watts: number) {
    const w = Math.max(0, Math.min(4000, Math.round(watts)));
    return bytes(OP.setPower, w & 0xff, (w >> 8) & 0xff);
  },
  /** Resistance level, unitless with resolution 0.1 (sint16, as Auuki and the trainers in the wild expect). */
  resistance(level: number) {
    const r = Math.round(level * 10);
    const u = r < 0 ? r + 0x10000 : r;
    return bytes(OP.setResistance, u & 0xff, (u >> 8) & 0xff);
  },
  /** Indoor bike simulation, used only as a fallback for resistance: grade in %, still air, default rolling and drag. */
  simulation(gradePct: number) {
    const g = Math.round(gradePct * 100);
    const u = g < 0 ? g + 0x10000 : g;
    return bytes(OP.setSimulation, 0, 0, u & 0xff, (u >> 8) & 0xff, 40, 51); // wind 0, crr 0.0040, cw 0.51 kg/m
  },
};

export type ControlResponse = { op: number; result: number; ok: boolean };

export const CONTROL_RESULT: Record<number, string> = {
  1: "ok",
  2: "comando non supportato",
  3: "valore non valido",
  4: "comando non riuscito",
  5: "controllo non concesso",
};

/** Control Point indication: 0x80, the request op code, result (1 = success). */
export function parseControlResponse(v: DataView): ControlResponse | null {
  if (v.byteLength < 3 || v.getUint8(0) !== OP.response) return null;
  const result = v.getUint8(2);
  return { op: v.getUint8(1), result, ok: result === 1 };
}

// ── Heart rate ──────────────────────────────────────────────────────────────────────────────────────

export type HeartRateMeasurement = { heartRate: number; rr: number[] };

/** Heart Rate Measurement (0x2A37). RR intervals come in 1/1024 s; returned in ms. */
export function parseHeartRate(v: DataView): HeartRateMeasurement {
  const flags = v.getUint8(0);
  let i = 1;
  let heartRate: number;
  if (flags & 0x01) {
    heartRate = v.getUint16(i, true);
    i += 2;
  } else {
    heartRate = v.getUint8(i);
    i += 1;
  }
  if (flags & 0x08) i += 2; // energy expended
  const rr: number[] = [];
  if (flags & 0x10) {
    for (; i + 1 < v.byteLength; i += 2) rr.push((v.getUint16(i, true) * 1000) / 1024);
  }
  return { heartRate, rr };
}

// ── Cycling power ───────────────────────────────────────────────────────────────────────────────────

export type CyclingPowerMeasurement = {
  power: number;
  /** Cumulative crank revolutions and the time of the last one (1/1024 s), for cadence. */
  crank: { revs: number; time: number } | null;
};

/** Cycling Power Measurement (0x2A63). */
export function parseCyclingPower(v: DataView): CyclingPowerMeasurement {
  const flags = v.getUint16(0, true);
  const power = v.getInt16(2, true);
  let i = 4;
  if (flags & (1 << 0)) i += 1; // pedal power balance
  if (flags & (1 << 2)) i += 2; // accumulated torque
  if (flags & (1 << 4)) i += 6; // wheel revolutions + last wheel event
  let crank: CyclingPowerMeasurement["crank"] = null;
  if (flags & (1 << 5) && i + 4 <= v.byteLength) crank = { revs: v.getUint16(i, true), time: v.getUint16(i + 2, true) };
  return { power, crank };
}

/** Cadence (rpm) between two crank readings; counters wrap at 16 bits. Null when the crank has not moved. */
export function crankCadence(prev: { revs: number; time: number }, cur: { revs: number; time: number }): number | null {
  const dRevs = (cur.revs - prev.revs + 0x10000) % 0x10000;
  const dTime = (cur.time - prev.time + 0x10000) % 0x10000;
  if (dRevs === 0 || dTime === 0) return null;
  return (dRevs * 60 * 1024) / dTime;
}

// ── Resistance steps ("gradini") ────────────────────────────────────────────────────────────────────

/** Levels the − / + buttons step through: the trainer's own steps when few, otherwise 10 equal steps. */
export function resistanceSteps(range: Range | null): number[] {
  const r = range && range.max > range.min ? range : { min: 0, max: 100, step: 1 };
  const count = r.step > 0 ? Math.round((r.max - r.min) / r.step) : 0;
  if (count >= 2 && count <= 20) return Array.from({ length: count + 1 }, (_, k) => r.min + k * r.step);
  return Array.from({ length: 11 }, (_, k) => r.min + ((r.max - r.min) * k) / 10);
}
