"use client";

// The home on computers and the web: the verdict of the day, the numbers that matter, today's workout and the wind,
// then load, recovery, the calendar, the week, power and the latest rides, all from the same data as the section pages.
// (Design B of 2026-11-06: terracotta card with the verdict on top, white cards on a warm background.)
import type { DashboardData } from "@/lib/dashboard";
import { Calendar } from "../calendar/Calendar";
import { PmcChart, RecoveryCharts, PowerCurveChart, WeeklyLoadChart } from "../charts";
import { capitalize, fmt, fmtDuration } from "../format";
import { EftpChart, PlanChart, SleepChart } from "../trendCharts";
import { AutonomicPanel, Card, ReadinessHero, RecentRides, Stat, ZonesTable, ZoneTime } from "./parts";
import { RecordsTable } from "./Potenza";
import { TodayWorkout } from "./TodayWorkout";
import { WindToday } from "./WindToday";

const longDate = (iso: string) => capitalize(new Date(`${iso}T12:00:00`).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" }));
const monthName = (iso: string) => capitalize(new Date(`${iso}T12:00:00`).toLocaleDateString("it-IT", { month: "long", year: "numeric" }));

/** What was done this month, from the rides and the load curve. */
function MonthSummary({ data }: { data: DashboardData }) {
  const prefix = data.today.slice(0, 7);
  const rides = data.activities.filter((a) => a.date.slice(0, 7) === prefix && a.category !== "nascosta");
  const secs = rides.reduce((s, a) => s + a.movingTime, 0);
  const tss = rides.reduce((s, a) => s + (a.tss ?? 0), 0);
  const km = rides.reduce((s, a) => s + (a.distanceKm ?? 0), 0);
  const rode = new Set(rides.map((a) => a.date.slice(0, 10)));
  const dayOfMonth = Number(data.today.slice(8));
  const first = data.pmc.find((p) => p.date >= `${prefix}-01`);
  const before = first ? data.pmc[data.pmc.indexOf(first) - 1] ?? first : null;
  const last = data.pmc.at(-1);
  const dCtl = before && last ? last.ctl - before.ctl : null;
  const row = (label: string, value: string) => (
    <tr className="border-t border-border first:border-0">
      <td className="py-2 text-muted">{label}</td>
      <td className="num py-2 text-right font-medium">{value}</td>
    </tr>
  );
  return (
    <Card title="Riepilogo del mese" subtitle={monthName(data.today)}>
      <table className="w-full text-sm">
        <tbody>
          {row("Uscite", String(rides.length))}
          {row("Ore", fmtDuration(secs))}
          {row("TSS", fmt(tss))}
          {row("Km", fmt(km, 1))}
          {row("Fitness: variazione", dCtl !== null ? `${dCtl >= 0 ? "+" : ""}${fmt(dCtl, 1)}` : "–")}
          {row("Giorni senza uscite", String(Math.max(0, dayOfMonth - rode.size)))}
        </tbody>
      </table>
    </Card>
  );
}

export function Dashboard({ data }: { data: DashboardData }) {
  const { status, athlete, cp, plan } = data;
  const hrv7 = status.hrv.baseline7 !== null ? Math.exp(status.hrv.baseline7) : null;
  const lastEftp = data.eftp.at(-1)?.eftp ?? null;
  const wkg = lastEftp && athlete.weight ? lastEftp / athlete.weight : null;
  const lastWeight = data.weightTrend.at(-1);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="text-xl font-medium">Buongiorno</h1>
        <span className="text-sm text-muted">{longDate(data.today)}</span>
      </div>

      <ReadinessHero status={status} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Fitness (CTL)" color="var(--fitness)" value={fmt(status.ctl)} hint="media 6 settimane" />
        <Stat label="Fatica (ATL)" color="var(--fatigue)" value={fmt(status.atl)} hint="media 7 giorni" />
        <Stat label="Forma (TSB)" color="var(--form)" value={fmt(status.tsb)} hint={status.formZone ?? undefined} />
        <Stat label="Ramp rate" value={status.rampRate !== null ? `${status.rampRate > 0 ? "+" : ""}${fmt(status.rampRate, 1)}` : "–"} hint="CTL negli ultimi 7 giorni" />
        <Stat label="FTP · rulli" value={`${fmt(athlete.ftp, 0)} · ${fmt(athlete.indoorFtp, 0)} W`} hint={lastEftp ? `eFTP ${fmt(lastEftp, 0)} W` : undefined} />
        <Stat label="HRV 7 gg" color="var(--hrv)" value={fmt(hrv7, 0, " ms")} hint={status.hrv.status} />
        <Stat label="FC a riposo" color="var(--rhr)" value={fmt(status.rhr.today, 0, " bpm")} hint={status.rhr.baseline7 !== null ? `media 7 gg ${fmt(status.rhr.baseline7, 1)}` : undefined} />
        <Stat label="Sonno" color="var(--sleep)" value={status.sleepHours !== null ? fmtDuration(status.sleepHours * 3600) : "–"} hint="stanotte" />
        <Stat label="Peso" value={fmt(lastWeight?.kg, 1, " kg")} hint={wkg ? `${fmt(wkg, 2)} W/kg a eFTP` : undefined} />
        <Stat label="Potenza critica" value={cp ? fmt(cp.cp, 0, " W") : "–"} hint={cp ? (cp.reliable ? "Monod 3–20′" : "incerta") : undefined} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* The three columns end on the same line: the first card and the last one of the middle column stretch to the tallest. */}
        <div className="min-w-0 lg:col-span-1 lg:[&>section]:h-full">
          <TodayWorkout data={data} />
        </div>
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-1 lg:[&>*:last-child]:flex-1">
          <WindToday today={data.today} />
          <MonthSummary data={data} />
        </div>
        <Card title="Ultime uscite" subtitle="clic per aprire il dettaglio" className="lg:col-span-1">
          <RecentRides rows={data.activities.slice(0, 8)} />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title="Fitness, fatica e forma" subtitle="ultimi 120 giorni" className="lg:col-span-2">
          <PmcChart pmc={data.pmc} />
        </Card>
        <Card title="Sonno" subtitle="ore per notte, ultimi 60 giorni" className="lg:col-span-1">
          <SleepChart sleep={data.sleep} />
        </Card>
      </div>

      <Card title="HRV e FC a riposo" subtitle="lettura combinata dei due marcatori notturni secondo il metodo di Marco Altini">
        <AutonomicPanel status={status} />
        <div className="mt-6 min-w-0">
          <RecoveryCharts recovery={data.recovery} />
        </div>
      </Card>

      <Calendar dashboard={data} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {plan.hasPlan ? (
          <Card title="Carico settimanale: pianificato e fatto" subtitle="calendario di Intervals.icu contro il carico reale">
            <PlanChart weeks={plan.weeks} />
          </Card>
        ) : (
          <Card title="Carico settimanale" subtitle="ultime 12 settimane">
            <WeeklyLoadChart weekly={data.weekly} />
          </Card>
        )}
        <Card title="Tempo in zona" subtitle={`zone di potenza Coggan, ultimi ${data.distribution.days} giorni`}>
          <ZoneTime shares={data.zoneShares} d={data.distribution} />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card
          title="Profilo di potenza"
          subtitle={cp ? `potenza critica ${fmt(cp.cp, 0, " W")} · W′ ${fmt(cp.wPrime / 1000, 1, " kJ")}${cp.reliable ? "" : " (incerta)"}` : "servono sforzi massimali tra 3 e 20 minuti"}
        >
          <PowerCurveChart mmp={data.mmp} cp={cp} />
          {data.icuModels.length > 0 && <p className="mt-2 text-xs text-faint">Modelli Intervals.icu: {data.icuModels.map((m) => `${m.name} ${fmt(m.cp, 0, " W")}`).join(" · ")}</p>}
        </Card>
        <Card title="FTP stimata nel tempo" subtitle="eFTP di Intervals.icu dopo ogni uscita, ultimi 12 mesi">
          <EftpChart eftp={data.eftp} ftp={athlete.ftp} />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Record del mese" subtitle="confronto con il mese scorso e con gli ultimi 84 giorni">
          <RecordsTable records={data.records} />
        </Card>
        <Card title="Zone di potenza" subtitle={`FTP ${fmt(athlete.ftp, 0, " W")}`}>
          <ZonesTable zones={data.powerZones} unit="W" colored />
        </Card>
      </div>
    </div>
  );
}
