// Everything behind /api/*, independent of where it runs: the Next.js routes call it on the server,
// the single-file build calls it straight from the browser (Intervals.icu allows cross-origin requests).
import { type ActivityRow, RIDE_TYPES, toActivityRow } from "../activities";
import { buildCalendar, buildLibrary, type CalendarData, eventFromLibrary, type LibraryFolder } from "../calendar";
import { buildDashboard, type DashboardData } from "../dashboard";
import { addDays, toIsoDate } from "../dates";
import { demoData } from "../demo";
import { demoRide } from "../demoRide";
import { cached } from "../intervals/cache";
import {
  type ActivityPatch,
  createEvent,
  deleteEvent,
  fetchActivities,
  fetchAthlete,
  fetchEvents,
  fetchHistory,
  fetchIntervals,
  fetchLibrary,
  fetchResolvedWorkout,
  fetchRide,
  fetchWatts,
  intervalsConfigured,
  moveEvent,
  updateActivity,
  uploadActivity,
} from "../intervals/client";
import { DEMO_WORKOUT_ID, demoWorkout, indoorFtp, playerWorkout } from "../player/load";
import type { PlayerWorkout } from "../player/timeline";
import {
  combineDurability,
  DURABILITY_DURATIONS,
  DURABILITY_MARKS,
  type DurabilityMark,
  type RideDurability,
  rideDurability,
} from "../physio/durability";
import { buildHistory, type HistoryData } from "../history";
import { buildRide, type RideDetail } from "../ride";

export type { CalendarData, HistoryData };
export type ActivitiesPage = { rows: ActivityRow[]; oldest: string; newest: string };
export type LibraryData = { folders: LibraryFolder[] };
export type DurabilityData = {
  windowDays: number;
  durations: number[];
  rides: { id: string; date: string; name: string; hours: number }[];
  marks: DurabilityMark[];
};

export type TrainerWorkoutData = { workout: PlayerWorkout };

export type ApiResult = { status: number; json: unknown };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ok = (json: unknown): ApiResult => ({ status: 200, json });
const fail = (status: number, error: string): ApiResult => ({ status, json: { error } });
const DEMO_ONLY = () => fail(400, "Non disponibile con i dati demo");
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

// ── Dashboard ───────────────────────────────────────────────────────────────────────────────────────

// HRV baseline needs ~60 days before the first displayed day, so fetch more than we show.
const DISPLAY_DAYS = 120;
const HISTORY_DAYS = DISPLAY_DAYS + 70;
const DASHBOARD_TTL_MS = 5 * 60 * 1000;
let dashboardCache: { at: number; data: DashboardData } | null = null;

async function dashboard(q: URLSearchParams): Promise<ApiResult> {
  if (q.get("demo") === "1" || !intervalsConfigured()) return ok(buildDashboard(demoData(HISTORY_DAYS), DISPLAY_DAYS));
  if (q.get("refresh") !== "1" && dashboardCache && Date.now() - dashboardCache.at < DASHBOARD_TTL_MS) return ok(dashboardCache.data);
  const data = buildDashboard(await fetchIntervals(HISTORY_DAYS), DISPLAY_DAYS);
  dashboardCache = { at: Date.now(), data };
  return ok(data);
}

// ── Archive ─────────────────────────────────────────────────────────────────────────────────────────

/** One page of the archive covers this many days, newest first. */
const PAGE_DAYS = 365;

async function activities(q: URLSearchParams): Promise<ApiResult> {
  const before = q.get("before");
  const newest = before && ISO_DATE.test(before) ? before : toIsoDate(new Date());
  const oldest = addDays(newest, -PAGE_DAYS + 1);
  const list =
    q.get("demo") === "1" || !intervalsConfigured()
      ? demoData(PAGE_DAYS).activities.filter((a) => a.start_date_local.slice(0, 10) <= newest)
      : // A year of activities is a heavy call for Intervals.icu: share it for 2 minutes.
        await cached(`activities:${oldest}:${newest}`, 120_000, () => fetchActivities(oldest, newest));
  const rows = list.map(toActivityRow).sort((a, b) => b.date.localeCompare(a.date));
  return ok({ rows, oldest, newest } satisfies ActivitiesPage);
}

// ── Ride detail ─────────────────────────────────────────────────────────────────────────────────────

