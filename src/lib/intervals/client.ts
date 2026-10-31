// Intervals.icu client. In the Next.js app it runs on the server (key from .env.local, never sent to the
// browser); in the single-file build it runs in the browser with the key saved there (see credentials.ts).
import { addDays, toIsoDate } from "../dates";
import { invalidate } from "./cache";
import { apiKey, athleteId } from "./credentials";
import type { RawRideDetail, RawStream } from "../ride";
import type {
  IcuActivity,
  IcuAthlete,
  IcuEvent,
  IcuFolder,
  IcuLibraryWorkout,
  IcuPowerCurve,
  IcuWellness,
  RawData,
} from "./types";

const BASE = "https://intervals.icu/api/v1";
const TIMEOUT_MS = 20_000;

export function intervalsConfigured(): boolean {
  return Boolean(apiKey());
}

async function icu<T>(
  path: string,
  params: Record<string, string> = {},
  write?: { method: "POST" | "PUT" | "DELETE"; body?: unknown },
): Promise<T> {
  try {
    const result = await icuRequest<T>(path, params, write);
    // Any change on Intervals.icu makes the remembered calendar reads stale.
    if (write) invalidate("calendar:");
    return result;
  } catch (e) {
    if (e instanceof DOMException && e.name === "TimeoutError") {
      throw new Error("Intervals.icu non ha risposto in tempo. Di solito basta riprovare.");
    }
    throw e;
  }
}

