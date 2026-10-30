"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useState } from "react";
import type { RideDetail, RidePoint } from "@/lib/ride";
import { fmt, fmtClock } from "../format";

const axis = { stroke: "var(--faint)", fontSize: 11, tickLine: false, axisLine: false } as const;
const margin = { top: 4, right: 6, bottom: 0, left: -18 };

// Tooltip payloads are typed loosely by Recharts; we only read our own row object.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TipProps = { active?: boolean; payload?: any[]; focus: Metric };

type Metric = "watts" | "hr" | "cadence" | "dfa" | "altitude";

const METRICS: Record<Metric, { label: string; color: string; ink: string; value: (p: RidePoint) => string }> = {
  watts: { label: "Potenza", color: "var(--fitness)", ink: "var(--fitness-ink)", value: (p) => fmt(p.watts, 0, " W") },
  hr: { label: "FC", color: "var(--rhr)", ink: "var(--rhr-ink)", value: (p) => fmt(p.hr, 0, " bpm") },
  cadence: { label: "Cadenza", color: "var(--form)", ink: "var(--form-ink)", value: (p) => fmt(p.cadence, 0, " rpm") },
  dfa: { label: "DFA α1", color: "var(--hrv)", ink: "var(--hrv-ink)", value: (p) => fmt(p.dfa, 2) },
  altitude: { label: "Altitudine", color: "var(--altitude)", ink: "var(--muted)", value: (p) => fmt(p.altitude, 0, " m") },
};

/** Tooltip of the chart under the mouse: its own metric in the foreground, the others as context. */
function RideTip({ active, payload, focus }: TipProps) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as RidePoint;
  const main = METRICS[focus];
  const others = (Object.keys(METRICS) as Metric[])
    .filter((m) => m !== focus)
    .map((m) => [METRICS[m].label, METRICS[m].value(p)] as [string, string]);
  return (
    <div className="card px-3 py-2 text-xs" style={{ boxShadow: "var(--tip-shadow)", borderTop: `3px solid ${main.color}` }}>
      <div className="flex items-baseline gap-2">
        <span className="num text-lg font-medium" style={{ color: main.ink }}>
          {main.value(p)}
        </span>
        <span className="text-muted">{main.label}</span>
      </div>
      <div className="mb-1 text-muted">
        {fmtClock(p.t)}
        {p.km !== null && <span className="ml-2">km {fmt(p.km, 1)}</span>}
      </div>
      {others.map(([label, value]) => (
        <div key={label} className="flex items-center gap-2 text-faint">
          <span>{label}</span>
          <span className="num ml-auto pl-4 text-muted">{value}</span>
        </div>
      ))}
    </div>
  );
}

function Fade({ id, color, from }: { id: string; color: string; from: number }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor={color} stopOpacity={from} />
      <stop offset="100%" stopColor={color} stopOpacity={0} />
    </linearGradient>
  );
}

type HoverHandler = (index: number | null) => void;
type ActiveHover = { metric: Metric; index: number } | null;

