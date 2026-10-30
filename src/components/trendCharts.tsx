"use client";

// Charts of the section pages added after phase 1: eFTP, zones per week, plan vs done, sleep, weight,
// aerobic efficiency and durability. Same conventions as charts.tsx: one Y axis, soft fades, one tooltip.
import {
  Area,
  Bar,
  BarChart,
  Cell,
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
import { ZONE_IDS } from "@/lib/insights";
import { axis, Fade, grid, Legend, margin, type Row, TipBox, type TipProps } from "./charts";
import { fmt, fmtDay, fmtDuration, fmtMonth, fmtSecsLabel } from "./format";

const dashCursor = { stroke: "var(--faint)", strokeDasharray: "3 3" };
const barCursor = { fill: "var(--grid)", radius: 8 };

// ── eFTP ────────────────────────────────────────────────────────────────────────────────────────────

function EftpTip({ active, payload }: TipProps) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as DashboardData["eftp"][number];
  return (
    <TipBox
      title={fmtDay(p.date)}
      rows={[
        { label: "FTP stimata", value: fmt(p.eftp, 0, " W"), color: "var(--fitness)" },
        { label: "FTP usata quel giorno", value: fmt(p.ftp, 0, " W"), color: "var(--fatigue)" },
      ]}
    />
  );
}

