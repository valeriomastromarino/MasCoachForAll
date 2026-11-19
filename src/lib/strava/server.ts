// The server side of Strava: the sealed tokens in the athlete's Intervals.icu note (see strava.ts), refreshed when the
// access token runs out. Only the Next.js routes in app/api/strava/ use it: the single-file app reaches them through the
// website, because the client secret stays there.
import { addDays } from "../dates";
import { createEvent, deleteEvent, fetchEvents, updateEvent } from "../intervals/client";
import { needsRefresh, openTokens, refreshTokens, sealTokens, STRAVA_NOTE, type StravaConfig, type StravaTokens } from "./strava";

async function findNote() {
  const events = await fetchEvents(STRAVA_NOTE.date, addDays(STRAVA_NOTE.date, 1));
  return events.find((e) => e.external_id === STRAVA_NOTE.externalId) ?? null;
}

export async function loadTokens(cfg: StravaConfig): Promise<StravaTokens | null> {
  const note = await findNote();
  return note ? openTokens(note.description, cfg.clientSecret) : null;
}

export async function saveTokens(cfg: StravaConfig, t: StravaTokens): Promise<void> {
  const description = await sealTokens(t, cfg.clientSecret);
  const note = await findNote();
  if (note) await updateEvent(String(note.id), { name: STRAVA_NOTE.name, description });
  else await createEvent({ category: "NOTE", start_date_local: `${STRAVA_NOTE.date}T00:00:00`, name: STRAVA_NOTE.name, description, external_id: STRAVA_NOTE.externalId });
}

export async function deleteTokens(): Promise<void> {
  const note = await findNote();
  if (note) await deleteEvent(String(note.id));
}

/** Tokens ready for a call: refreshed (and saved, Strava may change the refresh token) when the access token ran out. */
export async function freshTokens(cfg: StravaConfig): Promise<StravaTokens | null> {
  const t = await loadTokens(cfg);
  if (!t || !needsRefresh(t)) return t;
  const next = await refreshTokens(cfg, t);
  await saveTokens(cfg, next);
  return next;
}