function Panel({
  label,
  metric,
  height,
  data,
  hover,
  onHover,
  showAxis,
  children,
}: {
  label: string;
  metric: Metric;
  height: number;
  data: RidePoint[];
  hover: ActiveHover;
  onHover: (metric: Metric, index: number | null) => void;
  showAxis?: boolean;
  children: React.ReactNode;
}) {
  // Charts are not synced: only the chart under the mouse shows its tooltip, the others get a thin marker line.
  const elsewhere = hover && hover.metric !== metric ? data[hover.index] : null;
  return (
    <div>
      <div className="text-xs font-medium" style={{ color: METRICS[metric].ink }}>
        {label}
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart
          data={data}
          margin={margin}
          onMouseMove={(s) => {
            const i = Number(s?.activeTooltipIndex);
            onHover(metric, Number.isFinite(i) ? i : null);
          }}
          onMouseLeave={() => onHover(metric, null)}
        >
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(v) => fmtClock(v).replace(/:\d\d$/, "")}
            hide={!showAxis}
            {...axis}
          />
          <Tooltip content={<RideTip focus={metric} />} cursor={{ stroke: METRICS[metric].color, strokeWidth: 1.5 }} />
          {children}
          {elsewhere && <ReferenceLine x={elsewhere.t} stroke="var(--faint)" strokeDasharray="3 3" />}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function RideCharts({ ride, onHover }: { ride: RideDetail; onHover: HoverHandler }) {
  const data = ride.points;
  const [hover, setHover] = useState<ActiveHover>(null);
  const handleHover = (metric: Metric, index: number | null) => {
    setHover(index === null ? null : { metric, index });
    onHover(index);
  };
  const panel = { data, hover, onHover: handleHover };
  const hasAlt = data.some((p) => p.altitude !== null);
  const hasCadence = data.some((p) => p.cadence !== null && p.cadence > 0);
  return (
    <div className="space-y-3">
      <Panel label="Potenza (W)" metric="watts" height={150} {...panel}>
        <defs>
          <Fade id="r-w" color="var(--fitness)" from={0.45} />
        </defs>
        <YAxis {...axis} />
        {ride.efforts.map((e) => (
          <ReferenceArea key={e.startSec} x1={e.startSec} x2={e.startSec + e.durationSec} fill="var(--fatigue)" fillOpacity={0.12} />
        ))}
        {ride.ftp && <ReferenceLine y={ride.ftp} stroke="var(--fatigue)" strokeDasharray="4 4" label={{ value: "FTP", fontSize: 10, fill: "var(--fatigue-ink)", position: "insideTopRight" }} />}
        <Area type="monotone" dataKey="watts" stroke="var(--fitness)" strokeWidth={1.5} fill="url(#r-w)" connectNulls isAnimationActive={false} />
      </Panel>

      <Panel label="Frequenza cardiaca (bpm)" metric="hr" height={110} {...panel}>
        <defs>
          <Fade id="r-hr" color="var(--rhr)" from={0.35} />
        </defs>
        <YAxis {...axis} domain={["dataMin - 5", "dataMax + 5"]} />
        <Area type="monotone" dataKey="hr" stroke="var(--rhr)" strokeWidth={1.5} fill="url(#r-hr)" baseValue="dataMin" connectNulls isAnimationActive={false} />
      </Panel>

      {hasCadence && (
        <Panel label="Cadenza (rpm)" metric="cadence" height={100} {...panel}>
          <defs>
            <Fade id="r-cad" color="var(--form)" from={0.35} />
          </defs>
          <YAxis {...axis} domain={[0, "dataMax + 10"]} />
          <Area type="monotone" dataKey="cadence" stroke="var(--form)" strokeWidth={1.5} fill="url(#r-cad)" connectNulls isAnimationActive={false} />
        </Panel>
      )}

      {ride.hasDfa && (
        <Panel label="DFA α1 · sopra 0,75 sei sotto la soglia aerobica" metric="dfa" height={110} {...panel}>
          <YAxis {...axis} domain={[0.2, 1.8]} ticks={[0.5, 0.75, 1, 1.5]} />
          <ReferenceArea y1={0.75} y2={1.8} fill="var(--hrv-band)" fillOpacity={0.6} />
          <ReferenceArea y1={0.2} y2={0.5} fill="var(--critical-bg)" fillOpacity={0.8} />
          <ReferenceLine y={0.75} stroke="var(--hrv)" strokeDasharray="4 3" />
          <ReferenceLine y={0.5} stroke="var(--critical)" strokeDasharray="4 3" strokeOpacity={0.6} />
          <Line type="monotone" dataKey="dfa" stroke="var(--hrv)" strokeWidth={1.8} dot={false} connectNulls isAnimationActive={false} />
        </Panel>
      )}

      {hasAlt && (
        <Panel label="Altimetria (m)" metric="altitude" height={100} {...panel} showAxis>
          <defs>
            <Fade id="r-alt" color="var(--altitude)" from={0.55} />
          </defs>
          <YAxis {...axis} domain={["dataMin - 10", "dataMax + 10"]} tickFormatter={(v) => fmt(v)} />
          <Area type="monotone" dataKey="altitude" stroke="var(--altitude)" strokeWidth={1.5} fill="url(#r-alt)" baseValue="dataMin" connectNulls isAnimationActive={false} />
        </Panel>
      )}
    </div>
  );
}
