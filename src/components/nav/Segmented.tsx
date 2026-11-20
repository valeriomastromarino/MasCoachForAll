"use client";

// The views of one page side by side (Piano: Settimana / Stagione; Analisi: Forma / Potenza / Cuore / Recupero). One style for
// every switch of the phone app, 44 px tall (design D with the rules of A, 19 November 2026: there were two kinds of tabs).
import Link from "next/link";

export type SegmentedItem = { id: string; label: string; href: string };

export function Segmented({
  label,
  items,
  current,
  onPick,
}: {
  label: string;
  items: SegmentedItem[];
  current: string;
  /** Instead of following the link (e.g. a view of the same page that must not add a step to the history). */
  onPick?: (item: SegmentedItem) => void;
}) {
  return (
    <nav aria-label={label} className="flex gap-1 rounded-2xl p-1" style={{ background: "var(--neutral-bg)" }}>
      {items.map((it) => {
        const on = it.id === current;
        return (
          <Link
            key={it.id}
            href={it.href}
            onClick={
              onPick
                ? (e) => {
                    if (e.metaKey || e.ctrlKey) return;
                    e.preventDefault();
                    onPick(it);
                  }
                : undefined
            }
            aria-current={on ? "page" : undefined}
            // px-1: «Recupero» fits in a quarter of a 360 px phone (with px-2 it was cut to «Recupe…»).
            className="flex min-h-11 min-w-0 flex-1 items-center justify-center rounded-xl px-1 text-sm"
            style={on ? { background: "var(--accent-bg)", color: "var(--accent-ink)", fontWeight: 600 } : { color: "var(--muted)" }}
          >
            <span className="truncate">{it.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
