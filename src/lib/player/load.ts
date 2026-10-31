// Turns an Intervals.icu planned workout into what the player runs; plus a built-in workout to try the trainer
// without Intervals.icu (demo data, or just testing the connection).
import type { IcuAthlete, IcuEvent } from "../intervals/types";
import { capitalize } from "../text";
import type { RawStep } from "../workout";
import { buildTimeline, type PlayerWorkout, totalSecs } from "./timeline";

export const DEMO_WORKOUT_ID = "prova";

/** Indoor FTP of the athlete (falls back to the outdoor one). */
export function indoorFtp(athlete: IcuAthlete | null): number | null {
  const s = athlete?.sportSettings?.find((x) => x.types?.includes("VirtualRide")) ?? athlete?.sportSettings?.find((x) => x.types?.includes("Ride"));
  return s?.indoor_ftp || s?.ftp || null;
}

export function playerWorkout(e: IcuEvent, athleteFtp: number | null): PlayerWorkout {
  const ftp = e.workout_doc?.ftp || athleteFtp || 200;
  const steps = buildTimeline(e.workout_doc?.steps, ftp);
  return {
    id: String(e.id),
    name: capitalize(e.name ?? "Allenamento"),
    date: e.start_date_local.slice(0, 10),
    ftp,
    description: e.description?.trim() || null,
    steps,
    totalSecs: totalSecs(steps),
  };
}

const DEMO_STEPS: RawStep[] = [
  { text: "Riscaldamento", duration: 300, ramp: true, power: { start: 45, end: 65, units: "%ftp" } },
  { text: "Prova ERG 3x", reps: 3, steps: [
    { duration: 60, power: { value: 90, units: "%ftp" }, cadence: { start: 85, end: 95, units: "rpm" } },
    { duration: 60, power: { value: 55, units: "%ftp" } },
  ] },
  { text: "Defaticamento", duration: 180, power: { value: 50, units: "%ftp" } },
];

/** A 14-minute workout to try ERG, resistance and sensors. */
export function demoWorkout(ftp: number | null, today: string): PlayerWorkout {
  const f = ftp || 200;
  const steps = buildTimeline(DEMO_STEPS, f);
  return {
    id: DEMO_WORKOUT_ID,
    name: "Prova del rullo",
    date: today,
    ftp: f,
    description: "Allenamento di prova: riscaldamento, 3 cambi di potenza da 1′ e defaticamento. Serve a provare ERG, resistenza e sensori.",
    steps,
    totalSecs: totalSecs(steps),
  };
}