/** The set FTP is drawn as today's value only: per-ride FTPs jump between indoor and outdoor settings. */
export function EftpChart({ eftp, ftp }: Pick<DashboardData, "eftp"> & { ftp: number | null }) {
  const values = eftp.map((p) => p.eftp).concat(ftp ?? []);
  const domain = values.length ? [Math.floor((Math.min(...values) - 15) / 10) * 10, Math.ceil((Math.max(...values) + 10) / 10) * 10] : [0, 300];
  return (
    <div>
      <Legend
        items={[
          { label: "FTP stimata (eFTP)", color: "var(--fitness)" },
          { label: "FTP impostata oggi", color: "var(--fatigue)", dashed: true },
        ]}
      />
      <ResponsiveContainer width="100%" height={210}>
        <ComposedChart data={eftp} margin={margin}>
          <defs>
            <Fade id="g-eftp" color="var(--fitness)" from={0.35} />
          </defs>
          {grid}
          <XAxis dataKey="date" tickFormatter={fmtMonth} minTickGap={40} {...axis} />
          <YAxis {...axis} domain={domain} tickFormatter={(v) => fmt(v)} />
          <Tooltip content={<EftpTip />} cursor={dashCursor} />
          {ftp && <ReferenceLine y={ftp} stroke="var(--fatigue)" strokeDasharray="5 4" label={{ value: `${ftp} W`, fontSize: 10, fill: "var(--fatigue-ink)", position: "insideTopRight" }} />}
          <Area type="monotone" dataKey="eftp" stroke="var(--fitness)" strokeWidth={2.5} fill="url(#g-eftp)" baseValue="dataMin" isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Time in zone per week ───────────────────────────────────────────────────────────────────────────

const ZONE_LABELS = ["Recupero", "Endurance", "Tempo", "Soglia", "VO2max", "Anaerobica", "Neuromusc."];

function ZoneWeekTip({ active, payload }: TipProps) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as DashboardData["zoneWeeks"][number];
  const rows: Row[] = ZONE_IDS.filter((z) => p[z] > 0).map((z) => ({
    label: `${z} ${ZONE_LABELS[ZONE_IDS.indexOf(z)]}`,
    value: fmtDuration(p[z] * 3600),
    color: `var(--${z.toLowerCase()})`,
  }));
  rows.push({ label: "Totale", value: fmtDuration(p.total * 3600) });
  return <TipBox title={`Settimana del ${fmtDay(p.week)}`} rows={rows} />;
}

export function ZoneWeeksChart({ zoneWeeks }: Pick<DashboardData, "zoneWeeks">) {
  return (
    <div>
      <Legend items={ZONE_IDS.map((z) => ({ label: z, color: `var(--${z.toLowerCase()})`, band: true }))} />
      <ResponsiveContainer width="100%" height={230}>
        <BarChart data={zoneWeeks} margin={margin}>
          {grid}
          <XAxis dataKey="week" tickFormatter={fmtDay} minTickGap={20} {...axis} />
          <YAxis {...axis} tickFormatter={(v) => `${fmt(v)}h`} />
          <Tooltip content={<ZoneWeekTip />} cursor={barCursor} />
          {ZONE_IDS.map((z, i) => (
            <Bar
              key={z}
              dataKey={z}
              stackId="z"
              fill={`var(--${z.toLowerCase()})`}
              barSize={18}
              radius={i === ZONE_IDS.length - 1 ? [6, 6, 0, 0] : 0}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Plan vs done ────────────────────────────────────────────────────────────────────────────────────

type PlanWeek = DashboardData["plan"]["weeks"][number];

function PlanTip({ active, payload }: TipProps) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as PlanWeek;
  const rows: Row[] = [
    { label: "Pianificato", value: `${fmt(p.planned)} · ${fmtDuration(p.plannedHours * 3600)}`, color: "var(--faint)" },
  ];
  if (p.when !== "next") rows.push({ label: p.when === "current" ? "Fatto finora" : "Fatto", value: `${fmt(p.done)} · ${fmtDuration(p.doneHours * 3600)}`, color: "var(--load)" });
  const pct = p.planned > 0 && p.when === "past" ? Math.round((p.done / p.planned) * 100) : null;
  return <TipBox title={`Settimana del ${fmtDay(p.week)}`} rows={pct !== null ? [...rows, { label: "Rispetto al piano", value: `${pct}%` }] : rows} />;
}

export function PlanChart({ weeks }: { weeks: PlanWeek[] }) {
  return (
    <div>
      <Legend
        items={[
          { label: "Carico pianificato", color: "var(--neutral-bg)", band: true },
          { label: "Carico fatto", color: "var(--load)", band: true },
        ]}
      />
      <ResponsiveContainer width="100%" height={230}>
        <BarChart data={weeks} margin={margin} barGap={2}>
          <defs>
            <linearGradient id="g-done" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="var(--load-soft)" />
              <stop offset="100%" stopColor="var(--load)" />
            </linearGradient>
          </defs>
          {grid}
          <XAxis dataKey="week" tickFormatter={fmtDay} minTickGap={20} {...axis} />
          <YAxis {...axis} />
          <Tooltip content={<PlanTip />} cursor={barCursor} />
          <Bar dataKey="planned" fill="var(--neutral-bg)" stroke="var(--faint)" strokeDasharray="3 3" radius={[6, 6, 6, 6]} barSize={14} isAnimationActive={false} />
          <Bar dataKey="done" fill="url(#g-done)" radius={[6, 6, 6, 6]} barSize={14} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Sleep and weight ────────────────────────────────────────────────────────────────────────────────

function SleepTip({ active, payload }: TipProps) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as DashboardData["sleep"][number];
  return (
    <TipBox
      title={`Notte del ${fmtDay(p.date)}`}
      rows={[
        { label: "Sonno", value: p.hours !== null ? fmtDuration(p.hours * 3600) : "–", color: "var(--sleep)" },
        { label: "Media 7 notti", value: p.avg7 !== null ? fmtDuration(p.avg7 * 3600) : "–", color: "var(--sleep-ink)" },
        { label: "Punteggio Garmin", value: fmt(p.score) },
      ]}
    />
  );
}

export function SleepChart({ sleep }: Pick<DashboardData, "sleep">) {
  const data = sleep.slice(-60);
  return (
    <div>
      <Legend
        items={[
          { label: "Ore per notte", color: "var(--sleep)", band: true },
          { label: "Media 7 notti", color: "var(--sleep-ink)" },
          { label: "7 ore", color: "var(--faint)", dashed: true },
        ]}
      />
      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={data} margin={margin}>
          {grid}
          <XAxis dataKey="date" tickFormatter={fmtDay} minTickGap={40} {...axis} />
          <YAxis {...axis} domain={[4, "dataMax + 0.5"]} tickFormatter={(v) => `${fmt(v)}h`} allowDataOverflow />
          <Tooltip content={<SleepTip />} cursor={barCursor} />
          <ReferenceLine y={7} stroke="var(--faint)" strokeDasharray="4 4" />
          <Bar dataKey="hours" fill="var(--sleep)" fillOpacity={0.55} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          <Line type="monotone" dataKey="avg7" stroke="var(--sleep-ink)" strokeWidth={2.2} dot={false} connectNulls isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function WeightTip({ active, payload }: TipProps) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as DashboardData["weightTrend"][number];
  return <TipBox title={fmtDay(p.date)} rows={[{ label: "Peso", value: fmt(p.kg, 1, " kg"), color: "var(--foreground)" }]} />;
}

export function WeightChart({ weightTrend }: Pick<DashboardData, "weightTrend">) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <ComposedChart data={weightTrend} margin={margin}>
        {grid}
        <XAxis dataKey="date" tickFormatter={fmtDay} minTickGap={40} {...axis} />
        <YAxis {...axis} domain={["dataMin - 1", "dataMax + 1"]} tickFormatter={(v) => fmt(v)} />
        <Tooltip content={<WeightTip />} cursor={dashCursor} />
        <Line type="monotone" dataKey="kg" stroke="var(--muted)" strokeWidth={2} dot={{ r: 3, fill: "var(--muted)", strokeWidth: 0 }} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ── Aerobic efficiency ──────────────────────────────────────────────────────────────────────────────

type EffRide = DashboardData["efficiency"][number];

function EffTip({ active, payload }: TipProps) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as EffRide;
  return (
    <TipBox
      title={`${fmtDay(p.date)} · ${p.name}`}
      rows={[
        { label: "EF dell'uscita", value: fmt(p.ef, 2), color: "var(--rhr)" },
        { label: "Media ultime 5", value: fmt(p.efAvg, 2), color: "var(--rhr-ink)" },
        { label: "Pw:HR", value: fmt(p.decoupling, 1, "%") },
        { label: "Durata · IF", value: `${fmtDuration(p.minutes * 60)} · ${fmt(p.IF, 2)}` },
      ]}
    />
  );
}

export function EfficiencyChart({ rides }: { rides: EffRide[] }) {
  return (
    <div>
      <Legend
        items={[
          { label: "EF di ogni uscita endurance", color: "var(--rhr)", band: true },
          { label: "Media delle ultime 5", color: "var(--rhr-ink)" },
        ]}
      />
      <ResponsiveContainer width="100%" height={210}>
        <ComposedChart data={rides} margin={margin}>
          {grid}
          <XAxis dataKey="date" tickFormatter={fmtDay} minTickGap={40} {...axis} />
          <YAxis {...axis} domain={["dataMin - 0.05", "dataMax + 0.05"]} tickFormatter={(v) => fmt(v, 2)} />
          <Tooltip content={<EffTip />} cursor={dashCursor} />
          <Scatter dataKey="ef" fill="var(--rhr)" fillOpacity={0.55} isAnimationActive={false} />
          <Line type="monotone" dataKey="efAvg" stroke="var(--rhr-ink)" strokeWidth={2.2} dot={false} connectNulls isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DecouplingChart({ rides }: { rides: EffRide[] }) {
  return (
    <ResponsiveContainer width="100%" height={210}>
      <BarChart data={rides} margin={margin}>
        {grid}
        <XAxis dataKey="date" tickFormatter={fmtDay} minTickGap={40} {...axis} />
        <YAxis {...axis} tickFormatter={(v) => `${fmt(v)}%`} />
        <Tooltip content={<EffTip />} cursor={barCursor} />
        <ReferenceLine y={5} stroke="var(--warning)" strokeDasharray="4 4" label={{ value: "5%", fontSize: 10, fill: "var(--warning)", position: "insideTopRight" }} />
        <Bar dataKey="decoupling" radius={[4, 4, 4, 4]} barSize={10} isAnimationActive={false}>
          {rides.map((r) => (
            <Cell key={r.id} fill={r.decoupling !== null && r.decoupling > 5 ? "var(--warning)" : "var(--good)"} fillOpacity={0.75} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Durability ──────────────────────────────────────────────────────────────────────────────────────

export type DurabilityRow = { secs: number; fresh: number | null; after2: number | null; after3: number | null };

function DurTip({ active, payload }: TipProps) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as DurabilityRow;
  const pct = (x: number | null) => (x !== null && p.fresh ? ` (${Math.round((x / p.fresh) * 100)}%)` : "");
  return (
    <TipBox
      title={`Migliori ${fmtSecsLabel(p.secs)}`}
      rows={[
        { label: "Da fresco", value: fmt(p.fresh, 0, " W"), color: "var(--fitness)" },
        { label: "Dopo 2 ore", value: fmt(p.after2, 0, " W") + pct(p.after2), color: "var(--fatigue)" },
        { label: "Dopo 3 ore", value: fmt(p.after3, 0, " W") + pct(p.after3), color: "var(--rhr)" },
      ]}
    />
  );
}

export function DurabilityChart({ rows }: { rows: DurabilityRow[] }) {
  return (
    <div>
      <Legend
        items={[
          { label: "Da fresco (84 gg)", color: "var(--fitness)", band: true },
          { label: "Dopo 2 ore", color: "var(--fatigue)", band: true },
          { label: "Dopo 3 ore", color: "var(--rhr)", band: true },
        ]}
      />
      <ResponsiveContainer width="100%" height={210}>
        <BarChart data={rows} margin={margin} barGap={2}>
          {grid}
          <XAxis dataKey="secs" tickFormatter={fmtSecsLabel} {...axis} />
          <YAxis {...axis} />
          <Tooltip content={<DurTip />} cursor={barCursor} />
          <Bar dataKey="fresh" fill="var(--fitness)" radius={[6, 6, 0, 0]} barSize={14} isAnimationActive={false} />
          <Bar dataKey="after2" fill="var(--fatigue)" radius={[6, 6, 0, 0]} barSize={14} isAnimationActive={false} />
          <Bar dataKey="after3" fill="var(--rhr)" radius={[6, 6, 0, 0]} barSize={14} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
