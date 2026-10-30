"use client";

import { PmcChart, WeeklyLoadChart } from "../charts";
import { fmt } from "../format";
import { PlanChart } from "../trendCharts";
import { Card, Stat } from "./parts";
import { SectionPage } from "./SectionPage";

export default function Forma() {
  return (
    <SectionPage id="forma">
      {(data) => {
        const { status, plan } = data;
        const closed = plan.weeks.filter((w) => w.when === "past" && w.planned > 0);
        const adherence = closed.length ? closed.reduce((a, w) => a + w.done, 0) / closed.reduce((a, w) => a + w.planned, 0) : null;
        const next = plan.weeks.find((w) => w.when === "next");
        return (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="Fitness" color="var(--fitness)" value={fmt(status.ctl)} hint="carico medio di 6 settimane" />
              <Stat label="Fatica" color="var(--fatigue)" value={fmt(status.atl)} hint="carico medio di 7 giorni" />
              <Stat label="Forma" color="var(--form)" value={fmt(status.tsb)} hint={status.formZone ?? undefined} />
              <Stat label="Ramp rate" value={fmt(status.rampRate, 1)} hint="punti fitness a settimana" />
            </div>

            <Card title="Fitness, fatica e forma" subtitle="Performance Management Chart (Banister/Coggan), ultimi 120 giorni">
              <PmcChart pmc={data.pmc} />
            </Card>

            {plan.hasPlan ? (
              <Card
                title="Carico settimanale: pianificato e fatto"
                subtitle="Calendario di Intervals.icu contro il carico reale (ciclismo e palestra), ultime 8 settimane e la prossima"
              >
                <PlanChart weeks={plan.weeks} />
                <p className="mt-3 text-xs text-muted">
                  {adherence !== null && (
                    <>
                      Nelle settimane concluse hai fatto il <b className="font-medium text-foreground">{Math.round(adherence * 100)}%</b> del
                      carico pianificato.{" "}
                    </>
                  )}
                  {next && next.planned > 0 && (
                    <>
                      La prossima settimana prevede <b className="font-medium text-foreground">{fmt(next.planned)}</b> di carico.{" "}
                    </>
                  )}
                  Tra l&apos;80 e il 110% vuol dire piano rispettato; sotto il 70% per più settimane conviene rivedere il piano.
                </p>
              </Card>
            ) : (
              <Card title="Carico settimanale" subtitle="Carico totale (ciclismo e palestra), ultime 12 settimane">
                <WeeklyLoadChart weekly={data.weekly} />
              </Card>
            )}
          </>
        );
      }}
    </SectionPage>
  );
}
