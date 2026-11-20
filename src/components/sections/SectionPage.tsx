"use client";

import { useCompact } from "@/lib/compact";
import type { DashboardData } from "@/lib/dashboard";
import { refreshAll, useDashboard } from "../data/remote";
import { sectionById, type SectionId } from "../nav/sections";

/**
 * The title of a page of the phone app: one h1 per page, the same size everywhere (design D with the rules of A, 19 November
 * 2026; before, the page name was only in the pill at the top and screen readers found no title).
 */
export function PageTitle({ children, sub }: { children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <header>
      {sub && <p className="text-sm text-muted">{sub}</p>}
      <h1 className="text-[26px] font-semibold leading-tight tracking-tight">{children}</h1>
    </header>
  );
}

/** Names of the pages in the phone app where they differ from the full app (the trainer is «Pedala», the button that opens it). */
const COMPACT_TITLE: Partial<Record<SectionId, string>> = { rulli: "Pedala" };
/** Tabs of Analisi on the phone app: the page has its own title. */
const UNDER_ANALISI: SectionId[] = ["oggi", "forma", "potenza", "cuore", "recupero"];

export function SectionHeading({ id }: { id: SectionId }) {
  const compact = useCompact();
  const s = sectionById(id);
  const Icon = s.icon;
  if (compact) return UNDER_ANALISI.includes(id) ? null : <PageTitle>{COMPACT_TITLE[id] ?? s.label}</PageTitle>;
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

/**
 * Frame of a dashboard section: heading, shared data loading and error handling. `title` replaces the heading and stays in view
 * while the data load (the «Piano» page: title and the switch between week and season).
 */
export function SectionPage({
  id,
  heading = true,
  title,
  children,
}: {
  id: SectionId;
  heading?: boolean;
  title?: React.ReactNode;
  children: (data: DashboardData) => React.ReactNode;
}) {
  const { data, error } = useDashboard();
  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-4 py-4 sm:py-6">
      {title ?? (heading && <SectionHeading id={id} />)}
      {error && !data ? (
        <div className="card max-w-xl p-5" role="alert">
          <h2 className="font-medium">Non riesco a leggere i dati</h2>
          <p className="mt-2 text-sm text-muted">{error}</p>
          <button type="button" className="mt-4 inline-flex min-h-11 items-center rounded-full px-5 text-sm font-medium" style={{ background: "var(--accent-bg)", color: "var(--accent-ink)" }} onClick={() => refreshAll()}>
            Riprova
          </button>
        </div>
      ) : !data ? (
        <p className="text-sm text-muted">Carico i dati…</p>
      ) : (
        children(data)
      )}
    </div>
  );
}
