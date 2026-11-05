"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { useCompact } from "@/lib/compact";
import { Logo } from "./Logo";
import { TOPBAR_ACTIONS_ID } from "./slots";

// The phone app (single-file build) uses the hash router; elsewhere the address bar path.
const here = () => {
  const h = window.location.hash.replace(/^#/, "");
  if (h.startsWith("/")) return h;
  const p = window.location.pathname;
  return p.endsWith(".html") ? "/" : p;
};
const subscribe = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  window.addEventListener("popstate", cb);
  return () => {
    window.removeEventListener("hashchange", cb);
    window.removeEventListener("popstate", cb);
  };
};

// The theme switch moved to Impostazioni (gear icon in the navigation).
// Phone app: the logo, the name, the data source and "Aggiorna" show on Oggi only; the other pages start with their own content.
export function TopBar() {
  const compact = useCompact();
  const path = useSyncExternalStore(subscribe, here, () => "/");
  if (compact && path !== "/") return null;
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 pt-5">
      <Link href="/" aria-label="MasCoach, torna a Oggi">
        <Logo />
      </Link>
      <div id={TOPBAR_ACTIONS_ID} className="flex flex-wrap items-center gap-2" />
    </div>
  );
}
