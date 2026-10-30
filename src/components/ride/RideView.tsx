"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { RideDetail } from "@/lib/ride";
import { loadRide, type RideResult } from "../data/rides";
import { fmt, fmtClock, fmtDuration, fmtTime, fmtWeekday } from "../format";
import { RideCharts } from "./RideCharts";
import { TestCard } from "./TestCard";

// Leaflet touches `window`, so the map only renders in the browser.
const RideMap = dynamic(() => import("./RideMap"), {
  ssr: false,
  loading: () => <div className="h-full w-full rounded-xl" style={{ background: "var(--map-bg)" }} />,
});

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="card px-3.5 py-2.5">
      <div className="text-[11px] text-muted">{label}</div>
      <div className="num mt-0.5 text-lg font-medium">{value}</div>
    </div>
  );
}

function ZoneBars({ rows }: { rows: { id: string; label: string; secs: number; color: string }[] }) {
  const total = rows.reduce((a, r) => a + r.secs, 0) || 1;
  return (
    <div className="space-y-1.5">
      {rows.map((r) => (
        <div key={r.id} className="flex items-center gap-2 text-xs">
          <span className="w-28 shrink-0 text-muted">
            <span className="font-medium text-foreground">{r.id}</span> {r.label}
          </span>
          <div className="h-2.5 flex-1 rounded-full" style={{ background: "var(--neutral-bg)" }}>
            <div
              className="h-2.5 rounded-full"
              style={{ width: `${Math.max(r.secs > 0 ? 1.5 : 0, (r.secs / total) * 100)}%`, background: r.color }}
            />
          </div>
          <span className="num w-10 text-right">{fmt((r.secs / total) * 100)}%</span>
          <span className="num w-12 text-right text-faint">{fmtDuration(r.secs)}</span>
        </div>
      ))}
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="card min-w-0 p-5">
      <h2 className="text-sm font-medium">{title}</h2>
      {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

const ZONE_VARS = ["--z1", "--z2", "--z3", "--z4", "--z5", "--z6", "--z7"];
const HR_COLORS = ["#c9d1db", "#f9d3da", "#f4b6c1", "#ee8f9f", "#e46f84", "#d65470", "#c24f63"];

function RideBody({ ride }: { ride: RideDetail }) {
  const [hover, setHover] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const s = ride.summary;

  const subline = [
    fmtTime(ride.date),
    s.distanceKm !== null ? `${fmt(s.distanceKm, 1)} km` : null,
    fmtDuration(s.movingTime),
    s.elevation !== null ? `${fmt(s.elevation)} m D+` : null,
    s.speedKmh !== null ? `${fmt(s.speedKmh, 1)} km/h` : null,
    s.temp !== null ? `${fmt(s.temp)} °C` : null,
  ].filter(Boolean);

  const tiles: [string, string][] = [
    ["NP", fmt(s.np, 0, " W")],
    ["Potenza media", fmt(s.avgWatts, 0, " W")],
    ["TSS", fmt(s.tss)],
    ["IF", fmt(s.IF, 2)],
    ["VI", fmt(s.vi, 2)],
    ["Lavoro", fmt(s.kj, 0, " kJ")],
    ["FC media / max", `${fmt(s.avgHr)} / ${fmt(s.maxHr)}`],
    ["Cadenza", fmt(s.cadence, 0, " rpm")],
    ["Pw:HR", fmt(s.decoupling, 1, "%")],
    ["EF", fmt(s.ef, 2)],
    ["Bilanciamento S/D", s.lrLeft !== null ? `${fmt(s.lrLeft)} / ${fmt(100 - s.lrLeft)}` : "–"],
    ["Carboidrati", s.carbs !== null ? `~${fmt(s.carbs)} g` : "–"],
  ];

  const map = ride.hasRoute && (
    <section className="card min-w-0 p-3">
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 className="text-sm font-medium">Percorso</h2>
        <button
          className="rounded-full px-3 py-1 text-xs"
          style={{ background: "var(--accent-bg)", color: "var(--accent-ink)" }}
          onClick={() => setExpanded((x) => !x)}
        >
          {expanded ? "Riduci" : "Apri mappa"}
        </button>
      </div>
      {/* No height animation: Leaflet must measure the final size to fit the route. */}
      <div style={{ height: expanded ? 560 : 260 }}>
        <RideMap points={ride.points} hoverIndex={hover} expanded={expanded} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[11px] text-muted">
        <span>Colore = zona di potenza (media 1&apos;)</span>
        {ZONE_VARS.map((v, i) => (
          <span key={v} className="flex items-center gap-1">
            <span className="inline-block h-2 w-3 rounded-sm" style={{ background: `var(${v})` }} />Z{i + 1}
          </span>
        ))}
        <span style={{ color: "var(--good)" }}>● partenza</span>
        <span style={{ color: "var(--critical)" }}>● arrivo</span>
      </div>
    </section>
  );

  return (
    <main className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6">
      <Link href="/attivita" className="text-xs" style={{ color: "var(--accent-ink)" }}>
        ← Uscite
      </Link>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-medium">{ride.name}</h1>
          <p className="mt-0.5 text-xs text-muted">
            {fmtWeekday(ride.date)} · {subline.join(" · ")}
          </p>
        </div>
        <div className="flex gap-2">
          {ride.indoor && (
            <span className="rounded-full px-3 py-1 text-xs" style={{ background: "var(--accent-bg)", color: "var(--accent-ink)" }}>
              Rulli
            </span>
          )}
          {/* A test is not a training session: its IF-based label would be misleading. */}
          {ride.label && !ride.test && (
            <span className="rounded-full px-3 py-1 text-xs" style={{ background: "var(--good-bg)", color: "var(--good)" }}>
              {ride.label} · IF {fmt(s.IF, 2)}
            </span>
          )}
        </div>
      </header>

      {ride.test && <TestCard test={ride.test} ftpAtTheTime={ride.ftp} />}

      {expanded && map}
      <div className={`grid gap-4 ${ride.hasRoute && !expanded ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]" : ""}`}>
        {!expanded && map}
        <div className="grid grid-cols-2 gap-3 self-start sm:grid-cols-3 lg:grid-cols-4">
          {tiles.map(([l, v]) => (
            <Tile key={l} label={l} value={v} />
          ))}
        </div>
      </div>

      <Section
        title="Andamento"
        subtitle={`Medie ogni ${ride.bucketSecs} s · le fasce viola sono gli sforzi rilevati${ride.hasRoute ? " · passa sul grafico per vedere il punto sulla mappa" : ""}`}
      >
        <RideCharts ride={ride} onHover={setHover} />
      </Section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Tempo in zona di potenza" subtitle={ride.ftp ? `Zone Coggan su FTP ${ride.ftp} W` : undefined}>
          <ZoneBars
            rows={ride.powerZones.map((z, i) => ({ id: z.id, label: z.name, secs: z.secs, color: `var(${ZONE_VARS[i]})` }))}
          />
        </Section>
        <Section title="Tempo in zona cardio" subtitle="Zone impostate su Intervals.icu">
          <ZoneBars
            rows={ride.hrZones.map((z, i) => ({
              id: z.id,
              label: z.upper !== null ? `≤ ${z.upper} bpm` : "",
              secs: z.secs,
              color: HR_COLORS[i] ?? HR_COLORS[HR_COLORS.length - 1],
            }))}
          />
        </Section>
      </div>

      <Section title="Sforzi rilevati" subtitle="Intervalli di lavoro individuati automaticamente da Intervals.icu">
        {ride.efforts.length === 0 ? (
          <p className="text-sm text-muted">Nessuno sforzo rilevato: uscita a ritmo costante.</p>
        ) : (
          <div className="-mx-5 overflow-x-auto px-5">
            <table className="num w-full min-w-[520px] text-xs">
              <thead>
                <tr className="text-left text-faint">
                  <th className="py-2 font-normal">Zona</th>
                  <th className="py-2 font-normal">Inizio</th>
                  <th className="py-2 text-right font-normal">Km</th>
                  <th className="py-2 text-right font-normal">Durata</th>
                  <th className="py-2 text-right font-normal">W medi</th>
                  <th className="py-2 text-right font-normal">NP</th>
                  <th className="py-2 text-right font-normal">W max</th>
                  <th className="py-2 text-right font-normal">FC media</th>
                </tr>
              </thead>
              <tbody>
                {ride.efforts.map((e) => (
                  <tr key={e.startSec} className="border-t border-border">
                    <td className="py-2">
                      <span
                        className="inline-block w-8 rounded-md py-0.5 text-center text-[11px] font-medium"
                        style={{ background: e.zone !== null ? `var(${ZONE_VARS[e.zone]})` : "var(--neutral-bg)" }}
                      >
                        {e.zone !== null ? `Z${e.zone + 1}` : "–"}
                      </span>
                    </td>
                    <td className="py-2 text-muted">{fmtClock(e.startSec)}</td>
                    <td className="py-2 text-right">{fmt(e.km, 1)}</td>
                    <td className="py-2 text-right">{fmtClock(e.durationSec)}</td>
                    <td className="py-2 text-right">{fmt(e.avgWatts, 0, " W")}</td>
                    <td className="py-2 text-right">{fmt(e.np, 0, " W")}</td>
                    <td className="py-2 text-right">{fmt(e.maxWatts, 0, " W")}</td>
                    <td className="py-2 text-right">{fmt(e.avgHr)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </main>
  );
}

type Loaded = { id: string; attempt: number } & RideResult;

/** Waiting message that says what is happening when it takes longer than usual. */
function Loading() {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="mx-auto max-w-xl p-6 text-sm text-muted">
      <p>Carico l&apos;uscita…</p>
      {secs >= 4 && (
        <p className="mt-2 text-xs text-faint">
          Scarico i dati secondo per secondo da Intervals.icu ({secs} s). La prima apertura di un&apos;uscita può richiedere
          qualche secondo, poi resta in memoria.
        </p>
      )}
    </div>
  );
}

export default function RideView() {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<Loaded | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    loadRide(id).then((r) => !cancelled && setState({ id, attempt, ...r }));
    return () => {
      cancelled = true;
    };
  }, [id, attempt]);

  // Ignore a result that belongs to a previously opened ride or to an earlier attempt.
  if (!state || state.id !== id || state.attempt !== attempt) return <Loading />;
  if ("error" in state)
    return (
      <div className="mx-auto max-w-xl p-6">
        <Link href="/attivita" className="text-xs" style={{ color: "var(--accent-ink)" }}>
          ← Uscite
        </Link>
        <h1 className="mt-3 text-lg font-medium">Impossibile aprire l&apos;uscita</h1>
        <p className="mt-2 text-sm text-muted">{state.error}</p>
        <button
          className="mt-4 rounded-xl px-4 py-2 text-sm font-medium"
          style={{ background: "var(--accent-bg)", color: "var(--accent-ink)" }}
          onClick={() => setAttempt((a) => a + 1)}
        >
          Riprova
        </button>
      </div>
    );
  return <RideBody ride={state.ride} />;
}
