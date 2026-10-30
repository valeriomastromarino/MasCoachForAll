// Detail of a single ride: summary metrics, down-sampled streams, route and detected efforts.
import { isTestName, toIF } from "./activities";
import { analyzeTest, type TestResult } from "./physio/fitnessTest";
import { COGGAN_POWER_ZONES } from "./physio/power";
import { isNum } from "./physio/stats";
import { capitalize } from "./text";

export type RawStream = { type: string; data: (number | null)[]; data2?: (number | null)[] };

export type RawIcuInterval = {
  type?: string | null;
  start_index: number;
  end_index: number;
  moving_time?: number | null;
  distance?: number | null;
  average_watts?: number | null;
  weighted_average_watts?: number | null;
  max_watts?: number | null;
  average_heartrate?: number | null;
  zone?: number | null;
};

export type RawRideDetail = {
  id: string;
  name?: string | null;
  start_date_local: string;
  type?: string;
  trainer?: boolean | null;
  distance?: number | null;
  moving_time?: number | null;
  total_elevation_gain?: number | null;
  average_speed?: number | null;
  average_temp?: number | null;
  icu_ftp?: number | null;
  icu_weighted_avg_watts?: number | null;
  icu_average_watts?: number | null;
  icu_intensity?: number | null;
  icu_training_load?: number | null;
  icu_variability_index?: number | null;
  icu_joules?: number | null;
  average_heartrate?: number | null;
  max_heartrate?: number | null;
  average_cadence?: number | null;
  decoupling?: number | null;
  icu_efficiency_factor?: number | null;
  avg_lr_balance?: number | null;
  carbs_used?: number | null;
  icu_zone_times?: { id: string; secs: number }[] | null;
  icu_hr_zone_times?: number[] | null;
  icu_hr_zones?: number[] | null;
  icu_intervals?: RawIcuInterval[] | null;
};

export type RidePoint = {
  /** Seconds from start. */
  t: number;
  km: number | null;
  watts: number | null;
  hr: number | null;
  cadence: number | null;
  altitude: number | null;
  dfa: number | null;
  lat: number | null;
  lng: number | null;
  /** Coggan zone index (0–6) of the 60 s rolling power, used to colour the route. */
  zone: number | null;
};

export type RideEffort = {
  startSec: number;
  durationSec: number;
  km: number | null;
  avgWatts: number | null;
  np: number | null;
  maxWatts: number | null;
  avgHr: number | null;
  zone: number | null;
};

export type RideDetail = {
  id: string;
  name: string;
  date: string;
  indoor: boolean;
  ftp: number | null;
  /** Coggan-style label of the ride from its Intensity Factor. */
  label: string | null;
  summary: {
    distanceKm: number | null;
    movingTime: number;
    elevation: number | null;
    speedKmh: number | null;
    temp: number | null;
    np: number | null;
    avgWatts: number | null;
    IF: number | null;
    tss: number | null;
    vi: number | null;
    kj: number | null;
    avgHr: number | null;
    maxHr: number | null;
    cadence: number | null;
    decoupling: number | null;
    ef: number | null;
    lrLeft: number | null;
    carbs: number | null;
  };
  powerZones: { id: string; name: string; secs: number }[];
  hrZones: { id: string; upper: number | null; secs: number }[];
  efforts: RideEffort[];
  points: RidePoint[];
  hasRoute: boolean;
  hasDfa: boolean;
  bucketSecs: number;
  /** Set when the ride looks like a fitness test (by its name). */
  test: TestResult | null;
};

const MAX_POINTS = 1500;

function num(x: number | null | undefined): number | null {
  return isNum(x) ? x : null;
}

/** Ride type from IF, following Coggan's guide ranges. */
export function rideLabel(IF: number | null): string | null {
  if (IF === null) return null;
  if (IF < 0.6) return "Recupero";
  if (IF < 0.76) return "Endurance";
  if (IF < 0.86) return "Tempo";
  if (IF < 0.96) return "Soglia / sweet spot";
  if (IF < 1.06) return "Gara / soglia";
  return "Sforzo breve intenso";
}

export function zoneIndex(watts: number, ftp: number): number {
  for (let i = 0; i < COGGAN_POWER_ZONES.length; i++) {
    const up = COGGAN_POWER_ZONES[i].upper;
    if (up === null || watts <= up * ftp) return i;
  }
  return COGGAN_POWER_ZONES.length - 1;
}

function round(x: number | null, digits = 0): number | null {
  if (x === null) return null;
  const f = 10 ** digits;
  return Math.round(x * f) / f;
}

function bucketMean(arr: (number | null)[] | undefined, from: number, to: number): number | null {
  if (!arr) return null;
  let sum = 0;
  let n = 0;
  for (let i = from; i < to && i < arr.length; i++) {
    const v = arr[i];
    if (isNum(v)) {
      sum += v;
      n++;
    }
  }
  return n ? sum / n : null;
}

