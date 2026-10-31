"use client";

import { fmt } from "../format";
import { DecouplingChart, EfficiencyChart } from "../trendCharts";
import { Card, Stat, ZonesTable } from "./parts";
import { SectionPage } from "./SectionPage";

export default function Cuore() {
  return (
    <SectionPage id="cuore">
      {(data) => {
        const { athlete } = data;
        const withEf = data.efficiency.filter((r) => r.ef !== null);
        const efNow = withEf.at(-1)?.efAvg ?? null;
        const efThen = withEf.find((r) => r.efAvg !== null)?.efAvg ?? null;
        // Pw:HR is only meaningful on long steady rides.
        const steady = data.efficiency.filter((r) => r.minutes >= 90 && r.decoupling !== null);
        const okShare = steady.length ? steady.filter((r) => r.decoupling! <= 5).length / steady.length : null;
        return (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="FC di soglia" color="var(--rhr)" value={fmt(athlete.lthr, 0, " bpm")} hint="LTHR su Intervals.icu" />
              <Stat label="FC massima" value={fmt(athlete.maxHr, 0, " bpm")} />
              <Stat
                label="Efficienza (EF)"
                color="var(--rhr)"
                value={fmt(efNow, 2)}
                hint={efNow && efThen ? `${efNow >= efThen ? "+" : ""}${fmt(((efNow - efThen) / efThen) * 100, 1)}% in 4 mesi` : "media ultime 5 endurance"}
              />
              <Stat label="Lunghi sotto 5% Pw:HR" value={okShare !== null ? `${Math.round(okShare * 100)}%` : "–"} hint={`${steady.length} uscite oltre 90'`} />
            </div>

            <Card
              title="Efficienza aerobica"
              subtitle="EF = potenza normalizzata / FC media, solo uscite endurance (IF sotto 0,80) degli ultimi 120 giorni"
            >
              <EfficiencyChart rides={withEf} />
              <p className="mt-2 text-xs text-muted">
                Se l&apos;EF sale vuol dire più watt a parità di battiti: la base aerobica migliora. Confronta uscite simili: caldo,
                stanchezza e salite lunghe lo abbassano.
              </p>
            </Card>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <Card title="Disaccoppiamento Pw:HR" subtitle="Quanto sale la FC a parità di potenza nella seconda metà delle uscite endurance oltre 90'">
                {steady.length ? (
                  <>
                    <DecouplingChart rides={steady} />
                    <p className="mt-2 text-xs text-muted">
                      Sotto il 5% (verde) la durata è sostenibile per la tua base aerobica; sopra il 5% la FC deriva: uscita troppo
                      lunga o intensa per la forma attuale, oppure caldo e poca idratazione.
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-muted">Nessuna uscita endurance oltre 90 minuti negli ultimi 120 giorni.</p>
                )}
              </Card>
              <Card title="Zone cardio" subtitle={`FC di soglia ${fmt(athlete.lthr, 0, " bpm")} (Friel)`}>
                <ZonesTable zones={data.hrZones} unit="bpm" />
              </Card>
            </div>
          </>
        );
      }}
    </SectionPage>
  );
}
