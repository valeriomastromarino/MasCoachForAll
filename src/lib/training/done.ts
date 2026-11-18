// What a ride already done was, for the week's count: the engine must know that yesterday's session was a quality one,
// or it lays out another one right after it. The intensity factor alone does not say it: a structured session has a long
// warm-up and recoveries, and a tempo, sweet spot or short-interval VO2max ride rarely reaches 0.80 (found on
// 12 November 2026: more than half of the quality workouts of the library would not have been recognised once ridden).
// So: first the library workout with the same name (the planned session that was ridden), then the time spent in each
// power zone, and the intensity factor only when there is nothing else.
import type { ActivityRow } from "@/lib/activities";
import type { LibraryWorkout } from "@/lib/calendar";
import { classifyWorkout, type WorkoutClass } from "./classify";
import type { RecentActivity } from "./suggest";

type Ride = Pick<ActivityRow, "date" | "name" | "IF" | "tss" | "movingTime" | "zones">;

/** A session recalibrated in the trainer player is uploaded as "Name · al 90%". */
const key = (name: string) => name.replace(/\s*·\s*al\s+\d+%\s*$/i, "").trim().toLowerCase();

/** A ride counts as the library workout of the same name when at least half of it was ridden. */
const RIDDEN_SHARE = 0.5;

/** The ride read from its minutes in the Coggan zones (Z1…Z7), with the engine's own idea of quality and hard work. */
export function classFromZones(zones: number[], movingTime: number, IF: number | null): { cls?: WorkoutClass; hard: boolean; quality: boolean } {
  const m = (s: number) => s / 60;
  const total = m(movingTime || zones.reduce((a, b) => a + b, 0));
  const z4 = m(zones[3] ?? 0);
  const high = m((zones[4] ?? 0) + (zones[5] ?? 0) + (zones[6] ?? 0));
  const above = m(zones[2] ?? 0) + z4 + high;
  const long = total >= 150;
  // The old reading stays as one of the ways in: a ride ridden hard from start to finish.
  const byIF = IF !== null;
  const hard = high >= 8 || z4 >= 20 || (byIF && IF >= 0.85 && total >= 20);
  // Minutes above Z2 scattered over a long or hilly ride are not a quality session: they must be a real share of it.
  const quality = hard || (long ? above > total * 0.3 : above >= 20 && above >= total * 0.25) || (byIF && IF >= 0.8 && total >= 30);
  const cls: WorkoutClass | undefined = high >= 8 ? "vo2" : z4 >= 20 ? "soglia" : quality ? "tempo" : undefined;
  return { cls, hard, quality };
}

// The library is the same array for a whole session of the app: index its names once.
const byName = new WeakMap<LibraryWorkout[], Map<string, LibraryWorkout>>();
function index(library: LibraryWorkout[]): Map<string, LibraryWorkout> {
  let map = byName.get(library);
  if (!map) {
    map = new Map();
    for (const w of library) if (!map.has(key(w.name))) map.set(key(w.name), w);
    byName.set(library, map);
  }
  return map;
}

/** The rides done, as the engine counts them: each with its type, and whether it was a quality or a hard session. */
export function recentFromRides(rides: Ride[], library: LibraryWorkout[]): RecentActivity[] {
  const names = index(library);
  return rides.map((a) => {
    const row: RecentActivity = { date: a.date.slice(0, 10), name: a.name, IF: a.IF, tss: a.tss, movingTime: a.movingTime };
    const planned = names.get(key(a.name));
    if (planned && a.movingTime >= (planned.secs ?? 0) * RIDDEN_SHARE) {
      const c = classifyWorkout(planned);
      return { ...row, cls: c.cls, hard: c.hard, quality: c.quality };
    }
    if (a.zones?.length) return { ...row, ...classFromZones(a.zones, a.movingTime, a.IF) };
    return row;
  });
}
