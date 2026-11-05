"use client";

import Link from "next/link";
import { IconChevronLeft } from "@tabler/icons-react";
import { usePagerPos } from "@/lib/pagerPos";
import { isDetailPath, pageLabel, TAB_PATHS } from "../nav/tabs";
import { Logo } from "./Logo";

/** Dots of the five pages: the long one is the page under the finger and moves while you swipe. */
function Dots({ index }: { index: number }) {
  const pos = usePagerPos();
  return (
    <span className="ml-auto flex items-center gap-1.5" aria-hidden>
      {TAB_PATHS.map((p, i) => {
        // `pos` is the live position while sliding; at rest it equals the page.
        const near = Math.max(0, 1 - Math.abs((Number.isFinite(pos) ? pos : index) - i));
        return (
          <span
            key={p}
            className="block h-1.5 rounded-full"
            style={{ width: 6 + 12 * near, background: `color-mix(in srgb, var(--accent-ink) ${Math.round(near * 100)}%, var(--border))` }}
          />
        );
      })}
    </span>
  );
}

/**
 * The same top of every page: the MasCoach logo. On the phone app a row follows with the name of the page
 * (and a way back for the pages under "Altro"), plus the dots of the five swipeable pages.
 */
export function TopBarView({ path, compact, index }: { path: string; compact: boolean; index: number }) {
  if (compact && isDetailPath(path)) return null;
  const label = compact ? pageLabel(path) : "";
  return (
    <div className="mx-auto w-full max-w-6xl shrink-0 px-4 pt-5">
      <Link href="/" aria-label="MasCoach, torna a Oggi" className="inline-flex">
        <Logo />
      </Link>
      {compact && label && (
        <div className="mt-3 flex h-8 items-center gap-3">
          {index >= 0 ? (
            <span className="inline-flex h-8 items-center rounded-full px-3.5 text-xs font-medium leading-none" style={{ background: "var(--accent-bg)", color: "var(--accent-ink)" }}>
              {label}
            </span>
          ) : (
            <Link
              href="/altro"
              aria-label="Torna ad Altro"
              className="inline-flex h-8 items-center gap-1 rounded-full pl-2 pr-3.5 text-xs font-medium leading-none"
              style={{ background: "var(--accent-bg)", color: "var(--accent-ink)" }}
            >
              <IconChevronLeft size={15} stroke={2} aria-hidden />
              {label}
            </Link>
          )}
          {index >= 0 && <Dots index={index} />}
        </div>
      )}
    </div>
  );
}