async function icuRequest<T>(
  path: string,
  params: Record<string, string>,
  write?: { method: "POST" | "PUT" | "DELETE"; body?: unknown },
): Promise<T> {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  // btoa works both in Node and in the browser (the key is plain ASCII).
  const auth = btoa(`API_KEY:${apiKey()}`);
  const res = await fetch(url, {
    // Never wait forever on Intervals.icu: the pages show a clear message and a retry instead.
    signal: AbortSignal.timeout(TIMEOUT_MS),
    method: write?.method ?? "GET",
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
      ...(write?.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: write?.body !== undefined ? JSON.stringify(write.body) : undefined,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Intervals.icu ${res.status} su ${path}: ${body.slice(0, 200)}`);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

export async function fetchActivities(oldest: string, newest: string): Promise<IcuActivity[]> {
  return icu<IcuActivity[]>(`/athlete/${athleteId()}/activities`, { oldest, newest });
}

const RIDE_STREAMS = "time,watts,heartrate,cadence,altitude,distance,latlng,dfa_a1";

export async function fetchRide(activityId: string): Promise<{ raw: RawRideDetail; streams: RawStream[] }> {
  const id = encodeURIComponent(activityId);
  const [raw, streams] = await Promise.all([
    icu<RawRideDetail>(`/activity/${id}`, { intervals: "true" }),
    icu<RawStream[]>(`/activity/${id}/streams.json`, { types: RIDE_STREAMS }),
  ]);
  return { raw, streams };
}

export async function fetchIntervals(historyDays: number): Promise<RawData> {
  const today = toIsoDate(new Date());
  const oldest = addDays(today, -historyDays);
  const id = athleteId();
  const monthStart = today.slice(0, 8) + "01";
  const prevEnd = addDays(monthStart, -1);
  const prevStart = prevEnd.slice(0, 8) + "01";

  const [athlete, wellness, activities, events, curves] = await Promise.all([
    icu<IcuAthlete>(`/athlete/${id}`),
    icu<IcuWellness[]>(`/athlete/${id}/wellness`, { oldest, newest: today }),
    icu<IcuActivity[]>(`/athlete/${id}/activities`, { oldest: addDays(today, -365), newest: today }),
    icu<IcuEvent[]>(`/athlete/${id}/events`, { oldest: addDays(today, -7 * 9), newest: addDays(today, 14) }).catch(() => []),
    // 84 days ≈ the window most coaches use for a current power profile; "r.from.to" is a date range.
    icu<{ list?: IcuPowerCurve[] }>(`/athlete/${id}/power-curves.json`, {
      type: "Ride",
      curves: `84d,r.${monthStart}.${today},r.${prevStart}.${prevEnd}`,
    }).catch(() => ({ list: [] })),
  ]);

  return {
    source: "intervals",
    today,
    athlete,
    wellness,
    activities,
    events,
    powerCurve: curves.list?.[0] ?? null,
    monthCurves: { current: curves.list?.[1] ?? null, previous: curves.list?.[2] ?? null },
  };
}

/** Everything the long-term history needs: activities, wellness and best powers per calendar year. */
export async function fetchHistory(from: string, today: string): Promise<{
  activities: IcuActivity[];
  wellness: IcuWellness[];
  yearCurves: Record<string, IcuPowerCurve | null>;
}> {
  const id = athleteId();
  const years: string[] = [];
  for (let y = Number(from.slice(0, 4)); y <= Number(today.slice(0, 4)); y++) years.push(String(y));
  const [activities, wellness, curves] = await Promise.all([
    icu<IcuActivity[]>(`/athlete/${id}/activities`, { oldest: from, newest: today }),
    icu<IcuWellness[]>(`/athlete/${id}/wellness`, { oldest: from, newest: today }),
    icu<{ list?: IcuPowerCurve[] }>(`/athlete/${id}/power-curves.json`, {
      type: "Ride",
      curves: years.map((y) => `r.${y}-01-01.${y}-12-31`).join(","),
    }).catch(() => ({ list: [] })),
  ]);
  return { activities, wellness, yearCurves: Object.fromEntries(years.map((y, i) => [y, curves.list?.[i] ?? null])) };
}

// ── Calendar: read and write ────────────────────────────────────────────────────────────────────────

export async function fetchEvents(oldest: string, newest: string): Promise<IcuEvent[]> {
  return icu<IcuEvent[]>(`/athlete/${athleteId()}/events`, { oldest, newest });
}

export async function fetchLibrary(): Promise<{ workouts: IcuLibraryWorkout[]; folders: IcuFolder[] }> {
  const id = athleteId();
  const [workouts, folders] = await Promise.all([
    icu<IcuLibraryWorkout[]>(`/athlete/${id}/workouts`),
    icu<IcuFolder[]>(`/athlete/${id}/folders`),
  ]);
  return { workouts, folders };
}

/** Fields of an activity the calendar lets you change. */
export type ActivityPatch = { name?: string; type?: string; description?: string; icu_rpe?: number; carbs_ingested?: number };

export async function updateActivity(activityId: string, patch: ActivityPatch): Promise<void> {
  await icu(`/activity/${encodeURIComponent(activityId)}`, {}, { method: "PUT", body: patch });
}

export async function createEvent(event: Omit<IcuEvent, "id">): Promise<IcuEvent> {
  return icu<IcuEvent>(`/athlete/${athleteId()}/events`, {}, { method: "POST", body: event });
}

export async function fetchEvent(eventId: string): Promise<IcuEvent> {
  return icu<IcuEvent>(`/athlete/${athleteId()}/events/${encodeURIComponent(eventId)}`);
}

/** Changes some fields of a planned event; a new description makes Intervals.icu re-read the workout steps. */
export async function updateEvent(eventId: string, patch: Partial<Omit<IcuEvent, "id">>): Promise<IcuEvent> {
  return icu<IcuEvent>(`/athlete/${athleteId()}/events/${encodeURIComponent(eventId)}`, {}, { method: "PUT", body: patch });
}

/** One activity with every field Intervals.icu has on it (W′, joules, carbohydrate…). */
export async function fetchActivity(activityId: string): Promise<IcuActivity> {
  return icu<IcuActivity>(`/activity/${encodeURIComponent(activityId)}`);
}

/** Selected streams of an activity, by type (e.g. "w_bal,watts"). */
export async function fetchStreams(activityId: string, types: string): Promise<RawStream[]> {
  return icu<RawStream[]>(`/activity/${encodeURIComponent(activityId)}/streams.json`, { types });
}

/** Saves a workout in the library, in the folder with this name (created the first time). */
export async function saveLibraryWorkout(
  folderName: string,
  workout: Omit<IcuLibraryWorkout, "id" | "folder_id"> & { tags?: string[] },
): Promise<{ workout: IcuLibraryWorkout; folder: string }> {
  const id = athleteId();
  const folders = await icu<IcuFolder[]>(`/athlete/${id}/folders`);
  let folder = folders.find((f) => f.type !== "PLAN" && f.name === folderName);
  if (!folder) folder = await icu<IcuFolder>(`/athlete/${id}/folders`, {}, { method: "POST", body: { name: folderName, type: "FOLDER" } });
  const saved = await icu<IcuLibraryWorkout>(`/athlete/${id}/workouts`, {}, { method: "POST", body: { ...workout, folder_id: folder.id } });
  return { workout: saved, folder: folder.name ?? folderName };
}

export async function deleteLibraryWorkout(workoutId: number): Promise<void> {
  await icu(`/athlete/${athleteId()}/workouts/${workoutId}`, {}, { method: "DELETE" });
}

export async function moveEvent(eventId: string, date: string): Promise<void> {
  await icu(`/athlete/${athleteId()}/events/${encodeURIComponent(eventId)}`, {}, {
    method: "PUT",
    body: { start_date_local: `${date}T00:00:00` },
  });
}

export async function deleteEvent(eventId: string): Promise<void> {
  await icu(`/athlete/${athleteId()}/events/${encodeURIComponent(eventId)}`, {}, { method: "DELETE" });
}

// ── Trainer player ──────────────────────────────────────────────────────────────────────────────────

/**
 * A planned workout with its targets resolved in watts. Only the list endpoint resolves them (resolve=true),
 * so read the event first for its day, then that day's events.
 */
export async function fetchResolvedWorkout(eventId: string): Promise<IcuEvent> {
  const event = await fetchEvent(eventId);
  const day = event.start_date_local.slice(0, 10);
  const list = await icu<IcuEvent[]>(`/athlete/${athleteId()}/events`, { oldest: day, newest: day, resolve: "true" }).catch(() => []);
  return list.find((e) => String(e.id) === String(eventId)) ?? event;
}

export async function fetchAthlete(): Promise<IcuAthlete> {
  return icu<IcuAthlete>(`/athlete/${athleteId()}`);
}

/** Uploads a FIT file as a new activity, paired with the planned workout. Returns the new activity id. */
export async function uploadActivity(
  file: Uint8Array,
  opts: { name: string; externalId: string; pairedEventId: string | null },
): Promise<string | null> {
  const url = new URL(`${BASE}/athlete/${athleteId()}/activities`);
  url.searchParams.set("name", opts.name);
  url.searchParams.set("external_id", opts.externalId);
  url.searchParams.set("device_name", "MasCoach");
  if (opts.pairedEventId) url.searchParams.set("paired_event_id", opts.pairedEventId);
  const form = new FormData();
  form.append("file", new Blob([file as BlobPart], { type: "application/octet-stream" }), `${opts.externalId}.fit`);
  const res = await fetch(url, {
    method: "POST",
    signal: AbortSignal.timeout(60_000),
    headers: { Authorization: `Basic ${btoa(`API_KEY:${apiKey()}`)}`, Accept: "application/json" },
    body: form,
  });
  if (!res.ok) throw new Error(`Intervals.icu ${res.status} sul caricamento: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  invalidate("calendar:");
  const created = (await res.json().catch(() => [])) as { id?: string }[];
  return created[0]?.id ?? null;
}

/** Power stream only, for the durability analysis of long rides. */
export async function fetchWatts(activityId: string): Promise<(number | null)[]> {
  const streams = await icu<RawStream[]>(`/activity/${encodeURIComponent(activityId)}/streams.json`, { types: "watts" });
  return streams.find((s) => s.type === "watts")?.data ?? [];
}
