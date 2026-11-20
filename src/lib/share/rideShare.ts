// The picture of a ride to share on social media: styles A «Poster» and E «Sulla tua foto» (chosen on 20 November 2026 among
// six previews). This file decides what the picture says, from the ride alone; components/share/drawShare.ts draws it on a
// canvas, in the phone, without the network.
import type { RideDetail, RidePoint } from "../ride";
import { capitalize } from "../text";

export type ShareStyle = "poster" | "foto";
export type ShareFormat = "storia" | "post" | "quadrato";
export type ShareOptions = {
  /** Draw the route (only rides with GPS). */
  route: boolean;
  /** Leave out the first and the last HIDDEN_METERS of the route, so the picture does not show where the ride started. */
  hideEnds: boolean;
  /** Power and heart rate: NP, TSS, heart rate, work. */
  effort: boolean;
};

export const SHARE_SIZE: Record<ShareFormat, { w: number; h: number; label: string }> = {
  storia: { w: 1080, h: 1920, label: "Storia 9:16" },
  post: { w: 1080, h: 1350, label: "Post 4:5" },
  quadrato: { w: 1080, h: 1080, label: "Quadrato" },
};

export const HIDDEN_METERS = 500;

/** A piece of a number: the units are smaller ("111,9" + "km", "3" + "h" + "53" + "′"); `space` = a little gap before it. */
export type Part = { t: string; small?: boolean; space?: boolean };

export type StatId = "distance" | "time" | "elevation" | "speed" | "np" | "tss" | "hr" | "kj";

export type ShareStat = {
  id: StatId;
  /** The number with its unit, for the big numbers. */
  parts: Part[];
  /** Under a big number ("Distanza"). */
  label: string;
  /** In the line of small numbers of the poster: "NP " + bold "170 W", or bold "28,8" + " km/h". */
  line: { pre: string; bold: string; post: string };
  /** After the number in the line under the big number of the photo ("km", "m", "W NP", "TSS"). */
  tag: string;
};

/** x towards east and y towards north, in metres from the first point. */
export type XY = [number, number];

export type ShareCard = {
  title: string;
  /** "Domenica 1 novembre · 7:28" */
  when: string;
  /** "dom 1 nov" */
  whenShort: string;
  /** The three big numbers (fewer when the ride has fewer). */
  big: ShareStat[];
  /** The others, for the line of small numbers (up to four). */
  more: ShareStat[];
  route: XY[] | null;
  /** Power over the ride in bars from 0 to 1: the picture of the poster for a ride without GPS (on the trainer). */
  profile: number[] | null;
  /** Without the extension: the picture is a PNG or a JPEG. */
  fileName: string;
};

