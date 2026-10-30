// Long-term history for the coach (up to 4 years): year and month summaries of riding, load, power,
// eFTP, tests and the autonomic markers (HRV with Altini's method, resting HR, sleep, anomalous nights).
import { isTestName, RIDE_TYPES } from "./activities";
import { dateRange } from "./dates";
import { curveAt } from "./insights";
import type { IcuActivity, IcuPowerCurve, IcuWellness } from "./intervals/types";
import { assessAutonomic, isAnomaly } from "./physio/autonomic";
import { band } from "./physio/baseline";
import { isNum } from "./physio/stats";

export type HistoryInput = {
  from: string;
  today: string;
  activities: IcuActivity[];
  wellness: IcuWellness[];
  /** Best powers per calendar year, keyed by year ("2024"). */
  yearCurves: Record<string, IcuPowerCurve | null>;
};

const BEST_SECS: [string, number][] = [
  ["5s", 5],
  ["1m", 60],
  ["5m", 300],
  ["20m", 1200],
  ["60m", 3600],
];
const ZONES = ["Z1", "Z2", "Z3", "Z4", "Z5", "Z6", "Z7"];
const LONG_RIDE_SECS = 3 * 3600;

const r1 = (x: number) => Math.round(x * 10) / 10;
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
/** Mean of ln rMSSD back in ms: the right average for a log-normal marker. */
const lnMeanMs = (xs: number[]) => (xs.length ? Math.round(Math.exp(avg(xs.map(Math.log))!)) : null);

type Bucket = {
  rides: number;
  secs: number;
  km: number;
  tss: number;
  longRides: number;
  tests: number;
  otherSecs: number;
  zoneSecs: number[];
  eftps: { date: string; eftp: number }[];
  ftp: { date: string; ftp: number } | null;
};

const emptyBucket = (): Bucket => ({ rides: 0, secs: 0, km: 0, tss: 0, longRides: 0, tests: 0, otherSecs: 0, zoneSecs: ZONES.map(() => 0), eftps: [], ftp: null });

function addActivity(b: Bucket, a: IcuActivity) {
  const date = a.start_date_local.slice(0, 10);
  if (!a.type || !RIDE_TYPES.has(a.type)) {
    if (a.type) b.otherSecs += a.moving_time ?? 0;
    return;
  }
  b.rides++;
  b.secs += a.moving_time ?? 0;
  b.km += (a.distance ?? 0) / 1000;
  b.tss += a.icu_training_load ?? 0;
  if ((a.moving_time ?? 0) >= LONG_RIDE_SECS) b.longRides++;
  if (isTestName(a.name)) b.tests++;
  // SS (sweet spot) overlaps Z3/Z4: only the seven Coggan zones are summed.
  for (const z of a.icu_zone_times ?? []) {
    const i = ZONES.indexOf(z.id);
    if (i >= 0) b.zoneSecs[i] += z.secs;
  }
  if (isNum(a.icu_rolling_ftp) && a.icu_rolling_ftp > 0) b.eftps.push({ date, eftp: Math.round(a.icu_rolling_ftp) });
  if (isNum(a.icu_ftp) && a.icu_ftp > 0 && (!b.ftp || date >= b.ftp.date)) b.ftp = { date, ftp: a.icu_ftp };
}

function rideSummary(b: Bucket) {
  const eftps = [...b.eftps].sort((x, y) => x.date.localeCompare(y.date));
  return {
    uscite_bici: b.rides,
    ore_bici: r1(b.secs / 3600),
    km: Math.round(b.km),
    tss_bici: Math.round(b.tss),
    uscite_oltre_3h: b.longRides,
    test: b.tests,
    ore_altri_sport: r1(b.otherSecs / 3600),
    eftp_max: eftps.length ? Math.max(...eftps.map((e) => e.eftp)) : null,
    eftp_fine: eftps.at(-1)?.eftp ?? null,
  };
}

