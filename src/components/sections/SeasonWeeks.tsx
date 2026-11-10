"use client";

// Stagione, version B ("linguette", chosen on 10 November 2026): the weeks of the season as tabs (each bar is a week:
// height = load, colour = phase) and the chosen week day by day. Tapping a day opens a sheet to move, change or remove
// its workout. Changes stay on the device (and in the copy on Intervals.icu) until "Programma su Intervals".
import { IconAlertTriangle, IconCalendarEvent, IconCheck, IconChevronLeft, IconChevronRight, IconFlag, IconLock, IconMoon, IconPlus } from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { DashboardData } from "@/lib/dashboard";
import { addDays, weekStart } from "@/lib/dates";
import { loadProfile, PROFILE_EVENT, profileSnapshot } from "@/lib/profile/profile";
import { CLASS_LABEL, type Classified, classifyWorkout, QUALITY, type WorkoutClass } from "@/lib/training/classify";
import { lightWeekAdvice, PHASE_INFO, type PhaseId, type SeasonPlan, type SeasonSetup } from "@/lib/training/season";
import { saveSeason } from "@/lib/training/seasonStore";
import { fastedOk, parseCap } from "@/lib/training/suggest";
import { type DayView, freezeWeek, moveChoice, seasonWeeks, setChoice, type WeekView } from "@/lib/training/weeks";
import { dayLabel, Modal, send, WorkoutProfile } from "../calendar/shared";
import { scheduleCloudPush } from "../data/cloud";
import { refreshSeasonCalendar, useLibrary, useLife, useOverrides, useSeasonCalendar } from "../data/trainingData";

export const PHASE_COLOR: Record<PhaseId, string> = {
  base_1: "var(--hrv)",
  base_2: "var(--hrv)",
  base_3: "var(--hrv)",
  build_1: "var(--fitness)",
  build_2: "var(--fitness)",
  peak: "var(--form)",
  taper: "var(--fatigue)",
  recupero: "var(--faint)",
  mantenimento: "var(--muted)",
};
const KIND_SAY = { carico: "di carico", scarico: "leggera", stop: "di stop", taper: "di tapering", gara: "della gara" };
const DAY = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
const MONTH = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
const dow = (iso: string) => (new Date(`${iso}T12:00:00`).getDay() + 6) % 7;
const mon = (iso: string) => MONTH[Number(iso.slice(5, 7)) - 1];
const range = (a: string, b: string) => (mon(a) === mon(b) ? `${Number(a.slice(8))}–${Number(b.slice(8))} ${mon(b)}` : `${Number(a.slice(8))} ${mon(a)} – ${Number(b.slice(8))} ${mon(b)}`);
const num = (x: number, d = 0) => x.toFixed(d).replace(".", ",");
/** "venerdì 20", for the middle of a sentence. */
const dayName = (iso: string) => dayLabel(iso, { weekday: "long", day: "numeric" }).toLowerCase();

const subscribeProfile = (cb: () => void) => {
  window.addEventListener(PROFILE_EVENT, cb);
  return () => window.removeEventListener(PROFILE_EVENT, cb);
};

type Sheet = { week: number; date: string; cls: WorkoutClass | null; all: boolean; confirmRemove: boolean };

