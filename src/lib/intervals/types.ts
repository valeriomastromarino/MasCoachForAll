// Subset of the Intervals.icu API schema we rely on (see https://intervals.icu/api/v1/docs).
import type { RawStep } from "../workout";

export type IcuSportSettings = {
  types: string[];
  ftp?: number | null;
  indoor_ftp?: number | null;
  w_prime?: number | null;
  lthr?: number | null;
  max_hr?: number | null;
};

export type IcuAthlete = {
  id?: string;
  name?: string | null;
  firstname?: string | null;
  icu_weight?: number | null;
  weight?: number | null;
  icu_resting_hr?: number | null;
  sportSettings?: IcuSportSettings[];
};

export type IcuWellness = {
  id: string; // YYYY-MM-DD
  ctl?: number | null;
  atl?: number | null;
  /** Daily training load counted in CTL, includes activities hidden from the API (e.g. Strava-only). */
  ctlLoad?: number | null;
  /** Daily load counted in ATL; can exceed ctlLoad when a sport (e.g. gym) is set to count only as fatigue. */
  atlLoad?: number | null;
  weight?: number | null;
  restingHR?: number | null;
  hrv?: number | null; // rMSSD, ms (Garmin: overnight average)
  sleepSecs?: number | null;
  sleepScore?: number | null;
};

export type IcuActivity = {
  id: string;
  start_date_local: string;
  /** Missing for Strava-imported activities, which Intervals.icu may not expose via its API. */
  type?: string;
  name?: string | null;
  moving_time?: number | null;
  distance?: number | null;
  trainer?: boolean | null;
  icu_training_load?: number | null;
  icu_average_watts?: number | null;
  icu_weighted_avg_watts?: number | null;
  icu_intensity?: number | null;
  icu_ftp?: number | null;
  average_heartrate?: number | null;
  decoupling?: number | null;
  icu_efficiency_factor?: number | null;
  icu_zone_times?: { id: string; secs: number }[] | null;
  /** Intervals.icu's estimated FTP (eFTP) after this activity, from its rolling power model. */
  icu_rolling_ftp?: number | null;
  description?: string | null;
  /** Perceived exertion, 1–10 (Borg CR-10). */
  icu_rpe?: number | null;
  /** Work done, J. */
  icu_joules?: number | null;
  icu_joules_above_ftp?: number | null;
  /** W′ (J) Intervals.icu used for this activity, and the deepest W′bal depletion (J). */
  icu_w_prime?: number | null;
  icu_max_wbal_depletion?: number | null;
  /** Carbohydrate burnt (Intervals.icu estimate) and eaten (entered by the athlete), g. */
  carbs_used?: number | null;
  carbs_ingested?: number | null;
};

/** Calendar entry: planned workouts (category WORKOUT), races, notes… */
export type IcuEvent = {
  id: number | string;
  start_date_local: string;
  category?: string | null;
  type?: string | null;
  name?: string | null;
  icu_training_load?: number | null;
  moving_time?: number | null;
  description?: string | null;
  indoor?: boolean | null;
  workout_doc?: { steps?: RawStep[] | null } | null;
  /** Set by the app that created the event; MasCoach Coach uses "mascoach-coach-…" / "mascoach-prova-…". */
  external_id?: string | null;
  tags?: string[] | null;
  /** Multi-day events (holidays, illness…). */
  end_date_local?: string | null;
  /** Targets of TARGET events (week goals) and races: TSS, seconds, metres. */
  load_target?: number | null;
  time_target?: number | null;
  distance_target?: number | null;
};

/** Workout saved in the athlete's Intervals.icu library. */
export type IcuLibraryWorkout = {
  id: number;
  name?: string | null;
  type?: string | null;
  folder_id?: number | null;
  moving_time?: number | null;
  icu_training_load?: number | null;
  description?: string | null;
  indoor?: boolean | null;
  workout_doc?: { steps?: RawStep[] | null } | null;
};

export type IcuFolder = { id: number; name?: string | null; type?: string | null };

export type IcuPowerModel = { type: string; criticalPower?: number; wPrime?: number; pMax?: number; ftp?: number };

export type IcuPowerCurve = { secs: number[]; values?: number[]; watts?: number[]; powerModels?: IcuPowerModel[] };

export type RawData = {
  source: "intervals" | "demo";
  today: string;
  athlete: IcuAthlete;
  wellness: IcuWellness[];
  /** About a year of activities (the eFTP trend needs it); other views pick their own window. */
  activities: IcuActivity[];
  /** Calendar from ~9 weeks ago to 2 weeks ahead. */
  events: IcuEvent[];
  /** Best powers over the last 84 days. */
  powerCurve: IcuPowerCurve | null;
  /** Best powers of the current and the previous calendar month. */
  monthCurves: { current: IcuPowerCurve | null; previous: IcuPowerCurve | null };
};
