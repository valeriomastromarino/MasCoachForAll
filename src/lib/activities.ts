// Activity list rows, shared by the dashboard ("Ultime uscite") and the archive page.
import type { IcuActivity } from "./intervals/types";
import { isNum } from "./physio/stats";
import { capitalize } from "./text";

export const RIDE_TYPES = new Set(["Ride", "VirtualRide", "GravelRide", "MountainBikeRide", "EBikeRide"]);

export type ActivityCategory = "strada" | "offroad" | "rulli" | "altro" | "nascosta";

export type ActivityRow = {
  id: string;
  date: string;
  name: string;
  type: string | null;
  category: ActivityCategory;
  /** Looks like a fitness test (ramp, FTP, CP…): worth finding quickly. */
  isTest: boolean;
  indoor: boolean;
  movingTime: number;
  distanceKm: number | null;
  avgWatts: number | null;
  np: number | null;
  IF: number | null;
  tss: number | null;
  avgHr: number | null;
  decoupling: number | null;
  ef: number | null;
};

// "ftp" alone is not enough: "ftp 3x10min" is a workout at threshold, not a test.
const TEST_NAME = /\b(test|ramp|rampa|incrementale|critical power)\b|\bcp\d+\b/i;

export function isTestName(name: string | null | undefined): boolean {
  return TEST_NAME.test(name ?? "");
}

/** Intervals.icu reports IF as a percentage (e.g. 82.5). */
export function toIF(x: number | null | undefined): number | null {
  if (!isNum(x)) return null;
  return x > 3 ? x / 100 : x;
}

function num(x: number | null | undefined): number | null {
  return isNum(x) ? x : null;
}

export function categoryOf(a: Pick<IcuActivity, "type" | "trainer">): ActivityCategory {
  if (!a.type) return "nascosta";
  if (!RIDE_TYPES.has(a.type)) return "altro";
  if (a.type === "VirtualRide" || a.trainer) return "rulli";
  if (a.type === "MountainBikeRide" || a.type === "GravelRide") return "offroad";
  return "strada";
}

export function toActivityRow(a: IcuActivity): ActivityRow {
  const category = categoryOf(a);
  return {
    id: a.id,
    date: a.start_date_local,
    name: a.name ? capitalize(a.name) : (category === "nascosta" ? "Attività Strava non leggibile" : (a.type ?? "Attività")),
    type: a.type ?? null,
    category,
    isTest: isTestName(a.name),
    indoor: category === "rulli",
    movingTime: a.moving_time ?? 0,
    distanceKm: isNum(a.distance) ? a.distance / 1000 : null,
    avgWatts: num(a.icu_average_watts),
    np: num(a.icu_weighted_avg_watts),
    IF: toIF(a.icu_intensity),
    tss: num(a.icu_training_load),
    avgHr: num(a.average_heartrate),
    decoupling: num(a.decoupling),
    ef: num(a.icu_efficiency_factor),
  };
}
