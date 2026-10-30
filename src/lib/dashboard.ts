// Turns raw Intervals.icu data into everything the dashboard shows.
import { type ActivityRow, RIDE_TYPES, toActivityRow } from "./activities";
import { addDays, dateRange, weekStart } from "./dates";
import type { IcuSportSettings, RawData } from "./intervals/types";
import { type CpFit, fitCriticalPower, type MmpPoint } from "./physio/criticalPower";
import { classifyDistribution, type Distribution, type DistributionPattern, seilerDistribution } from "./physio/distribution";
import { hrZones } from "./physio/hrZones";
import {
  type EfficiencyRide,
  efficiencyTrend,
  type EftpPoint,
  eftpTrend,
  type MonthRecord,
  monthRecords,
  type PlanDay,
  type PlanWeek,
  planVsDone,
  type SleepNight,
  sleepSeries,
  weekDays,
  weeklyZones,
  weightSeries,
  type ZoneWeek,
} from "./insights";
import { type AutonomicAssessment, assessAutonomic, isAnomaly } from "./physio/autonomic";
import { analyzeHrv, type HrvAnalysis } from "./physio/hrv";
import { computePmc, type FormZone, formZone, rampRate } from "./physio/pmc";
import { powerZones, type Zone } from "./physio/power";
import { assessReadiness, type Readiness } from "./physio/readiness";
import { isNum } from "./physio/stats";

const MODEL_NAMES: Record<string, string> = {
  MS_2P: "Monod-Scherrer 2P",
  MORTON_3P: "Morton 3P",
  FFT_CURVES: "FFT",
  ECP: "Extended CP",
};


export type DashboardData = {
  source: RawData["source"];
  today: string;
  athlete: {
    name: string;
    weight: number | null;
    ftp: number | null;
    indoorFtp: number | null;
    lthr: number | null;
    maxHr: number | null;
    /** W′ set on Intervals.icu for cycling, J. */
    wPrime: number | null;
  };
  powerZones: Zone[];
  hrZones: Zone[];
  cp: CpFit | null;
  /** Intervals.icu's own power-duration models on the same curve, for comparison. */
  icuModels: { name: string; cp: number; ftp: number | null }[];
  mmp: MmpPoint[];
  pmc: { date: string; ctl: number; atl: number; tsb: number; load: number }[];
  /** Overnight markers per day. HRV is analysed on ln rMSSD and converted back to ms for display. */
  recovery: {
    date: string;
    rmssd: number | null;
    hrvBaseline: number | null;
    hrvRange: [number, number] | null;
    rhr: number | null;
    rhrBaseline: number | null;
    rhrRange: [number, number] | null;
    anomaly: boolean;
  }[];
  status: {
    ctl: number | null;
    atl: number | null;
    tsb: number | null;
    rampRate: number | null;
    formZone: FormZone | null;
    hrv: HrvAnalysis["today"];
    rhr: { today: number | null; baseline7: number | null; low: number | null; high: number | null };
    autonomic: Omit<AutonomicAssessment, "hrv" | "rhr">;
    sleepHours: number | null;
    readiness: Readiness;
  };
  distribution: Distribution & { pattern: DistributionPattern; days: number };
  /** Share of riding time in each Coggan zone over the same window (Z1–Z7). */
  zoneShares: { id: string; share: number }[];
  weekly: { week: string; load: number; hours: number }[];
  activities: ActivityRow[];
  /** eFTP estimated by Intervals.icu after each riding day, last 12 months. */
  eftp: EftpPoint[];
  /** Best powers of this month vs last month and the last 84 days. */
  records: { month: string; previousMonth: string; rows: MonthRecord[] };
  /** Weekly load planned on the Intervals.icu calendar vs done; hasPlan is false when nothing is planned. */
  plan: { weeks: PlanWeek[]; days: PlanDay[]; hasPlan: boolean };
  sleep: SleepNight[];
  weightTrend: { date: string; kg: number }[];
  zoneWeeks: ZoneWeek[];
  efficiency: EfficiencyRide[];
  /** Activities Intervals.icu won't expose via API (Strava-only imports) in the displayed period. */
  hiddenActivities: number;
};

function rideSettings(settings: IcuSportSettings[] | undefined): IcuSportSettings | undefined {
  return settings?.find((s) => s.types?.includes("Ride")) ?? settings?.[0];
}

