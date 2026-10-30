// Workouts written by MasCoach Coach (Claude through the connector) carry an external_id with one of these
// prefixes: the calendar labels them, and the coach may only change or delete its own workouts.

export type CoachMark = "coach" | "prova";

const PREFIX: Record<CoachMark, string> = { coach: "mascoach-coach-", prova: "mascoach-prova-" };

export function coachMarkOf(externalId: string | null | undefined): CoachMark | null {
  if (externalId?.startsWith(PREFIX.prova)) return "prova";
  if (externalId?.startsWith(PREFIX.coach)) return "coach";
  return null;
}

export function newCoachExternalId(mark: CoachMark): string {
  return PREFIX[mark] + crypto.randomUUID();
}

/** Tags shown on Intervals.icu too, so a coach workout is recognisable there as well. */
export function coachTags(mark: CoachMark): string[] {
  return mark === "prova" ? ["MasCoach Coach", "Prova"] : ["MasCoach Coach"];
}
