"use client";

import { useCompact } from "@/lib/compact";
import { addDays } from "@/lib/dates";
import { Calendar } from "../calendar/Calendar";
import { fmt, fmtDuration } from "../format";
import { OggiCompact } from "./OggiCompact";
import { ReadinessCard, StatGroup } from "./parts";
import { SectionPage } from "./SectionPage";
import { TodayWorkout } from "./TodayWorkout";

export default function Oggi() {
  const compact = useCompact();
  return (
    <SectionPage id="oggi" heading={false}>
      {(data) => {
        if (compact) return <OggiCompact data={data} />;
        const { status } = data;
        const lastNight = data.sleep.at(-1);
        const sleepScore = lastNight?.date === data.today ? lastNight.score : null;
        const hrv7 = status.hrv.baseline7 !== null ? Math.exp(status.hrv.baseline7) : null;
        const yesterday = addDays(data.today, -1);
        const rides = data.activities.filter((a) => a.date.slice(0, 10) === yesterday);
        const load = data.pmc.find((p) => p.date === yesterday)?.load ?? 0;
        return (
          <>
            {/* Today's status and the key numbers on top; the calendar holds the week, the rides and the plan. */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <ReadinessCard status={status} yesterday={{ rides, load }} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:col-span-2 lg:grid-cols-1">
                <StatGroup
                  title="Carico"
                  items={[
                    { label: "Fitness", color: "var(--fitness)", value: fmt(status.ctl) },
                    { label: "Fatica", color: "var(--fatigue)", value: fmt(status.atl) },
                    { label: "Forma", color: "var(--form)", value: fmt(status.tsb), hint: status.formZone ?? undefined },
                  ]}
                />
                <StatGroup
                  title="Recupero"
                  items={[
                    { label: "HRV 7 gg", color: "var(--hrv)", value: fmt(hrv7, 0, " ms"), hint: status.hrv.status },
                    { label: "FC a riposo", color: "var(--rhr)", value: fmt(status.rhr.today, 0, " bpm") },
                    {
                      label: "Sonno",
                      color: "var(--sleep)",
                      value: status.sleepHours !== null ? fmtDuration(status.sleepHours * 3600) : "–",
                      hint: sleepScore !== null ? `punteggio ${fmt(sleepScore)}` : undefined,
                    },
                  ]}
                />
              </div>
            </div>
            <TodayWorkout data={data} />
            <Calendar dashboard={data} />
          </>
        );
      }}
    </SectionPage>
  );
}
