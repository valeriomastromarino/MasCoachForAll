"use client";

import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DashboardData } from "@/lib/dashboard";
import { cpPredict } from "@/lib/physio/criticalPower";
import { fmt, fmtDay, fmtDuration, fmtSecsLabel } from "./format";

export const axis = { stroke: "var(--faint)", fontSize: 11, tickLine: false, axisLine: false } as const;
export const grid = <CartesianGrid stroke="var(--grid)" vertical={false} />;
export const margin = { top: 6, right: 6, bottom: 0, left: -18 };

/** Vertical fade from the series colour to transparent: the soft "sfumato" look of style A. */
export function Fade({ id, color, from = 0.45, to = 0 }: { id: string; color: string; from?: number; to?: number }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor={color} stopOpacity={from} />
      <stop offset="100%" stopColor={color} stopOpacity={to} />
    </linearGradient>
  );
}

export type Row = { label: string; value: string; color?: string };

export function TipBox({ title, rows, note }: { title: string; rows: Row[]; note?: string }) {
  return (
    <div className="card px-3 py-2 text-xs" style={{ boxShadow: "var(--tip-shadow)" }}>
      <div className="mb-1 font-medium text-foreground">{title}</div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2 text-muted">
          {r.color && <span className="inline-block h-2 w-2 rounded-full" style={{ background: r.color }} />}
          <span>{r.label}</span>
          <span className="num ml-auto pl-4 text-foreground">{r.value}</span>
        </div>
      ))}
      {note && <div className="mt-1 font-medium" style={{ color: "var(--critical)" }}>{note}</div>}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string; dashed?: boolean; band?: boolean }[] }) {
  return (
    <div className="mb-2 flex flex-wrap gap-4 text-xs text-muted">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          {i.band ? (
            <span className="inline-block h-2.5 w-4 rounded" style={{ background: i.color }} />
          ) : (
            <span className="inline-block w-4" style={{ borderTop: `2px ${i.dashed ? "dashed" : "solid"} ${i.color}` }} />
          )}
          {i.label}
        </span>
      ))}
    </div>
  );
}

// Tooltip payloads are typed loosely by Recharts; we only read our own row object.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TipProps = { active?: boolean; payload?: any[] };

function PmcTip({ active, payload }: TipProps) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as DashboardData["pmc"][number];
  return (
    <TipBox
      title={fmtDay(p.date)}
      rows={[
        { label: "Fitness", value: fmt(p.ctl), color: "var(--fitness)" },
        { label: "Fatica", value: fmt(p.atl), color: "var(--fatigue)" },
        { label: "Forma", value: fmt(p.tsb), color: "var(--form)" },
        { label: "Carico del giorno", value: fmt(p.load) },
      ]}
    />
  );
}

