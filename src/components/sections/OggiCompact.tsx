"use client";

// Today on the phone app, short: one verdict, today's workout (or the next one), wind, three numbers.
import Link from "next/link";
import type { DashboardData } from "@/lib/dashboard";
import { fmt, fmtDuration } from "../format";
import { ReadinessHero } from "./parts";
import { TodayWorkout } from "./TodayWorkout";
import { WindToday } from "./WindToday";

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
  const { status } = data;
  const hrv7 = status.hrv.baseline7 !== null ? Math.exp(status.hrv.baseline7) : null;

  return (
    <div className="space-y-3">
      <ReadinessHero status={status} size="short" />

      <TodayWorkout data={data} compact />

      <WindToday today={data.today} />

      <div className="grid grid-cols-3 gap-2">
        <Tile label="Forma" value={fmt(status.tsb)} hint={status.formZone ?? undefined} href="/analisi" />
        <Tile label="HRV 7 gg" value={fmt(hrv7, 0, " ms")} hint={status.hrv.status} href="/analisi/recupero" />
        <Tile label="Sonno" value={status.sleepHours !== null ? fmtDuration(status.sleepHours * 3600) : "–"} hint={status.sleepHours !== null ? "stanotte" : undefined} href="/analisi/recupero" />
      </div>
    </div>
  );
}
