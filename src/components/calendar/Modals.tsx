"use client";

import { IconCalendarEvent, IconMap, IconPlus, IconTrash } from "@tabler/icons-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { LibraryData } from "@/lib/api/handlers";
import { isTestName } from "@/lib/activities";
import type { CalendarActivity, CalendarWorkout } from "@/lib/calendar";
import { forgetRide, prefetchRide } from "../data/rides";
import { fmt, fmtDuration } from "../format";
import { CATEGORY_STYLE, CoachBadge, dayLabel, Description, Modal, SectionTitle, send, tint, WorkoutProfile } from "./shared";
import { apiFetch } from "../data/transport";

export type NightLevel = "verde" | "giallo" | "rosso";
export type Night = { level: NightLevel; hrv: number | null; rhr: number | null; sleepHours: number | null; sleepScore: number | null };

export const NIGHT_COLOR: Record<NightLevel, string> = { verde: "var(--good)", giallo: "var(--warning)", rosso: "var(--critical)" };
const NIGHT_TEXT: Record<NightLevel, string> = {
  verde: "Notte nella norma",
  giallo: "HRV bassa o FC a riposo alta",
  rosso: "Notte anomala: HRV giù e FC su insieme",
};

function ErrorLine({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p className="mt-3 rounded-xl px-3 py-2 text-xs" style={{ background: "var(--critical-bg)", color: "var(--critical)" }}>
      {error}
    </p>
  );
}

// ── Planned workout ─────────────────────────────────────────────────────────────────────────────────

export function WorkoutModal({ w, onClose, onChanged }: { w: CalendarWorkout; onClose: () => void; onChanged: () => void }) {
  const [moveTo, setMoveTo] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (url: string, method: "PATCH" | "DELETE", body?: unknown) => {
    setBusy(true);
    const err = await send(url, method, body);
    setBusy(false);
    if (err) setError(err);
    else onChanged();
  };

  return (
    <Modal title={w.name} subtitle={`Pianificato · ${dayLabel(w.date)}`} onClose={onClose}>
      <div className="num mt-2 flex gap-3 text-xs text-muted">
        {w.secs !== null && <span>{fmtDuration(w.secs)}</span>}
        {w.tss !== null && <span>{fmt(w.tss)} TSS</span>}
        {w.type && <span>{w.type === "Ride" ? "Bici" : w.type === "VirtualRide" ? "Rulli" : w.type}</span>}
        <CoachBadge mark={w.coach} />
      </div>

      {w.blocks.length > 0 && (
        <>
          <SectionTitle>Profilo</SectionTitle>
          <WorkoutProfile blocks={w.blocks} />
        </>
      )}

      <SectionTitle>Descrizione</SectionTitle>
      {w.description ? <Description text={w.description} /> : <p className="text-sm text-muted">Nessuna descrizione su Intervals.icu.</p>}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {moveTo === null ? (
          <button className="card flex items-center gap-1.5 px-3 py-1.5 text-xs" onClick={() => setMoveTo(w.date)} disabled={busy}>
            <IconCalendarEvent size={15} /> Sposta
          </button>
        ) : (
          <>
            <input
              type="date"
              value={moveTo}
              onChange={(e) => setMoveTo(e.target.value)}
              className="rounded-lg px-2 py-1 text-xs"
              style={{ background: "var(--background)", border: "1px solid var(--border)" }}
              aria-label="Nuovo giorno"
            />
            <button
              className="rounded-lg px-3 py-1.5 text-xs font-medium"
              style={{ background: "var(--accent-bg)", color: "var(--accent-ink)" }}
              disabled={busy || !moveTo || moveTo === w.date}
              onClick={() => run(`/api/calendar/events/${w.id}`, "PATCH", { date: moveTo })}
            >
              {busy ? "Sposto…" : "Conferma"}
            </button>
            <button className="text-xs text-muted" onClick={() => setMoveTo(null)}>
              Annulla
            </button>
          </>
        )}
        <span className="flex-1" />
        {confirmDelete ? (
          <>
            <span className="text-xs text-muted">Eliminarlo da Intervals.icu e dal Garmin?</span>
            <button
              className="rounded-lg px-3 py-1.5 text-xs font-medium"
              style={{ background: "var(--critical-bg)", color: "var(--critical)" }}
              disabled={busy}
              onClick={() => run(`/api/calendar/events/${w.id}`, "DELETE")}
            >
              {busy ? "Elimino…" : "Elimina"}
            </button>
            <button className="text-xs text-muted" onClick={() => setConfirmDelete(false)}>
              No
            </button>
          </>
        ) : (
          <button className="flex items-center gap-1.5 px-2 py-1.5 text-xs" style={{ color: "var(--critical)" }} onClick={() => setConfirmDelete(true)} disabled={busy}>
            <IconTrash size={15} /> Elimina
          </button>
        )}
      </div>
      <ErrorLine error={error} />
    </Modal>
  );
}

