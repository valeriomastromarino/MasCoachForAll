"use client";

// Phones: one week at a time, day under day, with the night, races and holidays, rides and planned workouts in full.
import { IconCalendarEvent, IconCheck, IconMoon, IconPlus, IconX } from "@tabler/icons-react";
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

function WorkoutCard({ w, state, onOpen }: { w: CalendarWorkout; state: WorkoutState; onOpen: () => void }) {
  const where = w.type === "VirtualRide" ? "rulli" : w.type === "Ride" ? "strada" : w.type;
  const bits = [where, w.tss !== null ? `${fmt(w.tss)} TSS` : null, w.secs !== null ? fmtDuration(w.secs) : null].filter(Boolean);
  return (
    <button
      onClick={onOpen}
      className="w-full rounded-[16px] px-3.5 py-2.5 text-left"
      style={{ border: "1.5px dashed var(--faint)", opacity: state === "done" ? 0.65 : 1 }}
    >
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium">
        {state === "done" && <IconCheck size={14} style={{ color: "var(--good)" }} aria-label="fatto" />}
        {state === "missed" && <IconX size={14} style={{ color: "var(--warning)" }} aria-label="non fatto" />}
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

/** Weather and wind of a day, small, under its date. */
function DayWeatherLine({ w }: { w: DayWeather }) {
  return (
    <span className="num mt-1 block text-[11px] text-muted" aria-label={`${w.label}, ${w.tMax} gradi, vento ${w.windKmh} chilometri orari`}>
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
}) {
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
            <button onClick={() => onOpenDay(d)} className="num -my-1.5 flex min-h-7 items-center gap-1.5 text-[11px] leading-none text-muted">
              <span className="h-2 w-2 rounded-full" style={{ background: NIGHT_COLOR[night.level] }} />
              HRV {fmt(night.hrv, 0)} · FC {fmt(night.rhr)}
              {night.sleepHours !== null && ` · ${fmtDuration(night.sleepHours * 3600)}`}
            </button>
          );
          return (
            <div key={d} className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-3 py-1">
              {/* self-start: a button centres its content, so the day used to float halfway down a tall day. */}
              <button onClick={() => onOpenDay(d)} className="self-start pt-2 text-left" aria-label={dayLabel(d)}>
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
              <div className="min-w-0 space-y-2">
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
                    {x.plans.map((w) => (
                      <WorkoutCard key={w.id} w={w} state={workoutState(w, x.acts, d, today)} onOpen={() => onOpenWorkout(w)} />
                    ))}
                    {d >= today && (
                      <button
                        onClick={() => onOpenDay(d)}
                        className="inline-flex h-8 items-center gap-1 rounded-full px-3 text-xs leading-none text-muted"
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
