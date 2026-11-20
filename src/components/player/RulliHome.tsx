"use client";

// /rulli: the workouts of the coming days ready to ride, a short workout to try the trainer, and the sessions
// still on this device (not yet on Intervals.icu).
import { IconDownload, IconTrash, IconUpload } from "@tabler/icons-react";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { bluetoothProblem } from "@/lib/ble/devices";
import { type CalendarData, type CalendarWorkout, onTrainer } from "@/lib/calendar";
import { setCoachPrefill } from "@/lib/coach/chat/prefill";
import { openCoach } from "../nav/openCoach";
import type { WorkoutBlock } from "@/lib/workout";
import { addDays, toIsoDate } from "@/lib/dates";
import { DEMO_WORKOUT_ID } from "@/lib/player/load";
import { type Recording, summarize } from "@/lib/player/recording";
import { deleteRecording, listRecordings } from "@/lib/player/store";
import { downloadFit, retryStrava, uploadPending, uploadRecording } from "./upload";
import { useRefreshTick } from "../data/remote";
import { apiFetch } from "../data/transport";
import { fmt, fmtClock, fmtDuration, fmtWeekday } from "../format";
import { useCompact } from "@/lib/compact";
import { SectionHeading } from "../sections/SectionPage";
import { PedalaLink } from "./PedalaLink";

/** The workout drawn small: one bar per block, wide as its duration and tall as its zone. `onBrand` is for the terracotta card. */
function MiniProfile({ blocks, height, onBrand = false, className = "" }: { blocks: WorkoutBlock[]; height: number; onBrand?: boolean; className?: string }) {
  if (!blocks.length) return null;
  return (
    <div className={`flex items-end gap-px ${className}`} style={{ height }} aria-hidden>
      {blocks.map((b, i) => (
        <i
          key={i}
          className="block rounded-t-[2px]"
          style={{
            flex: `${Math.max(1, b.secs)} 1 0`,
            height: `${Math.round(18 + (Math.min(7, Math.max(1, b.zone)) / 7) * 82)}%`,
            background: onBrand ? `rgba(255,255,255,${0.45 + (Math.min(7, Math.max(1, b.zone)) / 7) * 0.55})` : `var(--z${Math.min(7, Math.max(1, b.zone))})`,
          }}
        />
      ))}
    </div>
  );
}

function WorkoutRow({ w, today }: { w: CalendarWorkout; today: string }) {
  return (
    <li className="flex items-center gap-3 py-3">
      <MiniProfile blocks={w.blocks} height={26} className="w-14 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{w.name}</div>
        <div className="num text-xs text-muted">
          {w.date === today ? "Oggi" : fmtWeekday(w.date)}
          {w.secs !== null && ` · ${fmtDuration(w.secs)}`}
          {w.tss !== null && ` · ${fmt(w.tss)} TSS`}
          {onTrainer(w) ? " · rulli" : ""}
        </div>
      </div>
      <PedalaLink id={w.id} label={w.name} />
    </li>
  );
}

