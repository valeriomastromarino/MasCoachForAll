"use client";

// Phones: one week at a time, day under day, with the night, races and holidays, rides and planned workouts in full.
import { IconArrowsExchange, IconCalendarEvent, IconCheck, IconMoon, IconPlus, IconX } from "@tabler/icons-react";
import type { CalendarActivity, CalendarEvent, CalendarWorkout } from "@/lib/calendar";
import type { DayWeather } from "@/lib/weather";
import { fmt, fmtDuration } from "../format";
import { type Night, NIGHT_COLOR } from "./Modals";
import { CATEGORY_STYLE, CoachBadge, dayLabel, tint, WorkoutProfile } from "./shared";
import { WeatherIcon, WindArrow } from "./WeatherPanel";

export type WorkoutState = "done" | "missed" | "planned";

/** Planned bike sessions count as done when any ride happened that day. */
export function workoutState(w: CalendarWorkout, acts: CalendarActivity[], date: string, today: string): WorkoutState {
  const isBike = w.type === "Ride" || w.type === "VirtualRide" || !w.type;
  const bikeDone = acts.some((a) => a.category !== "altro" && a.category !== "nascosta");
  const done = isBike ? bikeDone : acts.length > 0;
  return done ? "done" : date < today ? "missed" : "planned";
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] px-3.5 py-2.5" style={{ background: "var(--background)" }}>
      <div className="num text-base font-medium">{value}</div>
      <div className="text-[11px] text-muted">{label}</div>
    </div>
  );
}

function ActivityCard({ a, onOpen }: { a: CalendarActivity; onOpen: () => void }) {
  const s = CATEGORY_STYLE[a.category];
  const bits = [
    a.tss !== null ? `${fmt(a.tss)} TSS` : null,
    fmtDuration(a.secs),
    a.km !== null && a.km > 0 ? `${fmt(a.km, 1)} km` : null,
    a.avgWatts !== null ? `${fmt(a.avgWatts)} W` : null,
    a.rpe !== null ? `RPE ${a.rpe}` : null,
  ].filter(Boolean);
  return (
    <button onClick={onOpen} className="w-full rounded-[16px] px-3.5 py-2.5 text-left" style={{ background: tint(s.color, 22) }}>
      <span className="flex items-center gap-2 text-sm font-medium" style={{ color: s.ink }}>
        <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: s.color }} />
        <span className="min-w-0 break-words">{a.name}</span>
      </span>
      <span className="num mt-0.5 block text-xs text-muted">{bits.join(" · ")}</span>
    </button>
  );
}

/** Props that let a card be held down and moved (HoldDrag.tsx). */
export type HoldProps = { onPointerDown: (e: React.PointerEvent<HTMLElement>) => void; onContextMenu: (e: React.MouseEvent) => void; style: React.CSSProperties };

export function WorkoutCard({ w, state, onOpen, hold, ghost = false }: { w: CalendarWorkout; state: WorkoutState; onOpen: () => void; hold?: HoldProps; ghost?: boolean }) {
  const where = w.type === "VirtualRide" ? "rulli" : w.type === "Ride" ? "strada" : w.type;
  const bits = [where, w.tss !== null ? `${fmt(w.tss)} TSS` : null, w.secs !== null ? fmtDuration(w.secs) : null].filter(Boolean);
  return (
    <button
      onClick={onOpen}
      onPointerDown={hold?.onPointerDown}
      onContextMenu={hold?.onContextMenu}
      className="w-full rounded-[16px] px-3.5 py-2.5 text-left"
      style={{ ...hold?.style, border: "1.5px dashed var(--faint)", opacity: ghost ? 0.35 : state === "done" ? 0.65 : 1 }}
    >
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium">
        {state === "done" && <IconCheck size={14} style={{ color: "var(--good-ink)" }} aria-label="fatto" />}
        {state === "missed" && <IconX size={14} style={{ color: "var(--warning-ink)" }} aria-label="non fatto" />}
        <span className="min-w-0 break-words" style={{ textDecoration: state === "missed" ? "line-through" : undefined }}>
          {w.name}
        </span>
        <CoachBadge mark={w.coach} />
      </span>
      <span className="num mt-0.5 block text-xs text-muted">
        {state === "planned" ? "Pianificato · " : ""}
        {bits.join(" · ")}
      </span>
      {w.blocks.length > 0 && (
        <span className="mt-1.5 block">
          <WorkoutProfile blocks={w.blocks} height={18} axis={false} />
        </span>
      )}
    </button>
  );
}