/** Trailing rolling mean over `win` samples (nulls skipped). */
function rolling(arr: (number | null)[], win: number): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  let n = 0;
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (isNum(v)) {
      sum += v;
      n++;
    }
    const drop = i - win >= 0 ? arr[i - win] : null;
    if (isNum(drop)) {
      sum -= drop;
      n--;
    }
    out.push(n ? sum / n : null);
  }
  return out;
}

export function buildRide(raw: RawRideDetail, streams: RawStream[]): RideDetail {
  const s = new Map(streams.map((x) => [x.type, x]));
  const time = s.get("time")?.data;
  const len = Math.max(0, ...streams.map((x) => x.data.length));
  const bucket = Math.max(1, Math.ceil(len / MAX_POINTS));
  const ftp = num(raw.icu_ftp);
  const latlng = s.get("latlng");
  const watts = s.get("watts")?.data;
  // Streams are 1 Hz for Garmin files; 60 samples ≈ 1 minute smoothing for the route colours.
  const watts60 = watts ? rolling(watts, 60) : undefined;

  const points: RidePoint[] = [];
  for (let i = 0; i < len; i += bucket) {
    const end = i + bucket;
    const mid = Math.min(len - 1, i + Math.floor(bucket / 2));
    const dist = s.get("distance")?.data[mid];
    const lat = latlng?.data[mid];
    const lng = latlng?.data2?.[mid];
    const w60 = watts60?.[mid];
    points.push({
      t: num(time?.[i]) ?? i,
      km: isNum(dist) ? round(dist / 1000, 2) : null,
      watts: round(bucketMean(watts, i, end)),
      hr: round(bucketMean(s.get("heartrate")?.data, i, end)),
      cadence: round(bucketMean(s.get("cadence")?.data, i, end)),
      altitude: round(bucketMean(s.get("altitude")?.data, i, end), 1),
      dfa: round(bucketMean(s.get("dfa_a1")?.data, i, end), 2),
      lat: isNum(lat) && lat !== 0 ? round(lat, 5) : null,
      lng: isNum(lng) && lng !== 0 ? round(lng, 5) : null,
      zone: ftp && isNum(w60) ? zoneIndex(w60, ftp) : null,
    });
  }

  const distAt = (idx: number) => {
    const d = s.get("distance")?.data[idx];
    return isNum(d) ? d / 1000 : null;
  };

  const efforts: RideEffort[] = (raw.icu_intervals ?? [])
    .filter((iv) => iv.type === "WORK")
    .map((iv) => ({
      startSec: num(time?.[iv.start_index]) ?? iv.start_index,
      durationSec: num(iv.moving_time) ?? iv.end_index - iv.start_index,
      km: distAt(iv.start_index),
      avgWatts: num(iv.average_watts),
      np: num(iv.weighted_average_watts),
      maxWatts: num(iv.max_watts),
      avgHr: num(iv.average_heartrate),
      zone: isNum(iv.zone) ? iv.zone - 1 : null,
    }));

  const zt = new Map((raw.icu_zone_times ?? []).map((z) => [z.id, z.secs]));
  const hrUpper = raw.icu_hr_zones ?? [];
  const IF = toIF(raw.icu_intensity);
  const lr = num(raw.avg_lr_balance);

  return {
    id: raw.id,
    name: raw.name ? capitalize(raw.name) : "Uscita",
    date: raw.start_date_local,
    indoor: Boolean(raw.trainer) || raw.type === "VirtualRide",
    ftp,
    label: rideLabel(IF),
    summary: {
      distanceKm: isNum(raw.distance) ? raw.distance / 1000 : null,
      movingTime: raw.moving_time ?? 0,
      elevation: num(raw.total_elevation_gain),
      speedKmh: isNum(raw.average_speed) ? raw.average_speed * 3.6 : null,
      temp: num(raw.average_temp),
      np: num(raw.icu_weighted_avg_watts),
      avgWatts: num(raw.icu_average_watts),
      IF,
      tss: num(raw.icu_training_load),
      vi: num(raw.icu_variability_index),
      kj: isNum(raw.icu_joules) ? raw.icu_joules / 1000 : null,
      avgHr: num(raw.average_heartrate),
      maxHr: num(raw.max_heartrate),
      cadence: num(raw.average_cadence),
      decoupling: num(raw.decoupling),
      ef: num(raw.icu_efficiency_factor),
      lrLeft: lr,
      carbs: num(raw.carbs_used),
    },
    powerZones: COGGAN_POWER_ZONES.map((z) => ({ id: z.id, name: z.name, secs: zt.get(z.id) ?? 0 })),
    hrZones: (raw.icu_hr_zone_times ?? []).map((secs, i) => ({
      id: `Z${i + 1}`,
      upper: num(hrUpper[i]),
      secs,
    })),
    efforts,
    points,
    hasRoute: points.some((p) => p.lat !== null),
    hasDfa: points.some((p) => p.dfa !== null),
    bucketSecs: bucket,
    test: isTestName(raw.name)
      ? analyzeTest(raw.name ?? "", { watts, hr: s.get("heartrate")?.data, dfa: s.get("dfa_a1")?.data })
      : null,
  };
}
