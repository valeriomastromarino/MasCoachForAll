"use client";

// Phone app: Forma, Potenza, Cuore and Recupero as the tabs of one page (the full app keeps four pages).
// The tall ones (Potenza, Cuore, Recupero) open cut short, with a button for the rest.
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
      {/* px-4 like the page above: the button used to run from edge to edge of the screen, wider than the cards. */}
      {state.tall && (
        <div className="px-4 pb-4">
          <button type="button" onClick={() => setState({ key: reset, open: !open, tall: true })} className="card mt-3 w-full px-4 py-2.5 text-sm text-muted">
            {open ? "Mostra meno" : "Mostra tutto"}
          </button>
        </div>
      )}
    </div>
  );
}

export default function Analisi() {
  const path = usePathname();
  const tab = TABS.find((t) => t.id !== "forma" && (path === t.href || path.startsWith(t.href + "/"))) ?? TABS[0];
  const View = tab.View;
  const router = useRouter();
  const from = useRef<{ x: number; y: number } | null>(null);
  // Swipe sideways to move between Forma, Potenza, Cuore and Recupero (not when the finger starts on a chart: it reads it).
  const onStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    from.current = (e.target as HTMLElement).closest(".recharts-wrapper, [data-noswipe]") ? null : { x: t.clientX, y: t.clientY };
  };
  const onEnd = (e: React.TouchEvent) => {
    const s = from.current;
    from.current = null;
    if (!s) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x;
    if (Math.abs(dx) < 60 || Math.abs(t.clientY - s.y) > Math.abs(dx) * 0.6) return;
    const next = TABS[TABS.findIndex((x) => x.id === tab.id) + (dx < 0 ? 1 : -1)];
    if (next) router.replace(next.href);
  };
  return (
    <div className="mx-auto w-full max-w-6xl" onTouchStart={onStart} onTouchEnd={onEnd}>
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