export function buildHistory(input: HistoryInput) {
  const days = dateRange(input.from, input.today);
  const wellness = new Map(input.wellness.map((w) => [w.id, w]));
  const acts = input.activities
    .filter((a) => a.start_date_local.slice(0, 10) >= input.from)
    .sort((a, b) => a.start_date_local.localeCompare(b.start_date_local));

  // Altini over the whole period: ln rMSSD and resting HR against their own rolling baselines.
  const rmssd = days.map((d) => wellness.get(d)?.hrv ?? null);
  const rhr = days.map((d) => wellness.get(d)?.restingHR ?? null);
  const ln = rmssd.map((x) => (isNum(x) && x > 0 ? Math.log(x) : null));
  const { hrv: hrvBase, rhr: rhrBase } = assessAutonomic(days, ln, rhr);
  const anomalous = new Set(days.filter((_, i) => isAnomaly(hrvBase[i], rhrBase[i])));
  const hrvLow = new Set(days.filter((_, i) => band(hrvBase[i]) === "sotto"));

  const months = new Map<string, Bucket>();
  const years = new Map<string, Bucket>();
  for (const a of acts) {
    const d = a.start_date_local;
    for (const [map, key] of [
      [months, d.slice(0, 7)],
      [years, d.slice(0, 4)],
    ] as const) {
      if (!map.has(key)) map.set(key, emptyBucket());
      addActivity(map.get(key)!, a);
    }
  }

  const daysOf = (prefix: string) => days.filter((d) => d.startsWith(prefix));
  const ctlStats = (prefix: string) => {
    const pts = daysOf(prefix)
      .map((d) => ({ d, ctl: wellness.get(d)?.ctl }))
      .filter((p): p is { d: string; ctl: number } => isNum(p.ctl));
    if (!pts.length) return { ctl_media: null, ctl_max: null, ctl_fine: null };
    const max = pts.reduce((m, p) => (p.ctl > m.ctl ? p : m));
    return {
      ctl_media: r1(avg(pts.map((p) => p.ctl))!),
      ctl_max: { valore: r1(max.ctl), data: max.d },
      ctl_fine: r1(pts.at(-1)!.ctl),
    };
  };
  const recoveryStats = (prefix: string) => {
    const ds = daysOf(prefix);
    const vals = (f: (w: IcuWellness) => number | null | undefined) =>
      ds.map((d) => wellness.get(d)).map((w) => (w ? f(w) : null)).filter((x): x is number => isNum(x) && x > 0);
    const rhrs = vals((w) => w.restingHR);
    const sleep = vals((w) => w.sleepSecs);
    return {
      hrv_media_ms: lnMeanMs(vals((w) => w.hrv)),
      fc_riposo_media: rhrs.length ? r1(avg(rhrs)!) : null,
      sonno_medio_ore: sleep.length ? r1(avg(sleep)! / 3600) : null,
      notti_anomale: ds.filter((d) => anomalous.has(d)).length,
      giorni_hrv_sotto_norma: ds.filter((d) => hrvLow.has(d)).length,
    };
  };

  const monthKeys = [...new Set(days.map((d) => d.slice(0, 7)))];
  const yearKeys = [...new Set(days.map((d) => d.slice(0, 4)))];

  return {
    periodo: { da: input.from, a: input.today },
    note: [
      "Le attività importate solo da Strava non sono leggibili via API: mancano da uscite, ore e TSS, ma il loro carico è nel CTL.",
      "HRV: media dei ln rMSSD notturni riportata in ms; notte anomala = HRV sotto e FC a riposo sopra il proprio range nello stesso giorno (metodo Altini).",
      "eFTP: stima di Intervals.icu dopo ogni uscita; non è un test.",
    ],
    anni: yearKeys.map((y) => {
      const b = years.get(y) ?? emptyBucket();
      const totalZone = b.zoneSecs.reduce((s, x) => s + x, 0);
      const curve = input.yearCurves[y] ?? null;
      return {
        anno: y,
        ...(y === input.from.slice(0, 4) && input.from.slice(5) !== "01-01" ? { parziale_da: input.from } : {}),
        ...(y === input.today.slice(0, 4) ? { parziale_fino_a: input.today } : {}),
        ...rideSummary(b),
        ftp_impostata: b.ftp?.ftp ?? null,
        ...ctlStats(y),
        ...recoveryStats(y),
        migliori_watt: Object.fromEntries(BEST_SECS.map(([label, s]) => [label, curveAt(curve, s)])),
        tempo_in_zona_pct: totalZone ? Object.fromEntries(ZONES.map((z, i) => [z, r1((b.zoneSecs[i] / totalZone) * 100)])) : null,
      };
    }),
    mesi: monthKeys.map((m) => {
      const { ore_altri_sport, ...ride } = rideSummary(months.get(m) ?? emptyBucket());
      return { mese: m, ...ride, ore_altri_sport, ...ctlStats(m), ...recoveryStats(m) };
    }),
    test: acts
      .filter((a) => a.type && RIDE_TYPES.has(a.type) && isTestName(a.name))
      .map((a) => ({
        id: a.id,
        data: a.start_date_local.slice(0, 10),
        nome: a.name,
        durata_min: Math.round((a.moving_time ?? 0) / 60),
        watt_medi: a.icu_average_watts ?? null,
        np: a.icu_weighted_avg_watts ?? null,
        eftp_dopo: isNum(a.icu_rolling_ftp) ? Math.round(a.icu_rolling_ftp) : null,
      })),
    notti_anomale: [...anomalous],
  };
}

export type HistoryData = ReturnType<typeof buildHistory>;
