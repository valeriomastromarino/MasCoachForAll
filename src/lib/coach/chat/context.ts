// What the chat knows when it answers (the app's own data and engines), what it can ask to be done, and how it keeps the thread.
import type { HistoryData } from "@/lib/api/handlers";
import type { CalendarWorkout, LibraryWorkout } from "@/lib/calendar";
import type { DashboardData } from "@/lib/dashboard";
import type { AthleteProfile } from "@/lib/profile/profile";
import type { LifeCategory, LifeEvent } from "@/lib/training/life";
import type { SeasonPlan, SeasonSetup } from "@/lib/training/season";
import { recentFromRides } from "@/lib/training/done";
import { choicesOf } from "@/lib/training/weeks";
import { type Place, type Proposal, type SuggestInput, type WorkoutClass } from "@/lib/training/suggest";
import type { Spec } from "@/lib/training/build/parse";
import type { DayWeather } from "@/lib/weather";
import type { WorkoutBlock } from "@/lib/workout";

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
  /** The daily forecast saved on the device by the calendar (Open-Meteo), when there is one. */
  weather?: DayWeather[];
};

/** Everything the chat can ask the app to write. Always after a "sì". */
export type Action =
  | { type: "schedule"; items: { workoutId: number; name: string; date: string; /** For the trainer: written as an indoor session. */ indoor?: boolean }[]; replace?: string[]; label: string }
  | { type: "move"; eventId: string; name: string; to: string; label: string; /** The day it is on now, so «annulla» can bring it back. */ from?: string }
  | { type: "remove"; eventId: string; name: string; label: string }
  /** Two planned sessions trade their days (written one after the other; if the second fails the first goes back). */
  | { type: "swap"; a: { eventId: string; name: string; from: string; to: string }; b: { eventId: string; name: string; from: string; to: string }; label: string }
  /** Several planned sessions taken off the calendar («cancella il weekend»). */
  | { type: "remove_many"; items: { eventId: string; name: string; date: string }[]; label: string }
  /** Several planned sessions shifted together («sposta tutto di un giorno»); if one fails the moved ones go back. */
  | { type: "move_many"; items: { eventId: string; name: string; from: string; to: string }[]; label: string }
  /** A race on the calendar (RACE_A/B/C events of Intervals.icu): the engine reads it as a hard day. */
  | { type: "race_add"; date: string; priority: "RACE_A" | "RACE_B" | "RACE_C"; name: string; label: string }
  | { type: "life_add"; category: LifeCategory; from: string; to: string; name: string; label: string }
  | { type: "life_close"; id: string; category: LifeCategory; to: string; label: string }
  | { type: "set_profile"; patch: Partial<AthleteProfile>; label: string }
  | { type: "set_season"; patch: Partial<SeasonSetup>; label: string }
  | { type: "rpe"; activityId: string; rpe: number; label: string }
  | { type: "carbs"; activityId: string; grams?: number; perHour?: number; label: string }
  /** A session built by the chat (lib/training/build), written on the calendar; `replace` are the bike workouts it takes the place of. */
  | { type: "create_workout"; date: string; name: string; text: string; indoor: boolean; secs: number; tss: number; replace: string[]; label: string }
  /** A session already on the calendar, rewritten (sprints or a block put inside it). `prev` brings it back with «annulla». */
  | { type: "update_workout"; eventId: string; name: string; text: string; secs: number; tss: number; prev: { name: string; text: string; secs: number | null; tss: number | null; indoor?: boolean }; label: string; /** Set when the change is also where it is ridden (rulli = the trainer FTP). */ indoor?: boolean }
  | { type: "save_library"; name: string; text: string; indoor: boolean; label: string };

/** What it takes to take back the last write. */
export type UndoInfo =
  | { kind: "remove_event"; ids: string[]; label: string }
  | { kind: "life_delete"; id: string; label: string }
  | { kind: "restore_event"; id: string; name: string; text: string; secs: number | null; tss: number | null; label: string; indoor?: boolean }
  /** Sessions moved by the chat, put back on their days. */
  | { kind: "move_back"; moves: { id: string; to: string }[]; label: string };

/** A session built by the chat, as the reply shows it: drawing, steps in watts, what was assumed and the check with the day. */
export type WorkoutCard = {
  name: string;
  /** "giovedì 20 nov" */
  when: string;
  /** "71 min · TSS 67 · sui rulli, FTP 250 W" */
  meta: string;
  blocks: WorkoutBlock[];
  steps: string[];
  /** What the engine chose where the words said nothing. */
  notes: string[];
  ok?: string;
  warning?: string;
  /** "nuova, su misura" or "modificata". */
  tag?: string;
};

/** The session being built in the chat: what was asked, for which day and, when it changes a planned one, which. */
export type Draft = {
  spec: Spec;
  date: string;
  place: "indoor" | "outdoor" | null;
  /** The planned workout it changes (null: a new session). */
  target: { eventId: string; name: string; text: string | null; blocks: WorkoutBlock[]; secs: number | null; tss: number | null; indoor: boolean } | null;
  /** Keep the bike workouts already planned that day (otherwise the new one takes their place). */
  keepOthers: boolean;
};

export type Reply = {
  text: string;
  /** Short lines under the text (numbers, reasons, steps). */
  lines?: string[];
  proposal?: Proposal;
  /** Quick replies: the next things worth asking. */
  chips?: string[];
  /** A write waiting for "sì". */
  confirm?: Action;
  /** A session built by the chat. */
  workout?: WorkoutCard;
  /** Buttons that answer a question of the chat («Quale?»): shown on the phone too, unlike the chips. */
  choices?: string[];
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
  /** The session being built (it takes the next changes: «fai 4 ripetute», «sposta a venerdì»). */
  draft?: Draft | null;
  /** The last session the chat wrote, for «salva in libreria». */
  lastBuilt?: { name: string; text: string; indoor: boolean } | null;
  /** What the conversation is about now, for the next short message («e domani?», «spostala», «cosa vuol dire?»). */
  focus?: Focus | null;
};

/**
 * The thread of the conversation: the last question answered (intent and day), the planned session last talked about,
 * the term worth explaining, the open question with its choices. Short replies are read against it.
 */
export type Focus = {
  intent?: string;
  date?: string;
  /** A planned session on the calendar (its id). */
  eventId?: string;
  /** A glossary term the last answer leaned on («cosa vuol dire?»). */
  term?: string;
  /** A question the chat asked, and what each choice means (the chips send these phrases). */
  choices?: string[];
  /** The message the chat was not sure about, and the other readings it had: «Non era questo» offers them, a tap teaches it. */
  asked?: string;
  alts?: string[];
};

export const emptyState = (): ChatState => ({ pending: null, options: [], index: 0, optionsDate: null, shown: [], awaiting: null, undo: null, draft: null, lastBuilt: null, focus: null });

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
    recent: recentFromRides(data.activities, ctx.library),
    library: ctx.library,
    profile: ctx.profile ?? undefined,
    phenotype: ctx.phenotype,
    place: o?.place ?? "any",
    ftp: data.athlete.ftp,
    indoorFtp: data.athlete.indoorFtp,
    season: ctx.plan,
    rampRate: data.status.rampRate,
    life: ctx.life,
    gym: data.gymDays,
    planned: ctx.planned.map((w) => ({ date: w.date, workout: { ...w, id: 0 } })),
    chosen: choicesOf(ctx.setup),
    feeling: o?.feeling ?? null,
    override: o ? { maxMins: o.maxMins, easier: o.easier, wantClass: o.wantClass, restToday: o.restToday } : undefined,
    ...over,
  };
}
