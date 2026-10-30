// Synthetic data shaped like Intervals.icu responses, so the app runs before the API key is set.
// Profile: FTP ~250 W, 72 kg, 6–10 h/week, last week was a hard block (HRV slightly suppressed).
import { addDays, dateRange, toIsoDate } from "./dates";
import type { IcuActivity, IcuEvent, IcuWellness, RawData } from "./intervals/types";
import { cpPredict } from "./physio/criticalPower";
import { computePmc } from "./physio/pmc";

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

type Session = { name: string; hours: number; IF: number; zones: [number, number, number, number, number, number] };

// zones = share of time in Z1, Z2, Z3, SS, Z4, Z5+
const WEEK: (Session | null)[] = [
  null,
  { name: "VO2max 5×4'", hours: 1.25, IF: 0.84, zones: [0.3, 0.38, 0.08, 0, 0.04, 0.2] },
  { name: "Endurance Z2", hours: 1.5, IF: 0.68, zones: [0.2, 0.78, 0.02, 0, 0, 0] },
  { name: "Sweet spot 3×15'", hours: 1.5, IF: 0.8, zones: [0.2, 0.3, 0.05, 0.45, 0, 0] },
  null,
  { name: "Lungo con salite", hours: 3.5, IF: 0.72, zones: [0.15, 0.55, 0.18, 0.06, 0.05, 0.01] },
  { name: "Medio fondo", hours: 2.5, IF: 0.7, zones: [0.18, 0.62, 0.14, 0.03, 0.02, 0.01] },
];

export function demoData(historyDays: number): RawData {
  const r = rng(42);
  const today = toIsoDate(new Date());
  const days = dateRange(addDays(today, -historyDays), today);
  const ftp = 250;

  const activities: IcuActivity[] = [];
  const loads = days.map((date, i) => {
    const dow = (new Date(date + "T12:00:00").getDay() + 6) % 7;
    const weekIdx = Math.floor((days.length - 1 - i) / 7);
    const recoveryWeek = weekIdx % 4 === 2;
    const s = WEEK[dow];
    if (!s || date === today) return 0;
    const hours = s.hours * (recoveryWeek ? 0.6 : 1) * (0.9 + r() * 0.2) * (weekIdx === 0 ? 1.15 : 1);
    const IF = s.IF * (recoveryWeek ? 0.93 : 1) * (0.97 + r() * 0.06);
    const load = hours * IF * IF * 100;
    const np = IF * ftp;
    const secs = Math.round(hours * 3600);
    // Sweet spot time is counted inside Z3 and also reported separately as "SS", like Intervals.icu does.
    const [z1, z2, z3, ss, z4, z5] = s.zones;
    const zoneShares: [string, number][] = [["Z1", z1], ["Z2", z2], ["Z3", z3 + ss], ["Z4", z4], ["Z5", z5], ["SS", ss]];
    activities.push({
      id: `demo-${i}`,
      start_date_local: `${date}T${dow >= 5 ? "08:30" : "18:15"}:00`,
      type: dow === 1 || dow === 3 ? "VirtualRide" : "Ride",
      name: recoveryWeek ? `${s.name} (scarico)` : s.name,
      moving_time: secs,
      distance: hours * (dow === 1 || dow === 3 ? 31000 : 28500),
      trainer: dow === 1 || dow === 3,
      icu_training_load: Math.round(load),
      icu_weighted_avg_watts: Math.round(np),
      icu_average_watts: Math.round(np / (dow === 1 ? 1.12 : 1.05)),
      icu_intensity: IF * 100,
      icu_ftp: ftp,
      average_heartrate: Math.round(118 + IF * 40 + r() * 4),
      decoupling: s.hours >= 2.5 ? 2 + r() * 5 : r() * 3,
      icu_efficiency_factor: np / (118 + IF * 40),
      icu_zone_times: zoneShares.map(([id, f]) => ({ id, secs: Math.round(f * secs) })),
      icu_rolling_ftp: Math.round(ftp - 12 + 10 * Math.sin(i / 40) + r() * 3),
    });
    return load;
  });

  const pmc = computePmc(
    days.map((date, i) => ({ date, load: loads[i] })),
    { ctl: 52, atl: 55 },
  );

  const wellness: IcuWellness[] = days.map((date, i) => {
    const p = pmc[i];
    // HRV drops when acute fatigue rises above fitness (negative TSB), plus day-to-day noise.
    const stress = Math.max(0, -(p.ctl - p.atl)) / 30;
    // A 3-night "cold" 25 days ago: HRV drops and resting HR rises together.
    const sick = i >= days.length - 26 && i < days.length - 23;
    const hrv = 64 * Math.exp(-0.12 * stress) * Math.exp((r() - 0.5) * 0.18) * (sick ? 0.68 : 1);
    return {
      id: date,
      ctl: p.ctl,
      atl: p.atl,
      ctlLoad: Math.round(loads[i]),
      hrv: r() < 0.05 ? null : Math.round(hrv * 10) / 10,
      restingHR: Math.round(44 + stress * 3 + r() * 2 + (sick ? 6 : 0)),
      sleepSecs: Math.round((6.6 + r() * 1.6) * 3600),
      sleepScore: Math.round(70 + r() * 20),
      weight: Math.round((72 + (r() - 0.5) * 0.8) * 10) / 10,
    };
  });

  const secs = [5, 15, 30, 60, 120, 180, 300, 480, 600, 720, 1200, 1800, 3600, 7200];
  const cp = { cp: 262, wPrime: 19500 };
  const values = secs.map((t) => {
    if (t < 120) return Math.round(Math.min(1050, cpPredict(cp, Math.max(t, 20)) * (t < 30 ? 1.25 : 1)));
    if (t <= 1200) return Math.round(cpPredict(cp, t) * (0.985 + r() * 0.02));
    return Math.round(cp.cp * (1 - 0.06 * Math.log2(t / 1200)));
  });

  // The usual week, planned on the calendar from 9 weeks ago to 2 weeks ahead.
  const events: IcuEvent[] = dateRange(addDays(today, -63), addDays(today, 14)).flatMap((date, i) => {
    const s = WEEK[(new Date(date + "T12:00:00").getDay() + 6) % 7];
    if (!s) return [];
    return [{ id: i, start_date_local: `${date}T00:00:00`, category: "WORKOUT", type: "Ride", name: s.name, icu_training_load: Math.round(s.hours * s.IF * s.IF * 100), moving_time: Math.round(s.hours * 3600) }];
  });
  const scaled = (f: number) => ({ secs, values: values.map((v) => Math.round(v * f)) });

  return {
    source: "demo",
    events,
    monthCurves: { current: scaled(0.96), previous: scaled(0.98) },
    today,
    athlete: {
      name: "Atleta demo",
      icu_weight: 72,
      icu_resting_hr: 45,
      sportSettings: [{ types: ["Ride", "VirtualRide"], ftp, indoor_ftp: 245, w_prime: 19500, lthr: 168, max_hr: 186 }],
    },
    wellness,
    activities: activities.reverse(),
    powerCurve: { secs, values },
  };
}
