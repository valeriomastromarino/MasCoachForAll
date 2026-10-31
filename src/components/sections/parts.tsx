"use client";

// Building blocks shared by the section pages (Oggi, Forma, Potenza, Cuore, Recupero).
import Link from "next/link";
import type { DashboardData } from "@/lib/dashboard";
import type { AutonomicPattern } from "@/lib/physio/autonomic";
import type { ReadinessLevel } from "@/lib/physio/readiness";
import { capitalize, fmt, fmtDay, fmtDuration, fmtWeekday } from "../format";

export function Card({ title, subtitle, children, className = "" }: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`card min-w-0 p-5 ${className}`}>
      <h2 className="text-sm font-medium">{title}</h2>
      {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function Stat({ label, value, hint, color }: { label: string; value: string; hint?: string; color?: string }) {
  return (
    <div className="card px-4 py-3">
      <div className="flex items-center gap-1.5 text-xs text-muted">
        {color && <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />}
        {label}
      </div>
      <div className="num mt-1 text-2xl font-medium">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-faint">{capitalize(hint)}</div>}
    </div>
  );
}

const LEVEL_STYLE: Record<ReadinessLevel, { ink: string; bg: string; icon: string }> = {
  verde: { ink: "var(--good)", bg: "var(--good-bg)", icon: "✓" },
  giallo: { ink: "var(--warning)", bg: "var(--warning-bg)", icon: "!" },
  rosso: { ink: "var(--critical)", bg: "var(--critical-bg)", icon: "✕" },
  grigio: { ink: "var(--muted)", bg: "var(--neutral-bg)", icon: "?" },
};

export function ReadinessCard({ status }: { status: DashboardData["status"] }) {
  const r = status.readiness;
  const s = LEVEL_STYLE[r.level];
  return (
    <section className="card p-5" style={{ background: `linear-gradient(135deg, ${s.bg} 0%, var(--surface) 75%)` }}>
      <div className="flex items-center gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg font-medium text-white"
          style={{ background: s.ink }}
          aria-hidden
        >
          {s.icon}
        </span>
        <div>
          <div className="text-xs text-muted">Stato di oggi</div>
          <div className="text-xl font-medium" style={{ color: s.ink }}>
            {r.headline}
          </div>
        </div>
      </div>
      <p className="mt-4 text-sm">{r.advice}</p>
      <ul className="mt-3 space-y-1.5 text-xs text-muted">
        {r.reasons.map((x) => (
          <li key={x} className="flex gap-2">
            <span style={{ color: s.ink }}>•</span>
            {x}
          </li>
        ))}
      </ul>
    </section>
  );
}

// Altini's HRV × resting-HR reading as a 3×3 grid: rows = HRV band, columns = resting-HR band.
const MATRIX: { pattern: AutonomicPattern; label: string }[][] = [
  [
    { pattern: "adattamento", label: "Adattamento" },
    { pattern: "hrv_alto", label: "HRV alta" },
    { pattern: "discordante", label: "Discordante" },
  ],
  [
    { pattern: "adattamento", label: "Adattamento" },
    { pattern: "stabile", label: "Equilibrio" },
    { pattern: "fc_alta", label: "FC alta" },
  ],
  [
    { pattern: "saturazione", label: "Saturazione" },
    { pattern: "hrv_basso", label: "HRV bassa" },
    { pattern: "stress", label: "Stress" },
  ],
];

const CELL_TONE: Record<AutonomicPattern, { bg: string; ink: string }> = {
  stabile: { bg: "var(--good-bg)", ink: "var(--good)" },
  adattamento: { bg: "var(--good-bg)", ink: "var(--good)" },
  hrv_alto: { bg: "var(--good-bg)", ink: "var(--good)" },
  hrv_basso: { bg: "var(--warning-bg)", ink: "var(--warning)" },
  fc_alta: { bg: "var(--warning-bg)", ink: "var(--warning)" },
  saturazione: { bg: "var(--warning-bg)", ink: "var(--warning)" },
  stress: { bg: "var(--critical-bg)", ink: "var(--critical)" },
  discordante: { bg: "var(--neutral-bg)", ink: "var(--muted)" },
  dati_insufficienti: { bg: "var(--neutral-bg)", ink: "var(--muted)" },
};

function bandIndex(value: number | null, low: number | null, high: number | null): number | null {
  if (value === null || low === null || high === null) return null;
  return value > high ? 0 : value < low ? 2 : 1;
}

export function AutonomicPanel({ status }: { status: DashboardData["status"] }) {
  const a = status.autonomic;
  const tone = CELL_TONE[a.pattern];
  const row = bandIndex(status.hrv.baseline7, status.hrv.low, status.hrv.high);
  // RHR columns run low → high, so invert the band index.
  const rhrIdx = bandIndex(status.rhr.baseline7, status.rhr.low, status.rhr.high);
  const col = rhrIdx === null ? null : 2 - rhrIdx;
  const recent = a.anomalyDates.slice(-6).reverse();
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="flex flex-col gap-4">
        <div className="rounded-xl px-4 py-3" style={{ background: tone.bg }}>
          <div className="text-xs" style={{ color: tone.ink }}>
            Lettura combinata
          </div>
          <div className="text-lg font-medium" style={{ color: tone.ink }}>
            {a.title}
          </div>
          <p className="mt-1 text-xs text-foreground/80">{a.explanation}</p>
        </div>
        <AnomalousNights dates={recent} />
      </div>

      <div>
        <div className="grid grid-cols-[auto_repeat(3,minmax(0,1fr))] gap-1 text-[11px]">
          <div />
          {["FC bassa", "FC normale", "FC alta"].map((h) => (
            <div key={h} className="pb-1 text-center text-faint">
              {h}
            </div>
          ))}
          {MATRIX.map((cells, r) => (
            <div key={r} className="contents">
              <div className="flex items-center pr-2 text-faint">{["HRV alta", "HRV norm.", "HRV bassa"][r]}</div>
              {cells.map((c, k) => {
                const active = r === row && k === col;
                const t = CELL_TONE[c.pattern];
                return (
                  <div
                    key={k}
                    className="rounded-lg px-1 py-2 text-center"
                    style={{
                      background: active ? t.bg : "var(--background)",
                      color: active ? t.ink : "var(--faint)",
                      outline: active ? `1.5px solid ${t.ink}` : undefined,
                      fontWeight: active ? 500 : 400,
                    }}
                  >
                    {c.label}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-faint">Medie degli ultimi 7 giorni rispetto ai tuoi range normali di 60 giorni.</p>
      </div>
    </div>
  );
}

function AnomalousNights({ dates }: { dates: string[] }) {
  return (
    <div className="text-xs">
      <div className="font-medium">Notti anomale</div>
      {dates.length === 0 ? (
        <p className="mt-1 text-muted">Nessuna negli ultimi 120 giorni.</p>
      ) : (
        <>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {dates.map((d) => (
              <span key={d} className="rounded-full px-2 py-0.5" style={{ background: "var(--critical-bg)", color: "var(--critical)" }}>
                {fmtDay(d)}
              </span>
            ))}
          </div>
          <p className="mt-1.5 text-muted">
            HRV bassa e FC a riposo alta nella stessa notte. Una sola notte di solito è sonno, alcol o stress; due o più di
            fila spesso anticipano un malanno.
          </p>
        </>
      )}
    </div>
  );
}

export const ZONE_NAMES = ["Recupero", "Endurance", "Tempo", "Soglia", "VO2max", "Anaerobica", "Neuromusc."];

export function ZoneTime({ shares, d }: { shares: DashboardData["zoneShares"]; d: DashboardData["distribution"] }) {
  if (d.totalSecs === 0) return <p className="text-sm text-muted">Nessun dato di potenza negli ultimi {d.days} giorni.</p>;
  return (
    <div>
      <div className="flex h-3.5 w-full gap-0.5 overflow-hidden rounded-full">
        {shares.map((z) => (
          <div key={z.id} style={{ width: `${z.share * 100}%`, background: `var(--${z.id.toLowerCase()})` }} />
        ))}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
        {shares.map((z, i) => (
          <div key={z.id} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded" style={{ background: `var(--${z.id.toLowerCase()})` }} />
            <span className="text-muted">
              {z.id} <span className="text-faint">{ZONE_NAMES[i]}</span>
            </span>
            <span className="num ml-auto font-medium">{fmt(z.share * 100)}%</span>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-muted">
        Modello a 3 zone di Seiler: <b className="font-medium text-foreground">{fmt(d.low * 100)}%</b> bassa ·{" "}
        <b className="font-medium text-foreground">{fmt(d.mid * 100)}%</b> media ·{" "}
        <b className="font-medium text-foreground">{fmt(d.high * 100)}%</b> alta, distribuzione {d.pattern}. Riferimento per
        un amatore evoluto: circa 75–80% a bassa intensità.
      </p>
    </div>
  );
}

export function ZonesTable({ zones, unit, colored }: { zones: DashboardData["powerZones"]; unit: string; colored?: boolean }) {
  if (!zones.length) return <p className="text-sm text-muted">Soglia non impostata su Intervals.icu.</p>;
  return (
    <table className="num w-full text-xs">
      <tbody>
        {zones.map((z, i) => (
          <tr key={z.id} className="border-t border-border first:border-0">
            <td className="py-1.5">
              <span
                className="mr-2 inline-block w-8 rounded-md py-0.5 text-center text-[11px] font-medium"
                style={{ background: colored ? `var(--z${i + 1})` : "var(--neutral-bg)", color: "var(--foreground)" }}
              >
                {z.id}
              </span>
              <span className="text-muted">{z.name}</span>
            </td>
            <td className="py-1.5 text-right whitespace-nowrap">
              {z.max === null ? `> ${z.min - 1}` : `${z.min}–${z.max}`} <span className="text-faint">{unit}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Compact list for the narrow column under today's status; the full metrics live in the archive and ride detail.
export function RecentRides({ rows }: { rows: DashboardData["activities"] }) {
  return (
    <ul className="-mx-2">
      {rows.map((a) => (
        <li key={a.id}>
          <Link
            href={`/attivita/${a.id}`}
            className="flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-[var(--background)]"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium" style={{ color: "var(--accent-ink)" }}>
                {a.name}
              </div>
              <div className="num mt-0.5 text-[11px] text-faint">
                {fmtWeekday(a.date)} · {fmtDuration(a.movingTime)}
                {a.indoor && " · rulli"}
              </div>
            </div>
            <div className="num shrink-0 text-right text-xs">
              {fmt(a.tss)} <span className="text-[11px] text-faint">TSS</span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
