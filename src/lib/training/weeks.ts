// The season week by week, day by day, for the Stagione page (version B, "linguette", chosen on 10 November 2026):
// what is done, what is already on the Intervals.icu calendar, what the athlete fixed and what the engine proposes.
// The weeks are simulated in order, so each one counts what the ones before it put in the legs.
import type { CalendarWorkout, LibraryWorkout } from "@/lib/calendar";
import { addDays, weekStart } from "@/lib/dates";
import { type Classified, classifyWorkout, CLASS_SAY, HARD } from "./classify";
import { type DayChoice, PHASE_INFO, type PlanWeek, type SeasonPlan, type SeasonSetup } from "./season";
import { parseCap, planWeek, type RecentActivity, type SlotKind, type SuggestInput, weekday } from "./suggest";

export type DayKind = "done" | "cal" | "mine" | "prop" | "rest" | "off" | "stop" | "race";

export type DayView = {
  date: string;
  kind: DayKind;
  name?: string;
  mins?: number;
  tss?: number | null;
  indoor?: boolean;
  /** The library workout (proposals and the athlete's choices) or the planned one (calendar). */
  workout?: LibraryWorkout;
  c?: Classified;
  /** The Intervals.icu event, for workouts already on the calendar. */
  event?: CalendarWorkout;
  slot?: SlotKind;
  /** A proposal kept as it was because the athlete touched its week. */
  frozen?: boolean;
  reason?: string;
};

export type WeekView = {
  index: number;
  week: PlanWeek;
  days: DayView[];
  tss: number;
  mins: number;
  quality: number;
  hard: number;
  warnings: string[];
  /** The athlete touched this week: its days stay put. */
  frozen: boolean;
};

/** A ride already done this week, before today. */
export type DoneRide = { date: string; name: string; mins: number; tss: number | null; indoor: boolean };

export type SeasonWeeksInput = {
  plan: SeasonPlan;
  setup: SeasonSetup;
  today: string;
  /** Everything the day engine needs, without the date-dependent parts. */
  base: Omit<SuggestInput, "date" | "season" | "planned" | "chosen">;
  /** Workouts on the Intervals.icu calendar over the season. */
  calendar: CalendarWorkout[];
  done: DoneRide[];
  /** How many weeks to compute (all by default). */
  weeks?: number;
};

const isRide = (k: DayKind) => k === "done" || k === "cal" || k === "mine" || k === "prop";

/** Every fixed day of the season, flattened for the engine. */
export const choicesOf = (setup: SeasonSetup | null | undefined): DayChoice[] => Object.values(setup?.weekPlans ?? {}).flat();

function restKind(reason: string): DayKind {
  if (/gara/i.test(reason) && !/dopo la gara/i.test(reason)) return "race";
  if (/ferie|trasferta|stop|febbre|Malattia/i.test(reason)) return "stop";
  if (/non è tra i giorni/i.test(reason)) return "off";
  return "rest";
}

/** What does not add up in a week: the rules the engine follows, checked again after the athlete's changes. */
export function weekWarnings(view: Omit<WeekView, "warnings">, profile: SuggestInput["profile"]): string[] {
  const out: string[] = [];
  const { week, days } = view;
  const info = PHASE_INFO[week.phase];
  const dayShort = (iso: string) => `${["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"][weekday(iso)]} ${Number(iso.slice(8))}`;
  const quality = (d: DayView) => isRide(d.kind) && !!d.c?.quality;
  for (let i = 1; i < days.length; i++) if (quality(days[i - 1]) && quality(days[i])) out.push(`${dayShort(days[i - 1].date)} e ${dayShort(days[i].date)}: due sedute di qualità di fila`);
  if (view.quality > week.qualityMax) out.push(week.qualityMax === 0 ? "In questa settimana non sono previste sedute di qualità" : `${view.quality} sedute di qualità: la settimana ne prevede al massimo ${week.qualityMax}`);
  else if (view.hard > week.hardMax) out.push(`${view.hard} lavori duri: la settimana ne prevede al massimo ${week.hardMax}`);
  const weekdayCap = parseCap(profile?.durataFeriali) ?? 120;
  const trainerCap = parseCap(profile?.ruliMax);
  for (const d of days) {
    if (d.kind !== "mine") continue;
    if (profile?.giorni?.length && !profile.giorni.includes(weekday(d.date))) out.push(`${dayShort(d.date)}: non è tra i tuoi giorni`);
    if (weekday(d.date) < 5 && (d.mins ?? 0) > weekdayCap + 5) out.push(`${dayShort(d.date)}: ${d.mins}' sono oltre il tempo dei feriali`);
    if (d.indoor && trainerCap && (d.mins ?? 0) > trainerCap + 5) out.push(`${dayShort(d.date)}: oltre il tempo dei rulli`);
    if (d.c && !info.classes.includes(d.c.cls) && d.c.cls !== "test" && d.c.cls !== "gara") out.push(`${dayShort(d.date)}: in ${info.label} il piano non prevede ${CLASS_SAY[d.c.cls]}`);
  }
  if (week.tssTarget > 0 && view.tss > week.tssTarget * 1.15) out.push(`Carico oltre il riferimento: ${view.tss} TSS su ${week.tssTarget}`);
  return out;
}

