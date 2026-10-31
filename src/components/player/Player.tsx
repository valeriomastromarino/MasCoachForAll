"use client";

// The trainer player screen (design approved in docs/player-rulli.md §5). Phone: metrics, profile, DFA α1,
// notes and devices in one column; on computers two columns. Mode selector and controls stay at the bottom.
import {
  IconActivityHeartbeat,
  IconBolt,
  IconHeart,
  IconMinus,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlayerSkipBack,
  IconPlayerSkipForward,
  IconPlus,
  IconRefresh,
  IconTarget,
  IconVolume,
  IconVolumeOff,
  IconX,
} from "@tabler/icons-react";
import { useMemo, useState } from "react";
import Link from "next/link";
import { bluetoothProblem, type DeviceKind } from "@/lib/ble/devices";
import { DFA_VT1, DFA_VT2, dfaZone } from "@/lib/physio/dfa";
import { workoutNotes } from "@/lib/player/notes";
import { summarize } from "@/lib/player/recording";
import { stepRemaining } from "@/lib/player/session";
import type { PlayerStep, PlayerWorkout } from "@/lib/player/timeline";
import { downloadFit } from "./upload";
import { IconTrainer } from "../brand/TrainerIcon";
import { fmt, fmtClock } from "../format";
import type { DeviceView, PlayerEngine, PlayerView } from "./engine";
import { usePlayer } from "./usePlayer";

const card = "rounded-2xl";
const cardStyle = { background: "var(--surface)", boxShadow: "var(--card-shadow)" };

function shortDuration(secs: number): string {
  if (secs < 60) return `${secs}s`;
  if (secs % 60 === 0 && secs < 3600) return `${secs / 60}min`;
  if (secs < 3600) return `${Math.floor(secs / 60)}min ${secs % 60}s`;
  return `${Math.floor(secs / 3600)}h${secs % 3600 ? String(Math.round((secs % 3600) / 60)).padStart(2, "0") : ""}`;
}

function stepText(s: PlayerStep): string {
  return `${shortDuration(s.secs)} @ ${s.ramp ? `${s.from}→${s.to}` : s.from}W`;
}

// ── Pieces ──────────────────────────────────────────────────────────────────────────────────────────

function Metric({ icon, color, label, value, unit, sub, right = false, bottom = false }: {
  icon: React.ReactNode; color: string; label: string; value: string; unit: string; sub?: string | null; right?: boolean; bottom?: boolean;
}) {
  return (
    <div className="min-w-0 px-4 py-3" style={{ borderColor: "var(--border)", borderStyle: "solid", borderWidth: 0, borderRightWidth: right ? 1 : 0, borderBottomWidth: bottom ? 1 : 0 }}>
      <div className="flex items-center gap-1.5 text-xs text-muted">
        <span style={{ color }} aria-hidden>{icon}</span>
        {label}
      </div>
      <div className="num mt-1.5 flex items-baseline gap-1">
        <span className="text-4xl font-medium leading-none lg:text-5xl">{value}</span>
        <span className="text-sm text-muted">{unit}</span>
      </div>
      <div className="num mt-1 h-4 truncate text-xs text-muted">{sub ?? ""}</div>
    </div>
  );
}

function Metrics({ view, step }: { view: PlayerView; step: PlayerStep | undefined }) {
  const s = view.session;
  const resistance = s.mode === "resistance";
  const cad = step?.cadence;
  return (
    <section className={`${card} grid grid-cols-2 overflow-hidden`} style={{ ...cardStyle, gridArea: "metrics" }} aria-label="Metriche">
      <Metric right bottom icon={<IconBolt size={15} />} color="var(--fatigue-ink)" label="Potenza"
        value={fmt(view.power)} unit="W" sub={view.devices.power.status === "connected" ? (view.match ? `dai pedali · corr. ${fmt(view.match, 2)}` : "dai pedali") : null} />
      <Metric bottom icon={<IconTarget size={15} />} color="var(--good)" label={resistance ? "Livello" : "Obiettivo"}
        value={resistance ? String(s.level) : fmt(view.target)} unit={resistance ? `/ ${view.levels.length - 1}` : "W"}
        sub={!resistance && s.offset ? `${s.offset > 0 ? "+" : ""}${s.offset} W su questo step` : resistance ? "resistenza" : null} />
      <Metric right icon={<IconHeart size={15} />} color="var(--rhr-ink)" label="FC" value={fmt(view.hr)} unit="bpm" />
      <Metric icon={<IconRefresh size={15} />} color="var(--fitness-ink)" label="Cadenza" value={fmt(view.cadence)} unit="rpm"
        sub={cad ? `obiettivo ${cad.lo === cad.hi ? cad.lo : `${cad.lo}–${cad.hi}`}` : null} />
    </section>
  );
}

