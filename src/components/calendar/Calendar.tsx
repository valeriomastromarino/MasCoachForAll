"use client";

import { IconCheck, IconChevronLeft, IconChevronRight, IconX } from "@tabler/icons-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CalendarActivity, CalendarData, CalendarWorkout } from "@/lib/calendar";
import type { DashboardData } from "@/lib/dashboard";
import { addDays, dateRange, weekStart } from "@/lib/dates";
import { refreshDashboard } from "../data/remote";
import { loadRide, prefetchRide } from "../data/rides";
import { fmt, fmtDuration } from "../format";
import { ActivityModal, DayModal, type Night, NIGHT_COLOR, WorkoutModal } from "./Modals";
import { CATEGORY_STYLE, CoachBadge, dayLabel, send, tint } from "./shared";
import { WeekList, type WorkoutState, workoutState } from "./WeekList";
import { apiFetch } from "../data/transport";

const WEEKS = 4;
/** Week shown on phones: the third of the four loaded (this week, when the range is centred on today). */
const PHONE_WEEK = 2;
const WEEKDAYS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

// Ranges already loaded in this visit: coming back to the home page shows them at once instead of
// downloading again (and the in-flight promise is shared, so a double mount doesn't fetch twice).
const RANGE_TTL_MS = 60_000;
const ranges = new Map<string, { at: number; value: Promise<CalendarData | { error: string }> }>();

function loadRange(url: string): Promise<CalendarData | { error: string }> {
  const hit = ranges.get(url);
  if (hit && Date.now() - hit.at < RANGE_TTL_MS) return hit.value;
  const value = apiFetch(url)
    .then(async (r) => {
      const json = await r.json();
      return r.ok ? (json as CalendarData) : { error: json.error ?? r.statusText };
    })
    .catch((e: unknown) => ({ error: e instanceof Error ? e.message : String(e) }))
    .then((res) => {
      if ("error" in res) ranges.delete(url);
      return res;
    });
  ranges.set(url, { at: Date.now(), value });
  return value;
}

type Open =
  | { kind: "day"; date: string }
  | { kind: "activity"; a: CalendarActivity }
  | { kind: "workout"; w: CalendarWorkout }
  | null;

/** Night reading from the dashboard's recovery series: anomaly red, one marker off yellow, else green. */
function nightsByDate(d: DashboardData): Map<string, Night> {
  const sleep = new Map(d.sleep.map((s) => [s.date, s]));
  const out = new Map<string, Night>();
  for (const r of d.recovery) {
    if (r.rmssd === null && r.rhr === null) continue;
    const lowHrv = r.rmssd !== null && r.hrvRange !== null && r.rmssd < r.hrvRange[0];
    const highRhr = r.rhr !== null && r.rhrRange !== null && r.rhr > r.rhrRange[1];
    const s = sleep.get(r.date);
    out.set(r.date, {
      level: r.anomaly ? "rosso" : lowHrv || highRhr ? "giallo" : "verde",
      hrv: r.rmssd,
      rhr: r.rhr,
      sleepHours: s?.hours ?? null,
      sleepScore: s?.score ?? null,
    });
  }
  return out;
}

function ActivityChip({ a, onOpen }: { a: CalendarActivity; onOpen: () => void }) {
  const s = CATEGORY_STYLE[a.category];
  return (
    <button
      onMouseEnter={() => a.category !== "nascosta" && prefetchRide(a.id)}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      className="w-full rounded-md px-1.5 py-1 text-left text-[11px] leading-snug transition-opacity hover:opacity-80"
      style={{ background: tint(s.color, 22), color: s.ink }}
      title={a.name}
    >
      <span className="num font-medium">
        {a.tss !== null ? `${fmt(a.tss)} TSS · ` : ""}
        {fmtDuration(a.secs)}
      </span>
      <span className="block break-words">{a.name}</span>
    </button>
  );
}

// The four-week grid is for computers; phones get the week list (WeekList.tsx).
function WorkoutChip({ w, state, onOpen }: { w: CalendarWorkout; state: WorkoutState; onOpen: () => void }) {
  return (
    <button
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/mascoach-event", JSON.stringify({ id: w.id, date: w.date }))}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      className="w-full rounded-md px-1.5 py-1 text-left text-[11px] leading-snug text-muted transition-opacity hover:opacity-80"
      style={{ border: "1px dashed var(--faint)", opacity: state === "done" ? 0.6 : 1 }}
      title={`${w.name} · trascina per spostarlo`}
    >
      <span className="num flex items-center gap-1 font-medium">
        {state === "done" && <IconCheck size={12} style={{ color: "var(--good)" }} aria-label="fatto" />}
        {state === "missed" && <IconX size={12} style={{ color: "var(--warning)" }} aria-label="non fatto" />}
        {w.tss !== null ? `${fmt(w.tss)} TSS` : ""}
        {w.tss !== null && w.secs !== null ? " · " : ""}
        {w.secs !== null ? fmtDuration(w.secs) : ""}
      </span>
      <span className="block break-words" style={{ textDecoration: state === "missed" ? "line-through" : undefined }}>
        {w.name}
      </span>
      <CoachBadge mark={w.coach} />
    </button>
  );
}