// A past ride never changes, so keep a small in-memory cache.
const rideCache = new Map<string, RideDetail>();
const MAX_RIDES = 100;
const BIKE_TYPES = new Set(["Ride", "VirtualRide", "GravelRide", "MountainBikeRide", "EBikeRide"]);

async function ride(id: string): Promise<ApiResult> {
  if (id.startsWith("demo-") || !intervalsConfigured()) {
    const { raw, streams } = demoRide(id);
    return ok(buildRide(raw, streams));
  }
  const hit = rideCache.get(id);
  if (hit) return ok(hit);
  const { raw, streams } = await fetchRide(id);
  const detail = buildRide(raw, streams);
  if (rideCache.size >= MAX_RIDES) rideCache.delete(rideCache.keys().next().value!);
  rideCache.set(id, detail);
  return ok(detail);
}

/** Name, bike type, description and RPE (1–10) of an activity, saved on Intervals.icu. */
async function patchRide(id: string, body: Record<string, unknown> | null): Promise<ApiResult> {
  if (id.startsWith("demo-") || !intervalsConfigured()) return DEMO_ONLY();
  if (!body) return fail(400, "Richiesta non valida");
  const patch: ActivityPatch = {};
  if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim().slice(0, 200);
  if (typeof body.type === "string" && BIKE_TYPES.has(body.type)) patch.type = body.type;
  // Like the RPE, a null description is ignored by Intervals.icu: an empty string clears it.
  if (typeof body.description === "string" || body.description === null) patch.description = (body.description as string | null) ?? "";
  // Intervals.icu ignores null: 0 is how an RPE is cleared.
  if (body.rpe === null) patch.icu_rpe = 0;
  else if (typeof body.rpe === "number" && Number.isInteger(body.rpe) && body.rpe >= 1 && body.rpe <= 10) patch.icu_rpe = body.rpe;
  if (!Object.keys(patch).length) return fail(400, "Niente da salvare");
  await updateActivity(id, patch);
  rideCache.delete(id);
  return ok({ ok: true });
}

// ── Calendar and library ────────────────────────────────────────────────────────────────────────────

const MAX_CALENDAR_DAYS = 70;

async function calendar(q: URLSearchParams): Promise<ApiResult> {
  const from = q.get("from") ?? "";
  const to = q.get("to") ?? "";
  const ftp = Number(q.get("ftp")) || null;
  if (!ISO_DATE.test(from) || !ISO_DATE.test(to) || from > to || addDays(from, MAX_CALENDAR_DAYS) < to) {
    return fail(400, "Intervallo di date non valido");
  }
  if (q.get("demo") === "1" || !intervalsConfigured()) {
    const demo = demoData(120);
    return ok(buildCalendar(demo.activities, demo.events, from, to, ftp));
  }
  const [acts, events] = await cached(`calendar:${from}:${to}`, 60_000, () =>
    Promise.all([fetchActivities(from, to), fetchEvents(from, to)]),
  );
  return ok(buildCalendar(acts, events, from, to, ftp) satisfies CalendarData);
}

/** Puts a workout from the Intervals.icu library on a day of the calendar. */
async function addWorkout(body: { workoutId?: number; date?: string } | null): Promise<ApiResult> {
  if (!intervalsConfigured()) return DEMO_ONLY();
  if (!body || typeof body.workoutId !== "number" || !ISO_DATE.test(body.date ?? "")) return fail(400, "Richiesta non valida");
  const { workouts } = await fetchLibrary();
  const w = workouts.find((x) => x.id === body.workoutId);
  if (!w) return fail(404, "Allenamento non trovato nella libreria");
  const created = await createEvent(eventFromLibrary(w, body.date!));
  return ok({ id: String(created?.id ?? "") });
}

async function moveWorkout(id: string, body: { date?: string } | null): Promise<ApiResult> {
  if (!intervalsConfigured()) return DEMO_ONLY();
  if (!ISO_DATE.test(body?.date ?? "")) return fail(400, "Data non valida");
  await moveEvent(id, body!.date!);
  return ok({ ok: true });
}

async function removeWorkout(id: string): Promise<ApiResult> {
  if (!intervalsConfigured()) return DEMO_ONLY();
  await deleteEvent(id);
  return ok({ ok: true });
}

