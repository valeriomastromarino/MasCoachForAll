"use client";

// "Allenamento di oggi": the workout the engine picks from the Intervals.icu library (lib/training/suggest.ts), with
// the reasons, the alternatives and a week plan. Nothing is written to Intervals.icu until a button says so.
import { useMemo, useState, useSyncExternalStore } from "react";
import type { DashboardData } from "@/lib/dashboard";
import { loadProfile, PROFILE_EVENT, profileSnapshot } from "@/lib/profile/profile";
import { PHASE_INFO, planFromToday, weekFor } from "@/lib/training/season";
import { loadSeason, SEASON_EVENT, seasonSnapshot } from "@/lib/training/seasonStore";
import { type Place, planWeek, type Proposal, suggestWorkout, type SuggestInput, type Suggestion } from "@/lib/training/suggest";
import Link from "next/link";
import { WorkoutProfile, send } from "../calendar/shared";
import { useLibrary, useLife, useOverrides, usePlanned } from "../data/trainingData";

const subscribe = (cb: () => void) => {
  window.addEventListener(PROFILE_EVENT, cb);
  return () => window.removeEventListener(PROFILE_EVENT, cb);
};

const PLACES: [Place, string][] = [
  ["any", "Indifferente"],
  ["outdoor", "Fuori"],
  ["indoor", "Rulli"],
];

const KIND_NAME = { carico: "di carico", scarico: "leggera", taper: "di tapering", gara: "della gara", stop: "di stop" };
const DAY_NAMES = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
const dayName = (date: string) => `${DAY_NAMES[(new Date(`${date}T12:00:00`).getDay() + 6) % 7]} ${Number(date.slice(8))}`;

const subscribeSeason = (cb: () => void) => {
  window.addEventListener(SEASON_EVENT, cb);
  return () => window.removeEventListener(SEASON_EVENT, cb);
};

