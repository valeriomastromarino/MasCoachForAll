// Trends behind the section pages: eFTP over time, monthly records, plan vs done, sleep, weight,
// time in zone week by week and aerobic efficiency.
import { toIF } from "./activities";
import { addDays, dateRange, weekStart } from "./dates";
import type { IcuActivity, IcuEvent, IcuPowerCurve, IcuWellness } from "./intervals/types";
import { isNum } from "./physio/stats";
import { capitalize } from "./text";

export const ZONE_IDS = ["Z1", "Z2", "Z3", "Z4", "Z5", "Z6", "Z7"] as const;
export type ZoneId = (typeof ZONE_IDS)[number];

const day = (iso: string) => iso.slice(0, 10);
const byDate = <T extends { start_date_local: string }>(a: T, b: T) => a.start_date_local.localeCompare(b.start_date_local);

// ── eFTP ────────────────────────────────────────────────────────────────────────────────────────────

export type EftpPoint = { date: string; eftp: number; ftp: number | null };

/** Intervals.icu's eFTP after each riding day (the last ride of the day wins). */
export function eftpTrend(rides: IcuActivity[]): EftpPoint[] {
  const out = new Map<string, EftpPoint>();
  for (const a of [...rides].sort(byDate)) {
    if (!isNum(a.icu_rolling_ftp) || a.icu_rolling_ftp <= 0) continue;
    const date = day(a.start_date_local);
    out.set(date, { date, eftp: Math.round(a.icu_rolling_ftp), ftp: isNum(a.icu_ftp) ? a.icu_ftp : null });
  }
  return [...out.values()];
}

// ── Monthly records ─────────────────────────────────────────────────────────────────────────────────

export const RECORD_DURATIONS = [5, 60, 300, 1200, 3600];

export type MonthRecord = { secs: number; current: number | null; previous: number | null; best84: number | null };

export function curveAt(curve: IcuPowerCurve | null | undefined, secs: number): number | null {
  if (!curve) return null;
  const i = curve.secs.indexOf(secs);
  const v = (curve.values ?? curve.watts)?.[i];
  return i >= 0 && isNum(v) && v > 0 ? v : null;
}

export function monthRecords(
  best84: IcuPowerCurve | null,
  current: IcuPowerCurve | null,
  previous: IcuPowerCurve | null,
): MonthRecord[] {
  return RECORD_DURATIONS.map((secs) => ({
    secs,
    current: curveAt(current, secs),
    previous: curveAt(previous, secs),
    best84: curveAt(best84, secs),
  }));
}

// ── Plan vs done ────────────────────────────────────────────────────────────────────────────────────

const PLANNED_CATEGORIES = new Set(["WORKOUT", "RACE_A", "RACE_B", "RACE_C"]);

export function isPlanned(e: IcuEvent): boolean {
  return PLANNED_CATEGORIES.has(e.category ?? "");
}

export type PlanWeek = {
  week: string;
  planned: number;
  done: number;
  plannedHours: number;
  doneHours: number;
  /** "past" weeks are closed, "current" is in progress, "next" hasn't started. */
  when: "past" | "current" | "next";
};

/** Weekly load and hours, planned on the Intervals.icu calendar vs actually done (all sports). */
export function planVsDone(
  events: IcuEvent[],
  loadByDate: Map<string, number>,
  activities: IcuActivity[],
  today: string,
  weeksBack = 8,
  weeksAhead = 1,
): PlanWeek[] {
  const thisWeek = weekStart(today);
  const weeks = new Map<string, PlanWeek>();
  for (let i = -weeksBack; i <= weeksAhead; i++) {
    const week = addDays(thisWeek, 7 * i);
    weeks.set(week, { week, planned: 0, done: 0, plannedHours: 0, doneHours: 0, when: i < 0 ? "past" : i === 0 ? "current" : "next" });
  }
  for (const e of events.filter(isPlanned)) {
    const w = weeks.get(weekStart(day(e.start_date_local)));
    if (!w) continue;
    w.planned += e.icu_training_load ?? 0;
    w.plannedHours += (e.moving_time ?? 0) / 3600;
  }
  for (const [d, load] of loadByDate) {
    const w = weeks.get(weekStart(d));
    if (w && d <= today) w.done += load;
  }
  for (const a of activities) {
    const w = weeks.get(weekStart(day(a.start_date_local)));
    if (w) w.doneHours += (a.moving_time ?? 0) / 3600;
  }
  return [...weeks.values()].map((w) => ({ ...w, planned: Math.round(w.planned), done: Math.round(w.done) }));
}

export type PlanItem = { name: string; type: string | null; load: number | null; secs: number | null };
export type PlanDay = { date: string; planned: PlanItem[]; done: (PlanItem & { id: string })[] };