// ── Activity done ───────────────────────────────────────────────────────────────────────────────────

const BORG: Record<number, string> = {
  1: "Molto facile",
  2: "Facile",
  3: "Moderato",
  4: "Un po' duro",
  5: "Duro",
  6: "Duro",
  7: "Molto duro",
  8: "Molto duro",
  9: "Quasi massimale",
  10: "Massimale",
};

const BIKE_TYPES = [
  { id: "Ride", label: "Strada" },
  { id: "VirtualRide", label: "Rulli" },
  { id: "GravelRide", label: "Gravel" },
  { id: "MountainBikeRide", label: "MTB" },
];

export function ActivityModal({ a, onClose, onChanged }: { a: CalendarActivity; onClose: () => void; onChanged: () => void }) {
  const [name, setName] = useState(a.name);
  const [type, setType] = useState(a.type ?? "");
  const [rpe, setRpe] = useState<number | null>(a.rpe);
  const [description, setDescription] = useState(a.description ?? "");
  const [markTest, setMarkTest] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const style = CATEGORY_STYLE[a.category];
  const isBike = BIKE_TYPES.some((t) => t.id === a.type);
  const alreadyTest = isTestName(name);

  // Start downloading the ride detail now: by the time the button is pressed it is usually ready.
  useEffect(() => {
    if (a.category !== "nascosta") prefetchRide(a.id);
  }, [a.id, a.category]);

  const save = async () => {
    const finalName = markTest && !alreadyTest ? `${name.trim()} · TEST` : name.trim();
    const body: Record<string, unknown> = {};
    if (finalName && finalName !== a.name) body.name = finalName;
    if (isBike && type !== a.type) body.type = type;
    if (rpe !== a.rpe) body.rpe = rpe;
    if ((description.trim() || null) !== a.description) body.description = description.trim() || null;
    if (!Object.keys(body).length) return onClose();
    setBusy(true);
    const err = await send(`/api/activity/${a.id}`, "PATCH", body);
    setBusy(false);
    if (err) setError(err);
    else {
      forgetRide(a.id);
      onChanged();
    }
  };

  return (
    <Modal
      subtitle={`${style.label} · ${dayLabel(a.date)}`}
      title={
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded-lg px-2 py-1.5 text-base font-medium"
          style={{ background: "var(--background)", border: "1px solid var(--border)" }}
          aria-label="Nome dell'uscita"
        />
      }
      onClose={onClose}
    >
      <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5">
        {[
          ["Durata", fmtDuration(a.secs), null],
          ["Distanza", fmt(a.km, 1, " km"), null],
          ["TSS", fmt(a.tss), null],
          ["Watt medi", fmt(a.avgWatts, 0, " W"), "var(--fitness)"],
          ["FC media", fmt(a.avgHr, 0, " bpm"), "var(--rhr)"],
        ].map(([label, value, dot]) => (
          <div key={label} className="rounded-xl px-3 py-2" style={{ background: tint(style.color, 14) }}>
            <div className="flex items-center gap-1 text-[11px] text-muted">
              {dot && <span className="h-1.5 w-1.5 rounded-full" style={{ background: dot }} />}
              {label}
            </div>
            <div className="num text-base font-medium">{value}</div>
          </div>
        ))}
      </div>

      {/* Strava-only imports can't be read through the API: no detail page for them. */}
      {a.category !== "nascosta" && (
        <Link
          href={`/attivita/${a.id}`}
          onClick={onClose}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium transition-opacity hover:opacity-90"
          style={{ background: "var(--fitness-ink)", color: "var(--surface)" }}
        >
          <IconMap size={20} /> {a.category === "altro" ? "Apri il dettaglio" : "Apri il dettaglio con mappa e grafici"}
        </Link>
      )}

      <SectionTitle>
        Fatica percepita (RPE, scala di Borg CR-10){" "}
        <span className="font-normal text-muted">{rpe ? `· ${rpe} ${BORG[rpe]}` : "· non indicata"}</span>
      </SectionTitle>
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((r) => (
          <button
            key={r}
            onClick={() => setRpe(rpe === r ? null : r)}
            className="num h-8 w-8 rounded-lg text-sm"
            style={{
              background: rpe === r ? "var(--accent-bg)" : "var(--background)",
              color: rpe === r ? "var(--accent-ink)" : "var(--foreground)",
              border: `1px solid ${rpe === r ? "var(--accent-ink)" : "var(--border)"}`,
            }}
            aria-pressed={rpe === r}
          >
            {r}
          </button>
        ))}
      </div>
      {rpe && a.secs > 0 && (
        <p className="mt-1.5 text-[11px] text-faint">
          Carico percepito (sRPE, Foster): {rpe} × {Math.round(a.secs / 60)} min = {fmt(rpe * Math.round(a.secs / 60))}
        </p>
      )}

      <SectionTitle>Descrizione</SectionTitle>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={3}
        placeholder="Come è andata: sensazioni, meteo, gambe…"
        className="w-full rounded-xl px-3 py-2 text-sm"
        style={{ background: "var(--background)", border: "1px solid var(--border)" }}
      />

      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs">
        {isBike && (
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="rounded-lg px-2 py-1.5"
            style={{ background: "var(--background)", border: "1px solid var(--border)" }}
            aria-label="Tipo di uscita"
          >
            {BIKE_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        )}
        {alreadyTest ? (
          <span className="rounded-full px-2 py-0.5" style={{ background: "var(--accent-bg)", color: "var(--accent-ink)" }}>
            Riconosciuta come TEST
          </span>
        ) : (
          <label className="flex items-center gap-1.5 text-muted">
            <input type="checkbox" checked={markTest} onChange={(e) => setMarkTest(e.target.checked)} /> È un TEST
          </label>
        )}
        <span className="flex-1" />
        <button
          className="rounded-lg px-4 py-1.5 font-medium"
          style={{ background: "var(--accent-bg)", color: "var(--accent-ink)" }}
          onClick={save}
          disabled={busy}
        >
          {busy ? "Salvo…" : "Salva"}
        </button>
      </div>
      <ErrorLine error={error} />
    </Modal>
  );
}