export function PmcChart({ pmc }: { pmc: DashboardData["pmc"] }) {
  return (
    <div>
      <Legend
        items={[
          { label: "Fitness (CTL)", color: "var(--fitness)" },
          { label: "Fatica (ATL)", color: "var(--fatigue)" },
          { label: "Forma (TSB)", color: "var(--form)" },
        ]}
      />
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={pmc} margin={margin}>
          <defs>
            <Fade id="g-ctl" color="var(--fitness)" from={0.45} />
            <Fade id="g-atl" color="var(--fatigue)" from={0.18} />
          </defs>
          {grid}
          <XAxis dataKey="date" tickFormatter={fmtDay} minTickGap={48} {...axis} />
          <YAxis {...axis} tickFormatter={(v) => fmt(v)} />
          <ReferenceLine y={0} stroke="var(--border)" />
          <Tooltip content={<PmcTip />} cursor={{ stroke: "var(--faint)", strokeDasharray: "3 3" }} />
          <Area type="monotone" dataKey="atl" stroke="var(--fatigue)" strokeWidth={1.5} fill="url(#g-atl)" isAnimationActive={false} />
          <Area type="monotone" dataKey="ctl" stroke="var(--fitness)" strokeWidth={2.5} fill="url(#g-ctl)" isAnimationActive={false} />
          <Line type="monotone" dataKey="tsb" stroke="var(--form)" strokeWidth={2} dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

type RecoveryRow = DashboardData["recovery"][number];

function HrvTip({ active, payload }: TipProps) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as RecoveryRow;
  return (
    <TipBox
      title={fmtDay(p.date)}
      rows={[
        { label: "HRV notte", value: fmt(p.rmssd, 0, " ms"), color: "var(--hrv)" },
        { label: "HRV media 7 gg", value: fmt(p.hrvBaseline, 0, " ms") },
        { label: "FC a riposo", value: fmt(p.rhr, 0, " bpm"), color: "var(--rhr)" },
        { label: "FC media 7 gg", value: fmt(p.rhrBaseline, 1, " bpm") },
      ]}
      note={p.anomaly ? "Notte anomala: HRV giù e FC su insieme" : undefined}
    />
  );
}

type DotProps = { cx?: number; cy?: number; payload?: RecoveryRow };

function nightDot(p: DotProps, color: string, key: "rmssd" | "rhr") {
  // Nights without a measurement would otherwise be drawn at the top edge.
  if (p.payload?.[key] === null || p.payload?.[key] === undefined) return <g />;
  const bad = p.payload.anomaly;
  return <circle cx={p.cx} cy={p.cy} r={bad ? 3.5 : 2.2} fill={bad ? "var(--critical)" : color} fillOpacity={bad ? 0.9 : 0.55} />;
}
const hrvDot = (p: DotProps) => nightDot(p, "var(--hrv)", "rmssd");
const rhrDot = (p: DotProps) => nightDot(p, "var(--rhr)", "rhr");

/** HRV and resting HR on two synced panels (never one dual-axis chart), anomalous nights marked on both. */
export function RecoveryCharts({ recovery }: { recovery: DashboardData["recovery"] }) {
  const data = recovery.slice(-90);
  const anomalies = data.filter((d) => d.anomaly).map((d) => d.date);
  const marks = anomalies.map((d) => <ReferenceLine key={d} x={d} stroke="var(--anomaly)" strokeWidth={6} />);
  return (
    <div>
      <Legend
        items={[
          { label: "Media 7 giorni", color: "var(--hrv)" },
          { label: "Range normale (60 gg)", color: "var(--hrv-band)", band: true },
          { label: "Notte anomala", color: "var(--anomaly)", band: true },
        ]}
      />
      <div className="text-xs font-medium" style={{ color: "var(--hrv-ink)" }}>
        HRV (ms)
      </div>
      <ResponsiveContainer width="100%" height={150}>
        <ComposedChart data={data} syncId="recovery" margin={margin}>
          <defs>
            <Fade id="g-hrv" color="var(--hrv)" from={0.3} />
          </defs>
          {grid}
          <XAxis dataKey="date" hide />
          <YAxis {...axis} domain={["dataMin - 4", "dataMax + 4"]} tickFormatter={(v) => fmt(v)} />
          {marks}
          <Tooltip content={<HrvTip />} cursor={{ stroke: "var(--faint)", strokeDasharray: "3 3" }} />
          <Area type="monotone" dataKey="hrvRange" fill="var(--hrv-band)" stroke="none" fillOpacity={1} isAnimationActive={false} />
          <Area
            type="monotone"
            dataKey="hrvBaseline"
            stroke="var(--hrv)"
            strokeWidth={2.5}
            fill="url(#g-hrv)"
            baseValue="dataMin"
            connectNulls
            isAnimationActive={false}
          />
          <Scatter dataKey="rmssd" shape={hrvDot} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="mt-2 text-xs font-medium" style={{ color: "var(--rhr-ink)" }}>
        FC a riposo (bpm)
      </div>
      <ResponsiveContainer width="100%" height={130}>
        <ComposedChart data={data} syncId="recovery" margin={margin}>
          <defs>
            <Fade id="g-rhr" color="var(--rhr)" from={0.25} />
          </defs>
          {grid}
          <XAxis dataKey="date" tickFormatter={fmtDay} minTickGap={48} {...axis} />
          <YAxis {...axis} domain={["dataMin - 2", "dataMax + 2"]} tickFormatter={(v) => fmt(v)} />
          {marks}
          <Tooltip content={<HrvTip />} cursor={{ stroke: "var(--faint)", strokeDasharray: "3 3" }} />
          <Area type="monotone" dataKey="rhrRange" fill="var(--rhr-band)" stroke="none" fillOpacity={1} isAnimationActive={false} />
          <Area
            type="monotone"
            dataKey="rhrBaseline"
            stroke="var(--rhr)"
            strokeWidth={2.5}
            fill="url(#g-rhr)"
            baseValue="dataMin"
            connectNulls
            isAnimationActive={false}
          />
          <Scatter dataKey="rhr" shape={rhrDot} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function PowerTip({ active, payload }: TipProps) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as { secs: number; watts?: number; model?: number };
  const rows: Row[] = [];
  if (p.watts) rows.push({ label: "Miglior potenza", value: fmt(p.watts, 0, " W"), color: "var(--fitness)" });
  if (p.model) rows.push({ label: "Modello CP", value: fmt(p.model, 0, " W"), color: "var(--fatigue)" });
  return <TipBox title={fmtDuration(p.secs)} rows={rows} />;
}

export function PowerCurveChart({ mmp, cp }: Pick<DashboardData, "mmp" | "cp">) {
  const model = cp ? [120, 180, 300, 480, 720, 1200].map((s) => ({ secs: s, model: Math.round(cpPredict(cp, s)) })) : [];
  const data = [...mmp.map((p) => ({ secs: p.secs, watts: p.watts })), ...model].sort((a, b) => a.secs - b.secs);
  return (
    <div>
      <Legend
        items={[
          { label: "Migliori potenze (84 gg)", color: "var(--fitness)" },
          ...(cp ? [{ label: "Modello potenza critica", color: "var(--fatigue)", dashed: true }] : []),
        ]}
      />
      <ResponsiveContainer width="100%" height={230}>
        <ComposedChart data={data} margin={{ ...margin, left: -12 }}>
          <defs>
            <Fade id="g-mmp" color="var(--fitness)" from={0.35} />
          </defs>
          {grid}
          <XAxis
            dataKey="secs"
            type="number"
            scale="log"
            domain={["dataMin", "dataMax"]}
            ticks={[5, 30, 60, 300, 1200, 3600]}
            tickFormatter={fmtSecsLabel}
            {...axis}
          />
          <YAxis {...axis} />
          <Tooltip content={<PowerTip />} cursor={{ stroke: "var(--faint)", strokeDasharray: "3 3" }} />
          <Area
            type="monotone"
            dataKey="watts"
            stroke="var(--fitness)"
            strokeWidth={2.5}
            fill="url(#g-mmp)"
            connectNulls
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="model"
            stroke="var(--fatigue)"
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function WeeklyTip({ active, payload }: TipProps) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as DashboardData["weekly"][number];
  return (
    <TipBox
      title={`Settimana del ${fmtDay(p.week)}`}
      rows={[
        { label: "Carico", value: fmt(p.load), color: "var(--load)" },
        { label: "Ore", value: fmtDuration(p.hours * 3600) },
      ]}
    />
  );
}

export function WeeklyLoadChart({ weekly }: Pick<DashboardData, "weekly">) {
  return (
    <ResponsiveContainer width="100%" height={230}>
      <BarChart data={weekly} margin={margin}>
        <defs>
          <linearGradient id="g-load" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="var(--load-soft)" />
            <stop offset="100%" stopColor="var(--load)" />
          </linearGradient>
        </defs>
        {grid}
        <XAxis dataKey="week" tickFormatter={fmtDay} minTickGap={20} {...axis} />
        <YAxis {...axis} />
        <Tooltip content={<WeeklyTip />} cursor={{ fill: "var(--grid)", radius: 8 }} />
        <Bar dataKey="load" fill="url(#g-load)" radius={[8, 8, 8, 8]} barSize={18} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}
