"use client";

import { Calendar } from "../calendar/Calendar";
import { fmt, fmtDuration } from "../format";
import { ReadinessCard, Stat } from "./parts";
import { SectionPage } from "./SectionPage";

export default function Oggi() {
  return (
    <SectionPage id="oggi">
      {(data) => {
        const { status } = data;
        const lastNight = data.sleep.at(-1);
        const sleepScore = lastNight?.date === data.today ? lastNight.score : null;
        const hrv7 = status.hrv.baseline7 !== null ? Math.exp(status.hrv.baseline7) : null;
        return (
          <>
            {/* Today's status and the key numbers on top; the calendar holds the week, the rides and the plan. */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <ReadinessCard status={status} />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:col-span-2">
                <Stat label="Fitness" color="var(--fitness)" value={fmt(status.ctl)} hint={`ramp ${fmt(status.rampRate, 1)}/sett.`} />
                <Stat label="Fatica" color="var(--fatigue)" value={fmt(status.atl)} />
                <Stat label="Forma" color="var(--form)" value={fmt(status.tsb)} hint={status.formZone ?? undefined} />
                <Stat label="HRV 7 gg" color="var(--hrv)" value={fmt(hrv7, 0, " ms")} hint={status.hrv.status} />
                <Stat
                  label="FC a riposo"
                  color="var(--rhr)"
                  value={fmt(status.rhr.today, 0, " bpm")}
                  hint={status.rhr.baseline7 !== null ? `media 7 gg ${fmt(status.rhr.baseline7, 1)}` : undefined}
                />
                <Stat
                  label="Sonno stanotte"
                  color="var(--sleep)"
                  value={status.sleepHours !== null ? fmtDuration(status.sleepHours * 3600) : "–"}
                  hint={sleepScore !== null ? `punteggio ${fmt(sleepScore)}` : undefined}
                />
              </div>
            </div>
            <Calendar dashboard={data} />
          </>
        );
      }}
    </SectionPage>
  );
}
