"use client";

// /rulli: the workouts of the coming days ready to ride, a short workout to try the trainer, and the sessions
// still on this device (not yet on Intervals.icu).
import { IconDownload, IconTrash, IconUpload } from "@tabler/icons-react";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { bluetoothProblem, type DeviceKind, lastChoice, rememberedDevice } from "@/lib/ble/devices";
import type { CalendarData, CalendarWorkout } from "@/lib/calendar";
import type { WorkoutBlock } from "@/lib/workout";
import { addDays, toIsoDate } from "@/lib/dates";
import { DEMO_WORKOUT_ID } from "@/lib/player/load";
import { type Recording, summarize } from "@/lib/player/recording";
import { deleteRecording, listRecordings } from "@/lib/player/store";
import { downloadFit, uploadPending, uploadRecording } from "./upload";
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

const SENSORS: { kind: DeviceKind; label: string }[] = [
  { kind: "trainer", label: "Rullo" },
  { kind: "hr", label: "Fascia" },
  { kind: "power", label: "Pedali" },
];

/** The devices of the last ride (they connect from the player): a dot for the ones the app remembers. */
function SensorsCard() {
  const [known, setKnown] = useState<Record<DeviceKind, string | null> | null>(null);
  useEffect(() => {
    let alive = true;
    void Promise.all(SENSORS.map(async ({ kind }) => [kind, (await rememberedDevice(kind))?.name ?? lastChoice(kind)?.name ?? null] as const)).then((all) => {
      if (alive) setKnown(Object.fromEntries(all) as Record<DeviceKind, string | null>);
    });
    return () => {
      alive = false;
    };
  }, []);
  return (
    <section className="card px-4 py-3" aria-label="Sensori">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium">Sensori</h2>
        <span className="text-[11px] text-muted">dall&apos;ultima volta · si collegano dal player</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {SENSORS.map(({ kind, label }) => {
          const name = known?.[kind] ?? null;
          return (
            <span key={kind} className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs" style={{ border: "1px solid var(--border)", color: name ? "var(--foreground)" : "var(--muted)" }}>
              <span className="h-2 w-2 rounded-full" style={{ background: name ? "var(--good)" : "var(--faint)" }} aria-hidden />
              {label}
              {name ? ` · ${name}` : " · nessuno"}
            </span>
          );
        })}
      </div>
    </section>
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

  const compact = useCompact();
  const [more, setMore] = useState(false);
  const workouts =
    today && cal && !("error" in cal) ? cal.workouts.filter((w) => w.date >= today && w.blocks.length > 0).sort((a, b) => a.date.localeCompare(b.date)) : [];

  const next = workouts[0];
  const rest = compact ? workouts.slice(1, 4) : workouts;
  return (
    <main className="mx-auto w-full max-w-6xl space-y-4 px-4 py-4 sm:py-6">
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
            {[next.secs !== null ? fmtDuration(next.secs) : null, next.tss !== null ? `${fmt(next.tss)} TSS` : null, next.type === "VirtualRide" ? "rulli" : null].filter(Boolean).join(" · ")}
          </div>
          <MiniProfile blocks={next.blocks} height={44} onBrand className="mt-3" />
          <PedalaLink id={next.id} className="mt-4 !h-11 w-full !text-sm" tone="onBrand" />
        </section>
      )}
      {compact && !problem && <SensorsCard />}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="card p-5">
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
        </section>
        <div className="space-y-4">
          {(!compact || more) && (<section className="card p-5">
            <h2 className="text-sm font-medium">Prova del rullo</h2>
            <p className="mt-1 text-sm text-muted">
              14 minuti per controllare rullo, fascia cardio, ERG e resistenza: riscaldamento, tre cambi di potenza da 1′ e defaticamento.
            </p>
            <PedalaLink id={DEMO_WORKOUT_ID} className="mt-3" />
          </section>)}
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
          {(!compact || more) && (<section className="card p-5 text-sm text-muted">
            <h2 className="text-sm font-medium text-[color:var(--foreground)]">Come funziona</h2>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              <li>Chrome o Edge su Windows o Android, con il Bluetooth acceso. Su iPhone non funziona.</li>
              <li>Chiudi le altre app che comandano il rullo (My E-Training, Zwift…): il rullo accetta un solo controllore.</li>
              <li>Il DFA α1 serve una fascia toracica che manda gli RR (es. Polar H10).</li>
              <li>
                Orologio Garmin come fascia: sull&apos;orologio attiva «Trasmetti frequenza cardiaca»; se nel player non compare, tocca «Mostra tutti
                i dispositivi». Dall&apos;orologio di solito arriva solo la FC, senza RR (niente DFA α1).
              </li>
              <li>La seduta parte quando pedali, va in pausa quando smetti e alla fine si carica su Intervals.icu.</li>
            </ul>
          </section>)}
          {compact && !more && (
            <button type="button" onClick={() => setMore(true)} className="card w-full px-4 py-3 text-left text-sm text-muted">
              Prova del rullo e istruzioni
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
