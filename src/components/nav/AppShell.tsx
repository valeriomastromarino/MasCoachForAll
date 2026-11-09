"use client";

// The frame of every page: logo on top and the page itself. On the phone app the five main pages (Oggi, Calendario, Coach, Uscite, Altro)
// sit side by side in a pager: the page follows the finger, and the page name at the right of the logo follows.
import { Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useCompact } from "@/lib/compact";
import { setPagerPos } from "@/lib/pagerPos";
import { TopBarView } from "../brand/TopBar";
import { useChartTouchDismiss } from "../chartTouch";
import Archive from "../archive/Archive";
import Altro from "../sections/Altro";
import Calendario from "../sections/Calendario";
import Coach from "../sections/Coach";
import Oggi from "../sections/Oggi";
import { replacePath } from "./replacePath";
import { useCurrentPath } from "./useCurrentPath";
import { TAB_PATHS, tabIndex } from "./tabs";

const PAGES: { render: () => React.ReactNode; fill?: boolean }[] = [
  { render: () => <Oggi /> },
  { render: () => <Calendario /> },
  { render: () => <Coach />, fill: true },
  { render: () => <Archive /> },
  { render: () => <Altro /> },
];

/** The finger has been still this long: the page is settled. */
const IDLE_MS = 110;

function TabPager({ index }: { index: number }) {
  const row = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const raf = useRef(0);
  const [mounted, setMounted] = useState<number[]>(() => [index]);
  const mount = useCallback((i: number) => setMounted((m) => (i >= 0 && i < PAGES.length && !m.includes(i) ? [...m, i] : m)), []);

  // Neighbours are prepared a moment after the page opens, so swiping never shows an empty page.
  useEffect(() => {
    const t = setTimeout(() => {
      mount(index - 1);
      mount(index + 1);
    }, 250);
    return () => clearTimeout(t);
  }, [index, mount]);

  // Opening the pager: jump to the page without sliding.
  useLayoutEffect(() => {
    const el = row.current;
    if (el) el.scrollLeft = index * el.clientWidth;
    setPagerPos(index);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A tap on the bottom bar (or a link) changed the address: slide there (jump when it is far away: the pages in between may not be ready).
  useEffect(() => {
    const el = row.current;
    if (!el) return;
    const here = Math.round(el.scrollLeft / el.clientWidth);
    if (here === index) return;
    const far = Math.abs(here - index) > 1 || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    mount(index);
    el.scrollTo({ left: index * el.clientWidth, behavior: far ? "auto" : "smooth" });
    if (far) setPagerPos(index);
  }, [index, mount]);

  const onScroll = () => {
    const el = row.current;
    if (!el) return;
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      const p = el.scrollLeft / el.clientWidth;
      setPagerPos(p);
      mount(Math.round(p));
    });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const i = Math.round(el.scrollLeft / el.clientWidth);
      if (i !== index && i >= 0 && i < TAB_PATHS.length) replacePath(TAB_PATHS[i]);
    }, IDLE_MS);
  };

  // Rotating the phone changes the width: stay on the same page.
  useEffect(() => {
    const el = row.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      el.scrollLeft = index * el.clientWidth;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [index]);

  return (
    <div
      ref={row}
      onScroll={onScroll}
      data-pager
      className="flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {PAGES.map((p, i) => (
        <section
          key={TAB_PATHS[i]}
          aria-hidden={i !== index}
          className={"h-full w-full min-w-full flex-none snap-center snap-always overscroll-y-contain pb-[var(--nav-h)] " + (p.fill ? "overflow-hidden" : "overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden")}
        >
          {mounted.includes(i) && p.render()}
        </section>
      ))}
    </div>
  );
}

function Shell({ children, header }: { children: React.ReactNode; header?: React.ReactNode }) {
  const path = useCurrentPath();
  const compact = useCompact();
  useChartTouchDismiss();
  const index = tabIndex(path);
  if (compact && index >= 0) {
    return (
      <div className="fixed inset-0 z-30 flex flex-col" style={{ background: "var(--background)" }}>
        <TopBarView path={path} compact index={index} />
        {header}
        <TabPager index={index} />
      </div>
    );
  }
  // Pages that open from the pager slide in; the section ("analisi", "attivita"…) is the key, so its own tabs don't replay it.
  const section = path.split("/")[1] ?? "";
  return (
    <>
      <TopBarView path={path} compact={compact} index={index} />
      {header}
      <div key={compact ? section : "all"} className="flex min-h-0 flex-1 flex-col" style={compact ? { animation: "page-in 0.22s ease-out" } : undefined}>
        {children}
      </div>
    </>
  );
}

// The current path is only known at request time: with Cache Components it must sit inside <Suspense>; the shell shows the page meanwhile.
export function AppShell({ children, header }: { children: React.ReactNode; header?: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <>
          <TopBarView path="" compact={false} index={-1} />
          {header}
          {children}
        </>
      }
    >
      <Shell header={header}>{children}</Shell>
    </Suspense>
  );
}