export function SeasonWeeks({ data, setup, plan }: { data: DashboardData; setup: SeasonSetup; plan: SeasonPlan }) {
  const today = data.today;
  const monday = weekStart(today);
  const rawProfile = useSyncExternalStore(subscribeProfile, profileSnapshot, () => "");
  const stored = useMemo(() => (rawProfile ? loadProfile() : null), [rawProfile]);
  const profile = stored?.profile;
  const library = useLibrary();
  const life = useLife(today);
  const overrides = useOverrides(today);
  const calendar = useSeasonCalendar(monday, plan.weeks.length, data.athlete.ftp);
  const [picked, setSel] = useState(0);
  // The plan can get shorter while the page stays open (a new week starts): the chosen tab stays inside it.
  const sel = Math.min(picked, Math.max(0, plan.weeks.length - 1));
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [toast, setToast] = useState<{ text: string; undo?: SeasonSetup } | null>(null);
  const [busy, setBusy] = useState("");
  const strip = useRef<HTMLDivElement>(null);

  const weeks = useMemo(() => {
    if (!library || !calendar) return null;
    const done = data.activities
      .filter((a) => a.date.slice(0, 10) >= monday && a.date.slice(0, 10) < today && ["strada", "offroad", "rulli"].includes(a.category))
      .map((a) => ({ date: a.date.slice(0, 10), name: a.name, mins: Math.round(a.movingTime / 60), tss: a.tss, indoor: a.indoor }));
    return seasonWeeks({
      plan,
      setup,
      today,
      calendar,
      done,
      base: {
        readiness: data.status.readiness.level,
        tsbYesterday: data.status.tsbYesterday,
        ctl: data.status.ctl,
        recent: data.activities.map((a) => ({ date: a.date.slice(0, 10), name: a.name, IF: a.IF, tss: a.tss, movingTime: a.movingTime })),
        library,
        profile,
        phenotype: stored?.phenotype ?? null,
        place: "any",
        ftp: data.athlete.ftp,
        indoorFtp: data.athlete.indoorFtp,
        rampRate: data.status.rampRate,
        life,
        feeling: overrides.feeling ?? null,
        override: { maxMins: overrides.maxMins, easier: overrides.easier, wantClass: overrides.wantClass, restToday: overrides.restToday },
      },
    });
  }, [library, calendar, data, monday, today, plan, setup, profile, stored, life, overrides]);

  // Keep the chosen tab in view.
  useEffect(() => {
    const s = strip.current;
    const on = s?.querySelector<HTMLElement>("[data-on='1']");
    if (s && on) s.scrollLeft = on.offsetLeft - s.clientWidth / 2 + on.offsetWidth / 2;
  }, [sel]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const max = Math.max(...plan.weeks.map((w) => w.tssTarget), 1);
  const view = weeks?.[sel] ?? null;
  const pw = plan.weeks[sel];
  const near = (start: string) => start <= addDays(monday, 14);
  const advice = lightWeekAdvice(data.recovery, data.status.autonomic?.pattern, today);
  const nextWeek = plan.weeks[1];

  // ── Changes ──────────────────────────────────────────────────────────────────────────────────
  const save = (next: SeasonSetup, text: string, undoable = true) => {
    const prev = setup;
    saveSeason(next);
    scheduleCloudPush();
    setToast({ text, undo: undoable ? prev : undefined });
  };
  const editWeek = (w: WeekView, change: (c: ReturnType<typeof freezeWeek>) => ReturnType<typeof freezeWeek>, text: string) => {
    const current = freezeWeek(w, today, setup.weekPlans?.[w.week.start] ?? []);
    save({ ...setup, weekPlans: { ...(setup.weekPlans ?? {}), [w.week.start]: change(current) } }, text);
  };
  const withoutDays = (start: string, dates: string[]): SeasonSetup => {
    const kept = (setup.weekPlans?.[start] ?? []).filter((c) => !dates.includes(c.date));
    const plans = { ...(setup.weekPlans ?? {}) };
    if (kept.length) plans[start] = kept;
    else delete plans[start];
    return { ...setup, weekPlans: plans };
  };
  const intervals = async (what: string, run: () => Promise<string | null>, ok: string) => {
    setBusy(what);
    const err = await run();
    setBusy("");
    if (err) return setToast({ text: `Non riuscito: ${err}` });
    void refreshSeasonCalendar();
    setToast({ text: ok });
  };

  const move = async (w: WeekView, d: DayView, to: string) => {
    const target = w.days.find((x) => x.date === to);
    if (target?.kind === "cal") return setToast({ text: "Quel giorno c'è già un allenamento su Intervals: sposta prima quello." });
    setSheet(null);
    if (d.kind === "cal" && d.event) return intervals("move", () => send(`/api/calendar/events/${d.event!.id}`, "PATCH", { date: to }), `Spostato su Intervals a ${dayName(to)}`);
    editWeek(w, (c) => moveChoice(c, d.date, to), target && (target.kind === "prop" || target.kind === "mine") ? `Scambiati: ${DAY[dow(d.date)]} ↔ ${DAY[dow(to)]}` : `Spostato a ${dayName(to)}`);
  };
  const replace = (w: WeekView, date: string, id: number, name: string) => {
    editWeek(w, (c) => setChoice(c, date, id), `Scelto: ${name}`);
    setSheet((s) => (s ? { ...s, cls: null } : s));
  };
  const remove = async (w: WeekView, d: DayView) => {
    setSheet(null);
    if (d.kind === "cal" && d.event) return intervals("remove", () => send(`/api/calendar/events/${d.event!.id}`, "DELETE"), "Tolto da Intervals");
    editWeek(w, (c) => setChoice(c, d.date, null), `${DAY[dow(d.date)]} ${Number(d.date.slice(8))}: riposo`);
  };
  const schedule = async (w: WeekView, days: DayView[]) => {
    const todo = days.filter((d) => (d.kind === "prop" || d.kind === "mine") && d.workout && d.date >= today);
    if (!todo.length) return;
    setSheet(null);
    setBusy("schedule");
    for (const d of todo) {
      const err = await send("/api/calendar/events", "POST", { workoutId: d.workout!.id, date: d.date });
      if (err) {
        setBusy("");
        void refreshSeasonCalendar();
        return setToast({ text: `Non riuscito per ${DAY[dow(d.date)]} ${Number(d.date.slice(8))}: ${err}` });
      }
    }
    // What is now on the calendar no longer needs to be held in the week. The calendar is read first, so the days
    // don't show other proposals for a moment before the scheduled workouts arrive.
    await refreshSeasonCalendar();
    setBusy("");
    saveSeason(withoutDays(w.week.start, todo.map((d) => d.date)));
    scheduleCloudPush();
    setToast({ text: todo.length === 1 ? "Programmato su Intervals" : `${todo.length} allenamenti programmati su Intervals` });
  };
  const toggleLight = (start: string) => {
    const on = setup.lightWeeks?.includes(start);
    save({ ...setup, lightWeeks: on ? setup.lightWeeks!.filter((x) => x !== start) : [...(setup.lightWeeks ?? []), start] }, on ? "La settimana torna di carico" : "Settimana leggera: meno volume, una sola seduta di qualità corta");
  };
  const toggleBlock = (start: string) => {
    const on = setup.blockWeeks?.includes(start);
    save({ ...setup, blockWeeks: on ? setup.blockWeeks!.filter((x) => x !== start) : [...(setup.blockWeeks ?? []), start] }, on ? "Niente blocco: due sedute di qualità" : "Settimana di blocco: tre sedute di qualità, stesso carico");
  };
  const reset = (start: string) => {
    const plans = { ...(setup.weekPlans ?? {}) };
    delete plans[start];
    save({ ...setup, weekPlans: plans }, "Proposta rifatta");
  };

  // ── Render ───────────────────────────────────────────────────────────────────────────────────
  if (!pw) return null;
  return (
    <>
      <section className="card py-3" data-noswipe>
        <div className="flex items-baseline justify-between px-4 pb-2">
          <h2 className="text-sm font-medium">Le settimane</h2>
          <span className="text-[11px] text-muted">tocca una settimana</span>
        </div>
        {/* Phones scroll the strip with the finger; with a mouse (sm and up) a thin scrollbar shows that it scrolls. */}
        <div ref={strip} className="flex items-end gap-0.5 overflow-x-auto px-3 pb-1 [scrollbar-width:none] sm:[scrollbar-width:thin]" role="tablist" aria-label="Settimane della stagione">
          {plan.weeks.map((w, i) => {
            const first = i === 0 || mon(w.start) !== mon(plan.weeks[i - 1].start);
            const light = w.kind !== "carico" || setup.lightWeeks?.includes(w.start);
            return (
              <div key={w.start} className="flex items-end">
                {first && <span className="self-stretch border-l px-1 text-[9.5px] uppercase tracking-wide text-faint" style={{ borderColor: "var(--border)" }}>{mon(w.start)}</span>}
                <button
                  type="button"
                  role="tab"
                  aria-selected={i === sel}
                  data-on={i === sel ? "1" : "0"}
                  onClick={() => setSel(i)}
                  title={`Settimana ${i + 1}: ${range(w.start, w.end)} · ${PHASE_INFO[w.phase].label} · TSS ${w.tssTarget}`}
                  className="flex w-[30px] shrink-0 flex-col items-center gap-0.5 rounded-[10px] py-1"
                  style={i === sel ? { background: "var(--accent-bg)", boxShadow: "inset 0 0 0 1.5px var(--accent-ink)", color: "var(--accent-ink)" } : { color: "var(--muted)" }}
                >
                  <span className="flex h-11 w-[15px] items-end">
                    <span className="block w-full rounded-t-[4px] rounded-b-[1px]" style={{ height: `${Math.max(6, (w.tssTarget / max) * 100)}%`, background: PHASE_COLOR[w.phase], opacity: light ? 0.5 : 1 }} />
                  </span>
                  <span className="num text-[9.5px] font-semibold leading-none">{i + 1}</span>
                  <span className="num text-[9px] leading-none" style={{ color: i === 0 ? "var(--brand)" : "var(--faint)" }}>{Number(w.start.slice(8))}</span>
                </button>
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 px-4 pt-2 text-[10.5px] text-muted">
          {(["base_1", "build_1", "peak", "taper", "mantenimento"] as PhaseId[]).map((p) => (
            <span key={p} className="inline-flex items-center gap-1">
              <i className="inline-block h-2 w-2 rounded-sm" style={{ background: PHASE_COLOR[p] }} />
              {p === "base_1" ? "Base" : p === "build_1" ? "Build" : PHASE_INFO[p].label}
            </span>
          ))}
          <span>chiare: leggere</span>
        </div>
      </section>

      <section className="card p-4" data-noswipe>
        <div className="flex items-center justify-between gap-2">
          <button type="button" onClick={() => setSel(Math.max(0, sel - 1))} disabled={sel === 0} aria-label="Settimana prima" className="grid h-9 w-9 place-items-center rounded-full disabled:opacity-30" style={{ border: "1px solid var(--border)" }}>
            <IconChevronLeft size={16} />
          </button>
          <div className="text-center">
            <div className="text-[15px] font-semibold">
              Settimana {sel + 1} di {plan.weeks.length}
            </div>
            <div className="text-xs text-muted">
              {range(pw.start, pw.end)}
              {sel === 0 ? " · questa" : ""}
            </div>
          </div>
          <button type="button" onClick={() => setSel(Math.min(plan.weeks.length - 1, sel + 1))} disabled={sel === plan.weeks.length - 1} aria-label="Settimana dopo" className="grid h-9 w-9 place-items-center rounded-full disabled:opacity-30" style={{ border: "1px solid var(--border)" }}>
            <IconChevronRight size={16} />
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11.5px] font-medium" style={{ border: `1px solid ${PHASE_COLOR[pw.phase]}`, background: "var(--background)" }}>
            <i className="inline-block h-[7px] w-[7px] rounded-[2px]" style={{ background: PHASE_COLOR[pw.phase] }} />
            {PHASE_INFO[pw.phase].label}
          </span>
          <span className="text-xs text-muted">
            Settimana {KIND_SAY[pw.kind]}
            {pw.block ? ", di blocco" : ""}
          </span>
        </div>
        <p className="mt-1 text-[11.5px] text-faint">
          {PHASE_INFO[pw.phase].focus}
          {pw.note ? ` · ${pw.note}` : ""}
        </p>

        {!view ? (
          <p className="mt-4 text-sm text-muted">Preparo le settimane dalla tua libreria…</p>
        ) : (
          <>
            <div className="mt-3 grid grid-cols-4 gap-1.5">
              {[
                [`${view.tss}`, `/${pw.tssTarget}`, "TSS / riferimento"],
                [num(view.mins / 60, 1), " h", "in bici"],
                [`${view.quality}`, `/${pw.qualityMax}`, "qualità"],
                [num(pw.ctlEnd), "", "CTL a fine settimana"],
              ].map(([a, b, l]) => (
                <div key={l} className="rounded-xl px-2 py-1.5" style={{ background: "var(--background)" }}>
                  <div className="num text-[15px] font-semibold leading-tight">
                    {a}
                    <small className="text-[11px] font-medium text-faint">{b}</small>
                  </div>
                  <div className="text-[10px] leading-tight text-muted">{l}</div>
                </div>
              ))}
            </div>
            <div className="mt-2.5 h-1.5 overflow-hidden rounded-full" style={{ background: "var(--neutral-bg)" }}>
              <div className="h-full rounded-full" style={{ width: `${pw.tssTarget ? Math.min(100, (view.tss / pw.tssTarget) * 100) : 0}%`, background: "var(--brand)" }} />
            </div>
            {(view.warnings.length > 0 || (sel === 0 && advice && nextWeek?.kind === "carico" && !setup.lightWeeks?.includes(nextWeek.start))) && (
              <ul className="mt-2.5 space-y-1">
                {view.warnings.map((w) => (
                  <li key={w} className="flex items-start gap-1.5 rounded-[10px] px-2.5 py-1.5 text-[11.5px] leading-snug" style={{ background: "var(--warning-bg)", color: "var(--warning-ink)" }}>
                    <IconAlertTriangle size={13} className="mt-px shrink-0" aria-hidden />
                    {w}
                  </li>
                ))}
                {sel === 0 && advice && nextWeek?.kind === "carico" && !setup.lightWeeks?.includes(nextWeek.start) && (
                  <li className="rounded-[10px] px-2.5 py-1.5 text-[11.5px] leading-snug" style={{ background: "var(--warning-bg)", color: "var(--warning-ink)" }}>
                    {advice}{" "}
                    <button type="button" className="font-semibold underline" onClick={() => toggleLight(nextWeek.start)}>
                      Rendi leggera la prossima
                    </button>
                  </li>
                )}
              </ul>
            )}

            <div className="mt-3.5 space-y-2">
              {view.days.map((d) => (
                <DayRow key={d.date} d={d} today={today} onOpen={() => setSheet({ week: sel, date: d.date, cls: null, all: false, confirmRemove: false })} />
              ))}
            </div>

            <div className="mt-4 space-y-2">
              {(() => {
                const todo = view.days.filter((d) => (d.kind === "prop" || d.kind === "mine") && d.date >= today);
                if (!todo.length) return <p className="flex items-center gap-1.5 text-xs text-muted"><IconCheck size={14} style={{ color: "var(--good)" }} aria-hidden />Niente da programmare: è già tutto su Intervals.</p>;
                if (!near(pw.start)) return <p className="text-xs text-muted">Bozza: si programma su Intervals da 2 settimane prima. Quello che scegli tu resta fisso.</p>;
                return (
                  <button type="button" disabled={!!busy} onClick={() => void schedule(view, todo)} className="h-10 w-full rounded-full text-sm font-semibold disabled:opacity-60" style={{ background: "var(--accent-bg)", color: "var(--accent-ink)" }}>
                    {busy === "schedule" ? "Programmo…" : `Programma ${todo.length === 1 ? "1 allenamento" : `${todo.length} allenamenti`} su Intervals`}
                  </button>
                );
              })()}
              <div className="flex flex-wrap gap-2">
                {(pw.kind === "carico" || setup.lightWeeks?.includes(pw.start)) && (
                  <button type="button" onClick={() => toggleLight(pw.start)} className="h-9 rounded-full px-3.5 text-xs leading-none" style={{ border: "1px solid var(--border)" }}>
                    {setup.lightWeeks?.includes(pw.start) ? "Torna di carico" : "Rendila leggera"}
                  </button>
                )}
                {(pw.kind === "carico" && PHASE_INFO[pw.phase].qualityMax > 0) && (
                  <button type="button" onClick={() => toggleBlock(pw.start)} className="h-9 rounded-full px-3.5 text-xs leading-none" style={{ border: "1px solid var(--border)" }}>
                    {pw.block ? "Togli il blocco" : "Settimana di blocco"}
                  </button>
                )}
                {view.frozen && (
                  <button type="button" onClick={() => reset(pw.start)} className="h-9 rounded-full px-3.5 text-xs leading-none" style={{ border: "1px solid var(--border)" }}>
                    Rifai la proposta
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </section>

      {toast && (
        <div role="status" className="fixed inset-x-0 z-[60] mx-auto flex w-max max-w-[90%] items-center gap-3 rounded-2xl px-4 py-2.5 text-[13px] shadow-lg" style={{ bottom: "calc(var(--nav-h, 0px) + 16px)", background: "var(--foreground)", color: "var(--background)" }}>
          <span>{toast.text}</span>
          {toast.undo && (
            <button
              type="button"
              className="font-semibold underline"
              onClick={() => {
                saveSeason(toast.undo!);
                scheduleCloudPush();
                setToast(null);
              }}
            >
              Annulla
            </button>
          )}
        </div>
      )}

      {sheet && weeks && (
        <DaySheet
          sheet={sheet}
          setSheet={setSheet}
          week={weeks[sheet.week]}
          today={today}
          near={near(weeks[sheet.week].week.start)}
          busy={busy}
          library={library ?? []}
          roadOnly={!!profile?.disciplina && !/mtb/i.test(profile.disciplina)}
          fasted={(c) => fastedOk(profile, c)}
          weekdayCap={parseCap(profile?.durataFeriali) ?? 120}
          onMove={move}
          onReplace={replace}
          onRemove={remove}
          onSchedule={(w, d) => void schedule(w, [d])}
        />
      )}
    </>
  );
}

function DayRow({ d, today, onOpen }: { d: DayView; today: string; onOpen: () => void }) {
  const isToday = d.date === today;
  const left = (
    <div className="pt-1.5">
      <span className="block text-[11px] leading-none" style={{ color: isToday ? "var(--accent-ink)" : "var(--muted)" }}>
        {DAY[dow(d.date)]}
      </span>
      <span className="num mt-1 inline-flex h-7 min-w-7 items-center justify-center rounded-full px-1 text-[17px] font-medium leading-none" style={isToday ? { background: "var(--brand)", color: "var(--on-brand)" } : undefined}>
        {Number(d.date.slice(8))}
      </span>
    </div>
  );
  let right: React.ReactNode;
  if (d.kind === "done" || d.kind === "cal" || d.kind === "mine" || d.kind === "prop") {
    const tag =
      d.kind === "done" ? (
        <span className="inline-flex items-center gap-0.5 text-[10.5px]" style={{ color: "var(--good)" }}><IconCheck size={12} aria-hidden />Fatto</span>
      ) : d.kind === "cal" ? (
        <span className="inline-flex items-center gap-0.5 text-[10.5px]" style={{ color: "var(--good)" }}><IconCalendarEvent size={12} aria-hidden />Su Intervals</span>
      ) : d.kind === "mine" ? (
        <span className="inline-flex items-center gap-0.5 text-[10.5px] font-medium" style={{ color: "var(--accent-ink)" }}><IconLock size={12} aria-hidden />Scelto da te</span>
      ) : (
        <span className="text-[10.5px] text-faint">{d.frozen ? "Proposta, fissata" : "Proposta"}</span>
      );
    right = (
      <button
        type="button"
        onClick={onOpen}
        disabled={d.kind === "done"}
        className="block w-full rounded-2xl px-3 py-2 text-left"
        style={{
          border: `1.5px ${d.kind === "prop" ? "dashed var(--faint)" : `solid ${d.kind === "mine" ? "var(--brand)" : "var(--border)"}`}`,
          background: d.kind === "prop" ? "transparent" : "var(--surface)",
          opacity: d.kind === "done" ? 0.8 : 1,
        }}
      >
        <span className="flex flex-wrap items-center gap-1.5">
          {d.c && d.kind !== "done" && (
            <span className="rounded-full px-1.5 text-[10.5px] font-semibold leading-[17px]" style={{ background: `color-mix(in srgb, var(--z${zoneOf(d.c.cls)}) 32%, var(--surface))` }}>
              {CLASS_LABEL[d.c.cls]}
            </span>
          )}
          {tag}
        </span>
        <span className="mt-0.5 block text-[13.5px] font-semibold leading-tight">{d.name}</span>
        <span className="num block text-[11.5px] text-muted">
          {[d.indoor ? "rulli" : "fuori", d.mins ? `${d.mins} min` : null, d.tss != null ? `TSS ${Math.round(d.tss)}` : null].filter(Boolean).join(" · ")}
        </span>
        {d.workout?.blocks?.length ? (
          <span className="mt-1.5 block">
            <WorkoutProfile blocks={d.workout.blocks} height={18} axis={false} />
          </span>
        ) : null}
      </button>
    );
  } else if (d.kind === "stop") {
    right = <div className="flex min-h-10 items-center gap-2 rounded-2xl px-3 text-xs" style={{ background: "var(--neutral-bg)", color: "var(--muted)" }}><IconCalendarEvent size={14} aria-hidden />{d.reason}</div>;
  } else if (d.kind === "race") {
    right = <div className="flex min-h-10 items-center gap-2 rounded-2xl px-3 text-xs font-medium" style={{ background: "var(--warning-bg)", color: "var(--warning-ink)" }}><IconFlag size={14} aria-hidden />Gara A</div>;
  } else if (d.date < today) {
    right = <div className="flex min-h-10 items-center gap-2 px-1 text-[12.5px] text-muted"><IconMoon size={16} style={{ color: "var(--brand)" }} aria-hidden />Riposo</div>;
  } else {
    right = (
      <button type="button" onClick={onOpen} className="flex min-h-10 w-full items-center gap-2 rounded-2xl px-3 text-left text-[12.5px] text-muted" style={{ border: "1.5px dashed var(--border)" }}>
        {d.kind === "off" ? <IconMoon size={16} style={{ color: "var(--brand)" }} aria-hidden /> : <IconPlus size={15} style={{ color: "var(--brand)" }} aria-hidden />}
        {d.kind === "off" ? "Non è tra i tuoi giorni" : d.reason && d.reason !== "Riposo" ? d.reason.replace(/:.*$/, "") : "Riposo · aggiungi"}
      </button>
    );
  }
  return (
    <div className="grid grid-cols-[2.6rem_minmax(0,1fr)] gap-2.5">
      {left}
      <div className="min-w-0">{right}</div>
    </div>
  );
}

const ZONE_OF: Record<WorkoutClass, number> = { recupero: 1, z2: 2, tempo: 3, sweetspot: 4, soglia: 4, vo2: 5, anaerobico: 6, sprint: 7, test: 5, gara: 4 };
const zoneOf = (c: WorkoutClass) => ZONE_OF[c];

function DaySheet(props: {
  sheet: Sheet;
  setSheet: (s: Sheet | null) => void;
  week: WeekView;
  today: string;
  near: boolean;
  busy: string;
  library: NonNullable<ReturnType<typeof useLibrary>>;
  roadOnly: boolean;
  /** Fasted workouts the athlete's sheet accepts (the same rule as the engine). */
  fasted: (c: Classified) => boolean;
  weekdayCap: number;
  onMove: (w: WeekView, d: DayView, to: string) => void;
  onReplace: (w: WeekView, date: string, id: number, name: string) => void;
  onRemove: (w: WeekView, d: DayView) => void;
  onSchedule: (w: WeekView, d: DayView) => void;
}) {
  const { sheet, setSheet, week, today, library } = props;
  const d = week.days.find((x) => x.date === sheet.date)!;
  const ride = d.kind === "cal" || d.kind === "mine" || d.kind === "prop";
  const info = PHASE_INFO[week.week.phase];
  const allowed = info.classes;
  const cls: WorkoutClass = sheet.cls ?? (d.c && ride ? d.c.cls : allowed.includes("z2") ? "z2" : allowed[0]);
  const editable = d.date >= today && d.kind !== "cal";
  const types = (sheet.all ? (Object.keys(CLASS_LABEL) as WorkoutClass[]).filter((c) => c !== "test" && c !== "gara") : allowed);
  const { roadOnly, fasted } = props;
  const pool = useMemo(
    () => library.map(classifyWorkout).filter((c) => c.cls !== "test" && c.cls !== "gara" && !(roadOnly && c.mtb) && (!c.fasted || fasted(c))),
    [library, roadOnly, fasted],
  );
  const ofClass = pool.filter((c) => c.cls === cls).sort((a, b) => a.mins - b.mins);
  const ref = ride && d.mins ? d.mins : dow(d.date) >= 5 ? 120 : 60;
  const options = ofClass.filter((c) => c.w.id !== d.workout?.id).sort((a, b) => Math.abs(a.mins - ref) - Math.abs(b.mins - ref)).slice(0, 4);
  // − and + always change the minutes shown: several workouts can round to the same minute.
  const now = Math.round(d.mins ?? 0);
  const sameType = ride && d.c?.cls === cls;
  const shorter = sameType ? ofClass.filter((c) => Math.round(c.mins) < now).pop() : undefined;
  const longer = sameType ? ofClass.find((c) => Math.round(c.mins) > now) : undefined;
  const chip = "flex flex-col items-center gap-0.5 rounded-xl py-1.5";
  return (
    <Modal
      title={ride ? d.name : "Giorno libero"}
      subtitle={`${dayLabel(d.date)} · settimana ${week.index + 1} · ${info.label}`}
      onClose={() => setSheet(null)}
    >
      {ride && d.c && (
        <>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11.5px] text-muted">
            <span className="rounded-full px-1.5 text-[10.5px] font-semibold leading-[17px] text-[var(--foreground)]" style={{ background: `color-mix(in srgb, var(--z${zoneOf(d.c.cls)}) 32%, var(--surface))` }}>{CLASS_LABEL[d.c.cls]}</span>
            {d.kind === "cal" ? "Su Intervals" : d.kind === "mine" ? "Scelto da te" : d.frozen ? "Proposta, fissata" : "Proposta"} · {d.indoor ? "rulli" : "fuori"} · {d.mins} min{d.tss != null ? ` · TSS ${Math.round(d.tss)}` : ""}
          </div>
          {d.workout?.blocks?.length ? <div className="mt-3"><WorkoutProfile blocks={d.workout.blocks} height={44} axis={false} /></div> : null}
        </>
      )}

      {ride && d.date >= today && (
        <>
          <h3 className="mb-1.5 mt-4 text-xs font-semibold">
            Sposta a <span className="font-normal text-faint">· {d.kind === "cal" ? "lo sposta anche su Intervals" : "se il giorno è occupato si scambiano"}</span>
          </h3>
          <div className="grid grid-cols-7 gap-1">
            {week.days.map((x) => {
              const here = x.date === d.date;
              const blocked = x.date < today || x.kind === "stop" || x.kind === "race" || x.kind === "done" || (x.kind === "cal" && !here);
              return (
                <button
                  key={x.date}
                  type="button"
                  disabled={here || blocked || !!props.busy}
                  aria-label={here ? `${dayName(x.date)}, è qui` : `Sposta a ${dayName(x.date)}`}
                  onClick={() => props.onMove(week, d, x.date)}
                  className={chip}
                  style={here ? { background: "var(--brand)", color: "var(--on-brand)" } : { border: `1px ${x.kind === "off" ? "dashed" : "solid"} var(--border)`, opacity: blocked ? 0.35 : 1 }}
                >
                  <span className="text-[9.5px]" style={{ color: here ? "var(--on-brand)" : "var(--muted)" }}>{DAY[dow(x.date)]}</span>
                  <span className="num text-[13px] font-semibold leading-none">{Number(x.date.slice(8))}</span>
                  <i className="block h-1.5 w-1.5 rounded-full" style={{ background: !here && x.c && x.kind !== "done" ? `var(--z${zoneOf(x.c.cls)})` : "transparent" }} />
                </button>
              );
            })}
          </div>
        </>
      )}

      {editable && (
        <>
          <h3 className="mb-1.5 mt-4 text-xs font-semibold">{ride ? "Cambia con" : "Aggiungi"} <span className="font-normal text-faint">· dalla tua libreria</span></h3>
          <div className="flex flex-wrap gap-1.5">
            {types.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setSheet({ ...sheet, cls: t })}
                className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[11.5px]"
                style={t === cls ? { background: "var(--accent-bg)", color: "var(--accent-ink)", border: "1px solid var(--accent-ink)" } : { border: `1px ${allowed.includes(t) ? "solid" : "dashed"} var(--border)`, opacity: allowed.includes(t) ? 1 : 0.7 }}
              >
                <i className="inline-block h-[7px] w-[7px] rounded-[2px]" style={{ background: `var(--z${zoneOf(t)})` }} />
                {CLASS_LABEL[t]}
              </button>
            ))}
            {!sheet.all && (
              <button type="button" onClick={() => setSheet({ ...sheet, all: true })} className="h-8 rounded-full px-3 text-[11.5px]" style={{ border: "1px solid var(--border)" }}>
                Altri tipi…
              </button>
            )}
          </div>
          {!allowed.includes(cls) && <p className="mt-2 text-[11px]" style={{ color: "var(--warning-ink)" }}>In {info.label} il piano non prevede {CLASS_LABEL[cls].toLowerCase()}: si può scegliere, la settimana lo segnala.</p>}
          {(shorter || longer) && (
            <div className="mt-2.5 flex items-center gap-2">
              <button type="button" disabled={!shorter} onClick={() => shorter && props.onReplace(week, d.date, shorter.w.id, shorter.w.name)} aria-label="Più corto" className="grid h-8 w-8 place-items-center rounded-full disabled:opacity-30" style={{ border: "1px solid var(--border)" }}>−</button>
              <span className="num min-w-14 text-center text-[13px] font-semibold">{d.mins} min</span>
              <button type="button" disabled={!longer} onClick={() => longer && props.onReplace(week, d.date, longer.w.id, longer.w.name)} aria-label="Più lungo" className="grid h-8 w-8 place-items-center rounded-full disabled:opacity-30" style={{ border: "1px solid var(--border)" }}>+</button>
              <span className="text-[11px] text-faint">durata, stesso tipo</span>
            </div>
          )}
          <div className="mt-2.5 space-y-1.5">
            {options.length === 0 && <p className="text-xs text-muted">Nella libreria non c&apos;è niente di questo tipo.</p>}
            {options.map((o) => (
              <button
                key={o.w.id}
                type="button"
                onClick={() => props.onReplace(week, d.date, o.w.id, o.w.name)}
                className="grid w-full grid-cols-[minmax(0,1fr)_72px] items-center gap-2.5 rounded-xl px-2.5 py-2 text-left"
                style={{ border: "1px solid var(--border)", background: "var(--background)", opacity: dow(d.date) < 5 && o.mins > props.weekdayCap + 5 ? 0.6 : 1 }}
              >
                <span className="min-w-0">
                  <span className="block text-[12.5px] font-semibold leading-tight">{o.w.name}</span>
                  <span className="num text-[11px] text-muted">{o.indoor ? "rulli" : "fuori"} · {Math.round(o.mins)} min · TSS {Math.round(o.tss)}{QUALITY.includes(o.cls) ? " · qualità" : ""}</span>
                </span>
                <WorkoutProfile blocks={o.w.blocks} height={24} axis={false} />
              </button>
            ))}
          </div>
        </>
      )}

      {d.date >= today && (
        <div className="mt-4 flex flex-wrap gap-2">
          {(d.kind === "prop" || d.kind === "mine") && (
            <button type="button" onClick={() => props.onRemove(week, d)} className="h-9 rounded-full px-3.5 text-xs" style={{ border: "1px solid var(--border)", color: "var(--critical)" }}>
              Togli: riposo
            </button>
          )}
          {d.kind === "cal" &&
            (sheet.confirmRemove ? (
              <button type="button" disabled={!!props.busy} onClick={() => props.onRemove(week, d)} className="h-9 rounded-full px-3.5 text-xs font-semibold" style={{ background: "var(--critical-bg)", color: "var(--critical)" }}>
                Sì, toglilo da Intervals
              </button>
            ) : (
              <button type="button" onClick={() => setSheet({ ...sheet, confirmRemove: true })} className="h-9 rounded-full px-3.5 text-xs" style={{ border: "1px solid var(--border)", color: "var(--critical)" }}>
                Togli da Intervals
              </button>
            ))}
        </div>
      )}
      {ride && d.kind !== "cal" && props.near && d.date >= today ? (
        <button type="button" disabled={!!props.busy} onClick={() => props.onSchedule(week, d)} className="mt-4 h-10 w-full rounded-full text-sm font-semibold disabled:opacity-60" style={{ background: "var(--accent-bg)", color: "var(--accent-ink)" }}>
          Programma su Intervals
        </button>
      ) : (
        <button type="button" onClick={() => setSheet(null)} className="mt-4 h-10 w-full rounded-full text-sm font-semibold" style={{ background: "var(--accent-bg)", color: "var(--accent-ink)" }}>
          Fatto
        </button>
      )}
      <p className="mt-2.5 text-[11px] leading-snug text-faint">
        {d.kind === "cal"
          ? "È già nel calendario di Intervals: spostarlo o toglierlo lo cambia anche lì."
          : props.near
            ? "Quello che cambi resta fisso: il resto del piano si ricalcola attorno."
            : "Settimana lontana: è una bozza. Quello che scegli tu resta fisso; il resto si ricalcola con i dati veri."}
      </p>
    </Modal>
  );
}
