// What the chat knows when it answers (the app's own data and engines), what it can ask to be done, and how it keeps the thread.
import type { HistoryData } from "@/lib/api/handlers";
import type { CalendarWorkout, LibraryWorkout } from "@/lib/calendar";
import type { DashboardData } from "@/lib/dashboard";
import type { AthleteProfile } from "@/lib/profile/profile";
import type { LifeCategory, LifeEvent } from "@/lib/training/life";
import type { SeasonPlan, SeasonSetup } from "@/lib/training/season";
import { type Place, type Proposal, type SuggestInput, type WorkoutClass } from "@/lib/training/suggest";

/** What the athlete told the chat about today: it only ever applies to `date`. */
export type TodayOverrides = {
  date: string;
  feeling?: { drop: boolean; note: string; rpe?: number };
  maxMins?: number;
  easier?: boolean;
  restToday?: boolean;
  wantClass?: WorkoutClass;
  place?: Place;
};

export type ChatContext = {
  today: string;
  data: DashboardData;
  library: LibraryWorkout[];
  /** Workouts on the Intervals.icu calendar from today to a week ahead (and what the app wrote). */
  planned: CalendarWorkout[];
  profile: AthleteProfile | null;
  phenotype: "diesel" | "all_rounder" | "glicolitico" | null;
  setup: SeasonSetup | null;
  plan: SeasonPlan | null;
  life: LifeEvent[];
  overrides: TodayOverrides;
  history: HistoryData | null;
};

/** Everything the chat can ask the app to write. Always after a "sì". */
export type Action =
  | { type: "schedule"; items: { workoutId: number; name: string; date: string }[]; replace?: string[]; label: string }
  | { type: "move"; eventId: string; name: string; to: string; label: string }
  | { type: "remove"; eventId: string; name: string; label: string }
  | { type: "life_add"; category: LifeCategory; from: string; to: string; name: string; label: string }
  | { type: "life_close"; id: string; category: LifeCategory; to: string; label: string }
  | { type: "set_profile"; patch: Partial<AthleteProfile>; label: string }
  | { type: "set_season"; patch: Partial<SeasonSetup>; label: string }
  | { type: "rpe"; activityId: string; rpe: number; label: string }
  | { type: "carbs"; activityId: string; grams?: number; perHour?: number; label: string };

/** What it takes to take back the last write. */
export type UndoInfo = { kind: "remove_event"; ids: string[]; label: string } | { kind: "life_delete"; id: string; label: string };

export type Reply = {
  text: string;
  /** Short lines under the text (numbers, reasons, steps). */
  lines?: string[];
  proposal?: Proposal;
  /** Quick replies: the next things worth asking. */
  chips?: string[];
  /** A write waiting for "sì". */
  confirm?: Action;
};

export type ChatState = {
  pending: Action | null;
  /** The workouts last shown (the first one is the pick) and the day they are for. */
  options: Proposal[];
  index: number;
  optionsDate: string | null;
  /** Ids already offered for the day, so "un altro" never repeats. */
  shown: number[];
  /** A question left open: the next message with dates completes it. */
  awaiting: { intent: "vita_ferie" | "vita_malattia" | "vita_infortunio"; part?: string } | null;
  undo: UndoInfo | null;
};

export const emptyState = (): ChatState => ({ pending: null, options: [], index: 0, optionsDate: null, shown: [], awaiting: null, undo: null });

export type ChatResult = {
  reply: Reply;
  state: ChatState;
  /** A confirmed action for the app to run. */
  run?: Action;
  /** Things for today, applied at once (nothing is written to Intervals.icu). */
  overrides?: Partial<Omit<TodayOverrides, "date">>;
  /** Clears today's overrides first ("ricomincia"). */
  resetOverrides?: boolean;
  /** Take back the last write. */
  undo?: UndoInfo;
};

/** The engine's input for a day, built from the chat's context: one place, so the chat and the "Allenamento di oggi" card agree. */
export function suggestInput(ctx: ChatContext, over: Partial<SuggestInput> = {}): SuggestInput {
  const { data } = ctx;
  const o = ctx.overrides.date === ctx.today ? ctx.overrides : null;
  return {
    date: ctx.today,
    readiness: data.status.readiness.level,
    tsbYesterday: data.status.tsbYesterday,
    ctl: data.status.ctl,
    recent: data.activities.map((a) => ({ date: a.date.slice(0, 10), name: a.name, IF: a.IF, tss: a.tss, movingTime: a.movingTime })),
    library: ctx.library,
    profile: ctx.profile ?? undefined,
    phenotype: ctx.phenotype,
    place: o?.place ?? "any",
    ftp: data.athlete.ftp,
    indoorFtp: data.athlete.indoorFtp,
    season: ctx.plan,
    rampRate: data.status.rampRate,
    life: ctx.life,
    feeling: o?.feeling ?? null,
    override: o ? { maxMins: o.maxMins, easier: o.easier, wantClass: o.wantClass, restToday: o.restToday } : undefined,
    ...over,
  };
}
