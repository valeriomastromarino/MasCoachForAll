"use client";

// The phone app's "Altro": what isn't in the five tabs (Oggi, Calendario, Coach, Rulli), one tap each.
// Forma, Potenza, Cuore and Recupero are the tabs of "Analisi"; the full app keeps them as four pages.
import { IconChartLine, IconChevronRight } from "@tabler/icons-react";
import Link from "next/link";
import { sectionById, SETTINGS } from "../nav/sections";

const ANALISI = { id: "analisi", href: "/analisi", label: "Analisi", description: "Forma, potenza, cuore e recupero", icon: IconChartLine, color: "var(--form-ink)" };

export default function Altro() {
  const items = [ANALISI, sectionById("stagione"), sectionById("uscite"), sectionById("test"), SETTINGS];
  return (
    <main className="mx-auto w-full max-w-xl space-y-3 px-4 py-6">
      <h1 className="text-lg font-medium">Altro</h1>
      <nav aria-label="Altre sezioni" className="card overflow-hidden">
        {items.map((s, i) => {
          const Icon = s.icon;
          return (
            <Link key={s.id} href={s.href} className="flex items-center gap-3 px-4 py-3" style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined }}>
              <Icon size={22} stroke={1.8} style={{ color: "var(--accent-ink)" }} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{s.label}</span>
                <span className="block truncate text-xs text-muted">{s.description}</span>
              </span>
              <IconChevronRight size={18} className="text-muted" aria-hidden />
            </Link>
          );
        })}
      </nav>
    </main>
  );
}
