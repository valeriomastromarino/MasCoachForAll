"use client";

import Link from "next/link";
import { IconChevronLeft } from "@tabler/icons-react";
import { isDetailPath, pageLabel } from "../nav/tabs";
import { Logo } from "./Logo";

/**
 * The same top of every page: the MasCoach logo. On the phone app the name of the page
 * (and a way back for the pages under "Altro"), at the right of the logo.
 */
export function TopBarView({ path, compact, index }: { path: string; compact: boolean; index: number }) {
  if (compact && isDetailPath(path)) return null;
  const label = compact ? pageLabel(path) : "";
  return (
    <div className="mx-auto w-full max-w-6xl shrink-0 px-4 pt-5">
      <div className="flex min-h-8 items-center justify-between gap-3">
        <Link href="/" aria-label="MasCoach, torna a Oggi" className="inline-flex">
          <Logo />
        </Link>
        {compact && label && (index >= 0 ? (
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
        ))}
      </div>
    </div>
  );
}