export function seasonWeeks(input: SeasonWeeksInput): WeekView[] {
  const { plan, setup, today, base, calendar, done } = input;
  const chosen = choicesOf(setup);
  const monday = weekStart(today);
  const weeks = plan.weeks.slice(0, input.weeks ?? plan.weeks.length);
  let recent: RecentActivity[] = base.recent;
  const out: WeekView[] = [];

  for (const [index, week] of weeks.entries()) {
    const from = week.start < today ? today : week.start;
    const days: DayView[] = [];
    // The days of the current week already gone: what was ridden, or rest.
    for (let d = week.start; d < from; d = addDays(d, 1)) {
      const ride = done.filter((r) => r.date === d).sort((a, b) => b.mins - a.mins)[0];
      days.push(ride ? { date: d, kind: "done", name: ride.name, mins: ride.mins, tss: ride.tss, indoor: ride.indoor } : { date: d, kind: "rest", reason: "Riposo" });
    }
    const events = calendar.filter((w) => w.date >= from && w.date <= week.end);
    const planned = events.map((w) => ({ date: w.date, workout: { ...w, id: 0 } as LibraryWorkout }));
    const future = week.start > monday;
    const engineDays = planWeek(
      {
        ...base,
        date: from,
        recent,
        season: plan,
        chosen,
        ...(future ? { readiness: "verde" as const, tsbYesterday: null, feeling: null, override: undefined } : {}),
      },
      planned,
    ).filter((d) => d.date <= week.end);
    const fixed = setup.weekPlans?.[week.start] ?? [];

    for (const d of engineDays) {
      if (d.planned) {
        const event = events.find((e) => e.date === d.date && e.name === d.planned!.name);
        const c = classifyWorkout(d.planned);
        days.push({ date: d.date, kind: "cal", name: d.planned.name, mins: Math.round(c.mins), tss: Math.round(c.tss), indoor: c.indoor || d.planned.type === "VirtualRide", workout: d.planned, c, event });
        recent = [...recent, { date: d.date, name: d.planned.name, IF: null, tss: c.tss, movingTime: c.mins * 60, hard: c.hard, quality: c.quality, cls: c.cls }];
      } else if (d.suggestion?.kind === "workout") {
        const m = d.suggestion.main;
        const c = classifyWorkout(m.workout);
        // The athlete's choice shows as theirs only when the engine kept it (today's readiness can set it aside).
        const choice = fixed.find((x) => x.date === d.date);
        const kept = !!choice && choice.id === m.workout.id;
        days.push({ date: d.date, kind: kept && choice.mine ? "mine" : "prop", name: m.workout.name, mins: m.mins, tss: m.tss, indoor: m.indoor, workout: m.workout, c, slot: m.slot, frozen: kept && !choice.mine });
        recent = [...recent, { date: d.date, name: m.workout.name, IF: null, tss: m.tss, movingTime: m.mins * 60, hard: c.hard, quality: c.quality, cls: c.cls }];
      } else {
        const reason = d.suggestion?.kind === "rest" ? d.suggestion.reason : "Riposo";
        const choice = fixed.find((x) => x.date === d.date && x.id === null);
        days.push(choice ? { date: d.date, kind: "rest", reason: choice.mine ? "Riposo, scelto da te" : "Riposo", frozen: !choice.mine } : { date: d.date, kind: restKind(reason), reason });
      }
    }

    const rides = days.filter((d) => isRide(d.kind));
    const partial = {
      index,
      week,
      days,
      tss: Math.round(rides.reduce((s, d) => s + (d.tss ?? 0), 0)),
      mins: rides.reduce((s, d) => s + (d.mins ?? 0), 0),
      quality: rides.filter((d) => d.c?.quality).length,
      hard: rides.filter((d) => d.c && HARD.includes(d.c.cls)).length,
      frozen: fixed.length > 0,
    };
    out.push({ ...partial, warnings: weekWarnings(partial, base.profile) });
  }
  return out;
}

/**
 * The week's days as fixed choices, for the first change the athlete makes in it: every day still to come that is not
 * on the calendar keeps what it shows now (a workout or rest), so changing one day leaves the others as they were.
 */
export function freezeWeek(view: WeekView, today: string, existing: DayChoice[] = []): DayChoice[] {
  const out = new Map(existing.map((c) => [c.date, c]));
  for (const d of view.days) {
    if (d.date < today || out.has(d.date)) continue;
    if (d.kind === "prop" || d.kind === "mine") out.set(d.date, { date: d.date, id: d.workout?.id ?? null, mine: d.kind === "mine" });
    else if (d.kind === "rest") out.set(d.date, { date: d.date, id: null, mine: false });
  }
  return [...out.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Moves the choice of `from` to `to` in a frozen week; whatever was on `to` goes to `from` (a swap), or `from` becomes rest. */
export function moveChoice(choices: DayChoice[], from: string, to: string): DayChoice[] {
  const a = choices.find((c) => c.date === from);
  const b = choices.find((c) => c.date === to);
  const rest = choices.filter((c) => c.date !== from && c.date !== to);
  return [...rest, { date: to, id: a?.id ?? null, mine: true }, { date: from, id: b?.id ?? null, mine: true }].sort((x, y) => x.date.localeCompare(y.date));
}

/** Sets a day of a frozen week to a workout or to rest. */
export function setChoice(choices: DayChoice[], date: string, id: number | null): DayChoice[] {
  return [...choices.filter((c) => c.date !== date), { date, id, mine: true }].sort((x, y) => x.date.localeCompare(y.date));
}
