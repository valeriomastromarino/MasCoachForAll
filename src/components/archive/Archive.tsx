"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ActivitiesPage } from "@/lib/api/handlers";
import type { ActivityCategory, ActivityRow } from "@/lib/activities";
import { addDays } from "@/lib/dates";
import { fmt, fmtDuration, fmtWeekday } from "../format";
import { SectionHeading } from "../sections/SectionPage";
import { apiFetch } from "../data/transport";

export type Filter = "bici" | "strada" | "offroad" | "rulli" | "test" | "altro";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "bici", label: "Tutte le bici" },
  { id: "strada", label: "Strada" },
  { id: "offroad", label: "MTB e gravel" },
  { id: "rulli", label: "Rulli" },
  { id: "test", label: "Test" },
  { id: "altro", label: "Altri sport" },
];

const BIKE: ActivityCategory[] = ["strada", "offroad", "rulli"];

function matches(r: ActivityRow, f: Filter): boolean {
  switch (f) {
    case "bici":
      // Strava-only imports are bike rides too, as far as we can tell, and still worth listing.
      return BIKE.includes(r.category) || r.category === "nascosta";
    case "test":
      return r.isTest;
    default:
      return r.category === f;
  }
}

function monthLabel(iso: string): string {
  const s = new Date(iso.slice(0, 7) + "-15T12:00:00").toLocaleDateString("it-IT", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const CATEGORY_BADGE: Partial<Record<ActivityCategory, { label: string; bg: string; ink: string }>> = {
  rulli: { label: "Rulli", bg: "var(--accent-bg)", ink: "var(--accent-ink)" },
  offroad: { label: "Off-road", bg: "var(--good-bg)", ink: "var(--good)" },
};

type LoadState = { pages: ActivitiesPage[]; loading: boolean; error: string | null; exhausted: boolean };

async function fetchPage(before?: string): Promise<ActivitiesPage | { error: string }> {
  try {
    const res = await apiFetch(`/api/activities${before ? `?before=${before}` : ""}`);
    const json = await res.json();
    return res.ok ? (json as ActivitiesPage) : { error: json.error ?? res.statusText };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export default function Archive({ section = "uscite", initialFilter = "bici" }: { section?: "uscite" | "test"; initialFilter?: Filter }) {
  const router = useRouter();
  const [state, setState] = useState<LoadState>({ pages: [], loading: true, error: null, exhausted: false });
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [query, setQuery] = useState("");

  // Next.js keeps visited pages alive and re-runs their effects when you come back: a page already
  // loaded (same date range) replaces the old copy instead of being appended twice.
  const apply = (r: ActivitiesPage | { error: string }) =>
    setState((s) =>
      "error" in r
        ? { ...s, loading: false, error: r.error }
        : {
            pages: [...s.pages.filter((p) => p.newest !== r.newest), r].sort((a, b) => b.newest.localeCompare(a.newest)),
            loading: false,
            error: null,
            exhausted: r.rows.length === 0,
          },
    );

  // Coming back to a page Next.js kept alive re-runs this effect: don't download the year again.
  const hasData = useRef(false);
  useEffect(() => {
    if (hasData.current) return;
    let cancelled = false;
    fetchPage().then((r) => {
      if (cancelled) return;
      if (!("error" in r)) hasData.current = true;
      apply(r);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadMore = async () => {
    const last = state.pages[state.pages.length - 1];
    if (!last) return;
    setState((s) => ({ ...s, loading: true }));
    apply(await fetchPage(addDays(last.oldest, -1)));
  };

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const seen = new Set<string>();
    return state.pages
      .flatMap((p) => p.rows)
      .filter((r) => !seen.has(r.id) && seen.add(r.id) && matches(r, filter) && (!q || r.name.toLowerCase().includes(q)));
  }, [state.pages, filter, query]);

  const months = useMemo(() => {
    const groups = new Map<string, ActivityRow[]>();
    for (const r of rows) {
      const k = r.date.slice(0, 7);
      groups.set(k, [...(groups.get(k) ?? []), r]);
    }
    return [...groups].map(([month, list]) => ({
      month,
      list,
      km: list.reduce((a, r) => a + (r.distanceKm ?? 0), 0),
      secs: list.reduce((a, r) => a + r.movingTime, 0),
      tss: list.reduce((a, r) => a + (r.tss ?? 0), 0),
    }));
  }, [rows]);

  const oldestLoaded = state.pages[state.pages.length - 1]?.oldest;
  const th = "py-2 font-normal text-faint";

  return (
    <main className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6">
      <SectionHeading id={section} />
      {oldestLoaded && (
        <p className="-mt-3 text-xs text-faint">
          Attività da Intervals.icu caricate dal{" "}
          {new Date(oldestLoaded + "T12:00:00").toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })}
        </p>
      )}

      <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cerca per nome, es. ramp test"
          className="w-full rounded-full px-4 py-2 text-sm outline-none sm:max-w-xs"
          style={{ background: "var(--background)", border: "1px solid var(--border)" }}
        />
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => {
            const on = filter === f.id;
            return (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className="rounded-full px-3 py-1.5 text-xs"
                style={{
                  background: on ? (f.id === "test" ? "var(--warning-bg)" : "var(--accent-bg)") : "var(--background)",
                  color: on ? (f.id === "test" ? "var(--warning)" : "var(--accent-ink)") : "var(--muted)",
                  fontWeight: on ? 500 : 400,
                }}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {state.error && (
        <p className="card p-4 text-sm" style={{ color: "var(--critical)" }}>
          Impossibile leggere le attività: {state.error}
        </p>
      )}

      {!state.loading && months.length === 0 && !state.error && (
        <p className="card p-5 text-sm text-muted">
          Nessuna attività trovata nei mesi caricati{query && ` per “${query}”`}. Prova a caricare i mesi precedenti.
        </p>
      )}

      {months.map((m) => (
        <section key={m.month} className="card min-w-0 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-medium">{monthLabel(m.month + "-01")}</h2>
            <p className="num text-xs text-muted">
              {m.list.length} attività · {fmt(m.km)} km · {fmtDuration(m.secs)} · carico {fmt(m.tss)}
            </p>
          </div>
          <div className="-mx-5 mt-3 overflow-x-auto px-5">
            <table className="num w-full min-w-[680px] text-xs">
              <thead>
                <tr className="text-left">
                  <th className={th}>Data</th>
                  <th className={th}>Attività</th>
                  <th className={`${th} text-right`}>Durata</th>
                  <th className={`${th} text-right`}>Km</th>
                  <th className={`${th} text-right`}>NP</th>
                  <th className={`${th} text-right`}>IF</th>
                  <th className={`${th} text-right`}>TSS</th>
                  <th className={`${th} text-right`}>FC media</th>
                </tr>
              </thead>
              <tbody>
                {m.list.map((r) => {
                  const openable = BIKE.includes(r.category);
                  const badge = CATEGORY_BADGE[r.category];
                  return (
                    <tr
                      key={r.id}
                      className={`border-t border-border ${openable ? "cursor-pointer transition-colors hover:bg-[var(--background)]" : ""}`}
                      onClick={openable ? () => router.push(`/attivita/${r.id}`) : undefined}
                      style={r.category === "nascosta" ? { color: "var(--faint)" } : undefined}
                    >
                      <td className="py-2 whitespace-nowrap text-muted">{fmtWeekday(r.date)}</td>
                      <td className="py-2">
                        {openable ? (
                          <Link href={`/attivita/${r.id}`} className="hover:underline" style={{ color: "var(--accent-ink)" }}>
                            {r.name}
                          </Link>
                        ) : (
                          <span title={r.category === "nascosta" ? "Strava non permette di leggerla via API" : undefined}>
                            {r.name}
                            {r.category === "altro" && r.type && <span className="ml-1 text-faint">({r.type})</span>}
                          </span>
                        )}
                        {r.isTest && (
                          <span
                            className="ml-2 rounded-full px-2 py-0.5 text-[10px] font-medium"
                            style={{ background: "var(--warning-bg)", color: "var(--warning)" }}
                          >
                            TEST
                          </span>
                        )}
                        {badge && (
                          <span className="ml-2 rounded-full px-2 py-0.5 text-[10px]" style={{ background: badge.bg, color: badge.ink }}>
                            {badge.label}
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-right">{r.movingTime ? fmtDuration(r.movingTime) : "–"}</td>
                      <td className="py-2 text-right">{fmt(r.distanceKm, 1)}</td>
                      <td className="py-2 text-right">{fmt(r.np, 0, " W")}</td>
                      <td className="py-2 text-right">{fmt(r.IF, 2)}</td>
                      <td className="py-2 text-right">{fmt(r.tss)}</td>
                      <td className="py-2 text-right">{fmt(r.avgHr)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <div className="flex justify-center pb-4">
        {state.exhausted ? (
          <p className="text-xs text-muted">Non ci sono attività più vecchie su Intervals.icu.</p>
        ) : (
          <button
            onClick={loadMore}
            disabled={state.loading || state.pages.length === 0}
            className="card px-4 py-2 text-sm disabled:opacity-50"
            style={{ color: "var(--accent-ink)" }}
          >
            {state.loading ? "Carico…" : "Carica i 12 mesi precedenti"}
          </button>
        )}
      </div>
    </main>
  );
}