const DEMO_LIBRARY: LibraryData = {
  folders: [
    {
      id: 1,
      name: "Workouts",
      workouts: [
        {
          id: 1,
          name: "Endurance Z2 · 1h30",
          type: "Ride",
          secs: 5400,
          tss: 60,
          description: "Riscaldamento\n- 10m Z1\n\nBlocco principale\n- 70m Z2\n\nDefaticamento\n- 10m Z1",
          blocks: [
            { secs: 600, zone: 1 },
            { secs: 4200, zone: 2 },
            { secs: 600, zone: 1 },
          ],
        },
      ],
    },
  ],
};

async function library(q: URLSearchParams): Promise<ApiResult> {
  if (!intervalsConfigured()) return ok(DEMO_LIBRARY);
  const ftp = Number(q.get("ftp")) || null;
  const { workouts, folders } = await fetchLibrary();
  return ok({ folders: buildLibrary(workouts, folders, ftp) } satisfies LibraryData);
}

// ── Durability ──────────────────────────────────────────────────────────────────────────────────────

// Same window as the fresh power profile it is compared with.
const WINDOW_DAYS = 84;
// A ride must go past 2 h by at least the shortest effort to count.
const MIN_SECS = DURABILITY_MARKS[0] + DURABILITY_DURATIONS[0];
const DURABILITY_TTL_MS = 30 * 60 * 1000;
// Streams of past rides never change: keep each analysis as long as the app runs.
const perRide = new Map<string, RideDurability>();
let durabilityCache: { at: number; data: DurabilityData } | null = null;

async function mapLimit<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

function demoDurability(): DurabilityData {
  const curve = demoData(WINDOW_DAYS).powerCurve!;
  const at = (s: number) => curve.values![curve.secs.indexOf(s)] ?? curve.values![curve.values!.length - 1];
  return {
    windowDays: WINDOW_DAYS,
    durations: DURABILITY_DURATIONS,
    rides: [],
    marks: DURABILITY_MARKS.map((afterSecs, m) => ({
      afterSecs,
      rides: m === 0 ? 9 : 4,
      avgKj: m === 0 ? 1350 : 2050,
      watts: DURABILITY_DURATIONS.map((d) => Math.round(at(d) * (m === 0 ? 0.93 : 0.87))),
    })),
  };
}

async function durability(q: URLSearchParams): Promise<ApiResult> {
  if (q.get("demo") === "1" || !intervalsConfigured()) return ok(demoDurability());
  if (q.get("refresh") !== "1" && durabilityCache && Date.now() - durabilityCache.at < DURABILITY_TTL_MS) return ok(durabilityCache.data);
  const today = toIsoDate(new Date());
  const long = (await fetchActivities(addDays(today, -WINDOW_DAYS + 1), today)).filter(
    (a) => a.type && RIDE_TYPES.has(a.type) && (a.moving_time ?? 0) >= MIN_SECS && (a.icu_average_watts ?? 0) > 0,
  );
  // Intervals.icu serves one athlete's requests largely one after another: keep the queue short.
  const analyses = await mapLimit(long, 2, async (a) => {
    if (!perRide.has(a.id)) perRide.set(a.id, rideDurability(await fetchWatts(a.id)));
    return perRide.get(a.id)!;
  });
  const data: DurabilityData = {
    windowDays: WINDOW_DAYS,
    durations: DURABILITY_DURATIONS,
    rides: long.map((a) => ({ id: a.id, date: a.start_date_local.slice(0, 10), name: a.name ?? "Uscita", hours: (a.moving_time ?? 0) / 3600 })),
    marks: combineDurability(analyses),
  };
  durabilityCache = { at: Date.now(), data };
  return ok(data);
}

// ── Long-term history (coach) ────────────────────────────────────────────────────────────────────────

const MAX_HISTORY_YEARS = 4;

async function history(q: URLSearchParams): Promise<ApiResult> {
  const years = Math.min(MAX_HISTORY_YEARS, Math.max(1, Math.round(Number(q.get("years")) || MAX_HISTORY_YEARS)));
  const today = toIsoDate(new Date());
  const from = addDays(today, -Math.round(years * 365.25) + 1);
  if (q.get("demo") === "1" || !intervalsConfigured()) {
    const demo = demoData(Math.round(years * 365.25));
    return ok(buildHistory({ from, today, activities: demo.activities, wellness: demo.wellness, yearCurves: {} }));
  }
  // Four years of activities is a heavy read for Intervals.icu: share it for 30 minutes.
  const raw = await cached(`history:${from}`, 30 * 60_000, () => fetchHistory(from, today));
  return ok(buildHistory({ from, today, ...raw }) satisfies HistoryData);
}

