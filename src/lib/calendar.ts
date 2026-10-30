// The home calendar: activities done and workouts planned on Intervals.icu, day by day.
import { type ActivityCategory, categoryOf, isTestName } from "./activities";
import { type CoachMark, coachMarkOf } from "./coach/marks";
import type { IcuActivity, IcuEvent, IcuFolder, IcuLibraryWorkout } from "./intervals/types";
import { addDays } from "./dates";
import { isPlanned } from "./insights";
import { isNum } from "./physio/stats";
import { capitalize } from "./text";
import { type WorkoutBlock, workoutBlocks } from "./workout";

export type CalendarActivity = {
  id: string;
  date: string;
  name: string;
  type: string | null;
  category: ActivityCategory;
  isTest: boolean;
  secs: number;
  tss: number | null;
  km: number | null;
  avgWatts: number | null;
  avgHr: number | null;
  rpe: number | null;
  description: string | null;
};

export type CalendarWorkout = {
  id: string;
  date: string;
  name: string;
  type: string | null;
  secs: number | null;
  tss: number | null;
  description: string | null;
  blocks: WorkoutBlock[];
  /** Written by MasCoach Coach ("prova" while the coach is being tried out). */
  coach: CoachMark | null;
};

/** Everything on the calendar that isn't a workout: races, holidays, illness, notes, season start, week targets. */
export type CalendarEvent = {
  id: string;
  date: string;
  /** Last day of a multi-day event (holiday, illness…); null for single days. */
  endDate: string | null;
  category: string;
  label: string;
  name: string;
  description: string | null;
  /** Targets set on the event (week goals, races): TSS, seconds, km. */
  loadTarget: number | null;
  timeTarget: number | null;
  distanceKm: number | null;
};

export type CalendarData = {
  from: string;
  to: string;
  activities: CalendarActivity[];
  workouts: CalendarWorkout[];
  events: CalendarEvent[];
};

const EVENT_LABEL: Record<string, string> = {
  RACE_A: "Gara A",
  RACE_B: "Gara B",
  RACE_C: "Gara C",
  HOLIDAY: "Vacanza / impegno",
  SICK: "Malattia",
  INJURED: "Infortunio",
  NOTE: "Nota",
  SEASON_START: "Inizio stagione",
  TARGET: "Obiettivo della settimana",
  PLAN: "Piano",
  FITNESS_DAYS: "Giorni di fitness",
  SET_EFTP: "eFTP impostata",
  SET_FITNESS: "Fitness impostata",
};

const num = (x: number | null | undefined) => (isNum(x) ? x : null);
const day = (iso: string) => iso.slice(0, 10);

export function toCalendarActivity(a: IcuActivity): CalendarActivity {
  return {
    id: a.id,
    date: day(a.start_date_local),
    name: capitalize(a.name ?? a.type ?? "Attività"),
    type: a.type ?? null,
    category: categoryOf(a),
    isTest: isTestName(a.name),
    secs: a.moving_time ?? 0,
    tss: num(a.icu_training_load),
    km: isNum(a.distance) ? a.distance / 1000 : null,
    avgWatts: isNum(a.icu_average_watts) && a.icu_average_watts > 0 ? a.icu_average_watts : null,
    avgHr: isNum(a.average_heartrate) && a.average_heartrate > 0 ? a.average_heartrate : null,
    // 0 means "cleared" (Intervals.icu ignores null on update).
    rpe: isNum(a.icu_rpe) && a.icu_rpe > 0 ? a.icu_rpe : null,
    description: a.description?.trim() || null,
  };
}

export function toCalendarWorkout(e: IcuEvent, ftp: number | null): CalendarWorkout {
  return {
    id: String(e.id),
    date: day(e.start_date_local),
    name: capitalize(e.name ?? e.type ?? "Allenamento"),
    type: e.type ?? null,
    secs: num(e.moving_time),
    tss: num(e.icu_training_load),
    description: e.description?.trim() || null,
    blocks: workoutBlocks(e.workout_doc?.steps, ftp),
    coach: coachMarkOf(e.external_id),
  };
}

