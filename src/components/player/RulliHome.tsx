"use client";

// /rulli: the workouts of the coming days ready to ride, a short workout to try the trainer, and the sessions
// still on this device (not yet on Intervals.icu).
import { IconDownload, IconTrash, IconUpload } from "@tabler/icons-react";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { bluetoothProblem } from "@/lib/ble/devices";
import type { CalendarData, CalendarWorkout } from "@/lib/calendar";
import { addDays, toIsoDate } from "@/lib/dates";
import { DEMO_WORKOUT_ID } from "@/lib/player/load";
import { type Recording, summarize } from "@/lib/player/recording";
import { deleteRecording, listRecordings } from "@/lib/player/store";
import { downloadFit, uploadPending, uploadRecording } from "./upload";
import { apiFetch } from "../data/transport";
import { fmt, fmtClock, fmtDuration, fmtWeekday } from "../format";
import { SectionHeading } from "../sections/SectionPage";
import { PedalaLink } from "./PedalaLink";

function WorkoutRow({ w, today }: { w: CalendarWorkout; today: string }) {
  return (
    <li className="flex items-center gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{w.name}</div>
        <div className="num text-xs text-muted">
          {w.date === today ? "Oggi" : fmtWeekday(w.date)}
          {w.secs !== null && ` · ${fmtDuration(w.secs)}`}
          {w.tss !== null && ` · ${fmt(w.tss)} TSS`}
          {w.type === "VirtualRide" ? " · rulli" : ""}
        </div>
      </div>
      <PedalaLink id={w.id} />
    </li>
  );
}

function SessionRow({ r, onChange }: { r: Recording; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const s = summarize(r.samples);
  return (
    <li className="flex flex-wrap items-center gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{r.name}</div>
        <div className="num text-xs text-muted">
          {fmtWeekday(new Date(r.startedAt).toISOString())} · {fmtClock(s.secs)} · {fmt(s.avgPower, 0, " W")}
          {r.status === "recording" ? " · interrotta" : ""}
        </div>
        {r.error && <div className="text-xs" style={{ color: "var(--warning)" }}>{r.error}</div>}
      </div>
      <button
        className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium disabled:opacity-50"
        style={{ background: "var(--accent-bg)", color: "var(--accent-ink)" }}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await uploadRecording({ ...r, status: "finished" });
          setBusy(false);
          onChange();
        }}
      >
        <IconUpload size={14} /> {busy ? "Carico…" : "Carica"}
      </button>
      <button className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs" style={{ background: "var(--neutral-bg)" }} onClick={() => downloadFit(r)}>
        <IconDownload size={14} /> FIT
      </button>
      <button
        aria-label="Elimina la seduta"
        className="rounded-lg p-1.5 text-muted"
        onClick={async () => {
          await deleteRecording(r.id);
          onChange();
        }}
      >
        <IconTrash size={15} />
      </button>
    </li>
  );
}

const noSubscribe = () => () => {};

export default function RulliHome() {
  // Read on the client only: the page is prerendered without a date or a browser.
  const today = useSyncExternalStore(noSubscribe, () => toIsoDate(new Date()), () => null);
  const [cal, setCal] = useState<CalendarData | { error: string } | null>(null);
  const [sessions, setSessions] = useState<Recording[]>([]);
  const problem = useSyncExternalStore(noSubscribe, bluetoothProblem, () => null);

  const reloadSessions = useCallback(() => {
    void listRecordings().then((all) => setSessions(all.filter((r) => r.status !== "uploaded")));
  }, []);

  useEffect(() => {
    if (!today) return;
    let alive = true;
    apiFetch(`/api/calendar?from=${addDays(today, -1)}&to=${addDays(today, 7)}`)
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (alive) setCal(res.ok ? (json as CalendarData) : { error: (json as { error?: string }).error ?? res.statusText });
      })
      .catch((e) => alive && setCal({ error: e instanceof Error ? e.message : String(e) }));
    return () => {
      alive = false;
    };
  }, [today]);

  // Sessions left on the device: upload them now, and again when the connection comes back.
  useEffect(() => {
    const retry = () => void uploadPending().then(reloadSessions);
    retry();
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [reloadSessions]);

  const workouts =
    today && cal && !("error" in cal) ? cal.workouts.filter((w) => w.date >= today && w.blocks.length > 0).sort((a, b) => a.date.localeCompare(b.date)) : [];

  return (
    <main className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6">
      <SectionHeading id="rulli" />
      {problem && (
        <p className="max-w-2xl rounded-2xl px-4 py-3 text-sm" style={{ background: "var(--warning-bg)", color: "var(--warning-ink)" }}>
          {problem}
        </p>
      )}
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="text-sm font-medium">Allenamenti dei prossimi giorni</h2>
          {!cal ? (
            <p className="mt-2 text-sm text-muted">Carico il calendario…</p>
          ) : "error" in cal ? (
            <p className="mt-2 text-sm text-muted">{cal.error}</p>
          ) : workouts.length === 0 ? (
            <p className="mt-2 text-sm text-muted">Nessun allenamento strutturato nei prossimi 7 giorni su Intervals.icu.</p>
          ) : (
            <ul className="mt-1 divide-y" style={{ borderColor: "var(--border)" }}>
              {workouts.map((w) => (
                <WorkoutRow key={w.id} w={w} today={today ?? ""} />
              ))}
            </ul>
          )}
        </section>
        <div className="space-y-5">
          <section className="card p-5">
            <h2 className="text-sm font-medium">Prova del rullo</h2>
            <p className="mt-1 text-sm text-muted">
              14 minuti per controllare rullo, fascia cardio, ERG e resistenza: riscaldamento, tre cambi di potenza da 1′ e defaticamento.
            </p>
            <PedalaLink id={DEMO_WORKOUT_ID} className="mt-3" />
          </section>
          <section className="card p-5">
            <h2 className="text-sm font-medium">Sedute su questo dispositivo</h2>
            {sessions.length === 0 ? (
              <p className="mt-1 text-sm text-muted">Tutte le sedute sono su Intervals.icu.</p>
            ) : (
              <>
                <p className="mt-1 text-sm text-muted">Non ancora su Intervals.icu: le carico appena c&apos;è la connessione.</p>
                <ul className="mt-1 divide-y" style={{ borderColor: "var(--border)" }}>
                  {sessions.map((r) => (
                    <SessionRow key={r.id} r={r} onChange={reloadSessions} />
                  ))}
                </ul>
              </>
            )}
          </section>
          <section className="card p-5 text-sm text-muted">
            <h2 className="text-sm font-medium text-[color:var(--foreground)]">Come funziona</h2>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              <li>Chrome o Edge su Windows o Android, con il Bluetooth acceso. Su iPhone non funziona.</li>
              <li>Chiudi le altre app che comandano il rullo (My E-Training, Zwift…): il rullo accetta un solo controllore.</li>
              <li>Il DFA α1 serve una fascia toracica che manda gli RR (es. Polar H10).</li>
              <li>La seduta parte quando pedali, va in pausa quando smetti e alla fine si carica su Intervals.icu.</li>
            </ul>
          </section>
        </div>
      </div>
    </main>
  );
}
