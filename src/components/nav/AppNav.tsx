"use client";

import { IconDots } from "@tabler/icons-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useState } from "react";
import { isActive, type Section, SECTIONS, SETTINGS } from "./sections";

const tint = (color: string, pct: number) => `color-mix(in srgb, ${color} ${pct}%, transparent)`;

function RailItem({ s, active }: { s: Section; active: boolean }) {
  const Icon = s.icon;
  return (
    <Link
      href={s.href}
      aria-label={s.label}
      aria-current={active ? "page" : undefined}
      className="group relative flex h-10 w-10 items-center justify-center rounded-xl transition-colors hover:bg-[var(--neutral-bg)]"
      style={{ background: active ? tint(s.color, 18) : undefined, color: s.color, opacity: s.soon ? 0.55 : 1 }}
    >
      {active && <span className="absolute -left-3 h-5 w-1 rounded-r-full" style={{ background: s.color }} aria-hidden />}
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

/** Icon rail on tablets and computers: a card beside the page that stays in view while scrolling. */
function SideRail({ pathname }: { pathname: string }) {
  return (
    <nav
      aria-label="Sezioni"
      className="card sticky top-5 z-40 my-5 hidden h-[calc(100vh-2.5rem)] w-16 shrink-0 flex-col items-center gap-1.5 py-4 md:flex"
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

/** Bottom tab bar on phones: the five main sections under the thumb, the rest in "Altro". */
function BottomBar({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);
  const main = SECTIONS.filter((s) => s.primary);
  const more = [...SECTIONS.filter((s) => !s.primary), SETTINGS];
  const moreActive = more.some((s) => isActive(s, pathname));
  const tab = "flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[10px]";
  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setOpen(false)} style={{ background: "rgba(0,0,0,.35)" }}>
          <div
            className="card absolute inset-x-3 p-2"
            style={{ bottom: "calc(4.5rem + env(safe-area-inset-bottom))" }}
            onClick={(e) => e.stopPropagation()}
          >
            {more.map((s) => {
              const Icon = s.icon;
              return (
                <Link
                  key={s.id}
                  href={s.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm"
                  style={{ background: isActive(s, pathname) ? "var(--neutral-bg)" : undefined, opacity: s.soon ? 0.6 : 1 }}
                >
                  <Icon size={20} style={{ color: s.color }} aria-hidden />
                  {s.label}
                  {s.soon && <span className="ml-auto text-xs text-faint">in arrivo</span>}
                </Link>
              );
            })}
          </div>
        </div>
      )}
      <nav
        aria-label="Sezioni"
        className="fixed inset-x-0 bottom-0 z-40 flex gap-1 px-2 pt-1.5 md:hidden"
        style={{
          background: "var(--surface)",
          borderTop: "1px solid var(--border)",
          paddingBottom: "calc(0.4rem + env(safe-area-inset-bottom))",
        }}
      >
        {main.map((s) => {
          const Icon = s.icon;
          const on = isActive(s, pathname);
          return (
            <Link key={s.id} href={s.href} className={tab} aria-current={on ? "page" : undefined} style={{ background: on ? tint(s.color, 18) : undefined, color: on ? s.color : "var(--muted)" }}>
              <Icon size={22} stroke={on ? 2.1 : 1.7} style={{ color: s.color }} aria-hidden />
              {s.label}
            </Link>
          );
        })}
        <button
          className={tab}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          style={{ background: moreActive ? "var(--neutral-bg)" : undefined, color: "var(--muted)" }}
        >
          <IconDots size={22} aria-hidden />
          Altro
        </button>
      </nav>
    </>
  );
}

function Nav({ pathname }: { pathname: string }) {
  return (
    <>
      <SideRail pathname={pathname} />
      <BottomBar pathname={pathname} />
    </>
  );
}

function CurrentNav() {
  return <Nav pathname={usePathname()} />;
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
