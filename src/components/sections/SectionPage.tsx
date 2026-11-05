"use client";

import Link from "next/link";
import { useState } from "react";
import { createPortal } from "react-dom";
import { useCompact } from "@/lib/compact";
import type { DashboardData } from "@/lib/dashboard";
import { TOPBAR_ACTIONS_ID } from "../brand/slots";
import { capitalize } from "../format";
import { refreshAll, useDashboard } from "../data/remote";
import { sectionById, type SectionId } from "../nav/sections";

/** Athlete name, data source and refresh, portalled into the top bar next to the logo. */
function TopBarActions({ data }: { data: DashboardData }) {
  const [busy, setBusy] = useState(false);
  const slot = typeof document !== "undefined" ? document.getElementById(TOPBAR_ACTIONS_ID) : null;
  if (!slot) return null;
  return createPortal(
    <>
      <span className="text-sm font-medium">{capitalize(data.athlete.name)}</span>
      <span
        className="rounded-full px-3 py-1 text-xs"
        style={{ background: "var(--accent-bg)", color: "var(--accent-ink)" }}
        title={data.source === "demo" ? "Imposta INTERVALS_API_KEY in .env.local per i tuoi dati" : undefined}
      >
        {data.source === "demo" ? "Dati demo" : "Intervals.icu"}
      </span>
      <button
        className="card px-3 py-1.5 text-xs disabled:opacity-50"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await refreshAll();
          setBusy(false);
        }}
      >
        {busy ? "Aggiorno…" : "Aggiorna"}
      </button>
    </>,
    slot,
  );
}

/** Phone app: the tabs name these pages already, and the four analysis pages share the "Analisi" tabs. */
const NO_TITLE = new Set<SectionId>(["oggi", "coach", "rulli", "forma", "potenza", "cuore", "recupero"]);

export function SectionHeading({ id }: { id: SectionId }) {
  const compact = useCompact();
  const s = sectionById(id);
  const Icon = s.icon;
  if (compact) {
    if (NO_TITLE.has(id)) return null;
    return (
      <header className="flex items-center gap-2">
        <Link href="/altro" className="rounded-full px-2.5 py-1 text-xs text-muted" style={{ border: "1px solid var(--border)" }}>
          ‹ Altro
        </Link>
        <h1 className="text-lg font-medium leading-tight">{s.label}</h1>
      </header>
    );
  }
  return (
    <header className="flex items-center gap-3">
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
        style={{ background: `color-mix(in srgb, ${s.color} 16%, transparent)`, color: s.color }}
        aria-hidden
      >
        <Icon size={20} stroke={1.9} />
      </span>
      <div>
        <h1 className="text-lg font-medium leading-tight">{s.label}</h1>
        <p className="text-xs text-muted">{s.description}</p>
      </div>
    </header>
  );
}

/** Frame of a dashboard section: heading, shared data loading and error handling. */
export function SectionPage({ id, heading = true, children }: { id: SectionId; heading?: boolean; children: (data: DashboardData) => React.ReactNode }) {
  const { data, error } = useDashboard();
  return (
    <main className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6">
      {heading && <SectionHeading id={id} />}
      {data && <TopBarActions data={data} />}
      {error && !data ? (
        <div className="card max-w-xl p-5">
          <h2 className="font-medium">Impossibile leggere i dati</h2>
          <p className="mt-2 text-sm text-muted">{error}</p>
          <button className="card mt-4 px-3 py-1.5 text-sm" onClick={() => refreshAll()}>
            Riprova
          </button>
        </div>
      ) : !data ? (
        <p className="text-sm text-muted">Carico i dati…</p>
      ) : (
        children(data)
      )}
    </main>
  );
}
