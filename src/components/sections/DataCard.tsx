"use client";

// Settings: whose data this is, where it comes from, and the button to reload it (it used to sit in the top bar).
import { useState } from "react";
import { capitalize } from "../format";
import { refreshAll, useDashboard } from "../data/remote";

export function DataCard() {
  const { data } = useDashboard();
  const [busy, setBusy] = useState(false);
  if (!data) return null;
  return (
    <section className="card flex max-w-xl items-center gap-3 p-5">
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-medium">{capitalize(data.athlete.name)}</h3>
        <p className="mt-0.5 text-xs text-muted">{data.source === "demo" ? "Dati demo: imposta INTERVALS_API_KEY in .env.local per i tuoi dati" : "Dati da Intervals.icu"}</p>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await refreshAll();
          setBusy(false);
        }}
        className="inline-flex h-9 shrink-0 items-center rounded-full px-4 text-xs font-medium leading-none disabled:opacity-50"
        style={{ background: "var(--accent-bg)", color: "var(--accent-ink)" }}
      >
        {busy ? "Aggiorno…" : "Aggiorna dati"}
      </button>
    </section>
  );
}
