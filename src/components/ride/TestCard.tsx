"use client";

import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TestResult } from "@/lib/physio/fitnessTest";
import { fmt } from "../format";

const axis = { stroke: "var(--faint)", fontSize: 11, tickLine: false, axisLine: false } as const;

// Tooltip payloads are typed loosely by Recharts; we only read our own row object.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TipProps = { active?: boolean; payload?: any[] };

function ConconiTip({ active, payload }: TipProps) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as { watts: number; hr?: number; fit?: number };
  return (
    <div className="card px-3 py-2 text-xs" style={{ boxShadow: "var(--tip-shadow)", borderTop: "3px solid var(--rhr)" }}>
      <div className="num text-base font-medium" style={{ color: "var(--rhr-ink)" }}>
        {fmt(p.hr ?? p.fit, 0, " bpm")}
      </div>
      <div className="text-muted">a {fmt(p.watts, 0, " W")}</div>
    </div>
  );
}

/** HR vs power across the ramp, with the cubic fit and the Dmax deflection point (Conconi plot). */
function ConconiChart({ test }: { test: TestResult }) {
  const d = test.deflection!;
  const data = [
    ...d.points.map((p) => ({ watts: Math.round(p.watts), hr: Math.round(p.hr) })),
    ...d.fit.map((p) => ({ watts: Math.round(p.watts), fit: Math.round(p.hr * 10) / 10 })),
  ].sort((a, b) => a.watts - b.watts);
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: "var(--rhr)" }} />
          FC ogni 30&quot;
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-4" style={{ borderTop: "2px solid var(--rhr-ink)" }} />
          Curva interpolata
        </span>
        {test.ftp && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-4" style={{ borderTop: "2px dashed var(--fatigue)" }} />
            FTP stimata
          </span>
        )}
      </div>
      <ResponsiveContainer width="100%" height={230}>
        <ComposedChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -14 }}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis dataKey="watts" type="number" domain={["dataMin", "dataMax"]} unit=" W" {...axis} />
          <YAxis {...axis} domain={["dataMin - 3", "dataMax + 3"]} tickFormatter={(v) => fmt(v)} />
          <Tooltip content={<ConconiTip />} cursor={{ stroke: "var(--rhr)", strokeDasharray: "3 3" }} />
          {test.ftp?.low !== undefined && test.ftp.high !== undefined && (
            <ReferenceArea x1={test.ftp.low} x2={test.ftp.high} fill="var(--fatigue)" fillOpacity={0.12} strokeOpacity={0} />
          )}
          {test.ftp && <ReferenceLine x={test.ftp.watts} stroke="var(--fatigue)" strokeDasharray="4 4" />}
          <Scatter dataKey="hr" fill="var(--rhr)" fillOpacity={0.55} isAnimationActive={false} />
          <Line dataKey="fit" stroke="var(--rhr-ink)" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
          {d.found && d.watts !== null && d.hr !== null && (
            <ReferenceDot x={d.watts} y={d.hr} r={6} fill="var(--critical)" stroke="#fff" strokeWidth={2} />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function Row({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-border py-2 first:border-0">
      <span className="text-xs text-muted">{label}</span>
      <span className="text-right">
        <span className="num text-sm font-medium">{value}</span>
        {note && <span className="block text-[11px] text-faint">{note}</span>}
      </span>
    </div>
  );
}

const decimal = (x: number) => x.toFixed(2).replace(".", ",");

/** Ramp tests: how the FTP was built (standard rule, individual MAP fraction, lag-corrected deflection) and how to confirm it. */
function RampReasoning({ test }: { test: TestResult }) {
  const r = test.ramp!;
  const d = test.deflection;
  return (
    <div className="mt-4">
      <div className="text-xs font-medium">Come è stata stimata</div>
      <Row label="Regola standard (0,75 × MAP)" value={`${r.standard} W`} note="Media di popolazione" />
      <Row
        label={`Frazione del MAP personale (${decimal(r.fraction.low)}–${decimal(r.fraction.high)})`}
        value={`${r.fromMap.low}–${r.fromMap.high} W`}
        note={r.fraction.why}
      />
      {r.fromDeflection && d?.watts != null && test.rampRate !== null && (
        <Row
          label="Flesso FC corretto per il ritardo"
          value={`${r.fromDeflection.low}–${r.fromDeflection.high} W`}
          note={`Flesso a ${d.watts} W − ${Math.round(test.rampRate)} W/min × 1–1,5 min (la FC insegue la potenza)`}
        />
      )}
      <div className="mt-3 text-xs font-medium">Come confermarla</div>
      <ul className="mt-1 space-y-1 text-xs text-muted">
        {r.validation.map((v) => (
          <li key={v} className="flex gap-2">
            <span>•</span>
            {v}
          </li>
        ))}
      </ul>
    </div>
  );
}

const PROTOCOL_LABEL: Record<TestResult["protocol"], string> = {
  rampa: "Test a rampa",
  "20 minuti": "Test 20 minuti",
  "2×8 minuti": "Test 2×8 minuti",
  sconosciuto: "Test",
};

export function TestCard({ test, ftpAtTheTime }: { test: TestResult; ftpAtTheTime: number | null }) {
  const d = test.deflection;
  const delta = test.ftp && ftpAtTheTime ? test.ftp.watts - ftpAtTheTime : null;
  const hrvt2 = test.dfa?.vt2 ?? null;
  const agree = d?.found && d.hr !== null && hrvt2 ? Math.abs(d.hr - hrvt2.hr) <= 5 : null;
  const bests = [
    ["1'", test.best1],
    ["5'", test.best5],
    ["8'", test.best8],
    ["20'", test.best20],
  ] as const;

  return (
    <section className="card min-w-0 p-5" style={{ background: "linear-gradient(135deg, var(--warning-bg) 0%, var(--surface) 55%)" }}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-medium">Risultato del test</h2>
        <span className="rounded-full px-2.5 py-0.5 text-[11px] font-medium" style={{ background: "var(--warning-bg)", color: "var(--warning)" }}>
          {PROTOCOL_LABEL[test.protocol]}
        </span>
      </div>

      <div className={`mt-4 grid gap-6 ${d ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]" : ""}`}>
        <div>
          {test.ftp ? (
            <div>
              <div className="text-xs text-muted">FTP stimata</div>
              <div className="num text-3xl font-medium" style={{ color: "var(--fatigue-ink)" }}>
                {test.ftp.watts} W
              </div>
              {test.ftp.low !== undefined && test.ftp.high !== undefined && (
                <div className="num text-sm" style={{ color: "var(--fatigue-ink)" }}>
                  intervallo {test.ftp.low}–{test.ftp.high} W
                </div>
              )}
              <div className="text-xs text-muted">
                {test.ftp.method} · {test.ftp.basis}
              </div>
              {delta !== null && (
                <div className="mt-1 text-xs text-muted">
                  FTP impostata allora: {ftpAtTheTime} W ({delta > 0 ? "+" : ""}
                  {delta} W)
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted">Protocollo non riconosciuto: nessuna stima di FTP.</p>
          )}

          {test.ramp && <RampReasoning test={test} />}

          <div className="mt-4">
            {test.protocol === "rampa" && d && (
              <Row
                label="Flessione della FC (Conconi, Dmax)"
                value={d.found ? `${d.hr} bpm a ${d.watts} W` : "Non evidente"}
                note={d.found ? "Stima della soglia FC" : "La FC sale in modo lineare: succede in molti atleti"}
              />
            )}
            {test.protocol === "rampa" && test.hrAtFtp !== null && (
              <Row label="FC alla potenza di soglia" value={`${test.hrAtFtp} bpm`} note="Indicativa: in rampa la FC è in ritardo sulla potenza" />
            )}
            {test.dfa?.vt1 && (
              <Row label="Soglia aerobica (DFA α1 = 0,75)" value={`${test.dfa.vt1.hr} bpm · ${test.dfa.vt1.watts} W`} />
            )}
            {test.dfa?.vt2 && (
              <Row
                label="Soglia anaerobica (DFA α1 = 0,5)"
                value={`${test.dfa.vt2.hr} bpm · ${test.dfa.vt2.watts} W`}
                note={agree === null ? undefined : agree ? "Concorda con la flessione della FC" : "Non concorda con la flessione: preferisci il DFA α1"}
              />
            )}
            <Row label="FC massima" value={fmt(test.hrMax, 0, " bpm")} />
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {bests.map(([label, w]) =>
              w !== null ? (
                <span key={label} className="num rounded-full px-2.5 py-1 text-xs" style={{ background: "var(--background)" }}>
                  <span className="text-muted">{label}</span> <b className="font-medium">{w} W</b>
                </span>
              ) : null,
            )}
          </div>

          {test.warnings.length > 0 && (
            <ul className="mt-4 space-y-1.5 text-xs" style={{ color: "var(--warning-ink)" }}>
              {test.warnings.map((w) => (
                <li key={w} className="flex gap-2">
                  <span>•</span>
                  {w}
                </li>
              ))}
            </ul>
          )}
        </div>

        {d && (
          <div className="min-w-0">
            <div className="mb-1 text-xs font-medium" style={{ color: "var(--rhr-ink)" }}>
              FC rispetto alla potenza durante la rampa
            </div>
            <ConconiChart test={test} />
          </div>
        )}
      </div>
    </section>
  );
}
