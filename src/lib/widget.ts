// What the Android home-screen widget shows: a small summary of today, rebuilt by `GET /api/widget` and cached on the phone.
// Pure function over the dashboard and today's calendar, so it is easy to test; the native side only draws it.
import type { CalendarData } from "./calendar";
import { addDays } from "./dates";
import type { DashboardData } from "./dashboard";

export type WidgetData = {
  v: 1;
  /** When it was built (ISO). */
  at: string;
  date: string;
  level: "verde" | "giallo" | "rosso" | "grigio";
  headline: string;
  advice: string;
  /** Form shown in the app (CTL − ATL of today). */
  tsb: number | null;
  ctl: number | null;
  atl: number | null;
  hrv: number | null;
  rhr: number | null;
  sleepHours: number | null;
  /** The workout planned for today on the Intervals.icu calendar. */
  workout: { id: string; name: string; secs: number | null; tss: number | null; blocks: { secs: number; zone: number }[] } | null;
  yesterday: { name: string; secs: number; tss: number | null } | null;
  /** Monday to Sunday: load done (or planned) each day. */
  week: { date: string; tss: number | null; today: boolean }[];
};

const round = (x: number | null | undefined, d = 0) => (typeof x === "number" && Number.isFinite(x) ? Number(x.toFixed(d)) : null);

export function buildWidget(dash: DashboardData, cal: CalendarData, today: string, now = new Date()): WidgetData {
  const s = dash.status;
  const planned = cal.workouts.filter((w) => w.date === today).sort((a, b) => (b.secs ?? 0) - (a.secs ?? 0))[0] ?? null;
  const yRows = dash.activities.filter((a) => a.date === addDays(today, -1) && a.movingTime > 0);
  const longest = [...yRows].sort((a, b) => b.movingTime - a.movingTime)[0];
  const lastRecovery = [...dash.recovery].reverse().find((r) => r.date === today) ?? dash.recovery[dash.recovery.length - 1];
  return {
    v: 1,
    at: now.toISOString(),
    date: today,
    level: s.readiness.level,
    headline: s.readiness.headline,
    advice: s.readiness.advice,
    tsb: round(s.tsb),
    ctl: round(s.ctl),
    atl: round(s.atl),
    hrv: round(lastRecovery?.rmssd),
    rhr: round(lastRecovery?.rhr ?? s.rhr.today),
    sleepHours: round(s.sleepHours, 1),
    workout: planned ? { id: planned.id, name: planned.name, secs: planned.secs, tss: round(planned.tss), blocks: planned.blocks } : null,
    yesterday: longest
      ? { name: longest.name, secs: yRows.reduce((t, r) => t + r.movingTime, 0), tss: round(yRows.reduce((t, r) => t + (r.tss ?? 0), 0)) }
      : null,
    week: dash.plan.days.map((d) => {
      const done = d.done.reduce((t, i) => t + (i.load ?? 0), 0);
      const plan = d.planned.reduce((t, i) => t + (i.load ?? 0), 0);
      const tss = done || plan;
      return { date: d.date, tss: tss ? Math.round(tss) : null, today: d.date === today };
    }),
  };
}
