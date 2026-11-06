"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { IconCalendarEvent, IconDots } from "@tabler/icons-react";
import { useCompact } from "@/lib/compact";
import { replacePath } from "./replacePath";
import { isActive, type Section, SECTIONS, SETTINGS } from "./sections";
import { tabIndex } from "./tabs";
import { useCurrentPath } from "./useCurrentPath";

/** Phone app: four big tabs. Everything that isn't today, the calendar, the coach or the rides is under "Altro". */
const ALTRO = { href: "/altro", label: "Altro", color: "var(--muted)" };
type Tab = { id: string; href: string; label: string; icon: Section["icon"]; color: string };
const tabOf = (id: "oggi" | "coach" | "uscite"): Tab => SECTIONS.find((s) => s.id === id)!;
const CALENDARIO: Tab = { id: "calendario", href: "/calendario", label: "Calendario", icon: IconCalendarEvent, color: "var(--accent-ink)" };
const tabOn = (s: Tab, pathname: string) => (s.href === "/" ? pathname === "/" : pathname === s.href || pathname.startsWith(s.href + "/"));

function CompactBar({ pathname }: { pathname: string }) {
  const tabs: Tab[] = [tabOf("oggi"), CALENDARIO, tabOf("coach"), tabOf("uscite")];
  const inTabs = tabs.some((s) => tabOn(s, pathname));
  // On one of the five pages the pager slides to the tapped one; from any other page the tap opens it normally.
  const slide = (href: string) => (e: React.MouseEvent) => {
    if (tabIndex(pathname) < 0 || e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    replacePath(href);
  };
  const tab = "flex h-[3.25rem] flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl text-[11px] leading-none transition-colors";
  return (
    <nav
      aria-label="Sezioni"
      className="fixed inset-x-0 bottom-0 z-40"
      style={{ background: "var(--surface)", borderTop: "1px solid var(--border)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex gap-1 px-2 py-1.5">
        {tabs.map((s) => {
          const Icon = s.icon;
          const on = tabOn(s, pathname);
          return (
            <Link key={s.id} href={s.href} onClick={slide(s.href)} className={tab} aria-current={on ? "page" : undefined} style={{ background: on ? "var(--accent-bg)" : undefined, color: on ? "var(--accent-ink)" : "var(--muted)" }}>
              <Icon size={24} stroke={on ? 2.1 : 1.7} aria-hidden />
              <span>{s.label}</span>
            </Link>
          );
        })}
        <Link href={ALTRO.href} onClick={slide(ALTRO.href)} className={tab} aria-current={!inTabs ? "page" : undefined} style={{ background: !inTabs ? "var(--accent-bg)" : undefined, color: !inTabs ? "var(--accent-ink)" : "var(--muted)" }}>
          <IconDots size={24} stroke={!inTabs ? 2.1 : 1.7} aria-hidden />
          <span>{ALTRO.label}</span>
        </Link>
      </div>
    </nav>
  );
}

function RailItem({ s, active }: { s: Section; active: boolean }) {
  const Icon = s.icon;
  return (
    <Link
      href={s.href}
      aria-label={s.label}
      aria-current={active ? "page" : undefined}
      className="group relative flex h-10 w-10 items-center justify-center rounded-xl transition-colors hover:bg-[var(--neutral-bg)]"
      style={{ background: active ? "var(--accent-bg)" : undefined, color: active ? "var(--accent-ink)" : "var(--muted)", opacity: s.soon ? 0.55 : 1 }}
    >
      {active && <span className="absolute -left-3 h-5 w-1 rounded-r-full" style={{ background: "var(--accent-ink)" }} aria-hidden />}
      <Icon size={21} stroke={active ? 2.1 : 1.7} aria-hidden />
      {/* Name on hover: the rail shows icons only. */}
      <span
        className="pointer-events-none absolute left-full z-50 ml-3 whitespace-nowrap rounded-lg px-2.5 py-1 text-xs opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
        style={{ background: "var(--foreground)", color: "var(--background)" }}
      >
        {s.label}
        {s.soon && " · in arrivo"}
      </span>
    </Link>
  );
}

/** Icon rail on tablets and computers (wide and tall screens, see the `rail` variant): a card beside the page that stays in view while scrolling. */
function SideRail({ pathname }: { pathname: string }) {
  return (
    <nav
      aria-label="Sezioni"
      className="card sticky top-5 z-40 my-5 hidden h-[calc(100dvh-2.5rem)] w-16 shrink-0 flex-col items-center gap-1.5 py-4 rail:flex"
    >
      {SECTIONS.map((s, i) => (
        <div key={s.id} className="flex flex-col items-center">
          {/* Future phases sit below a divider. */}
          {i > 0 && SECTIONS[i - 1].primary !== s.primary && <hr className="my-1.5 w-6" style={{ borderColor: "var(--border)" }} />}
          {i > 0 && !SECTIONS[i - 1].soon && s.soon && <hr className="my-1.5 w-6" style={{ borderColor: "var(--border)" }} />}
          <RailItem s={s} active={isActive(s, pathname)} />
        </div>
      ))}
      <div className="flex-1" />
      <RailItem s={SETTINGS} active={isActive(SETTINGS, pathname)} />
    </nav>
  );
}

/** Bottom tab bar on phones, also in landscape: every section in one row that scrolls sideways, the open one kept in view. */
function BottomBar({ pathname }: { pathname: string }) {
  const items = [...SECTIONS.filter((s) => !s.soon), SETTINGS];
  const row = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState({ left: false, right: false });
  const measure = useCallback(() => {
    const el = row.current;
    if (el) setMore({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  }, []);
  useEffect(() => {
    row.current?.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ inline: "center", block: "nearest" });
    measure();
  }, [pathname, measure]);
  const tab = "flex w-[4.75rem] flex-none snap-start flex-col items-center gap-0.5 rounded-xl py-1.5 text-[10px]";
  const fade = (side: "left" | "right") => (
    <span
      aria-hidden
      className={`pointer-events-none absolute inset-y-0 w-7 ${side === "left" ? "left-0" : "right-0"}`}
      style={{ background: `linear-gradient(to ${side === "left" ? "right" : "left"}, var(--surface), transparent)` }}
    />
  );
  return (
    <nav
      aria-label="Sezioni"
      className="fixed inset-x-0 bottom-0 z-40 rail:hidden"
      style={{
        background: "var(--surface)",
        borderTop: "1px solid var(--border)",
        paddingBottom: "calc(0.4rem + env(safe-area-inset-bottom))",
      }}
    >
      <div
        ref={row}
        onScroll={measure}
        className="flex snap-x scroll-px-2 gap-1 overflow-x-auto px-2 pt-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((s) => {
          const Icon = s.icon;
          const on = isActive(s, pathname);
          return (
            <Link key={s.id} href={s.href} className={tab} aria-current={on ? "page" : undefined} style={{ background: on ? "var(--accent-bg)" : undefined, color: on ? "var(--accent-ink)" : "var(--muted)" }}>
              <Icon size={22} stroke={on ? 2.1 : 1.7} aria-hidden />
              <span className="max-w-full truncate">{s.label}</span>
            </Link>
          );
        })}
      </div>
      {more.left && fade("left")}
      {more.right && fade("right")}
    </nav>
  );
}

function Nav({ pathname }: { pathname: string }) {
  const compact = useCompact();
  if (compact) return <CompactBar pathname={pathname} />;
  return (
    <>
      <SideRail pathname={pathname} />
      <BottomBar pathname={pathname} />
    </>
  );
}

function CurrentNav() {
  return <Nav pathname={useCurrentPath()} />;
}

// The current path is only known at request time: with Cache Components it must sit inside <Suspense>.
// The prerendered shell shows the same bars with no section highlighted.
export function AppNav() {
  return (
    <Suspense fallback={<Nav pathname="" />}>
      <CurrentNav />
    </Suspense>
  );
}