export function toCalendarEvent(e: IcuEvent): CalendarEvent {
  const end = e.end_date_local ? day(e.end_date_local) : null;
  const category = e.category ?? "NOTE";
  return {
    id: String(e.id),
    date: day(e.start_date_local),
    // Intervals.icu ends a single-day event at midnight of the next day.
    endDate: end && end > addDays(day(e.start_date_local), 1) ? addDays(end, -1) : null,
    category,
    label: EVENT_LABEL[category] ?? category,
    name: capitalize(e.name ?? EVENT_LABEL[category] ?? "Evento"),
    description: e.description?.trim() || null,
    loadTarget: num(e.load_target),
    timeTarget: num(e.time_target),
    distanceKm: isNum(e.distance_target) ? e.distance_target / 1000 : null,
  };
}

/** Non-workout events that touch [from, to]. */
export function calendarEvents(events: IcuEvent[], from: string, to: string): CalendarEvent[] {
  return events
    .filter((e) => e.category && e.category !== "WORKOUT")
    .map(toCalendarEvent)
    .filter((e) => e.date <= to && (e.endDate ?? e.date) >= from)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function buildCalendar(
  activities: IcuActivity[],
  events: IcuEvent[],
  from: string,
  to: string,
  ftp: number | null,
): CalendarData {
  const inRange = (d: string) => d >= from && d <= to;
  return {
    from,
    to,
    activities: activities
      .filter((a) => inRange(day(a.start_date_local)))
      .sort((a, b) => a.start_date_local.localeCompare(b.start_date_local))
      .map(toCalendarActivity),
    workouts: events
      .filter((e) => isPlanned(e) && inRange(day(e.start_date_local)))
      .map((e) => toCalendarWorkout(e, ftp)),
    events: calendarEvents(events, from, to),
  };
}

// ── Workout library ─────────────────────────────────────────────────────────────────────────────────

export type LibraryWorkout = Omit<CalendarWorkout, "date" | "id" | "coach"> & { id: number };
export type LibraryFolder = { id: number | null; name: string; workouts: LibraryWorkout[] };

export function buildLibrary(workouts: IcuLibraryWorkout[], folders: IcuFolder[], ftp: number | null): LibraryFolder[] {
  const names = new Map(folders.map((f) => [f.id, f.name ?? "Cartella"]));
  const groups = new Map<number | null, LibraryWorkout[]>();
  for (const w of workouts) {
    const key = w.folder_id != null && names.has(w.folder_id) ? w.folder_id : null;
    groups.set(key, [
      ...(groups.get(key) ?? []),
      {
        id: w.id,
        name: capitalize(w.name ?? "Allenamento"),
        type: w.type ?? null,
        secs: num(w.moving_time),
        tss: num(w.icu_training_load),
        description: w.description?.trim() || null,
        blocks: workoutBlocks(w.workout_doc?.steps, ftp),
      },
    ]);
  }
  return [...groups]
    .map(([id, list]) => ({
      id,
      name: id === null ? "Senza cartella" : names.get(id)!,
      workouts: list.sort((a, b) => a.name.localeCompare(b.name, "it")),
    }))
    .sort((a, b) => b.workouts.length - a.workouts.length);
}

/** Event body that puts a library workout on a day; Intervals.icu re-reads the steps from the description. */
export function eventFromLibrary(w: IcuLibraryWorkout, date: string): Omit<IcuEvent, "id"> {
  return {
    category: "WORKOUT",
    start_date_local: `${date}T00:00:00`,
    type: w.type ?? "Ride",
    name: w.name ?? "Allenamento",
    description: w.description ?? "",
    moving_time: w.moving_time ?? null,
    icu_training_load: w.icu_training_load ?? null,
    indoor: w.indoor ?? null,
  };
}