/** compact (phone app): only the workout and its button, without the phase text, the reasons and the week proposal. */
export function TodayWorkout({ data, compact = false }: { data: DashboardData; compact?: boolean }) {
  const raw = useSyncExternalStore(subscribe, profileSnapshot, () => "");
  const rawSeason = useSyncExternalStore(subscribeSeason, seasonSnapshot, () => "");
  const life = useLife(data.today);
  const overrides = useOverrides(data.today);
  const season = useMemo(() => {
    const setup = rawSeason ? loadSeason() : null;
    return setup ? planFromToday(setup, data.today, data.status.ctl, life) : null;
  }, [rawSeason, data.today, data.status.ctl, life]);
  const stored = useMemo(() => (raw ? loadProfile() : null), [raw]);
  const library = useLibrary();
  const [placeChoice, setPlaceChoice] = useState<Place>("any");
  const [chosen, setChosen] = useState(0);
  const [showOther, setShowOther] = useState(false);
  const [saving, setSaving] = useState<string>("");
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const today = data.today;
  const planned = usePlanned(today, data.athlete.ftp);
  // What the athlete said in the chat (a place, a time limit, a feeling) counts here too.
  const place: Place = placeChoice !== "any" ? placeChoice : (overrides.place ?? "any");
  const setPlace = setPlaceChoice;

  const input: SuggestInput | null = useMemo(() => {
    if (!library) return null;
    return {
      date: today,
      readiness: data.status.readiness.level,
      tsbYesterday: data.status.tsbYesterday,
      ctl: data.status.ctl,
      recent: data.activities.map((a) => ({ date: a.date.slice(0, 10), name: a.name, IF: a.IF, tss: a.tss, movingTime: a.movingTime })),
      library,
      profile: stored?.profile,
      phenotype: stored?.phenotype ?? null,
      place,
      ftp: data.athlete.ftp,
      indoorFtp: data.athlete.indoorFtp,
      season,
      rampRate: data.status.rampRate,
      life,
      feeling: overrides.feeling ?? null,
      override: { maxMins: overrides.maxMins, easier: overrides.easier, wantClass: overrides.wantClass, restToday: overrides.restToday },
    };
  }, [library, today, data, stored, place, season, life, overrides]);

  const suggestion: Suggestion | null = useMemo(() => (input ? suggestWorkout(input) : null), [input]);
  const week = useMemo(() => (input && planned ? planWeek(input, planned.map((w) => ({ date: w.date, workout: { ...w, id: 0 } }))) : []), [input, planned]);
  const todayPlanned = planned?.find((w) => w.date === today) ?? null;
  const weekPlan = weekFor(season, today);

  const schedule = async (p: Proposal, date: string) => {
    const key = `${date}:${p.workout.id}`;
    setSaving(key);
    setError(null);
    const err = await send("/api/calendar/events", "POST", { workoutId: p.workout.id, date });
    setSaving("");
    if (err) setError(err);
    else setDone((d) => ({ ...d, [key]: true }));
  };

  if (data.source === "demo") return null;

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-sm font-medium">Allenamento di oggi</h2>
      <div className="flex gap-1" role="group" aria-label="Dove ti alleni oggi">
        {PLACES.map(([p, label]) => (
          <button
            key={p}
            type="button"
            onClick={() => (setPlace(p), setChosen(0))}
            className="rounded-full px-3 py-1 text-xs"
            style={{ background: place === p ? "var(--accent-bg)" : "transparent", color: place === p ? "var(--accent-ink)" : "var(--muted)", border: `1px solid ${place === p ? "var(--accent-ink)" : "var(--border)"}` }}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );

  let body: React.ReactNode;
  if (!suggestion || planned === null) {
    body = <p className="mt-3 text-sm text-muted">Scelgo dalla tua libreria…</p>;
  } else if (todayPlanned && !showOther) {
    body = (
      <div className="mt-3">
        <div className="text-xs text-muted">Hai già in programma su Intervals</div>
        <div className="mt-1 font-medium">{todayPlanned.name}</div>
        <div className="num text-xs text-muted">
          {todayPlanned.secs ? `${Math.round(todayPlanned.secs / 60)} min` : ""}
          {todayPlanned.tss ? ` · TSS ${Math.round(todayPlanned.tss)}` : ""}
        </div>
        {todayPlanned.blocks.length > 0 && (
          <div className="mt-3">
            <WorkoutProfile blocks={todayPlanned.blocks} height={44} axis={false} />
          </div>
        )}
        <button type="button" onClick={() => setShowOther(true)} className="mt-3 text-xs text-faint underline">
          Proponimi un&apos;altra cosa
        </button>
      </div>
    );
  } else if (suggestion.kind === "rest") {
    body = <p className="mt-3 text-sm">{suggestion.reason}</p>;
  } else {
    const options = [suggestion.main, ...suggestion.alternatives];
    const p = options[Math.min(chosen, options.length - 1)];
    const key = `${today}:${p.workout.id}`;
    body = (
      <div className="mt-3">
        <div className="flex items-center gap-2">
          <span className="rounded-full px-2 py-0.5 text-[11px]" style={{ background: "var(--accent-bg)", color: "var(--accent-ink)" }}>
            {p.label}
          </span>
          <span className="text-[11px] text-faint">{p.indoor ? "rulli" : "fuori"}</span>
        </div>
        <div className="mt-1 text-base font-medium">{p.workout.name}</div>
        <div className="num text-xs text-muted">
          {p.mins} min · TSS {p.tss}
        </div>
        {p.workout.blocks.length > 0 && (
          <div className="mt-3">
            <WorkoutProfile blocks={p.workout.blocks} height={52} />
          </div>
        )}
        <ul className="mt-3 space-y-1 text-xs text-muted">
          {!compact && p.reasons.map((r) => <li key={r}>{r}</li>)}
          <li>Carboidrati: {p.carbs}{compact ? "" : " (indicazione, non un dato registrato)"}.</li>
          {!compact && p.ftpNote && <li>{p.ftpNote}.</li>}
        </ul>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={saving === key || done[key]}
            onClick={() => void schedule(p, today)}
            className="rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-60"
            style={{ background: "var(--accent-bg)", color: "var(--accent-ink)" }}
          >
            {done[key] ? "Programmato su Intervals" : saving === key ? "Programmo…" : "Programma su Intervals"}
          </button>
          {done[key] && <span className="text-xs text-muted">Lo trovi nel calendario; da lì puoi aprirlo sul Garmin o sul rullo.</span>}
        </div>
        {suggestion.alternatives.length > 0 && (
          <div className="mt-4 border-t pt-3" style={{ borderColor: "var(--border)" }}>
            <div className="text-xs text-faint">Oppure</div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {options.map((o, i) => (
                <button
                  key={o.workout.id}
                  type="button"
                  onClick={() => setChosen(i)}
                  className="rounded-full px-3 py-1 text-xs"
                  style={{ background: i === chosen ? "var(--accent-bg)" : "transparent", color: i === chosen ? "var(--accent-ink)" : "var(--foreground)", border: `1px solid ${i === chosen ? "var(--accent-ink)" : "var(--border)"}` }}
                >
                  {o.label}: {o.workout.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <section className="card p-4">
      {header}
      {!compact && <div className="mt-2 text-xs text-muted">
        {weekPlan ? (
          <>
            {PHASE_INFO[weekPlan.phase].label}: {PHASE_INFO[weekPlan.phase].focus}. Settimana {KIND_NAME[weekPlan.kind]}, TSS di riferimento {weekPlan.tssTarget}.{" "}
            <Link href="/stagione" className="underline">
              Piano
            </Link>
          </>
        ) : (
          <Link href="/stagione" className="underline">
            Imposta la stagione: picco di forma e ramp rate →
          </Link>
        )}
      </div>}
      {body}
      {error && (
        <p className="mt-3 text-xs" style={{ color: "var(--critical)" }} role="alert">
          {error}
        </p>
      )}
      {!compact && week.length > 0 && (
        <details className="mt-4 border-t pt-3" style={{ borderColor: "var(--border)" }}>
          <summary className="cursor-pointer text-xs text-muted">Proposta per la settimana</summary>
          <div className="mt-2 text-[11px] text-faint">Da domani si suppone la prontezza verde: si aggiorna ogni mattina con i dati veri.</div>
          <ul className="mt-2 divide-y" style={{ borderColor: "var(--border)" }}>
            {week.map(({ date, suggestion: s, planned: already }) => {
              return (
                <li key={date} className="flex items-center gap-3 py-2 text-sm" style={{ borderColor: "var(--border)" }}>
                  <span className="w-12 shrink-0 text-xs text-muted">{dayName(date)}</span>
                  <span className="min-w-0 flex-1">
                    {already ? (
                      <span className="text-muted">Già in programma: {already.name}</span>
                    ) : !s || s.kind === "rest" ? (
                      <span className="text-muted">Riposo</span>
                    ) : (
                      <>
                        <span className="font-medium">{s.main.workout.name}</span>
                        <span className="num block text-xs text-muted">
                          {s.main.label} · {s.main.mins} min · TSS {s.main.tss}
                        </span>
                      </>
                    )}
                  </span>
                  {!already && s?.kind === "workout" && date !== today && (
                    <button
                      type="button"
                      disabled={saving === `${date}:${s.main.workout.id}` || done[`${date}:${s.main.workout.id}`]}
                      onClick={() => void schedule(s.main, date)}
                      className="shrink-0 rounded-lg px-2.5 py-1 text-xs disabled:opacity-60"
                      style={{ border: "1px solid var(--border)" }}
                    >
                      {done[`${date}:${s.main.workout.id}`] ? "Fatto" : "Programma"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </section>
  );
}
