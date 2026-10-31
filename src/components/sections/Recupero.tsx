"use client";

import { RecoveryCharts } from "../charts";
import { fmt, fmtDay, fmtDuration } from "../format";
import { SleepChart, WeightChart } from "../trendCharts";
import { AutonomicPanel, Card, Stat } from "./parts";
import { SectionPage } from "./SectionPage";

export default function Recupero() {
  return (
    <SectionPage id="recupero">
      {(data) => {
        const { status, sleep, weightTrend } = data;
        const hrv7 = status.hrv.baseline7 !== null ? Math.exp(status.hrv.baseline7) : null;
        const lastSleep = sleep.at(-1);
        const scores = sleep.slice(-7).map((s) => s.score).filter((x): x is number => x !== null);
        const score7 = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
        const lastWeight = weightTrend.at(-1);
        return (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="HRV 7 gg" color="var(--hrv)" value={fmt(hrv7, 0, " ms")} hint={status.hrv.status} />
              <Stat
                label="FC a riposo"
                color="var(--rhr)"
                value={fmt(status.rhr.today, 0, " bpm")}
                hint={status.rhr.baseline7 !== null ? `media 7 gg ${fmt(status.rhr.baseline7, 1)}` : undefined}
              />
              <Stat
                label="Sonno, media 7 notti"
                color="var(--sleep)"
                value={lastSleep?.avg7 != null ? fmtDuration(lastSleep.avg7 * 3600) : "–"}
                hint={score7 !== null ? `punteggio medio ${fmt(score7)}` : undefined}
              />
              <Stat label="Peso" value={fmt(lastWeight?.kg, 1, " kg")} hint={lastWeight ? `pesata del ${fmtDay(lastWeight.date)}` : "nessuna pesata"} />
            </div>

            <Card title="HRV e FC a riposo" subtitle="Lettura combinata dei due marcatori notturni secondo il metodo di Marco Altini">
              <AutonomicPanel status={status} />
              <div className="mt-6 min-w-0">
                <RecoveryCharts recovery={data.recovery} />
              </div>
            </Card>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <Card title="Sonno" subtitle="Ore dormite per notte dal Garmin, ultimi 60 giorni">
                <SleepChart sleep={sleep} />
                <p className="mt-2 text-xs text-muted">
                  Sotto le 7 ore per più notti di fila l&apos;HRV tende a scendere e gli allenamenti duri rendono meno.
                </p>
              </Card>
              <Card title="Peso" subtitle={`${weightTrend.length} pesate negli ultimi 6 mesi`}>
                {weightTrend.length >= 2 ? (
                  <WeightChart weightTrend={weightTrend} />
                ) : (
                  <p className="text-sm text-muted">Servono almeno due pesate su Garmin o Intervals.icu per vedere l&apos;andamento.</p>
                )}
                <p className="mt-2 text-xs text-muted">Il peso serve per i W/kg: pesati ogni tanto, al mattino, sempre nelle stesse condizioni.</p>
              </Card>
            </div>
          </>
        );
      }}
    </SectionPage>
  );
}
