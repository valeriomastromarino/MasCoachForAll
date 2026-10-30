"use client";

import type { DashboardData } from "@/lib/dashboard";
import { durabilityLevel } from "@/lib/physio/durability";
import { PowerCurveChart } from "../charts";
import { useDurability } from "../data/remote";
import { fmt, fmtMonthName, fmtSecsLabel } from "../format";
import { DurabilityChart, type DurabilityRow, EftpChart, ZoneWeeksChart } from "../trendCharts";
import { Card, Stat, ZonesTable, ZoneTime } from "./parts";
import { SectionPage } from "./SectionPage";

const RECORD_NAMES: Record<number, string> = { 5: "Sprint 5\"", 60: "1 minuto", 300: "5 minuti", 1200: "20 minuti", 3600: "1 ora" };

function RecordsTable({ records }: { records: DashboardData["records"] }) {
  const th = "py-2 font-normal text-faint text-right";
  return (
    <table className="num w-full text-xs">
      <thead>
        <tr>
          <th className="py-2 text-left font-normal text-faint">Durata</th>
          <th className={th}>{fmtMonthName(records.month)}</th>
          <th className={th}>{fmtMonthName(records.previousMonth)}</th>
          <th className={th}>Migliore 84 gg</th>
        </tr>
      </thead>
      <tbody>
        {records.rows.map((r) => {
          const record = r.current !== null && r.best84 !== null && r.current >= r.best84;
          const up = r.current !== null && r.previous !== null ? r.current - r.previous : null;
          return (
            <tr key={r.secs} className="border-t border-border">
              <td className="py-2 text-muted">{RECORD_NAMES[r.secs] ?? fmtSecsLabel(r.secs)}</td>
              <td className="py-2 text-right">
                <span className="font-medium">{fmt(r.current, 0, " W")}</span>
                {record ? (
                  <span className="ml-1.5 rounded-full px-1.5 py-0.5 text-[10px]" style={{ background: "var(--good-bg)", color: "var(--good)" }}>
                    Record
                  </span>
                ) : (
                  up !== null && (
                    <span className="ml-1.5 text-[11px]" style={{ color: up >= 0 ? "var(--good)" : "var(--faint)" }}>
                      {up >= 0 ? "+" : ""}
                      {fmt(up)}
                    </span>
                  )
                )}
              </td>
              <td className="py-2 text-right text-muted">{fmt(r.previous, 0, " W")}</td>
              <td className="py-2 text-right text-muted">{fmt(r.best84, 0, " W")}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function DurabilityCard({ mmp }: { mmp: DashboardData["mmp"] }) {
  const { data, error } = useDurability();
  const fresh = (secs: number) => mmp.find((p) => p.secs === secs)?.watts ?? null;
  const rows: DurabilityRow[] = (data?.durations ?? []).map((secs, d) => ({
    secs,
    fresh: fresh(secs),
    after2: data!.marks[0]?.watts[d] ?? null,
    after3: data!.marks[1]?.watts[d] ?? null,
  }));
  // The 20' effort after 2 h is the most common single number for durability.
  const key = rows.find((r) => r.secs === 1200) ?? rows.at(-1);
  const ratio = key?.fresh && key.after2 ? key.after2 / key.fresh : null;
  const [m2, m3] = data?.marks ?? [];
  return (
    <Card title="Durability: quanta potenza resta dopo ore di uscita" subtitle="Migliori sforzi fatti dopo 2 e 3 ore, confrontati con quelli da fresco">
      {error && !data ? (
        <p className="text-sm text-muted">Impossibile analizzare le uscite lunghe: {error}</p>
      ) : !data ? (
        <p className="text-sm text-muted">Analizzo le uscite lunghe degli ultimi 84 giorni…</p>
      ) : !m2?.rides ? (
        <p className="text-sm text-muted">Negli ultimi {data.windowDays} giorni non ci sono uscite oltre le 2 ore con il misuratore di potenza.</p>
      ) : (
        <>
          <DurabilityChart rows={rows} />
          {ratio !== null && (
            <p className="mt-3 rounded-xl px-3 py-2 text-xs" style={{ background: "var(--neutral-bg)" }}>
              Dopo 2 ore il tuo miglior 20&apos; è il <b className="font-medium">{Math.round(ratio * 100)}%</b> di quello da fresco:
              tenuta <b className="font-medium">{durabilityLevel(ratio)}</b>. Sopra il 95% è ottima, tra 90 e 95% buona.
            </p>
          )}
          <p className="mt-2 text-[11px] text-faint">
            {m2.rides} uscite oltre 2 h (in media {fmt(m2.avgKj)} kJ già spesi), {m3?.rides ?? 0} oltre 3 h
            {m3?.avgKj ? ` (${fmt(m3.avgKj)} kJ)` : ""}. Conta solo ciò che hai fatto davvero: se dopo 2 ore non hai mai spinto a
            tutta, la tenuta reale è più alta di così.
          </p>
        </>
      )}
    </Card>
  );
}

export default function Potenza() {
  return (
    <SectionPage id="potenza">
      {(data) => {
        const { athlete, cp } = data;
        const lastEftp = data.eftp.at(-1)?.eftp ?? null;
        const yearAgo = data.eftp[0]?.eftp ?? null;
        const wkg = lastEftp && athlete.weight ? lastEftp / athlete.weight : null;
        return (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="FTP impostata" color="var(--fatigue)" value={fmt(athlete.ftp, 0, " W")} hint="su Intervals.icu" />
              <Stat
                label="FTP stimata"
                color="var(--fitness)"
                value={fmt(lastEftp, 0, " W")}
                hint={lastEftp && yearAgo ? `${lastEftp >= yearAgo ? "+" : ""}${fmt(lastEftp - yearAgo)} W in un anno` : undefined}
              />
              <Stat label="W/kg (stimata)" value={fmt(wkg, 2)} hint={`peso ${fmt(athlete.weight, 1, " kg")}`} />
              <Stat label="Potenza critica" value={cp ? fmt(cp.cp, 0, " W") : "–"} hint={cp ? (cp.reliable ? "Monod 3–20'" : "incerta") : undefined} />
            </div>

            <Card title="FTP stimata nel tempo" subtitle="eFTP calcolata da Intervals.icu dopo ogni uscita, ultimi 12 mesi">
              <EftpChart eftp={data.eftp} ftp={athlete.ftp} />
              <p className="mt-2 text-xs text-muted">
                L&apos;eFTP sale solo quando fai sforzi duri: se resta piatta per settimane non vuol dire che sei peggiorato, ma che
                non hai fatto sforzi massimali.
              </p>
            </Card>

            <div className="grid gap-5 lg:grid-cols-2">
              <Card title="Record del mese" subtitle={`Migliori potenze di ${fmtMonthName(data.records.month)} confrontate con il mese scorso`}>
                <RecordsTable records={data.records} />
              </Card>
              <Card
                title="Profilo di potenza"
                subtitle={
                  cp && !cp.reliable
                    ? `Potenza critica incerta: tra ${fmt(cp.cp, 0)} e ${fmt(cp.shortCp, 0, " W")} (Monod, 3–20 min)`
                    : cp
                      ? `Potenza critica ${fmt(cp.cp, 0, " W")} · W′ ${fmt(cp.wPrime / 1000, 1, " kJ")} · eFTP ${fmt(cp.eftp, 0, " W")}`
                      : "Servono sforzi massimali tra 3 e 20 minuti per stimare la potenza critica"
                }
              >
                <PowerCurveChart mmp={data.mmp} cp={cp} />
                {data.icuModels.length > 0 && (
                  <p className="mt-2 text-xs text-faint">
                    Modelli Intervals.icu: {data.icuModels.map((m) => `${m.name} ${fmt(m.cp, 0, " W")}`).join(" · ")}
                  </p>
                )}
              </Card>
            </div>

            <DurabilityCard mmp={data.mmp} />

            <div className="grid gap-5 lg:grid-cols-2">
              <Card title="Tempo in zona settimana per settimana" subtitle="Ore in ciascuna zona di potenza Coggan, ultime 12 settimane">
                <ZoneWeeksChart zoneWeeks={data.zoneWeeks} />
              </Card>
              <Card title="Tempo in zona" subtitle={`Zone di potenza Coggan, ultimi ${data.distribution.days} giorni`}>
                <ZoneTime shares={data.zoneShares} d={data.distribution} />
              </Card>
            </div>

            <Card title="Zone di potenza" subtitle={`FTP ${fmt(athlete.ftp, 0, " W")}`} className="lg:max-w-md">
              <ZonesTable zones={data.powerZones} unit="W" colored />
            </Card>
          </>
        );
      }}
    </SectionPage>
  );
}
