"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { IconAlertTriangle, IconCheck, IconChevronLeft, IconRefresh } from "@tabler/icons-react";
import { refreshAll } from "../data/remote";
import { isDetailPath, pageLabel } from "../nav/tabs";
import { Logo } from "./Logo";

type RefreshState = "idle" | "busy" | "ok" | "error";

const REFRESH_TEXT: Record<RefreshState, string> = {
  idle: "Aggiorna dati",
  busy: "Aggiorno i dati…",
  ok: "Dati aggiornati",
  error: "Dati non aggiornati: riprova",
};

/**
 * «Aggiorna dati» as a symbol at the right end of the top bar (19 November 2026: the athlete wanted it by the logo, and from
 * 6 November it was a button in Impostazioni). It turns while reading, then shows for a moment whether it worked.
 */
function RefreshButton() {
  const [state, setState] = useState<RefreshState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const run = async () => {
    if (state === "busy") return;
    clearTimeout(timer.current);
    setState("busy");
    const ok = await refreshAll();
    setState(ok ? "ok" : "error");
    timer.current = setTimeout(() => setState("idle"), ok ? 1500 : 4000);
  };
  const color = state === "error" ? "var(--critical)" : state === "ok" ? "var(--good)" : "var(--muted)";
  return (
    <>
      <button
        type="button"
        onClick={run}
        aria-label={REFRESH_TEXT[state]}
        title={REFRESH_TEXT[state]}
        aria-busy={state === "busy"}
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
        style={{ background: "var(--surface)", boxShadow: "var(--card-shadow)", color }}
      >
        {state === "ok" ? (
          <IconCheck size={18} stroke={2} aria-hidden />
        ) : state === "error" ? (
          <IconAlertTriangle size={18} stroke={2} aria-hidden />
        ) : (
          <IconRefresh size={18} stroke={2} aria-hidden className={state === "busy" ? "animate-spin motion-reduce:animate-none" : undefined} />
        )}
      </button>
      <span role="status" className="sr-only">
        {state === "ok" || state === "error" ? REFRESH_TEXT[state] : ""}
      </span>
    </>
  );
}

/**
 * The same top of every page: the MasCoach logo at the left and «Aggiorna dati» at the right. On the phone app the name of
 * the page (and a way back for the pages under "Altro") sits just before the refresh symbol.
 */
export function TopBarView({ path, compact, index }: { path: string; compact: boolean; index: number }) {
  if (compact && isDetailPath(path)) return null;
  const label = compact ? pageLabel(path) : "";
  return (
    <div className="mx-auto w-full max-w-6xl shrink-0 px-4 pt-5">
      <div className="flex min-h-9 items-center justify-between gap-2">
        {/* `topbar-logo`: a little smaller on phones narrower than 360 px, so the page name is not cut short («Impost…»). */}
        <Link href="/" aria-label="MasCoach, torna a Oggi" className="topbar-logo inline-flex shrink-0">
          <Logo />
        </Link>
        <div className="flex min-w-0 items-center gap-2">
          {compact && label && (index >= 0 ? (
            <span className="inline-flex h-8 min-w-0 items-center truncate rounded-full px-3.5 text-xs font-medium leading-none" style={{ background: "var(--accent-bg)", color: "var(--accent-ink)" }}>
              {label}
            </span>
          ) : (
            <Link
              href="/altro"
              // The visible name comes first in what a screen reader says (WCAG 2.5.3, «label in name»).
              aria-label={`${label}, torna ad Altro`}
              className="inline-flex h-8 min-w-0 items-center gap-1 rounded-full pl-2 pr-3.5 text-xs font-medium leading-none"
              style={{ background: "var(--accent-bg)", color: "var(--accent-ink)" }}
            >
              <IconChevronLeft size={15} stroke={2} aria-hidden className="shrink-0" />
              <span className="truncate">{label}</span>
            </Link>
          ))}
          <RefreshButton />
        </div>
      </div>
    </div>
  );
}
