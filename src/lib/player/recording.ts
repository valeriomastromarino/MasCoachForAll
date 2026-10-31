// What the player records during a session, and its summary. Saved on the device while riding (see store.ts),
// then written as a FIT file (fit.ts) and uploaded to Intervals.icu.

export type Sample = {
  /** Epoch ms. */
  t: number;
  power: number | null;
  hr: number | null;
  cadence: number | null;
  /** km/h, from the trainer. */
  speed: number | null;
  /** Cumulative metres. */
  distance: number;
  target: number | null;
};

export type Recording = {
  id: string;
  eventId: string | null;
  name: string;
  /** Epoch ms of the first pedal stroke. */
  startedAt: number;
  samples: Sample[];
  /** Beat-to-beat intervals from the chest strap, ms, with the time they arrived. */
  rr: { t: number; ms: number }[];
  /** Sample index where each lap (workout step) starts. */
  laps: number[];
  /** Timer stops (manual or automatic pauses), epoch ms. */
  pauses: { from: number; to: number | null }[];
  status: "recording" | "finished" | "uploaded";
  /** Activity id on Intervals.icu once uploaded. */
  uploadedId?: string | null;
  error?: string | null;
};

export function newRecording(eventId: string | null, name: string, now: number): Recording {
  return { id: `rulli-${now}`, eventId, name, startedAt: now, samples: [], rr: [], laps: [0], pauses: [], status: "recording" };
}

export type Summary = {
  secs: number;
  distanceKm: number;
  avgPower: number | null;
  maxPower: number | null;
  avgHr: number | null;
  maxHr: number | null;
  avgCadence: number | null;
  /** Total work, kJ. */
  kj: number;
};

const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : null);
const max = (xs: number[]) => (xs.length ? Math.max(...xs) : null);

export function summarize(samples: Sample[]): Summary {
  const p = samples.map((s) => s.power).filter((x): x is number => x !== null);
  const h = samples.map((s) => s.hr).filter((x): x is number => x !== null && x > 0);
  const c = samples.map((s) => s.cadence).filter((x): x is number => x !== null && x > 0);
  return {
    secs: samples.length,
    distanceKm: (samples[samples.length - 1]?.distance ?? 0) / 1000,
    avgPower: avg(p),
    maxPower: max(p),
    avgHr: avg(h),
    maxHr: max(h),
    avgCadence: avg(c),
    kj: Math.round(p.reduce((s, x) => s + x, 0) / 1000),
  };
}
