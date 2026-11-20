"use client";

// The menu at the top of the phone app (design D «Azione», 19 November 2026): what used to be under «Altro» (Analisi, Stagione,
// Test, the trainer check, Impostazioni) opens from here, so the bar at the bottom keeps the things done every day.
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconCalendarStats, IconChartLine, IconChevronRight, IconMenu2, IconSettings, IconStopwatch, IconX } from "@tabler/icons-react";
import { guardBack } from "@/lib/native";
import { IconTrainer } from "../brand/TrainerIcon";
import { Logo } from "../brand/Logo";

const ITEMS = [
  { href: "/analisi", label: "Analisi", sub: "Forma, potenza, cuore e recupero", Icon: IconChartLine },
  { href: "/stagione", label: "Stagione", sub: "Il piano fino al picco, anche in Piano", Icon: IconCalendarStats },
  { href: "/test", label: "Test", sub: "Rampa, 20′, potenza critica", Icon: IconStopwatch },
  { href: "/rulli/prova", label: "Prova del rullo", sub: "14′ per controllare ERG e sensori", Icon: IconTrainer },
  { href: "/impostazioni", label: "Impostazioni", sub: "Aspetto, dati, Strava", Icon: IconSettings },
];

/** Round button like «Aggiorna dati», 44 px. */
export const ROUND_BUTTON = "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full";

function MenuSheet({ onClose }: { onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = panel.current;
    el?.querySelector<HTMLElement>("a")?.focus();
    const removeBack = guardBack(() => (onClose(), true));
    // Esc closes; Tab stays inside the menu while it is open.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return onClose();
      if (e.key !== "Tab" || !el) return;
      const all = [...el.querySelectorAll<HTMLElement>("a, button")];
      const first = all[0], last = all[all.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      removeBack();
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0" style={{ background: "rgba(20, 14, 10, 0.4)" }} onClick={onClose} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        className="absolute inset-x-0 top-0 mx-auto max-w-xl rounded-b-[26px] px-4 pb-4 pt-4"
        style={{ background: "var(--surface)", boxShadow: "var(--tip-shadow)", animation: "menu-in 0.18s ease-out" }}
      >
        <div className="mb-1 flex items-center justify-between">
          <Logo />
          <button type="button" onClick={onClose} aria-label="Chiudi il menu" className={ROUND_BUTTON} style={{ background: "var(--neutral-bg)", color: "var(--foreground)" }}>
            <IconX size={20} stroke={2} aria-hidden />
          </button>
        </div>
        <nav aria-label="Altre pagine">
          {ITEMS.map(({ href, label, sub, Icon }, i) => (
            <Link key={href} href={href} onClick={onClose} className="flex min-h-[60px] items-center gap-3 py-2" style={{ borderTop: i ? "1px solid var(--border)" : undefined }}>
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl" style={{ background: "var(--accent-bg)", color: "var(--accent-ink)" }} aria-hidden>
                <Icon size={21} stroke={1.8} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold leading-tight">{label}</span>
                <span className="block text-[13px] leading-snug text-muted">{sub}</span>
              </span>
              <IconChevronRight size={18} className="shrink-0 text-muted" aria-hidden />
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}

export function MenuButton() {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => {
    setOpen(false);
    button.current?.focus();
  }, []);
  return (
    <>
      <button
        ref={button}
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Menu"
        aria-haspopup="dialog"
        aria-expanded={open}
        className={ROUND_BUTTON}
        style={{ background: "var(--surface)", boxShadow: "var(--card-shadow)", color: "var(--foreground)" }}
      >
        <IconMenu2 size={20} stroke={2} aria-hidden />
      </button>
      {/* On the body: inside the top bar the sheet sat under the bottom bar, which stayed bright and could be tapped. */}
      {open && createPortal(<MenuSheet onClose={close} />, document.body)}
    </>
  );
}