/** Monday to Sunday of the current week: what was planned and what was done each day. */
export function weekDays(events: IcuEvent[], activities: IcuActivity[], today: string): PlanDay[] {
  const from = weekStart(today);
  return dateRange(from, addDays(from, 6)).map((date) => ({
    date,
    planned: events
      .filter((e) => isPlanned(e) && day(e.start_date_local) === date)
      .map((e) => ({ name: capitalize(e.name ?? e.type ?? "Allenamento"), type: e.type ?? null, load: e.icu_training_load ?? null, secs: e.moving_time ?? null })),
    done: activities
      .filter((a) => day(a.start_date_local) === date)
      .sort(byDate)
      .map((a) => ({
        id: a.id,
        name: capitalize(a.name ?? a.type ?? "Attività"),
        type: a.type ?? null,
        load: a.icu_training_load ?? null,
        secs: a.moving_time ?? null,
      })),
  }));
}

// ── Sleep and weight ────────────────────────────────────────────────────────────────────────────────

export type SleepNight = { date: string; hours: number | null; score: number | null; avg7: number | null };

/** Garmin sleep per night with the 7-night average of the hours slept. */
export function sleepSeries(wellness: IcuWellness[], days: string[]): SleepNight[] {
  const w = new Map(wellness.map((x) => [x.id, x]));
  const hours = days.map((d) => {
    const s = w.get(d)?.sleepSecs;
    return isNum(s) && s > 0 ? s / 3600 : null;
  });
  return days.map((date, i) => {
    const last7 = hours.slice(Math.max(0, i - 6), i + 1).filter(isNum);
    const score = w.get(date)?.sleepScore;
    return {
      date,
      hours: hours[i],
      score: isNum(score) ? score : null,
      avg7: last7.length >= 3 ? last7.reduce((a, b) => a + b, 0) / last7.length : null,
    };
  });
}

export function weightSeries(wellness: IcuWellness[]): { date: string; kg: number }[] {
  return wellness
    .filter((w) => isNum(w.weight) && w.weight > 0)
    .map((w) => ({ date: w.id, kg: w.weight as number }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ── Time in zone, week by week ──────────────────────────────────────────────────────────────────────

export type ZoneWeek = { week: string; total: number } & Record<ZoneId, number>;

/** Hours in each Coggan zone per week. Intervals' "SS" overlaps Z3/Z4, so it is left out. */
export function weeklyZones(rides: IcuActivity[], today: string, weeks = 12): ZoneWeek[] {
  const thisWeek = weekStart(today);
  const out = new Map<string, ZoneWeek>();
  for (let i = weeks - 1; i >= 0; i--) {
    const week = addDays(thisWeek, -7 * i);
    out.set(week, { week, total: 0, Z1: 0, Z2: 0, Z3: 0, Z4: 0, Z5: 0, Z6: 0, Z7: 0 });
  }
  for (const a of rides) {
    const w = out.get(weekStart(day(a.start_date_local)));
    if (!w) continue;
    for (const z of a.icu_zone_times ?? []) {
      if (!(ZONE_IDS as readonly string[]).includes(z.id)) continue;
      w[z.id as ZoneId] += z.secs / 3600;
      w.total += z.secs / 3600;
    }
  }
  return [...out.values()];
}

// ── Aerobic efficiency ──────────────────────────────────────────────────────────────────────────────

export type EfficiencyRide = {
  id: string;
  date: string;
  name: string;
  minutes: number;
  IF: number | null;
  ef: number | null;
  decoupling: number | null;
  /** Mean EF of this and the previous 4 endurance rides: the trend line. */
  efAvg: number | null;
};

/**
 * Endurance rides only (IF below 0.80): EF = NP / average HR is comparable between them,
 * while intervals or races would mix in a different intensity.
 */
export function efficiencyTrend(rides: IcuActivity[], from: string): EfficiencyRide[] {
  const out: EfficiencyRide[] = [];
  for (const a of [...rides].sort(byDate)) {
    const IF = toIF(a.icu_intensity);
    const minutes = (a.moving_time ?? 0) / 60;
    if (day(a.start_date_local) < from || IF === null || IF >= 0.8 || minutes < 45) continue;
    const ef = isNum(a.icu_efficiency_factor) && a.icu_efficiency_factor > 0 ? a.icu_efficiency_factor : null;
    out.push({
      id: a.id,
      date: day(a.start_date_local),
      name: capitalize(a.name ?? "Uscita"),
      minutes,
      IF,
      ef,
      decoupling: isNum(a.decoupling) ? a.decoupling : null,
      efAvg: null,
    });
  }
  out.forEach((r, i) => {
    const last = out.slice(Math.max(0, i - 4), i + 1).map((x) => x.ef).filter(isNum);
    r.efAvg = last.length >= 2 ? last.reduce((a, b) => a + b, 0) / last.length : null;
  });
  return out;
}
