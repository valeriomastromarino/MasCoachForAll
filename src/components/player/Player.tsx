"use client";

// The trainer player screen (design approved in docs/player-rulli.md §5). Phone: metrics, profile, DFA α1,
// notes and devices in one column; on computers two columns. Mode selector and controls stay at the bottom.
import {
  IconActivityHeartbeat,
  IconAdjustmentsHorizontal,
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
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { bluetoothProblem, type DeviceKind } from "@/lib/ble/devices";
import { guardBack } from "@/lib/native";
import { DFA_VT1, DFA_VT2, dfaZone } from "@/lib/physio/dfa";
import { workoutNotes } from "@/lib/player/notes";
import { summarize } from "@/lib/player/recording";
import { SCALE_OPTIONS, stepRemaining } from "@/lib/player/session";
import { SPRINT_LEADS, SPRINT_MAX_STEPS, SPRINT_WATTS } from "@/lib/player/sprint";
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

/** An error message as a sentence, so the text after it does not run on («…il file FIT. Resta salvata…»). */
const sentence = (s: string) => (/[.!?…]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);

function stepText(s: PlayerStep, k = 1): string {
  const w = (x: number) => Math.round(x * k);
  return `${shortDuration(s.secs)} @ ${s.ramp ? `${w(s.from)}→${w(s.to)}` : w(s.from)}W`;
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
  // A sprint (and its warning) is ridden in resistance: the card shows the sprint's level.
  const sprinting = view.sprint.phase !== "off";
  const resistance = s.mode === "resistance" || sprinting;
  const level = sprinting ? view.sprint.cfg.level : s.level;
  const cad = step?.cadence;
  return (
    <section className={`${card} grid grid-cols-2 overflow-hidden`} style={{ ...cardStyle, gridArea: "metrics" }} aria-label="Metriche">
      <Metric right bottom icon={<IconBolt size={15} />} color="var(--fatigue-ink)" label="Potenza"
        value={fmt(view.power)} unit="W" sub={view.devices.power.status === "connected" ? (view.match ? `dai pedali · corr. ${fmt(view.match, 2)}` : "dai pedali") : null} />
      <Metric bottom icon={<IconTarget size={15} />} color="var(--good)" label={resistance ? "Livello" : "Obiettivo"}
        value={resistance ? String(level) : fmt(view.target)} unit={resistance ? `/ ${view.levels.length - 1}` : "W"}
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

function Profile({ workout, view, onRecal }: { workout: PlayerWorkout; view: PlayerView; onRecal: () => void }) {
  const s = view.session;
  const steps = workout.steps;
  const total = Math.max(1, workout.totalSecs);
  const maxW = Math.max(workout.ftp * 1.2, ...steps.map((x) => Math.max(x.from, x.to))) * 1.08;
  const H = 120;
  const X = (sec: number) => (sec / total) * 1000;
  const Y = (w: number) => H - (Math.min(w, maxW) / maxW) * H;
  const next = steps[s.stepIndex + 1];
  // Recalibrated: the steps from the one it was applied on are drawn (and shown) at the lower power.
  const k = (st: PlayerStep) => (st.index >= s.scaleFrom ? s.scale : 1);
  const label = statusLabel(view);
  // The ridden line breaks where a step was skipped (back or forward) instead of drawing across.
  const gap = Math.max(5, (3 * total) / 1000);
  const traces: string[] = [];
  let points: string[] = [];
  view.trace.forEach((p, i) => {
    const prev = view.trace[i - 1];
    if (prev && (p.pos < prev.pos || p.pos - prev.pos > gap)) {
      traces.push(points.join(" "));
      points = [];
    }
    points.push(`${X(p.pos).toFixed(1)},${Y(p.w).toFixed(1)}`);
  });
  if (points.length) traces.push(points.join(" "));
  return (
    <section className={`${card} p-4`} style={{ ...cardStyle, gridArea: "profile" }} aria-label="Profilo dell'allenamento">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs text-muted">Tempo rimanente</div>
          <div className="num text-3xl font-medium">{fmtClock(Math.ceil(stepRemaining(s, steps)))}</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted">Prossimo</div>
          <div className="num text-base text-muted">{next ? stepText(next, k(next)) : "Fine"}</div>
        </div>
      </div>
      {steps[s.stepIndex]?.label && <div className="mt-1 text-xs text-muted">{steps[s.stepIndex].label}</div>}
      <button
        type="button"
        onClick={onRecal}
        disabled={s.status === "done"}
        className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium leading-none disabled:opacity-40"
        style={s.scale < 1 ? { background: "var(--accent-bg)", color: "var(--accent-ink)" } : { border: "1px solid var(--border)", color: "var(--muted)" }}
      >
        <IconAdjustmentsHorizontal size={15} aria-hidden /> Ricalibra · {Math.round(s.scale * 100)}%
      </button>
      <svg viewBox={`0 0 1000 ${H}`} preserveAspectRatio="none" className="mt-3 block h-28 w-full lg:h-44" role="img" aria-label="Profilo con la potenza pedalata">
        {steps.map((st) => {
          const x0 = X(st.start);
          const x1 = X(st.start + st.secs);
          const done = st.start + st.secs <= s.pos;
          return (
            <polygon
              key={st.index}
              points={`${x0},${H} ${x0},${Y(st.from * k(st))} ${x1},${Y(st.to * k(st))} ${x1},${H}`}
              fill={`var(--z${st.zone})`}
              opacity={done ? 0.45 : 0.9}
              stroke="var(--surface)"
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
        {traces.map((pts, i) => (
          <polyline key={i} points={pts} fill="none" stroke="var(--foreground)" strokeWidth={1.6} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        ))}
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
      <div className="num relative mt-1 h-4 text-xs text-muted">
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
          <div className="flex justify-between text-xs text-muted">
            <span>−10′</span>
            <span>ora</span>
          </div>
        </div>
      )}
    </section>
  );
}

const KINDS: DeviceKind[] = ["trainer", "hr", "power"];

const STATUS_TEXT: Record<DeviceView["status"], string> = {
  off: "non collegato",
  connecting: "collegamento…",
  connected: "collegato",
  lost: "collegamento perso",
};

const DEVICE_INFO: Record<DeviceKind, { label: string; lost: string; icon: React.ReactNode; color: string }> = {
  trainer: { label: "Rullo", lost: "Rullo scollegato", icon: <IconTrainer size={20} />, color: "var(--fitness-ink)" },
  hr: { label: "Fascia cardio", lost: "Fascia cardio scollegata", icon: <IconHeart size={20} />, color: "var(--rhr-ink)" },
  power: { label: "Pedali (facoltativi)", lost: "Pedali scollegati", icon: <IconBolt size={20} />, color: "var(--fatigue-ink)" },
};

/**
 * One device. Manual management: «Collega» opens the chooser, «Ricollega» / «Riprova» try the device of this session
 * again, «Annulla» stops a connection in progress, «Scollega» closes it. Nothing connects by itself.
 */
function DeviceCard({ kind, d, engine, compact = false }: { kind: DeviceKind; d: DeviceView; engine: PlayerEngine; compact?: boolean }) {
  const info = DEVICE_INFO[kind];
  const ok = d.status === "connected";
  const busy = d.status === "connecting";
  const text = ok ? (d.detail ? `${d.detail} · collegato` : "collegato") : busy ? `${d.detail ?? "collegamento"}…` : STATUS_TEXT[d.status];
  const color = ok ? "var(--good)" : d.status === "lost" || d.error ? "var(--critical)" : "var(--muted)";
  const action = d.status === "lost" ? "Ricollega" : d.retry ? "Riprova" : "Collega";
  if (compact) {
    return (
      <button
        className="flex min-w-0 items-center gap-1.5 rounded-lg px-2 py-1 text-xs"
        onClick={() => (ok || busy ? undefined : engine.connect(kind))}
        title={d.error ?? undefined}
        aria-label={`${info.label}: ${text}${ok || busy ? "" : ` · ${action}`}`}
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
        <div className={`text-xs ${d.error && !ok && !busy ? "" : "truncate"}`} style={{ color }}>{d.error && !ok && !busy ? d.error : text}</div>
        {!ok && !busy && (
          <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted">
            {d.retry && (
              <button className="underline underline-offset-2" onClick={() => engine.choose(kind)}>
                Un altro dispositivo
              </button>
            )}
            <button className="underline underline-offset-2" onClick={() => engine.choose(kind, true)}>
              {d.retry ? "Mostra tutti" : "Non lo trovi? Mostra tutti i dispositivi"}
            </button>
          </div>
        )}
      </div>
      {ok || busy ? (
        <button className="text-xs text-muted" onClick={() => engine.disconnect(kind)}>{busy ? "Annulla" : "Scollega"}</button>
      ) : (
        <button className="rounded-lg px-3 py-1.5 text-xs font-medium" style={{ background: "var(--accent-bg)", color: "var(--accent-ink)" }} onClick={() => engine.connect(kind)}>
          {action}
        </button>
      )}
    </div>
  );
}

function Devices({ view, engine }: { view: PlayerView; engine: PlayerEngine }) {
  const problem = useMemo(() => bluetoothProblem(), []);
  return (
    <section className="player-flow-only" style={{ gridArea: "devices" }} aria-label="Strumenti collegati">
      <div className="mb-2 mt-2 px-1 text-xs text-muted">Strumenti collegati · si collegano a mano, a ogni seduta</div>
      {problem ? (
        <p className="rounded-2xl px-4 py-3 text-sm" style={{ background: "var(--warning-bg)", color: "var(--warning-ink)" }}>{problem}</p>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {KINDS.map((k) => (
            <DeviceCard key={k} kind={k} d={view.devices[k]} engine={engine} />
          ))}
        </div>
      )}
    </section>
  );
}

/** A device connected earlier in this session that is not any more: nothing reconnects by itself, so it shows at the top. */
function DroppedAlert({ view, engine }: { view: PlayerView; engine: PlayerEngine }) {
  const dropped = KINDS.filter((k) => view.devices[k].dropped);
  if (!dropped.length) return null;
  return (
    <div className="mx-auto mb-3 w-full max-w-6xl space-y-2">
      {dropped.map((k) => {
        const d = view.devices[k];
        const busy = d.status === "connecting";
        return (
          <div key={k} role="alert" className="flex items-center justify-between gap-3 rounded-xl px-3 py-2" style={{ background: "var(--critical-bg)", color: "var(--critical)" }}>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{DEVICE_INFO[k].lost}</span>
              <span className="block truncate text-xs">{busy ? `${d.detail ?? "mi collego"}…` : (d.error ?? d.name ?? "")}</span>
            </span>
            {!busy && (
              <button
                type="button"
                className="h-9 shrink-0 rounded-full px-4 text-xs font-semibold leading-none"
                style={{ background: "var(--surface)", color: "var(--critical)", border: "1px solid var(--critical)" }}
                onClick={() => engine.connect(k)}
              >
                Ricollega
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Above the metrics: the warning before a sprint, and the sprint itself while it lasts. */
function SprintAlert({ view }: { view: PlayerView }) {
  const sp = view.sprint;
  if (sp.phase === "off") return null;
  if (sp.phase === "warn") {
    return (
      <div role="alert" className="mx-auto mb-3 flex w-full max-w-6xl items-center gap-4 rounded-2xl px-4 py-3" style={{ background: "var(--warning-bg)", color: "var(--warning-ink)", border: "2px solid var(--warning)" }}>
        <span className="num min-w-[2ch] text-center text-5xl font-semibold leading-none">{sp.secs}</span>
        <div>
          <div className="text-base font-semibold">SPRINT tra {sp.secs} s</div>
          <div className="text-xs">Passo alla resistenza {sp.cfg.level}. ERG spento.</div>
        </div>
      </div>
    );
  }
  return (
    <div role="status" className="mx-auto mb-3 w-full max-w-6xl rounded-2xl px-4 py-4 text-center" style={{ background: "var(--z7)", color: "#fff" }}>
      <div className="text-[11px] font-medium uppercase tracking-wider opacity-80">
        Sprint {sp.n} di {sp.total} · resistenza {sp.cfg.level}
      </div>
      <div className="num mt-1 text-6xl font-semibold leading-none">
        {fmt(view.power)}
        <span className="ml-1 text-xl font-medium opacity-80">W</span>
      </div>
      <div className="num mt-3 flex justify-around text-xs opacity-90">
        <div>
          <b className="block text-xl">{sp.secs}″</b>restano
        </div>
        <div>
          <b className="block text-xl">{fmt(sp.peak)}</b>picco W
        </div>
        <div>
          <b className="block text-xl">{fmt(view.cadence)}</b>rpm
        </div>
      </div>
    </div>
  );
}

function Switch({ on }: { on: boolean }) {
  return (
    <span className="relative inline-block h-6 w-10 shrink-0 rounded-full" style={{ background: on ? "var(--brand)" : "var(--border)" }} aria-hidden>
      <span className="absolute top-[3px] h-[18px] w-[18px] rounded-full bg-white" style={{ left: on ? 19 : 3, boxShadow: "0 1px 3px rgba(0,0,0,.3)" }} />
    </span>
  );
}

/** Footer: turns the automatic sprints on or off; tapping the text opens their settings. */
function SprintToggle({ view, engine, onSettings }: { view: PlayerView; engine: PlayerEngine; onSettings: () => void }) {
  const c = view.sprint.cfg;
  return (
    <div className="flex items-center justify-between gap-3">
      <button type="button" onClick={onSettings} className="min-w-0 text-left">
        <span className="block text-sm font-medium">Sprint automatici</span>
        <span className="num block truncate text-xs text-muted">≥ {c.watts} W · resistenza {c.level} · avviso {c.leadSecs} s</span>
      </button>
      <button type="button" role="switch" aria-checked={c.on} aria-label="Sprint automatici" onClick={() => engine.setSprint({ on: !c.on })}>
        <Switch on={c.on} />
      </button>
    </div>
  );
}

function OptionRow<T extends number>({ label, options, value, text, onPick }: { label: string; options: readonly T[]; value: T; text: (v: T) => string; onPick: (v: T) => void }) {
  return (
    <div className="mt-4">
      <div className="mb-1.5 text-xs text-muted">{label}</div>
      <div className="flex gap-1.5" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={o === value}
            onClick={() => onPick(o)}
            className="num flex-1 rounded-xl px-1 py-2 text-sm font-medium"
            style={o === value ? { background: "var(--accent-bg)", color: "var(--accent-ink)", border: "1px solid var(--accent-ink)" } : { border: "1px solid var(--border)" }}
          >
            {text(o)}
          </button>
        ))}
      </div>
    </div>
  );
}

function SprintSheet({ view, engine, onClose }: { view: PlayerView; engine: PlayerEngine; onClose: () => void }) {
  const c = view.sprint.cfg;
  const levels = view.levels.length || 10;
  return (
    <Sheet>
      <h2 className="text-base font-medium">Sprint automatici</h2>
      <p className="mt-1 text-sm text-muted">Sopra la soglia il rullo passa in resistenza e a fine step torna in ERG. In resistenza la potenza dipende da rapporto, cadenza e livello.</p>
      <OptionRow label="Da quale potenza" options={SPRINT_WATTS} value={c.watts} text={(v) => `${v} W`} onPick={(v) => engine.setSprint({ watts: v })} />
      <OptionRow label="Avviso prima" options={SPRINT_LEADS} value={c.leadSecs} text={(v) => `${v} s`} onPick={(v) => engine.setSprint({ leadSecs: v })} />
      <OptionRow label="Solo step brevi" options={SPRINT_MAX_STEPS} value={c.maxStepSecs} text={(v) => (v === 0 ? "tutti" : `≤ ${v} s`)} onPick={(v) => engine.setSprint({ maxStepSecs: v })} />
      <div className="mt-4">
        <div className="mb-1.5 text-xs text-muted">Resistenza di partenza (poi si ricorda l&apos;ultima usata)</div>
        <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label="Livello di resistenza">
          {Array.from({ length: levels }, (_, i) => i).map((i) => (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={i === c.level}
              onClick={() => engine.setSprint({ level: i })}
              className="num rounded-lg py-1.5 text-sm font-medium"
              style={i === c.level ? { background: "var(--brand)", color: "var(--on-brand)" } : { border: "1px solid var(--border)" }}
            >
              {i}
            </button>
          ))}
        </div>
      </div>
      <button className="mt-5 w-full rounded-xl px-4 py-2.5 text-sm font-medium" style={{ background: "var(--accent-bg)", color: "var(--accent-ink)" }} onClick={onClose}>Fatto</button>
    </Sheet>
  );
}

/** "Ricalibra": the rest of the session at 100 / 95 / 90 / 85 % of the planned watts. */
function RecalSheet({ view, workout, engine, onClose }: { view: PlayerView; workout: PlayerWorkout; engine: PlayerEngine; onClose: () => void }) {
  const s = view.session;
  const [pick, setPick] = useState<number>(s.scale);
  const next = workout.steps[Math.min(workout.steps.length - 1, s.stepIndex + 1)];
  return (
    <Sheet>
      <h2 className="text-base font-medium">Ricalibra la seduta</h2>
      <p className="mt-1 text-sm text-muted">Abbassa la potenza di tutti gli step che restano. Il riscaldamento e ciò che hai già fatto non cambiano.</p>
      <div className="mt-4 grid grid-cols-4 gap-2" role="radiogroup" aria-label="Percentuale della potenza prevista">
        {SCALE_OPTIONS.map((o) => (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={pick === o}
            onClick={() => setPick(o)}
            className="num rounded-2xl px-1 py-2.5 text-center text-base font-semibold"
            style={pick === o ? { background: "var(--accent-bg)", color: "var(--accent-ink)", border: "1px solid var(--accent-ink)" } : { border: "1px solid var(--border)" }}
          >
            {Math.round(o * 100)}%
            <span className="block text-[10px] font-normal text-muted">{o === 1 ? "com'è" : `−${Math.round((1 - o) * 100)}%`}</span>
          </button>
        ))}
      </div>
      {next && (
        <p className="num mt-3 text-xs text-muted">
          Prossimo step: <b className="text-[color:var(--foreground)]">{stepText(next, pick)}</b>
          {pick < 1 ? ` (previsto ${stepText(next)})` : ""}
        </p>
      )}
      <div className="mt-4 grid grid-cols-1 gap-2">
        <button
          className="rounded-xl px-4 py-2.5 text-sm font-medium"
          style={{ background: "var(--brand)", color: "var(--on-brand)" }}
          onClick={() => {
            engine.recalibrate(pick);
            onClose();
          }}
        >
          {pick === 1 ? "Torna alla potenza prevista" : `Applica ${Math.round(pick * 100)}%`}
        </button>
        <button className="rounded-xl px-4 py-2 text-sm text-muted" onClick={onClose}>Annulla</button>
      </div>
    </Sheet>
  );
}

function ModeSelector({ view, engine }: { view: PlayerView; engine: PlayerEngine }) {
  const s = view.session;
  const sprinting = view.sprint.phase !== "off";
  const active = sprinting ? "resistance" : s.mode;
  const opt = (mode: "erg" | "resistance", text: string) => (
    <button
      role="radio"
      aria-checked={active === mode}
      className="num flex-1 rounded-lg px-3 py-2 text-sm"
      style={active === mode ? { background: "var(--accent-bg)", color: "var(--accent-ink)", fontWeight: 500 } : { color: "var(--muted)" }}
      onClick={() => engine.setMode(mode)}
    >
      {text}
    </button>
  );
  return (
    <div role="radiogroup" aria-label="Modalità del rullo" className="flex min-w-0 flex-1 gap-1 rounded-xl p-1 lg:max-w-sm" style={{ background: "var(--neutral-bg)" }}>
      {opt("erg", `ERG · ${fmt(view.target)} W`)}
      {opt("resistance", sprinting ? `Sprint · ${view.sprint.cfg.level}` : `Resistenza · ${s.level}`)}
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
    <div className="flex items-center justify-between gap-2 sm:justify-end">
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
      <div className="mt-4 grid grid-cols-1 gap-2">
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
        {view.uploading ? "Carico su Intervals.icu…" : uploaded ? "Caricata su Intervals.icu." : rec.error ? `Non caricata: ${sentence(rec.error)} Resta salvata su questo dispositivo e riprovo da Rulli.` : "Salvata sul dispositivo."}
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
  const [recal, setRecal] = useState(false);
  const [sprintSettings, setSprintSettings] = useState(false);
  const notes = useMemo(() => workoutNotes(workout.description), [workout.description]);
  const s = view.session;
  const step = workout.steps[s.stepIndex];
  const showFinish = s.status === "done";
  // The toggle is offered when the workout has a step that could be a sprint at any of the thresholds.
  const hasSprint = workout.steps.some((st) => Math.max(st.from, st.to) >= SPRINT_WATTS[0]);

  const close = () => (view.recording ? setAsking(true) : onExit());

  // Android's Back button does what the X does: ask before ending a ride, close an open sheet first.
  const recording = view.recording;
  useEffect(
    () =>
      guardBack(() => {
        if (showFinish) onExit();
        else if (recal) setRecal(false);
        else if (sprintSettings) setSprintSettings(false);
        else if (asking) setAsking(false);
        else if (recording) setAsking(true);
        else onExit();
        return true;
      }),
    [asking, recal, sprintSettings, showFinish, recording, onExit],
  );

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
        <DroppedAlert view={view} engine={engine} />
        <SprintAlert view={view} />
        {s.scale < 1 && (
          <div className="mx-auto mb-3 flex w-full max-w-6xl items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm font-medium" style={{ background: "var(--warning-bg)", color: "var(--warning-ink)" }}>
            <span>Seduta al {Math.round(s.scale * 100)}%</span>
            <button type="button" className="text-xs font-normal underline underline-offset-2" onClick={() => engine.recalibrate(1)}>Annulla</button>
          </div>
        )}
        <div className="player-grid mx-auto w-full max-w-6xl">
          <Metrics view={view} step={step} />
          <Profile workout={workout} view={view} onRecal={() => setRecal(true)} />
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
        {hasSprint && (
          <div className="mx-auto mb-3 w-full max-w-6xl">
            <SprintToggle view={view} engine={engine} onSettings={() => setSprintSettings(true)} />
          </div>
        )}
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 sm:flex-row sm:items-center">
          <div className="player-wide-only flex min-w-0 flex-1 flex-wrap items-center gap-1">
            {KINDS.map((k) => (
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
      {recal && !showFinish && <RecalSheet view={view} workout={workout} engine={engine} onClose={() => setRecal(false)} />}
      {sprintSettings && !showFinish && <SprintSheet view={view} engine={engine} onClose={() => setSprintSettings(false)} />}
      {showFinish && <FinishSheet view={view} engine={engine} onClose={onExit} />}
    </div>
  );
}