export function Calendar({ dashboard }: { dashboard: DashboardData }) {
  const today = dashboard.today;
  const ftp = dashboard.athlete.ftp;
  // Two weeks back, this week and the next one.
  const [start, setStart] = useState(() => addDays(weekStart(today), -14));
  const end = addDays(start, WEEKS * 7 - 1);
  const [data, setData] = useState<{ key: string; cal: CalendarData } | { key: string; error: string } | null>(null);
  const [version, setVersion] = useState(0);
  const [open, setOpen] = useState<Open>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [dropError, setDropError] = useState<string | null>(null);
  const key = `${start}|${version}`;
  const nights = useMemo(() => nightsByDate(dashboard), [dashboard]);

  useEffect(() => {
    let alive = true;
    loadRange(`/api/calendar?from=${start}&to=${end}${ftp ? `&ftp=${ftp}` : ""}`).then(
      (r) => alive && setData("error" in r ? { key, error: r.error } : { key, cal: r }),
    );
    return () => {
      alive = false;
    };
  }, [start, end, ftp, key]);

  // After a change on Intervals.icu: reload this range and, quietly, the dashboard numbers.
  const changed = useCallback(() => {
    ranges.clear();
    setOpen(null);
    setVersion((v) => v + 1);
    refreshDashboard();
  }, []);

  const cal = data && "cal" in data ? data.cal : null;

  // Intervals.icu takes seconds to serve a ride's second-by-second data the first time it is asked.
  // Warm up the most likely ones (bike rides of the last two weeks) one at a time in the background.
  useEffect(() => {
    if (!cal) return;
    const recent = addDays(today, -14);
    const ids = cal.activities
      .filter((a) => a.date >= recent && a.category !== "altro" && a.category !== "nascosta")
      .map((a) => a.id)
      .reverse();
    let stopped = false;
    const timer = setTimeout(async () => {
      for (const id of ids) {
        if (stopped) break;
        await loadRide(id);
      }
    }, 1500);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [cal, today]);
  const loading = !data || data.key !== key;
  const byDay = useMemo(() => {
    const m = new Map<string, { acts: CalendarActivity[]; plans: CalendarWorkout[] }>();
    for (const d of dateRange(start, end)) m.set(d, { acts: [], plans: [] });
    for (const a of cal?.activities ?? []) m.get(a.date)?.acts.push(a);
    for (const w of cal?.workouts ?? []) m.get(w.date)?.plans.push(w);
    return m;
  }, [cal, start, end]);

  const drop = async (e: React.DragEvent, date: string) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData("text/mascoach-event");
    if (!raw) return;
    const { id, date: from } = JSON.parse(raw) as { id: string; date: string };
    if (from === date) return;
    setMoving(id);
    setDropError(null);
    const err = await send(`/api/calendar/events/${id}`, "PATCH", { date });
    setMoving(null);
    if (err) setDropError(err);
    else changed();
  };

  const weeks = Array.from({ length: WEEKS }, (_, w) => dateRange(addDays(start, w * 7), addDays(start, w * 7 + 6)));
  const span = (from: string, to: string) =>
    `${dayLabel(from, { day: "numeric", month: "short" })} – ${dayLabel(to, { day: "numeric", month: "short", year: "numeric" })}`;
  const rangeLabel = span(start, end);
  const phoneWeek = weeks[PHONE_WEEK];
  const btn = "card flex h-8 items-center justify-center px-2.5 text-xs disabled:opacity-50";

  return (
    <section className="card min-w-0 p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-2 text-sm font-medium">Calendario</h2>
        <button className={btn} onClick={() => setStart(addDays(start, -7))} aria-label="Settimana precedente">
          <IconChevronLeft size={16} />
        </button>
        <button className={btn} onClick={() => setStart(addDays(start, 7))} aria-label="Settimana successiva">
          <IconChevronRight size={16} />
        </button>
        <button className={btn} onClick={() => setStart(addDays(weekStart(today), -14))}>
          Oggi
        </button>
        <span className="num hidden text-xs text-muted sm:inline">{rangeLabel}</span>
        <span className="num w-full text-xs text-muted sm:hidden">{span(phoneWeek[0], phoneWeek[6])}</span>
        {(loading || moving) && <span className="text-xs text-faint">{moving ? "Sposto…" : "Carico…"}</span>}
        <span className="ml-auto hidden items-center gap-3 text-[11px] text-muted lg:flex">
          {(["strada", "rulli", "offroad", "altro"] as const).map((c) => (
            <span key={c} className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm" style={{ background: CATEGORY_STYLE[c].color }} />
              {CATEGORY_STYLE[c].label}
            </span>
          ))}
          <span className="flex items-center gap-1">
            <span className="h-2 w-3 rounded-sm" style={{ border: "1px dashed var(--faint)" }} />
            Pianificato
          </span>
        </span>
      </div>
      {data && "error" in data && !loading && (
        <p className="mt-3 text-xs" style={{ color: "var(--critical)" }}>
          Impossibile leggere il calendario: {data.error}
        </p>
      )}
      {dropError && (
        <p className="mt-3 text-xs" style={{ color: "var(--critical)" }}>
          Spostamento non riuscito: {dropError}
        </p>
      )}

      <div className="sm:hidden">
        <WeekList
          days={phoneWeek}
          byDay={byDay}
          events={cal?.events ?? []}
          nights={nights}
          today={today}
          loading={loading}
          onOpenDay={(date) => setOpen({ kind: "day", date })}
          onOpenActivity={(a) => setOpen({ kind: "activity", a })}
          onOpenWorkout={(w) => setOpen({ kind: "workout", w })}
        />
      </div>

      <div className="mt-4 hidden grid-cols-[repeat(7,minmax(0,1fr))_4.5rem] gap-1.5 sm:grid">
        {WEEKDAYS.map((d) => (
          <div key={d} className="pb-1 text-center text-[11px] text-faint">
            {d}
          </div>
        ))}
        <div className="pb-1 text-center text-[11px] text-faint">Settimana</div>

        {weeks.map((days) => {
          let tss = 0;
          let secs = 0;
          let planned = 0;
          for (const d of days) {
            const x = byDay.get(d)!;
            for (const a of x.acts) {
              tss += a.tss ?? 0;
              secs += a.secs;
            }
            for (const w of x.plans) planned += w.tss ?? 0;
          }
          return (
            <div key={days[0]} className="contents">
              {days.map((d) => {
                const x = byDay.get(d)!;
                const night = d <= today ? nights.get(d) : undefined;
                const isToday = d === today;
                const num = Number(d.slice(8));
                return (
                  <div
                    key={d}
                    role="button"
                    tabIndex={0}
                    onClick={() => setOpen({ kind: "day", date: d })}
                    onKeyDown={(e) => e.key === "Enter" && setOpen({ kind: "day", date: d })}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => drop(e, d)}
                    className="relative flex min-h-[104px] min-w-0 cursor-pointer flex-col gap-1 rounded-lg p-1.5 transition-colors hover:brightness-[0.98]"
                    style={{
                      background: isToday ? "var(--accent-bg)" : "var(--background)",
                      outline: isToday ? "1.5px solid var(--accent-ink)" : undefined,
                      opacity: loading ? 0.6 : 1,
                    }}
                    aria-label={dayLabel(d)}
                  >
                    <div className="flex items-center gap-1 text-[11px]">
                      <span className={isToday ? "font-medium" : "text-muted"}>
                        {num}
                        {(num === 1 || d === start) && ` ${new Date(d + "T12:00:00").toLocaleDateString("it-IT", { month: "short" })}`}
                      </span>
                      {night && (
                        <span
                          className="ml-auto h-2 w-2 rounded-full"
                          style={{ background: NIGHT_COLOR[night.level] }}
                          title={`Notte: HRV ${fmt(night.hrv, 0, " ms")}, FC ${fmt(night.rhr)}`}
                        />
                      )}
                    </div>
                    {x.acts.map((a) => (
                      <ActivityChip key={a.id} a={a} onOpen={() => setOpen({ kind: "activity", a })} />
                    ))}
                    {x.plans.map((w) => (
                      <WorkoutChip key={w.id} w={w} state={workoutState(w, x.acts, d, today)} onOpen={() => setOpen({ kind: "workout", w })} />
                    ))}
                  </div>
                );
              })}
              <div className="num flex flex-col justify-center gap-0.5 rounded-lg px-2 text-[11px] text-muted" style={{ background: "var(--neutral-bg)" }}>
                <span className="text-sm font-medium text-foreground">{fmt(tss)}</span>
                <span>TSS</span>
                <span>{fmtDuration(secs)}</span>
                {planned > 0 && <span className="text-faint">Piano {fmt(planned)}</span>}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[11px] text-faint">
        <span className="sm:hidden">
          Tocca un giorno, un&apos;uscita o un allenamento per i dettagli; con le frecce cambi settimana. Le modifiche vengono salvate
          su Intervals.icu.
        </span>
        <span className="hidden sm:inline">
          Clicca un giorno per i dettagli e per aggiungere un allenamento; puoi trascinare un allenamento pianificato su un altro
          giorno. Le modifiche vengono salvate su Intervals.icu.
        </span>
      </p>

      {open?.kind === "workout" && <WorkoutModal w={open.w} onClose={() => setOpen(null)} onChanged={changed} />}
      {open?.kind === "activity" && <ActivityModal a={open.a} onClose={() => setOpen(null)} onChanged={changed} />}
      {open?.kind === "day" && (
        <DayModal
          date={open.date}
          night={open.date <= today ? (nights.get(open.date) ?? null) : null}
          activities={byDay.get(open.date)?.acts ?? []}
          workouts={byDay.get(open.date)?.plans ?? []}
          ftp={ftp}
          onOpenActivity={(a) => setOpen({ kind: "activity", a })}
          onOpenWorkout={(w) => setOpen({ kind: "workout", w })}
          onClose={() => setOpen(null)}
          onChanged={changed}
        />
      )}
    </section>
  );
}