// ── Trainer player ──────────────────────────────────────────────────────────────────────────────────

async function trainerWorkout(id: string): Promise<ApiResult> {
  const today = toIsoDate(new Date());
  if (id === DEMO_WORKOUT_ID || !intervalsConfigured()) {
    const ftp = intervalsConfigured() ? indoorFtp(await fetchAthlete().catch(() => null)) : indoorFtp(demoData(1).athlete);
    return ok({ workout: demoWorkout(ftp, today) } satisfies TrainerWorkoutData);
  }
  const [event, athlete] = await Promise.all([fetchResolvedWorkout(id), fetchAthlete().catch(() => null)]);
  if (!event.workout_doc?.steps?.length) return fail(422, "Questo allenamento non ha passi strutturati su Intervals.icu");
  return ok({ workout: playerWorkout(event, indoorFtp(athlete)) } satisfies TrainerWorkoutData);
}

/** FIT file of a trainer session (base64), uploaded to Intervals.icu and paired with its planned workout. */
async function trainerUpload(body: { fit?: string; name?: string; externalId?: string; eventId?: string | null } | null): Promise<ApiResult> {
  if (!intervalsConfigured()) return fail(400, "Con i dati demo la seduta non si carica: scarica il file FIT");
  if (!body?.fit || !body.externalId) return fail(400, "Richiesta non valida");
  const bin = atob(body.fit);
  const file = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  const pairedEventId = body.eventId && body.eventId !== DEMO_WORKOUT_ID ? body.eventId : null;
  const id = await uploadActivity(file, { name: (body.name ?? "Rulli").slice(0, 200), externalId: body.externalId, pairedEventId });
  dashboardCache = null;
  return ok({ id });
}

// ── Dispatch ────────────────────────────────────────────────────────────────────────────────────────

/** Forget everything remembered (used when the Intervals.icu key changes). */
export function resetApiCaches() {
  dashboardCache = null;
  durabilityCache = null;
  rideCache.clear();
  perRide.clear();
}

/** Runs one API call: `path` is e.g. "/api/calendar?from=…", `body` the parsed JSON of a write. */
export async function handleApi(method: string, path: string, body: unknown = null): Promise<ApiResult> {
  const url = new URL(path, "http://app.local");
  const p = url.pathname.replace(/\/+$/, "");
  const q = url.searchParams;
  const seg = (re: RegExp) => decodeURIComponent(p.match(re)?.[1] ?? "");
  try {
    if (method === "GET" && p === "/api/dashboard") return await dashboard(q);
    if (method === "GET" && p === "/api/activities") return await activities(q);
    if (method === "GET" && p === "/api/calendar") return await calendar(q);
    if (method === "GET" && p === "/api/library") return await library(q);
    if (method === "GET" && p === "/api/durability") return await durability(q);
    if (method === "GET" && p === "/api/history") return await history(q);
    if (p.startsWith("/api/activity/")) {
      const id = seg(/^\/api\/activity\/([^/]+)$/);
      if (method === "GET") return await ride(id);
      if (method === "PATCH") return await patchRide(id, body as Record<string, unknown> | null);
    }
    if (method === "GET" && p.startsWith("/api/rulli/workout/")) return await trainerWorkout(seg(/^\/api\/rulli\/workout\/([^/]+)$/));
    if (method === "POST" && p === "/api/rulli/upload") return await trainerUpload(body as Parameters<typeof trainerUpload>[0]);
    if (p === "/api/calendar/events" && method === "POST") return await addWorkout(body as { workoutId?: number; date?: string } | null);
    if (p.startsWith("/api/calendar/events/")) {
      const id = seg(/^\/api\/calendar\/events\/([^/]+)$/);
      if (method === "PATCH") return await moveWorkout(id, body as { date?: string } | null);
      if (method === "DELETE") return await removeWorkout(id);
    }
    return fail(404, `Richiesta sconosciuta: ${method} ${p}`);
  } catch (e) {
    return fail(502, message(e));
  }
}
