"use client";

// Today on the phone app, short: one verdict, today's workout, three numbers and the week.
import Link from "next/link";
import { useMemo, useSyncExternalStore } from "react";
import type { DashboardData } from "@/lib/dashboard";
import { weekStart } from "@/lib/dates";
import { planFromToday, weekFor } from "@/lib/training/season";
import { loadSeason, SEASON_EVENT, seasonSnapshot } from "@/lib/training/seasonStore";
import { useLife } from "../data/trainingData";
import { fmt, fmtDuration } from "../format";
import { ReadinessHero } from "./parts";
import { TodayWorkout } from "./TodayWorkout";

const subSeason = (cb: () => void) => {
  window.addEventListener(SEASON_EVENT, cb);
  return () => window.removeEventListener(SEASON_EVENT, cb);
};

function Tile({ label, value, hint, href }: { label: string; value: string; hint?: string; href: string }) {
  return (
    <Link href={href} className="card block px-3 py-2.5">
      <div className="text-[11px] text-muted">{label}</div>
      <div className="num text-lg font-medium leading-tight">{value}</div>
      {hint && <div className="truncate text-[11px] text-muted">{hint}</div>}
    </Link>
  );
}

export function OggiCompact({ data }: { data: DashboardData }) {
  const { status, today } = data;
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
      <ReadinessHero status={status} size="short" />

      <TodayWorkout data={data} compact />

      <div className="grid grid-cols-3 gap-2">
        <Tile label="Forma" value={fmt(status.tsb)} hint={status.formZone ?? undefined} href="/analisi" />
        <Tile label="HRV 7 gg" value={fmt(hrv7, 0, " ms")} href="/analisi/recupero" />
        <Tile label="Sonno" value={status.sleepHours !== null ? fmtDuration(status.sleepHours * 3600) : "–"} href="/analisi/recupero" />
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
