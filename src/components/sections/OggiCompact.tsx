"use client";

// Today on the phone app, short: one verdict, today's workout, three numbers and the week.
import { useMemo, useSyncExternalStore } from "react";
import type { DashboardData } from "@/lib/dashboard";
import { weekStart } from "@/lib/dates";
import { planFromToday, weekFor } from "@/lib/training/season";
import { loadSeason, SEASON_EVENT, seasonSnapshot } from "@/lib/training/seasonStore";
import { useLife } from "../data/trainingData";
import { fmt, fmtDuration } from "../format";
import { LEVEL_STYLE } from "./parts";
import { TodayWorkout } from "./TodayWorkout";

const subSeason = (cb: () => void) => {
  window.addEventListener(SEASON_EVENT, cb);
  return () => window.removeEventListener(SEASON_EVENT, cb);
};

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card px-3 py-2.5">
      <div className="text-[11px] text-muted">{label}</div>
      <div className="num text-lg font-medium leading-tight">{value}</div>
      {hint && <div className="truncate text-[11px] text-muted">{hint}</div>}
    </div>
  );
}

export function OggiCompact({ data }: { data: DashboardData }) {
  const { status, today } = data;
  const level = LEVEL_STYLE[status.readiness.level];
  const raw = useSyncExternalStore(subSeason, seasonSnapshot, () => "");
  const life = useLife(today);
  const plan = useMemo(() => {
    const setup = raw ? loadSeason() : null;
    return setup ? planFromToday(setup, today, status.ctl, life) : null;
  }, [raw, today, status.ctl, life]);
  const week = weekFor(plan, today);
  const from = weekStart(today);
  const tssDone = Math.round(data.activities.filter((a) => a.date.slice(0, 10) >= from && a.date.slice(0, 10) <= today).reduce((s, a) => s + (a.tss ?? 0), 0));
  const share = week && week.tssTarget > 0 ? Math.min(1, tssDone / week.tssTarget) : 0;
  const hrv7 = status.hrv.baseline7 !== null ? Math.exp(status.hrv.baseline7) : null;

  return (
    <div className="space-y-3">
      <section className="flex items-center gap-3 rounded-2xl px-4 py-3" style={{ background: level.bg }} aria-label="Stato di oggi">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base font-medium text-white" style={{ background: level.ink }} aria-hidden>
          {level.icon}
        </span>
        <div className="min-w-0">
          <div className="text-[11px] text-muted">Stato di oggi</div>
          <div className="text-lg font-medium leading-tight" style={{ color: level.ink }}>
            {status.readiness.headline}
          </div>
        </div>
      </section>

      <TodayWorkout data={data} compact />

      <div className="grid grid-cols-3 gap-2">
        <Tile label="Forma" value={fmt(status.tsb)} hint={status.formZone ?? undefined} />
        <Tile label="HRV 7 gg" value={fmt(hrv7, 0, " ms")} />
        <Tile label="Sonno" value={status.sleepHours !== null ? fmtDuration(status.sleepHours * 3600) : "–"} />
      </div>

      {week && (
        <section className="card px-4 py-3" aria-label="Settimana">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>Settimana</span>
            <span className="num">
              {tssDone} / {week.tssTarget} TSS
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
            <div className="h-full rounded-full" style={{ width: `${Math.round(share * 100)}%`, background: "var(--accent-ink)" }} />
          </div>
        </section>
      )}

    </div>
  );
}