// ── Day ─────────────────────────────────────────────────────────────────────────────────────────────

// The library rarely changes: load it once per visit.
let libraryCache: Promise<LibraryData | { error: string }> | null = null;
function loadLibrary(ftp: number | null) {
  libraryCache ??= apiFetch(`/api/library${ftp ? `?ftp=${ftp}` : ""}`)
    .then(async (r) => {
      const json = await r.json();
      return r.ok ? (json as LibraryData) : { error: json.error ?? r.statusText };
    })
    .catch((e: unknown) => ({ error: e instanceof Error ? e.message : String(e) }))
    .then((res) => {
      // Don't keep a failure: the next pop-up tries again.
      if ("error" in res) libraryCache = null;
      return res;
    });
  return libraryCache;
}

export function DayModal({
  date,
  night,
  activities,
  workouts,
  ftp,
  onOpenActivity,
  onOpenWorkout,
  onClose,
  onChanged,
}: {
  date: string;
  night: Night | null;
  activities: CalendarActivity[];
  workouts: CalendarWorkout[];
  ftp: number | null;
  onOpenActivity: (a: CalendarActivity) => void;
  onOpenWorkout: (w: CalendarWorkout) => void;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [library, setLibrary] = useState<LibraryData | { error: string } | null>(null);
  const [pick, setPick] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadLibrary(ftp).then((l) => alive && setLibrary(l));
    return () => {
      alive = false;
    };
  }, [ftp]);

  const folders = library && "folders" in library ? library.folders : [];
  const chosen = folders.flatMap((f) => f.workouts).find((w) => w.id === pick) ?? null;

  const add = async () => {
    if (pick === null) return;
    setBusy(true);
    const err = await send("/api/calendar/events", "POST", { workoutId: pick, date });
    setBusy(false);
    if (err) setError(err);
    else onChanged();
  };

  return (
    <Modal title={dayLabel(date)} onClose={onClose}>
      {night && (
        <>
          <SectionTitle>Notte</SectionTitle>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: NIGHT_COLOR[night.level] }} />
              {NIGHT_TEXT[night.level]}
            </span>
            <span>HRV {fmt(night.hrv, 0, " ms")}</span>
            <span>FC a riposo {fmt(night.rhr, 0, " bpm")}</span>
            <span>
              Sonno {night.sleepHours !== null ? fmtDuration(night.sleepHours * 3600) : "–"}
              {night.sleepScore !== null && ` · punteggio ${fmt(night.sleepScore)}`}
            </span>
          </div>
        </>
      )}

      {(activities.length > 0 || workouts.length > 0) && (
        <>
          <SectionTitle>Nel calendario</SectionTitle>
          <ul className="space-y-1.5">
            {activities.map((a) => (
              <li key={a.id}>
                <button
                  className="w-full rounded-lg px-3 py-2 text-left text-sm"
                  style={{ background: tint(CATEGORY_STYLE[a.category].color, 16), color: CATEGORY_STYLE[a.category].ink }}
                  onClick={() => onOpenActivity(a)}
                >
                  <span className="font-medium">{a.name}</span>
                  <span className="num ml-2 text-xs opacity-80">
                    {fmtDuration(a.secs)}
                    {a.tss !== null && ` · ${fmt(a.tss)} TSS`}
                  </span>
                </button>
              </li>
            ))}
            {workouts.map((w) => (
              <li key={w.id}>
                <button className="w-full rounded-lg px-3 py-2 text-left text-sm text-muted" style={{ border: "1px dashed var(--faint)" }} onClick={() => onOpenWorkout(w)}>
                  <span className="font-medium text-foreground">{w.name}</span>
                  <span className="num ml-2 text-xs">
                    {w.secs !== null && fmtDuration(w.secs)}
                    {w.tss !== null && ` · ${fmt(w.tss)} TSS`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <SectionTitle>Aggiungi allenamento dalla libreria Intervals.icu</SectionTitle>
      {!library ? (
        <p className="text-sm text-muted">Carico la libreria…</p>
      ) : "error" in library ? (
        <ErrorLine error={library.error} />
      ) : (
        <>
          <select
            value={pick ?? ""}
            onChange={(e) => setPick(e.target.value ? Number(e.target.value) : null)}
            className="w-full rounded-xl px-3 py-2 text-sm"
            style={{ background: "var(--background)", border: "1px solid var(--border)" }}
            aria-label="Allenamento dalla libreria"
          >
            <option value="">Scegli un allenamento…</option>
            {folders.map((f) => (
              <optgroup key={f.id ?? "none"} label={`${f.name} (${f.workouts.length})`}>
                {f.workouts.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                    {w.secs !== null ? ` · ${fmtDuration(w.secs)}` : ""}
                    {w.tss !== null ? ` · ${fmt(w.tss)} TSS` : ""}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {chosen && (
            <div className="mt-3 space-y-3">
              {chosen.blocks.length > 0 && <WorkoutProfile blocks={chosen.blocks} height={52} />}
              {chosen.description && <Description text={chosen.description} />}
            </div>
          )}
          <button
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-medium disabled:opacity-50"
            style={{ background: "var(--accent-bg)", color: "var(--accent-ink)" }}
            disabled={pick === null || busy}
            onClick={add}
          >
            <IconPlus size={16} /> {busy ? "Aggiungo…" : "Metti in questo giorno"}
          </button>
        </>
      )}
      <ErrorLine error={error} />
    </Modal>
  );
}
