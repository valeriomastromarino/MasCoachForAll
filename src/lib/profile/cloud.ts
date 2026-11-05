// The copy of the athlete sheet and the season kept in the athlete's own Intervals.icu account, so a reinstalled app
// (or a new phone) finds them again, and the coach can read them. It is one NOTE event on a fixed day in the year 2000,
// out of every calendar view, found by its external id. The text is readable; the JSON after the marker is what the app reads.
import type { AthleteProfile } from "./profile";
import type { SeasonSetup } from "@/lib/training/season";

export type CloudPayload = {
  version: 1;
  /** ISO date-time of the last save. */
  savedAt: string;
  profile: AthleteProfile | null;
  phenotype: "diesel" | "all_rounder" | "glicolitico" | null;
  /** Text of Scheda_atleta.md as it was when saved. */
  sheet: string | null;
  season: SeasonSetup | null;
};

export type CloudTarget = { date: string; externalId: string; name: string };

export const CLOUD_NOTE: CloudTarget = { date: "2000-01-01", externalId: "mascoach-data", name: "MasCoach: dati dell'app (non cancellare)" };
/** For tests only: written and deleted right away, never touching the real copy. */
export const CLOUD_TEST: CloudTarget = { date: "2000-01-03", externalId: "mascoach-data-prova", name: "MasCoach: prova (si può cancellare)" };

const MARKER = "---MASCOACH-JSON---";
const HEADER = "MasCoach: copia della scheda atleta e della stagione. Si ripristina da sola quando rimetti l'app. Non modificare né cancellare.";

export function isCloudPayload(x: unknown): x is CloudPayload {
  if (!x || typeof x !== "object") return false;
  const p = x as Partial<CloudPayload>;
  return p.version === 1 && typeof p.savedAt === "string" && (p.profile === null || typeof p.profile === "object") && (p.season === null || typeof p.season === "object");
}

export function encodeCloud(p: CloudPayload): string {
  return [HEADER, "", p.sheet ?? "(scheda atleta non ancora compilata)", "", MARKER, JSON.stringify(p)].join("\n");
}

export function decodeCloud(description: string | null | undefined): CloudPayload | null {
  const at = description?.lastIndexOf(MARKER) ?? -1;
  if (!description || at < 0) return null;
  try {
    const p = JSON.parse(description.slice(at + MARKER.length).trim());
    return isCloudPayload(p) ? p : null;
  } catch {
    return null;
  }
}

/** What is already in Intervals.icu fills what this device doesn't have, so a fresh install never wipes the saved copy. */
export function mergeWithCloud(local: CloudPayload, existing: CloudPayload | null, opts: { seasonCleared?: boolean } = {}): CloudPayload {
  if (!existing) return local;
  const keepProfile = local.profile === null && existing.profile !== null;
  return {
    ...local,
    profile: keepProfile ? existing.profile : local.profile,
    phenotype: keepProfile ? existing.phenotype : local.phenotype,
    sheet: keepProfile ? existing.sheet : local.sheet,
    season: local.season ?? (opts.seasonCleared ? null : existing.season),
  };
}