function EventLine({ e }: { e: CalendarEvent }) {
  const race = e.category.startsWith("RACE");
  return (
    <div
      className="flex items-center gap-2 rounded-[16px] px-3.5 py-2 text-xs"
      style={{ background: race ? "var(--warning-bg)" : "var(--neutral-bg)", color: race ? "var(--warning-ink)" : "var(--muted)" }}
    >
      <IconCalendarEvent size={14} className="shrink-0" aria-hidden />
      <span className="min-w-0 break-words">
        <b className="font-medium">{e.label}</b> · {e.name}
        {e.endDate && ` (fino al ${dayLabel(e.endDate, { day: "numeric", month: "short" })})`}
      </span>
    </div>
  );
}

const weatherWords = (w: DayWeather) => `${w.label}, ${w.tMax} gradi, vento ${w.windKmh} chilometri orari`;

/** Weather and wind of a day, small, under its date (read out by the day's button). */
function DayWeatherLine({ w }: { w: DayWeather }) {
  return (
    <span className="num mt-1 block text-[11px] text-muted" aria-hidden>
      <span className="flex items-center gap-0.5">
        <WeatherIcon kind={w.kind} size={14} />
        {w.tMax}°
      </span>
      <span className="flex items-center gap-0.5">
        <WindArrow from={w.windFrom} size={13} />
        {w.windKmh}
      </span>
    </span>
  );
}

