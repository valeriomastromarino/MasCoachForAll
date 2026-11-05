"use client";

// Phone app: Forma, Potenza, Cuore and Recupero as the tabs of one page (the full app keeps four pages).
// The tall ones (Potenza, Cuore, Recupero) open cut short, with a button for the rest.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Cuore from "./Cuore";
import Forma from "./Forma";
import Potenza from "./Potenza";
import Recupero from "./Recupero";

const TABS = [
  { id: "forma", label: "Forma", href: "/analisi", View: Forma },
  { id: "potenza", label: "Potenza", href: "/analisi/potenza", View: Potenza },
  { id: "cuore", label: "Cuore", href: "/analisi/cuore", View: Cuore },
  { id: "recupero", label: "Recupero", href: "/analisi/recupero", View: Recupero },
] as const;

const CLAMP_PX = 900;

/** Cuts a tall page at CLAMP_PX with a fade and a "Mostra tutto" button; short pages show whole. */
function Clamp({ children, reset }: { children: React.ReactNode; reset: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<{ key: string; open: boolean; tall: boolean }>({ key: reset, open: false, tall: false });
  const open = state.key === reset && state.open;
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setState((s) => ({ key: reset, open: s.key === reset ? s.open : false, tall: el.scrollHeight > CLAMP_PX + 160 }));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [reset]);
  const cut = state.tall && !open;
  return (
    <div>
      <div className="relative">
        <div ref={box} style={cut ? { maxHeight: CLAMP_PX, overflow: "hidden" } : undefined}>
          {children}
        </div>
        {cut && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24" style={{ background: "linear-gradient(to bottom, transparent, var(--background))" }} aria-hidden />}
      </div>
      {state.tall && (
        <button type="button" onClick={() => setState({ key: reset, open: !open, tall: true })} className="card mt-3 w-full px-4 py-2.5 text-sm text-muted">
          {open ? "Mostra meno" : "Mostra tutto"}
        </button>
      )}
    </div>
  );
}

export default function Analisi() {
  const path = usePathname();
  const tab = TABS.find((t) => t.id !== "forma" && (path === t.href || path.startsWith(t.href + "/"))) ?? TABS[0];
  const View = tab.View;
  return (
    <div className="mx-auto w-full max-w-6xl">
      <nav aria-label="Analisi" className="flex gap-1.5 overflow-x-auto px-4 pt-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={t.href}
            aria-current={t.id === tab.id ? "page" : undefined}
            className="shrink-0 rounded-full px-4 py-1.5 text-sm"
            style={{ background: t.id === tab.id ? "var(--accent-bg)" : "transparent", color: t.id === tab.id ? "var(--accent-ink)" : "var(--muted)", border: `1px solid ${t.id === tab.id ? "var(--accent-ink)" : "var(--border)"}` }}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      <Clamp reset={tab.id}>
        <View />
      </Clamp>
    </div>
  );
}
