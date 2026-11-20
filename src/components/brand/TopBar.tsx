"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { IconAlertTriangle, IconCheck, IconChevronLeft, IconRefresh } from "@tabler/icons-react";
import { refreshAll } from "../data/remote";
import { MenuButton, ROUND_BUTTON } from "../nav/Menu";
import { isDetailPath, isRidePath, pageLabel } from "../nav/tabs";
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
        className={ROUND_BUTTON}
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
 * The way back from a page opened from the menu or a link (Analisi, Test, Impostazioni…): one pill, the only one (before there
 * were the pill «‹ Altro», a title «‹ Altro» and Android's Back). It goes back where the athlete was; to Oggi if the app opened
 * right on this page (a link from the widget).
 */
function BackPill({ from }: { from: string }) {
  const router = useRouter();
  const back = () => (window.history.length > 1 ? window.history.back() : router.push("/"));
  return (
    <button
      type="button"
      onClick={back}
      // The visible word comes first in what a screen reader says (WCAG 2.5.3, «label in name»).
      aria-label={from ? `Indietro, esci da ${from}` : "Indietro"}
      className="inline-flex h-11 shrink-0 items-center gap-1 rounded-full pl-3 pr-4 text-sm font-medium"
      style={{ background: "var(--accent-bg)", color: "var(--accent-ink)" }}
    >
      <IconChevronLeft size={18} stroke={2} aria-hidden />
      Indietro
    </button>
  );
}

/**
 * The same top of every page: the MasCoach logo at the left and «Aggiorna dati» at the right. On the phone app (design D,
 * 19 November 2026) the four pages of the bottom bar have the menu beside it, the others «Indietro»; the page names its own
 * title, so the pill with the name of the page is gone.
 */
export function TopBarView({ path, compact, index }: { path: string; compact: boolean; index: number }) {
  if (compact && isDetailPath(path)) return null;
  return (
    <div className="mx-auto w-full max-w-6xl shrink-0 px-4 pt-4">
      <div className="flex min-h-11 items-center justify-between gap-2">
        {/* `topbar-logo`: a little smaller on phones narrower than 360 px, so the buttons beside it keep their room. */}
        <Link href="/" aria-label="MasCoach, torna a Oggi" className="topbar-logo inline-flex min-h-11 shrink-0 items-center">
          <Logo />
        </Link>
        <div className="flex min-w-0 items-center gap-2">
          {/* «Pedala» (/rulli) is in the bottom bar too, so it has the menu like the four pages of the pager. */}
          {compact && (index >= 0 || path === "/rulli" ? <MenuButton /> : <BackPill from={isRidePath(path) ? "questa uscita" : pageLabel(path)} />)}
          <RefreshButton />
        </div>
      </div>
    </div>
  );
}
