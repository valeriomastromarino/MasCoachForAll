"use client";

// Settings: whose data this is and where it comes from. «Aggiorna dati» is the symbol at the right of the top bar
// (19 November 2026; from 6 November it was a button here, before that in the top bar).
import { IconRefresh } from "@tabler/icons-react";
import { capitalize } from "../format";
import { useDashboard } from "../data/remote";

export function DataCard() {
  const { data } = useDashboard();
  if (!data) return null;
  return (
    <section className="card max-w-xl p-5">
      <h3 className="truncate text-sm font-medium">{capitalize(data.athlete.name)}</h3>
      <p className="mt-0.5 text-xs text-muted">{data.source === "demo" ? "Dati demo: collega il tuo Intervals.icu per vedere i tuoi" : "Dati da Intervals.icu"}</p>
      <p className="mt-2 flex items-center gap-1 text-xs text-muted">
        Per aggiornarli tocca
        <IconRefresh size={14} stroke={2} aria-label="il simbolo Aggiorna dati" className="shrink-0" />
        in alto a destra.
      </p>
    </section>
  );
}