function num(x: number | null | undefined): number | null {
  return isNum(x) ? x : null;
}

export function buildDashboard(raw: RawData, displayDays = 120): DashboardData {
  const today = raw.today;
  const days = dateRange(addDays(today, -displayDays + 1), today);
  const wellnessByDate = new Map(raw.wellness.map((w) => [w.id, w]));

  const rides = raw.activities.filter((a) => a.type && RIDE_TYPES.has(a.type));
  const hiddenActivities = raw.activities.filter((a) => !a.type && a.start_date_local.slice(0, 10) >= days[0]).length;

  // Load counts every sport (it's whole-body fatigue); the analysis below is cycling-only.
  // Prefer Intervals.icu's daily load: it also includes activities the API hides (Strava-only imports).
  // atlLoad is the total stress of the day; ctlLoad may leave out sports set to count only as fatigue (gym).
  const activityLoad = new Map<string, number>();
  for (const a of raw.activities) {
    const d = a.start_date_local.slice(0, 10);
    activityLoad.set(d, (activityLoad.get(d) ?? 0) + (a.icu_training_load ?? 0));
  }
  const loadByDate = new Map(
    days.map((d) => {
      const w = wellnessByDate.get(d);
      return [d, num(w?.atlLoad) ?? num(w?.ctlLoad) ?? activityLoad.get(d) ?? 0] as const;
    }),
  );

  // PMC: prefer Intervals.icu's own CTL/ATL (it has full history); fall back to our model if missing.
  const haveIcuPmc = raw.wellness.some((w) => isNum(w.ctl));
  let pmc: DashboardData["pmc"];
  if (haveIcuPmc) {
    let prev = { ctl: 0, atl: 0 };
    pmc = days.map((date) => {
      const w = wellnessByDate.get(date);
      const ctl = num(w?.ctl) ?? prev.ctl;
      const atl = num(w?.atl) ?? prev.atl;
      const point = { date, ctl, atl, tsb: prev.ctl - prev.atl, load: loadByDate.get(date) ?? 0 };
      prev = { ctl, atl };
      return point;
    });
    // First day has no "yesterday": use same-day values.
    if (pmc.length) pmc[0].tsb = pmc[0].ctl - pmc[0].atl;
  } else {
    pmc = computePmc(days.map((date) => ({ date, load: loadByDate.get(date) ?? 0 })));
  }

  const hrvDays = days.map((date) => ({ date, rmssd: num(wellnessByDate.get(date)?.hrv) }));
  const hrvAnalysis = analyzeHrv(hrvDays);
  const rhrValues = days.map((d) => num(wellnessByDate.get(d)?.restingHR));
  const { hrv: hrvBase, rhr: rhrBase, ...autonomic } = assessAutonomic(
    days,
    hrvAnalysis.points.map((p) => p.ln),
    rhrValues,
  );
  const exp = (x: number | null) => (x === null ? null : Math.exp(x));
  const recovery: DashboardData["recovery"] = days.map((date, i) => {
    const h = hrvBase[i];
    const r = rhrBase[i];
    return {
      date,
      rmssd: hrvDays[i].rmssd,
      hrvBaseline: exp(h.baseline7),
      hrvRange: h.low !== null && h.high !== null ? [Math.exp(h.low), Math.exp(h.high)] : null,
      rhr: rhrValues[i],
      rhrBaseline: r.baseline7,
      rhrRange: r.low !== null && r.high !== null ? [r.low, r.high] : null,
      anomaly: isAnomaly(h, r),
    };
  });
  const lastRhr = rhrBase[rhrBase.length - 1];
  const rhr = {
    today: rhrValues[rhrValues.length - 1] ?? null,
    baseline7: lastRhr?.baseline7 ?? null,
    low: lastRhr?.low ?? null,
    high: lastRhr?.high ?? null,
  };

  const todayWellness = wellnessByDate.get(today);
  const sleepSecs = num(todayWellness?.sleepSecs);
  const sleepHours = sleepSecs !== null ? sleepSecs / 3600 : null;

  const last = pmc[pmc.length - 1];
  const ctl = last?.ctl ?? null;
  const tsb = last?.tsb ?? null;

  const readiness = assessReadiness({
    hrv: hrvAnalysis.today,
    autonomic,
    ctl,
    tsb,
    sleepHours,
  });

  const settings = rideSettings(raw.athlete.sportSettings);
  const ftp = num(settings?.ftp);
  const lthr = num(settings?.lthr);
  const weight =
    num(raw.athlete.icu_weight) ??
    num([...raw.wellness].reverse().find((w) => isNum(w.weight))?.weight) ??
    num(raw.athlete.weight);

  const curveWatts = raw.powerCurve?.values ?? raw.powerCurve?.watts ?? [];
  const mmp: MmpPoint[] = (raw.powerCurve?.secs ?? [])
    .map((secs, i) => ({ secs, watts: curveWatts[i] }))
    .filter((p) => isNum(p.watts) && p.watts > 0);

  const distDays = 28;
  const distFrom = addDays(today, -distDays + 1);
  const recent = rides.filter((a) => a.start_date_local.slice(0, 10) >= distFrom);
  const dist = seilerDistribution(recent.map((a) => a.icu_zone_times ?? []));
  const zoneSecs = new Map(["Z1", "Z2", "Z3", "Z4", "Z5", "Z6", "Z7"].map((z) => [z, 0]));
  for (const a of recent)
    for (const z of a.icu_zone_times ?? []) if (zoneSecs.has(z.id)) zoneSecs.set(z.id, zoneSecs.get(z.id)! + z.secs);
  const zoneTotal = [...zoneSecs.values()].reduce((x, y) => x + y, 0);
  const zoneShares = [...zoneSecs].map(([id, secs]) => ({ id, share: zoneTotal ? secs / zoneTotal : 0 }));

  const weeks = new Map<string, { load: number; hours: number }>();
  for (let i = 11; i >= 0; i--) weeks.set(weekStart(addDays(today, -7 * i)), { load: 0, hours: 0 });
  for (const [d, load] of loadByDate) {
    const w = weeks.get(weekStart(d));
    if (w) w.load += load;
  }
  for (const a of raw.activities) {
    const w = weeks.get(weekStart(a.start_date_local.slice(0, 10)));
    if (w) w.hours += (a.moving_time ?? 0) / 3600;
  }

  const plan = planVsDone(raw.events, loadByDate, raw.activities, today);
  const prevMonth = addDays(today.slice(0, 8) + "01", -1).slice(0, 7);

  return {
    source: raw.source,
    today,
    athlete: {
      name: raw.athlete.name || raw.athlete.firstname || "Atleta",
      weight,
      ftp,
      indoorFtp: num(settings?.indoor_ftp),
      lthr,
      maxHr: num(settings?.max_hr),
      wPrime: num(settings?.w_prime),
    },
    powerZones: ftp ? powerZones(ftp) : [],
    hrZones: lthr ? hrZones(lthr) : [],
    cp: fitCriticalPower(mmp),
    icuModels: (raw.powerCurve?.powerModels ?? [])
      .filter((m) => isNum(m.criticalPower))
      .map((m) => ({ name: MODEL_NAMES[m.type] ?? m.type, cp: m.criticalPower!, ftp: num(m.ftp) })),
    mmp,
    pmc,
    recovery,
    status: {
      ctl,
      atl: last?.atl ?? null,
      tsb,
      rampRate: isNum(rampRate(pmc)) ? rampRate(pmc) : null,
      formZone: ctl !== null && tsb !== null ? formZone(tsb, ctl) : null,
      hrv: hrvAnalysis.today,
      rhr,
      autonomic,
      sleepHours,
      readiness,
    },
    distribution: { ...dist, pattern: classifyDistribution(dist), days: distDays },
    zoneShares,
    weekly: [...weeks].map(([week, v]) => ({ week, load: Math.round(v.load), hours: v.hours })),
    activities: [...rides]
      .sort((a, b) => b.start_date_local.localeCompare(a.start_date_local))
      .slice(0, 15)
      .map(toActivityRow),
    eftp: eftpTrend(rides),
    records: {
      month: today.slice(0, 7),
      previousMonth: prevMonth,
      rows: monthRecords(raw.powerCurve, raw.monthCurves.current, raw.monthCurves.previous),
    },
    plan: { weeks: plan, days: weekDays(raw.events, raw.activities, today), hasPlan: plan.some((w) => w.planned > 0) },
    sleep: sleepSeries(raw.wellness, days.slice(-90)),
    weightTrend: weightSeries(raw.wellness),
    zoneWeeks: weeklyZones(rides, today),
    efficiency: efficiencyTrend(rides, days[0]),
    hiddenActivities,
  };
}