function SessionRow({ r, onChange }: { r: Recording; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  // On Intervals.icu already: the row is here because Strava is missing.
  const onIntervals = r.status === "uploaded";
  const s = summarize(r.samples);
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
      {/* On phones the text takes the whole line and the buttons go below it, instead of squeezing it into a narrow column. */}
      <div className="min-w-0 grow basis-full sm:basis-0">
        <div className="truncate text-sm font-medium">{r.name}</div>
        <div className="num text-xs text-muted">
          {fmtWeekday(new Date(r.startedAt).toISOString())} · {fmtClock(s.secs)} · {fmt(s.avgPower, 0, " W")}
          {r.status === "recording" ? " · interrotta" : ""}
        </div>
        {r.error && r.status !== "uploaded" && <div className="text-xs" style={{ color: "var(--warning-ink)" }}>{r.error}</div>}
        {onIntervals && (
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="rounded-full px-2 py-0.5 text-[10.5px]" style={{ background: "var(--good-bg)", color: "var(--good-ink)" }}>✓ Intervals</span>
            <span className="rounded-full px-2 py-0.5 text-[10.5px]" style={{ background: "var(--warning-bg)", color: "var(--warning-ink)" }}>Strava da mandare</span>
            {r.strava?.error && <span className="text-[11px] text-muted">{r.strava.error}</span>}
          </div>
        )}
      </div>
      <button
        type="button"
        className="flex min-h-11 items-center gap-1.5 rounded-xl px-3.5 text-sm font-medium disabled:opacity-50"
        style={{ background: "var(--accent-bg)", color: "var(--accent-ink)" }}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          // Already on Intervals.icu: only Strava is missing.
          if (onIntervals) await retryStrava(r);
          else await uploadRecording({ ...r, status: "finished" });
          setBusy(false);
          onChange();
        }}
      >
        <IconUpload size={16} aria-hidden /> {busy ? (onIntervals ? "Mando…" : "Carico…") : onIntervals ? "Riprova" : "Carica"}
      </button>
      <button type="button" className="flex min-h-11 items-center gap-1.5 rounded-xl px-3.5 text-sm" style={{ background: "var(--neutral-bg)" }} onClick={() => downloadFit(r)} aria-label={`FIT: scarica il file di ${r.name}`}>
        <IconDownload size={16} aria-hidden /> FIT
      </button>
      <button
        type="button"
        aria-label={`Elimina la seduta ${r.name}`}
        className="flex h-11 w-11 items-center justify-center rounded-xl text-muted"
        onClick={async () => {
          await deleteRecording(r.id);
          onChange();
        }}
      >
        <IconTrash size={18} aria-hidden />
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
    // Still to send: not on Intervals.icu yet, or on Intervals.icu but not yet on Strava.
    void listRecordings().then((all) => setSessions(all.filter((r) => r.status !== "uploaded" || r.strava?.status === "error")));
  }, []);

  // «Aggiorna dati» (the symbol by the logo) reads the next days again; if that fails, what was on screen stays.
  const tick = useRefreshTick();
  useEffect(() => {
    if (!today) return;
    let alive = true;
    const failed = (error: string) => setCal((prev) => (prev && !("error" in prev) ? prev : { error }));
    apiFetch(`/api/calendar?from=${addDays(today, -1)}&to=${addDays(today, 7)}`)
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!alive) return;
        if (res.ok) setCal(json as CalendarData);
        else failed((json as { error?: string }).error ?? res.statusText);
      })
      .catch((e) => alive && failed(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [today, tick]);

  // Sessions left on the device: upload them now, and again when the connection comes back.
  useEffect(() => {
    const retry = () => void uploadPending().then(reloadSessions);
    retry();
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [reloadSessions]);

  const compact = useCompact();
  const [more, setMore] = useState(false);
  const workouts =
    today && cal && !("error" in cal) ? cal.workouts.filter((w) => w.date >= today && w.blocks.length > 0).sort((a, b) => a.date.localeCompare(b.date)) : [];

  const next = workouts[0];
  const rest = compact ? workouts.slice(1, 4) : workouts;
  /** The calendar was read and holds nothing to ride. */
  const empty = !!cal && !("error" in cal) && workouts.length === 0;
  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-4 py-4 sm:py-6">
      <SectionHeading id="rulli" />
      {problem && (
        <p className="max-w-2xl rounded-2xl px-4 py-3 text-sm" style={{ background: "var(--warning-bg)", color: "var(--warning-ink)" }}>
          {problem}
        </p>
      )}
      {/* Phone app: the next workout on the trainer, big, with the way to start it. */}
      {compact && next && (
        <section className="rounded-[20px] p-5" style={{ background: "var(--brand)", color: "var(--on-brand)" }} aria-label="Prossimo allenamento sui rulli">
          <div className="text-[11px] font-medium uppercase leading-none tracking-wider opacity-80">{next.date === today ? "Oggi" : fmtWeekday(next.date)}</div>
          <div className="mt-2 text-xl font-medium leading-tight">{next.name}</div>
          <div className="num mt-1 text-xs opacity-85">
            {[next.secs !== null ? fmtDuration(next.secs) : null, next.tss !== null ? `${fmt(next.tss)} TSS` : null, onTrainer(next) ? "rulli" : null].filter(Boolean).join(" · ")}
          </div>
          <MiniProfile blocks={next.blocks} height={44} onBrand className="mt-3" />
          <PedalaLink id={next.id} label={next.name} className="mt-4 !h-14 w-full !text-base" tone="onBrand" />
        </section>
      )}
      {/* Phone app: nothing to ride in the next days. The round «Pedala» of the bar lands here, so the page says what can be done. */}
      {compact && empty && (
        <section className="card p-5">
          <h2 className="text-base font-semibold">Niente da pedalare nei prossimi 7 giorni</h2>
          <p className="mt-1 text-sm text-muted">Chiedi una seduta al coach, per esempio «oggi sui rulli 60′ Z2», o prova il rullo con la seduta di 14 minuti.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => (setCoachPrefill("Oggi sui rulli "), openCoach())}
              className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold"
              style={{ background: "var(--brand)", color: "var(--on-brand)" }}
            >
              Chiedi al coach
            </button>
            <PedalaLink id={DEMO_WORKOUT_ID} text="Prova del rullo" />
          </div>
        </section>
      )}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {!(compact && empty) && <section className="card p-5">
          <h2 className="text-sm font-medium">{compact && next ? "Prossimi giorni" : "Allenamenti dei prossimi giorni"}</h2>
          {!cal ? (
            <p className="mt-2 text-sm text-muted">Carico il calendario…</p>
          ) : "error" in cal ? (
            <p className="mt-2 text-sm text-muted">{cal.error}</p>
          ) : workouts.length === 0 ? (
            <p className="mt-2 text-sm text-muted">Nessun allenamento strutturato nei prossimi 7 giorni su Intervals.icu.</p>
          ) : rest.length === 0 ? (
            <p className="mt-2 text-sm text-muted">Nient&apos;altro in programma nei prossimi giorni.</p>
          ) : (
            <ul className="mt-1 divide-y" style={{ borderColor: "var(--border)" }}>
              {rest.map((w) => (
                <WorkoutRow key={w.id} w={w} today={today ?? ""} />
              ))}
            </ul>
          )}
        </section>}
        <div className="space-y-4">
          {(!compact || more) && (<section className="card p-5">
            <h2 className="text-sm font-medium">Prova del rullo</h2>
            <p className="mt-1 text-sm text-muted">
              14 minuti per controllare rullo, fascia cardio, ERG e resistenza: riscaldamento, tre cambi di potenza da 1′ e defaticamento.
            </p>
            <PedalaLink id={DEMO_WORKOUT_ID} label="Prova del rullo" className="mt-3" />
          </section>)}
          <section className="card p-5">
            <h2 className="text-sm font-medium">Sedute su questo dispositivo</h2>
            {sessions.length === 0 ? (
              <p className="mt-1 text-sm text-muted">Tutte le sedute sono su Intervals.icu.</p>
            ) : (
              <>
                <p className="mt-1 text-sm text-muted">Non ancora su Intervals.icu, o non ancora su Strava: le mando appena c&apos;è la connessione.</p>
                <ul className="mt-1 divide-y" style={{ borderColor: "var(--border)" }}>
                  {sessions.map((r) => (
                    <SessionRow key={r.id} r={r} onChange={reloadSessions} />
                  ))}
                </ul>
              </>
            )}
          </section>
          {(!compact || more) && (<section className="card p-5 text-sm text-muted">
            <h2 className="text-sm font-medium text-[color:var(--foreground)]">Come funziona</h2>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              <li>Chrome o Edge su Windows o Android, con il Bluetooth acceso. Su iPhone non funziona.</li>
              <li>Chiudi le altre app che comandano il rullo (My E-Training, Zwift…): il rullo accetta un solo controllore.</li>
              <li>
                Rullo, fascia e pedali si collegano a mano nel player, a ogni seduta: l&apos;app non li ricorda e non si ricollega da sola. Se un
                collegamento cade, in alto compare «Ricollega».
              </li>
              <li>Il DFA α1 serve una fascia toracica che manda gli RR (es. Polar H10).</li>
              <li>
                Orologio Garmin come fascia: sull&apos;orologio attiva «Trasmetti frequenza cardiaca»; se nel player non compare, tocca «Mostra tutti
                i dispositivi». Dall&apos;orologio di solito arriva solo la FC, senza RR (niente DFA α1).
              </li>
              <li>La seduta parte quando pedali, va in pausa quando smetti e alla fine si carica su Intervals.icu.</li>
            </ul>
          </section>)}
          {compact && !more && (
            <button type="button" onClick={() => setMore(true)} aria-expanded={false} className="card min-h-12 w-full px-4 py-3 text-left text-sm text-muted">
              {empty ? "Istruzioni" : "Prova del rullo e istruzioni"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