const it = (x: number, digits = 0) => x.toLocaleString("it-IT", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const ok = (x: number | null | undefined): x is number => typeof x === "number" && Number.isFinite(x) && x > 0;

/** "3" h "53" ′ under an hour "47" ′: minutes like the rest of the app (′ is the prime of minutes). */
export function timeParts(secs: number): Part[] {
  const mins = Math.round(secs / 60);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return [{ t: String(m) }, { t: "′", small: true }];
  return [{ t: String(h) }, { t: "h", small: true }, { t: String(m).padStart(2, "0") }, { t: "′", small: true }];
}

function stats(ride: RideDetail, effort: boolean): Partial<Record<StatId, ShareStat>> {
  const s = ride.summary;
  const out: Partial<Record<StatId, ShareStat>> = {};
  const add = (id: StatId, value: string, unit: string, label: string, line: ShareStat["line"], tag: string) => {
    out[id] = { id, parts: unit ? [{ t: value }, { t: unit, small: true, space: true }] : [{ t: value }], label, line, tag };
  };
  if (ok(s.distanceKm) && s.distanceKm >= 0.5) {
    const km = it(s.distanceKm, 1);
    add("distance", km, "km", "Distanza", { pre: "", bold: km, post: " km" }, "km");
  }
  if (ok(s.movingTime)) {
    const parts = timeParts(s.movingTime);
    out.time = { id: "time", parts, label: "Tempo", line: { pre: "", bold: parts.map((p) => p.t).join(""), post: "" }, tag: "" };
  }
  // On the trainer the climb and the speed are made up by the trainer: they are left out.
  if (!ride.indoor && ok(s.elevation) && s.elevation >= 1) {
    const m = it(s.elevation);
    add("elevation", m, "m", "Dislivello", { pre: "", bold: m, post: " m" }, "m");
  }
  if (!ride.indoor && ok(s.speedKmh)) {
    const v = it(s.speedKmh, 1);
    add("speed", v, "km/h", "Velocità", { pre: "", bold: v, post: " km/h" }, "km/h");
  }
  if (effort) {
    if (ok(s.np)) add("np", it(s.np), "W", "Potenza NP", { pre: "NP ", bold: `${it(s.np)} W`, post: "" }, "W NP");
    if (ok(s.tss)) add("tss", it(s.tss), "", "TSS", { pre: "TSS ", bold: it(s.tss), post: "" }, "TSS");
    if (ok(s.avgHr)) add("hr", it(s.avgHr), "bpm", "FC media", { pre: "FC ", bold: it(s.avgHr), post: "" }, "bpm");
    if (ok(s.kj)) add("kj", it(s.kj), "kJ", "Lavoro", { pre: "", bold: it(s.kj), post: " kJ" }, "kJ");
  }
  return out;
}

// Outside: how far, how long, how much climbing. On the trainer: how long and how hard.
const BIG_OUTDOOR: StatId[] = ["distance", "time", "elevation", "speed", "np", "tss"];
const BIG_INDOOR: StatId[] = ["time", "np", "tss", "kj", "distance", "hr"];
const MORE: StatId[] = ["np", "tss", "hr", "speed", "kj", "elevation", "distance"];

const R = 6_371_000;

/**
 * The route in metres, north up, without the first and the last `hide` metres (0 = all of it). The distance is measured along
 * the GPS points from the first fix, so at least `hide` metres of road are left out. Null without GPS or with too little left.
 */
export function routeMeters(points: RidePoint[], hide: number): XY[] | null {
  const gps = points.filter((p): p is RidePoint & { lat: number; lng: number } => p.lat !== null && p.lng !== null);
  if (gps.length < 2) return null;
  const lat0 = gps[0].lat;
  const lng0 = gps[0].lng;
  const cos = Math.cos((gps.reduce((a, p) => a + p.lat, 0) / gps.length) * (Math.PI / 180));
  const xy: XY[] = gps.map((p) => [((p.lng - lng0) * Math.PI * R * cos) / 180, ((p.lat - lat0) * Math.PI * R) / 180]);
  const along = [0];
  for (let i = 1; i < xy.length; i++) along.push(along[i - 1] + Math.hypot(xy[i][0] - xy[i - 1][0], xy[i][1] - xy[i - 1][1]));
  const total = along[along.length - 1];
  const kept = hide > 0 ? xy.filter((_, i) => along[i] >= hide && along[i] <= total - hide) : xy;
  // Less than 300 m of road left (or a ride standing still): nothing worth drawing.
  if (kept.length < 2 || (hide > 0 ? total - 2 * hide : total) < 300) return null;
  return kept;
}

/** Fits the route in a box (pixels), keeping its shape; y grows downwards on a canvas, so north goes up. */
export function fitRoute(route: XY[], box: { x: number; y: number; w: number; h: number }, pad = 0): XY[] {
  const xs = route.map((p) => p[0]);
  const ys = route.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const spanX = Math.max(maxX - minX, 1e-6), spanY = Math.max(maxY - minY, 1e-6);
  const s = Math.min((box.w - 2 * pad) / spanX, (box.h - 2 * pad) / spanY);
  const ox = box.x + (box.w - spanX * s) / 2;
  const oy = box.y + (box.h - spanY * s) / 2;
  return route.map(([x, y]) => [ox + (x - minX) * s, oy + (maxY - y) * s]);
}

/** Mean power in `bars` slices of the ride, from 0 to 1 (the highest slice = 1). Null without power. */
export function powerProfile(points: RidePoint[], bars = 48): number[] | null {
  const w = points.map((p) => p.watts);
  if (!w.some((x) => ok(x)) || points.length < bars) return null;
  const out: number[] = [];
  for (let b = 0; b < bars; b++) {
    const from = Math.floor((b * w.length) / bars), to = Math.floor(((b + 1) * w.length) / bars);
    let sum = 0, n = 0;
    for (let i = from; i < to; i++) {
      const x = w[i];
      if (x !== null) {
        sum += x;
        n++;
      }
    }
    out.push(n ? sum / n : 0);
  }
  const top = Math.max(...out);
  return out.map((x) => Math.max(0.04, x / top));
}

/** "mascoach-2026-11-01-fondo-z2-3h": ASCII only, for every app and file system. */
export function shareFileName(ride: Pick<RideDetail, "date" | "name">): string {
  const slug = ride.name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
  return `mascoach-${ride.date.slice(0, 10)}${slug ? `-${slug}` : ""}`;
}

export function shareCard(ride: RideDetail, opts: ShareOptions): ShareCard {
  const all = stats(ride, opts.effort);
  const big = (ride.indoor ? BIG_INDOOR : BIG_OUTDOOR).flatMap((id) => all[id] ?? []).slice(0, 3);
  const used = new Set(big.map((s) => s.id));
  const more = MORE.filter((id) => !used.has(id)).flatMap((id) => all[id] ?? []).slice(0, 4);
  const day = new Date(`${ride.date.slice(0, 10)}T12:00:00`);
  const clock = ride.date.slice(11, 16).replace(/^0(?=\d)/, "");
  const date = capitalize(day.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" }));
  return {
    title: ride.name,
    when: clock ? `${date} · ${clock}` : date,
    whenShort: day.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" }).replace(/\./g, ""),
    big,
    more,
    route: opts.route && ride.hasRoute ? routeMeters(ride.points, opts.hideEnds ? HIDDEN_METERS : 0) : null,
    profile: opts.effort ? powerProfile(ride.points) : null,
    fileName: shareFileName(ride),
  };
}