export function WeekList({
  weather,
  days,
  byDay,
  events,
  nights,
  today,
  loading,
  onOpenDay,
  onOpenActivity,
  onOpenWorkout,
  hold,
}: {
  /** Forecast per day (only days within the forecast window). */
  weather?: Map<string, DayWeather>;
  days: string[];
  byDay: Map<string, { acts: CalendarActivity[]; plans: CalendarWorkout[] }>;
  events: CalendarEvent[];
  nights: Map<string, Night>;
  today: string;
  loading: boolean;
  onOpenDay: (date: string) => void;
  onOpenActivity: (a: CalendarActivity) => void;
  onOpenWorkout: (w: CalendarWorkout) => void;
  /** Holding a planned session down to move it: the session in the hand, the day under the finger and the ride that would swap. */
  hold?: { bind: (w: CalendarWorkout) => HoldProps; justDropped: () => boolean; heldId: string | null; overDate: string | null; swapName: string | null };
}) {
  const holding = !!hold?.heldId;
  let tss = 0;
  let secs = 0;
  let planned = 0;
  for (const d of days) {
    const x = byDay.get(d);
    for (const a of x?.acts ?? []) {
      tss += a.tss ?? 0;
      secs += a.secs;
    }
    for (const w of x?.plans ?? []) if (workoutState(w, x!.acts, d, today) === "planned") planned += w.tss ?? 0;
  }

  return (
    <div style={{ opacity: loading ? 0.6 : 1 }}>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Summary label="TSS fatto" value={fmt(tss)} />
        <Summary label="in movimento" value={secs ? fmtDuration(secs) : "0"} />
        <Summary label="TSS pianificato" value={fmt(planned)} />
      </div>

      <div className="mt-3 space-y-2">
        {days.map((d) => {
          const x = byDay.get(d) ?? { acts: [], plans: [] };
          const night = d <= today ? nights.get(d) : undefined;
          const dayEvents = events.filter((e) => e.date <= d && (e.endDate ?? e.date) >= d);
          const isToday = d === today;
          const empty = !x.acts.length && !x.plans.length;
          const nightLine = night && (
            <button type="button" onClick={() => onOpenDay(d)} className="num -my-2.5 flex min-h-11 items-center gap-1.5 text-[11px] leading-none text-muted">
              <span className="h-2 w-2 rounded-full" style={{ background: NIGHT_COLOR[night.level] }} />
              HRV {fmt(night.hrv, 0)} · FC {fmt(night.rhr)}
              {night.sleepHours !== null && ` · ${fmtDuration(night.sleepHours * 3600)}`}
            </button>
          );
          return (
            <div key={d} data-drop={`day:${d}`} className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-3 py-1" style={holding && d < today ? { opacity: 0.4 } : undefined}>
              {/* self-start: a button centres its content, so the day used to float halfway down a tall day. */}
              {/* The name begins with what the button shows («Mer 19»), then the month and the weather. */}
              <button
                type="button"
                onClick={() => onOpenDay(d)}
                className="self-start pt-2 text-left"
                aria-label={`${dayLabel(d, { weekday: "short", day: "numeric", month: "long" })}${weather?.get(d) ? `, ${weatherWords(weather.get(d)!)}` : ""}`}
              >
                <span className="block text-xs leading-none" style={{ color: isToday ? "var(--accent-ink)" : "var(--muted)" }}>
                  {dayLabel(d, { weekday: "short" })}
                </span>
                <span
                  className="num mt-1 inline-flex h-8 min-w-8 items-center justify-center rounded-full px-1 text-xl font-medium leading-none"
                  style={isToday ? { background: "var(--brand)", color: "var(--on-brand)" } : undefined}
                >
                  {Number(d.slice(8))}
                </span>
                {weather?.get(d) && <DayWeatherLine w={weather.get(d)!} />}
              </button>
              <div
                className="min-w-0 space-y-2 rounded-[18px]"
                style={
                  holding && d >= today
                    ? hold!.overDate === d
                      ? { outline: "2px solid var(--brand)", outlineOffset: 4, background: "color-mix(in srgb, var(--brand) 12%, transparent)" }
                      : { outline: "1.5px dashed color-mix(in srgb, var(--brand) 55%, transparent)", outlineOffset: 4 }
                    : undefined
                }
              >
                {dayEvents.map((e) => (
                  <EventLine key={e.id} e={e} />
                ))}
                {empty && d < today && (
                  <div className="card space-y-2 px-3.5 py-3">
                    {nightLine}
                    <p className="flex items-center gap-2 text-sm font-medium leading-none">
                      <IconMoon size={18} style={{ color: "var(--brand)" }} aria-hidden />
                      Riposo
                    </p>
                  </div>
                )}
                {empty && d >= today && (
                  <button
                    onClick={() => onOpenDay(d)}
                    className="flex min-h-12 w-full items-center gap-2 rounded-[16px] px-3.5 text-left text-sm leading-none text-muted"
                    style={{ border: `1.5px ${isToday ? "solid var(--brand)" : "dashed var(--faint)"}` }}
                  >
                    <IconPlus size={16} style={{ color: "var(--brand)" }} aria-hidden />
                    {isToday ? "Niente in programma · aggiungi" : "Giorno libero · aggiungi"}
                  </button>
                )}
                {!empty && (
                  <>
                    {nightLine}
                    {x.acts.map((a) => (
                      <ActivityCard key={a.id} a={a} onOpen={() => onOpenActivity(a)} />
                    ))}
                    {x.plans.map((w) => {
                      const state = workoutState(w, x.acts, d, today);
                      const held = hold?.heldId === w.id;
                      // The card stays on the page while it is in the hand (the finger's touch events keep going to it); on the
                      // day it leaves, a dropped swap shows what comes here.
                      return (
                        <div key={w.id} className="relative">
                          <WorkoutCard
                            w={w}
                            state={state}
                            onOpen={() => !hold?.justDropped() && onOpenWorkout(w)}
                            hold={hold && state !== "done" ? hold.bind(w) : undefined}
                            ghost={held}
                          />
                          {held && hold.swapName && (
                            <div
                              className="absolute inset-0 flex items-center justify-center gap-1.5 rounded-[16px] px-3 text-center text-sm"
                              style={{ border: "1.5px dashed var(--brand)", color: "var(--accent-ink)", background: "var(--background)" }}
                            >
                              <IconArrowsExchange size={16} aria-hidden className="shrink-0" />
                              Qui va «{hold.swapName}»
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {d >= today && (
                      <button
                        onClick={() => onOpenDay(d)}
                        className="inline-flex h-11 items-center gap-1 rounded-full px-4 text-sm leading-none text-muted"
                        style={{ border: "1px solid var(--border)" }}
                      >
                        <IconPlus size={14} aria-hidden /> Aggiungi
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
