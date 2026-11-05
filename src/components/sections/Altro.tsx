"use client";

// The phone app's "Altro": every section that isn't in the four tabs, one tap each (the full app keeps them all in its bar).
import { IconChevronRight } from "@tabler/icons-react";
import Link from "next/link";
import { SECTIONS, SETTINGS } from "../nav/sections";

const IN_TABS = new Set(["oggi", "coach", "rulli"]); // and the calendar, which is not one of SECTIONS

export default function Altro() {
  const items = [...SECTIONS.filter((s) => !IN_TABS.has(s.id) && !s.soon), SETTINGS];
  return (
    <main className="mx-auto w-full max-w-xl space-y-3 px-4 py-6">
      <h1 className="text-lg font-medium">Altro</h1>
      <nav aria-label="Altre sezioni" className="card overflow-hidden">
        {items.map((s, i) => {
          const Icon = s.icon;
          return (
            <Link key={s.id} href={s.href} className="flex items-center gap-3 px-4 py-3" style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined }}>
              <Icon size={22} stroke={1.8} style={{ color: s.color }} aria-hidden />
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