function statusLabel(view: PlayerView): string | null {
  const s = view.session;
  if (s.status === "ready") return "Inizia a pedalare per partire";
  if (s.status === "paused") return "In pausa";
  if (s.autoPaused) return "In pausa: riprendi a pedalare";
  if (s.status === "done") return "Allenamento finito";
  return null;
}

function Profile({ workout, view }: { workout: PlayerWorkout; view: PlayerView }) {
  const s = view.session;
  const steps = workout.steps;
  const total = Math.max(1, workout.totalSecs);
  const maxW = Math.max(workout.ftp * 1.2, ...steps.map((x) => Math.max(x.from, x.to))) * 1.08;
  const H = 120;
  const X = (sec: number) => (sec / total) * 1000;
  const Y = (w: number) => H - (Math.min(w, maxW) / maxW) * H;
  const next = steps[s.stepIndex + 1];
  const label = statusLabel(view);
  const trace = view.trace.map((p) => `${X(p.pos).toFixed(1)},${Y(p.w).toFixed(1)}`).join(" ");
  return (
    <section className={`${card} p-4`} style={{ ...cardStyle, gridArea: "profile" }} aria-label="Profilo dell'allenamento">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs text-muted">Tempo rimanente</div>
          <div className="num text-3xl font-medium">{fmtClock(Math.ceil(stepRemaining(s, steps)))}</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted">Prossimo</div>
          <div className="num text-base text-muted">{next ? stepText(next) : "Fine"}</div>
        </div>
      </div>
      {steps[s.stepIndex]?.label && <div className="mt-1 text-xs text-muted">{steps[s.stepIndex].label}</div>}
      <svg viewBox={`0 0 1000 ${H}`} preserveAspectRatio="none" className="mt-3 block h-28 w-full lg:h-44" role="img" aria-label="Profilo con la potenza pedalata">
        {steps.map((st) => {
          const x0 = X(st.start);
          const x1 = X(st.start + st.secs);
          const done = st.start + st.secs <= s.pos;
          return (
            <polygon
              key={st.index}
              points={`${x0},${H} ${x0},${Y(st.from)} ${x1},${Y(st.to)} ${x1},${H}`}
              fill={`var(--z${st.zone})`}
              opacity={done ? 0.45 : 0.9}
              stroke="var(--surface)"
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
        {trace && <polyline points={trace} fill="none" stroke="var(--foreground)" strokeWidth={1.6} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />}
        <line x1={X(s.pos)} x2={X(s.pos)} y1={0} y2={H} stroke="var(--foreground)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="num mt-1 flex justify-between text-xs text-muted">
        <span>{fmtClock(s.pos)}</span>
        {label && <span className="font-medium" style={{ color: "var(--accent-ink)" }}>{label}</span>}
        <span>−{fmtClock(Math.max(0, total - s.pos))}</span>
      </div>
    </section>
  );
}

function DfaCard({ view }: { view: PlayerView }) {
  const d = view.dfa;
  const hr = view.devices.hr;
  let message: string | null = null;
  if (hr.status !== "connected") message = "Collega una fascia cardio per vedere il DFA α1.";
  else if (hr.detail === "solo FC") message = "La fascia non manda gli intervalli RR: DFA non disponibile.";
  else if (!d || d.warmingUp) message = `In calcolo: ${fmtClock(Math.round(d?.coveredSecs ?? 0))} di 2:00 di battiti.`;
  const a = d?.alpha1 ?? null;
  // Scale 0.3–1.3, VT2 and VT1 marked.
  const pct = (x: number) => Math.min(100, Math.max(0, ((x - 0.3) / 1.0) * 100));
  const hist = view.dfaHistory;
  const HX = 300;
  const HY = 60;
  const yA = (x: number) => HY - (Math.min(1.4, Math.max(0.2, x)) - 0.2) / 1.2 * HY;
  return (
    <section className={`${card} p-4`} style={{ ...cardStyle, gridArea: "dfa" }} aria-label="DFA alfa 1">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-xs text-muted">
            <IconActivityHeartbeat size={15} style={{ color: "var(--hrv-ink)" }} aria-hidden /> DFA α1
          </div>
          {a !== null && !message ? (
            <div className="mt-1 flex items-baseline gap-2">
              <span className="num text-3xl font-medium" style={{ color: "var(--hrv-ink)" }}>{fmt(a, 2)}</span>
              <span className="text-sm text-muted">{dfaZone(a)}</span>
            </div>
          ) : (
            <p className="mt-1 text-sm text-muted">{message}</p>
          )}
        </div>
        {d && !message && (
          <div className="num text-right text-xs text-muted">
            finestra 2′
            <br />
            <span style={{ color: d.reliable ? undefined : "var(--warning)" }}>artefatti {fmt(d.artifactPct, 1)}%</span>
          </div>
        )}
      </div>
      <div className="relative mt-3 h-2 rounded-full" style={{ background: `linear-gradient(to right, color-mix(in srgb, var(--critical) 45%, transparent) ${pct(DFA_VT2)}%, color-mix(in srgb, var(--warning) 45%, transparent) ${pct(DFA_VT2)}% ${pct(DFA_VT1)}%, color-mix(in srgb, var(--hrv) 45%, transparent) ${pct(DFA_VT1)}%)` }}>
        {a !== null && !message && <span className="absolute -top-1.5 h-5 w-1 rounded" style={{ left: `calc(${pct(a)}% - 2px)`, background: "var(--foreground)" }} />}
      </div>
      <div className="num relative mt-1 h-4 text-[10px] text-muted">
        <span className="absolute -translate-x-1/2" style={{ left: `${pct(DFA_VT2)}%` }}>0,5 VT2</span>
        <span className="absolute -translate-x-1/2" style={{ left: `${pct(DFA_VT1)}%` }}>0,75 VT1</span>
      </div>
      {hist.length > 1 && (
        <div className="player-wide-only mt-3">
          <svg viewBox={`0 0 ${HX} ${HY}`} preserveAspectRatio="none" className="block h-20 w-full" role="img" aria-label="DFA alfa 1 negli ultimi 10 minuti">
            <line x1={0} x2={HX} y1={yA(DFA_VT1)} y2={yA(DFA_VT1)} stroke="var(--hrv)" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
            <line x1={0} x2={HX} y1={yA(DFA_VT2)} y2={yA(DFA_VT2)} stroke="var(--critical)" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
            <polyline
              points={hist.map((p, i) => `${(i / (hist.length - 1)) * HX},${yA(p.a)}`).join(" ")}
              fill="none"
              stroke="var(--foreground)"
              strokeWidth={1.6}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <div className="flex justify-between text-[10px] text-muted">
            <span>−10′</span>
            <span>ora</span>
          </div>
        </div>
      )}
    </section>
  );
}

const STATUS_TEXT: Record<DeviceView["status"], string> = {
  off: "non collegato",
  connecting: "collegamento…",
  connected: "collegato",
  reconnecting: "ricollego…",
  lost: "connessione persa",
};

const DEVICE_INFO: Record<DeviceKind, { label: string; icon: React.ReactNode; color: string }> = {
  trainer: { label: "Rullo", icon: <IconTrainer size={20} />, color: "var(--fitness-ink)" },
  hr: { label: "Fascia cardio", icon: <IconHeart size={20} />, color: "var(--rhr-ink)" },
  power: { label: "Pedali (facoltativi)", icon: <IconBolt size={20} />, color: "var(--fatigue-ink)" },
};

function DeviceCard({ kind, d, engine, compact = false }: { kind: DeviceKind; d: DeviceView; engine: PlayerEngine; compact?: boolean }) {
  const info = DEVICE_INFO[kind];
  const ok = d.status === "connected";
  const busy = d.status === "connecting" || d.status === "reconnecting";
  const text = ok && d.detail ? `${d.detail} · collegato` : STATUS_TEXT[d.status];
  const color = ok ? "var(--good)" : d.status === "lost" ? "var(--critical)" : "var(--muted)";
  if (compact) {
    return (
      <button
        className="flex min-w-0 items-center gap-1.5 rounded-lg px-2 py-1 text-xs"
        onClick={() => (ok ? undefined : engine.connect(kind))}
        title={d.error ?? undefined}
        aria-label={`${info.label}: ${text}`}
      >
        <span style={{ color: info.color }} aria-hidden>{info.icon}</span>
        <span className="truncate">{d.name ?? info.label}</span>
        <span style={{ color }}>· {text}</span>
      </button>
    );
  }
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-2xl px-3 py-2.5" style={cardStyle}>
      <span style={{ color: info.color }} aria-hidden>{info.icon}</span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm">{d.name ?? info.label}</div>
        <div className="truncate text-xs" style={{ color }}>{d.error && !ok ? d.error : text}</div>
      </div>
      {ok ? (
        <button className="text-xs text-muted" onClick={() => engine.disconnect(kind)}>Scollega</button>
      ) : (
        <button
          className="rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
          style={{ background: "var(--accent-bg)", color: "var(--accent-ink)" }}
          disabled={busy}
          onClick={() => engine.connect(kind)}
        >
          {busy ? "…" : d.remembered && d.status === "off" && !d.error ? "Ricollega" : "Collega"}
        </button>
      )}
    </div>
  );
}

function Devices({ view, engine }: { view: PlayerView; engine: PlayerEngine }) {
  const problem = useMemo(() => bluetoothProblem(), []);
  return (
    <section className="player-flow-only" style={{ gridArea: "devices" }} aria-label="Strumenti collegati">
      <div className="mb-2 mt-2 px-1 text-xs text-muted">Strumenti collegati</div>
      {problem ? (
        <p className="rounded-2xl px-4 py-3 text-sm" style={{ background: "var(--warning-bg)", color: "var(--warning-ink)" }}>{problem}</p>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {(["trainer", "hr", "power"] as DeviceKind[]).map((k) => (
            <DeviceCard key={k} kind={k} d={view.devices[k]} engine={engine} />
          ))}
        </div>
      )}
    </section>
  );
}

function ModeSelector({ view, engine }: { view: PlayerView; engine: PlayerEngine }) {
  const s = view.session;
  const opt = (mode: "erg" | "resistance", text: string) => (
    <button
      role="radio"
      aria-checked={s.mode === mode}
      className="num flex-1 rounded-lg px-3 py-2 text-sm"
      style={s.mode === mode ? { background: "var(--accent-bg)", color: "var(--accent-ink)", fontWeight: 500 } : { color: "var(--muted)" }}
      onClick={() => engine.setMode(mode)}
    >
      {text}
    </button>
  );
  return (
    <div role="radiogroup" aria-label="Modalità del rullo" className="flex min-w-0 flex-1 gap-1 rounded-xl p-1 lg:max-w-sm" style={{ background: "var(--neutral-bg)" }}>
      {opt("erg", `ERG · ${fmt(view.target)} W`)}
      {opt("resistance", `Resistenza · ${s.level}`)}
    </div>
  );
}

function RoundButton({ label, onClick, children, primary = false, disabled = false }: {
  label: string; onClick: () => void; children: React.ReactNode; primary?: boolean; disabled?: boolean;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full disabled:opacity-40"
      style={primary ? { background: "var(--accent-bg)", color: "var(--accent-ink)" } : { background: "var(--neutral-bg)" }}
    >
      {children}
    </button>
  );
}

function Controls({ view, engine }: { view: PlayerView; engine: PlayerEngine }) {
  const s = view.session;
  const done = s.status === "done";
  const running = s.status === "running";
  const step = s.mode === "erg" ? "5 W" : "un gradino";
  return (
    <div className="flex items-center justify-between gap-2 lg:justify-end">
      <RoundButton label={`Meno ${step}`} onClick={() => engine.adjust(-1)} disabled={done}><IconMinus size={22} /></RoundButton>
      <div className="flex items-center gap-1 rounded-full px-2" style={{ background: "var(--neutral-bg)" }}>
        <RoundButton label="Step precedente" onClick={() => engine.skip(-1)} disabled={done || s.status === "ready"}><IconPlayerSkipBack size={22} /></RoundButton>
        <RoundButton label={running ? "Pausa" : "Avvia"} onClick={() => engine.play()} disabled={done} primary>
          {running ? <IconPlayerPause size={24} /> : <IconPlayerPlay size={24} />}
        </RoundButton>
        <RoundButton label="Step successivo" onClick={() => engine.skip(1)} disabled={done}><IconPlayerSkipForward size={22} /></RoundButton>
      </div>
      <RoundButton label={`Più ${step}`} onClick={() => engine.adjust(1)} disabled={done}><IconPlus size={22} /></RoundButton>
    </div>
  );
}

// ── Dialogs ─────────────────────────────────────────────────────────────────────────────────────────

function Sheet({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-4 sm:items-center" style={{ background: "rgba(10, 12, 20, 0.55)" }} role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-2xl p-5" style={{ background: "var(--surface)", boxShadow: "var(--tip-shadow)" }}>
        {children}
      </div>
    </div>
  );
}

function ExitSheet({ onSave, onStay, onDiscard }: { onSave: () => void; onStay: () => void; onDiscard: () => void }) {
  const [sure, setSure] = useState(false);
  return (
    <Sheet>
      <h2 className="text-base font-medium">Vuoi terminare l&apos;allenamento?</h2>
      <p className="mt-1 text-sm text-muted">La seduta registrata finora viene salvata e caricata su Intervals.icu.</p>
      <div className="mt-4 grid gap-2">
        <button className="rounded-xl px-4 py-2.5 text-sm font-medium" style={{ background: "var(--accent-bg)", color: "var(--accent-ink)" }} onClick={onSave}>Termina e salva</button>
        <button className="rounded-xl px-4 py-2.5 text-sm" style={{ background: "var(--neutral-bg)" }} onClick={onStay}>Continua a pedalare</button>
        {sure ? (
          <button className="rounded-xl px-4 py-2.5 text-sm font-medium" style={{ background: "var(--critical-bg)", color: "var(--critical)" }} onClick={onDiscard}>Sì, butta la seduta</button>
        ) : (
          <button className="px-4 py-2 text-sm text-muted" onClick={() => setSure(true)}>Esci senza salvare</button>
        )}
      </div>
    </Sheet>
  );
}

function FinishSheet({ view, engine, onClose }: { view: PlayerView; engine: PlayerEngine; onClose: () => void }) {
  const rec = view.finished;
  if (!rec) {
    return (
      <Sheet>
        <h2 className="text-base font-medium">Seduta troppo breve</h2>
        <p className="mt-1 text-sm text-muted">Meno di qualche secondo pedalato: non è stata salvata.</p>
        <button className="mt-4 w-full rounded-xl px-4 py-2.5 text-sm" style={{ background: "var(--neutral-bg)" }} onClick={onClose}>Chiudi</button>
      </Sheet>
    );
  }
  const s = summarize(rec.samples);
  const uploaded = rec.status === "uploaded";
  return (
    <Sheet>
      <h2 className="text-base font-medium">{rec.name}</h2>
      <div className="num mt-3 grid grid-cols-3 gap-3 text-sm">
        <div><div className="text-xs text-muted">Durata</div>{fmtClock(s.secs)}</div>
        <div><div className="text-xs text-muted">Potenza media</div>{fmt(s.avgPower, 0, " W")}</div>
        <div><div className="text-xs text-muted">FC media</div>{fmt(s.avgHr, 0, " bpm")}</div>
        <div><div className="text-xs text-muted">Lavoro</div>{fmt(s.kj, 0, " kJ")}</div>
        <div><div className="text-xs text-muted">Cadenza</div>{fmt(s.avgCadence, 0, " rpm")}</div>
        <div><div className="text-xs text-muted">Distanza</div>{fmt(s.distanceKm, 1, " km")}</div>
      </div>
      <div className="mt-4 rounded-xl px-3 py-2.5 text-sm" style={{ background: uploaded ? "var(--good-bg)" : rec.error ? "var(--warning-bg)" : "var(--neutral-bg)" }}>
        {view.uploading ? "Carico su Intervals.icu…" : uploaded ? "Caricata su Intervals.icu." : rec.error ? `Non caricata: ${rec.error} Resta salvata su questo dispositivo e riprovo da Rulli.` : "Salvata sul dispositivo."}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {uploaded && rec.uploadedId && (
          <Link href={`/attivita/${rec.uploadedId}`} className="rounded-xl px-4 py-2.5 text-sm font-medium" style={{ background: "var(--accent-bg)", color: "var(--accent-ink)" }}>
            Apri l&apos;uscita
          </Link>
        )}
        {!uploaded && !view.uploading && (
          <button className="rounded-xl px-4 py-2.5 text-sm font-medium" style={{ background: "var(--accent-bg)", color: "var(--accent-ink)" }} onClick={() => engine.retryUpload()}>Riprova</button>
        )}
        <button className="rounded-xl px-4 py-2.5 text-sm" style={{ background: "var(--neutral-bg)" }} onClick={() => downloadFit(rec)}>Scarica FIT</button>
        <span className="flex-1" />
        <button className="rounded-xl px-4 py-2.5 text-sm" style={{ background: "var(--neutral-bg)" }} onClick={onClose}>Chiudi</button>
      </div>
    </Sheet>
  );
}

// ── Screen ──────────────────────────────────────────────────────────────────────────────────────────

export function Player({ workout, onExit }: { workout: PlayerWorkout; onExit: () => void }) {
  const { engine, view } = usePlayer(workout);
  const [asking, setAsking] = useState(false);
  const notes = useMemo(() => workoutNotes(workout.description), [workout.description]);
  const s = view.session;
  const step = workout.steps[s.stepIndex];
  const showFinish = s.status === "done";

  const close = () => (view.recording ? setAsking(true) : onExit());

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "var(--background)" }}>
      <header className="flex items-center gap-3 px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button aria-label="Chiudi" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full" style={cardStyle} onClick={close}>
          <IconX size={20} />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <div className="truncate text-base font-medium">{workout.name} · {shortDuration(workout.totalSecs)}</div>
          <div className="player-wide-only text-xs text-muted">step {s.stepIndex + 1} di {workout.steps.length} · FTP {workout.ftp} W</div>
        </div>
        <button aria-label={view.sound ? "Spegni i suoni" : "Accendi i suoni"} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full" style={cardStyle} onClick={() => engine.toggleSound()}>
          {view.sound ? <IconVolume size={20} /> : <IconVolumeOff size={20} />}
        </button>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <div className="player-grid mx-auto w-full max-w-6xl">
          <Metrics view={view} step={step} />
          <Profile workout={workout} view={view} />
          <DfaCard view={view} />
          {notes && (
            <section className={`${card} p-4`} style={{ ...cardStyle, gridArea: "notes" }} aria-label="Note allenamento">
              <div className="text-sm font-medium">Note allenamento</div>
              <p className="mt-1 whitespace-pre-line text-sm text-muted">{notes}</p>
            </section>
          )}
          <Devices view={view} engine={engine} />
        </div>
      </main>

      <footer className="border-t px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 lg:flex-row lg:items-center">
          <div className="player-wide-only flex min-w-0 flex-1 flex-wrap items-center gap-1">
            {(["trainer", "hr", "power"] as DeviceKind[]).map((k) => (
              <DeviceCard key={k} kind={k} d={view.devices[k]} engine={engine} compact />
            ))}
          </div>
          <ModeSelector view={view} engine={engine} />
          <Controls view={view} engine={engine} />
        </div>
      </footer>

      {asking && !showFinish && (
        <ExitSheet
          onSave={() => {
            setAsking(false);
            void engine.finish();
          }}
          onStay={() => setAsking(false)}
          onDiscard={async () => {
            await engine.discard();
            onExit();
          }}
        />
      )}
      {showFinish && <FinishSheet view={view} engine={engine} onClose={onExit} />}
    </div>
  );
}
