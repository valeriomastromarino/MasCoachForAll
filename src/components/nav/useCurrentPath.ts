"use client";

// The page the app is on. Next.js does not always notice an address changed with history.replaceState (the pager does that
// when you swipe), so the address bar itself is the truth: this hook re-reads it on every navigation, swipe and Back.
// (The single-file build swaps this file for standalone/useCurrentPath.ts, which reads the hash router.)
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";

const subs = new Set<() => void>();

/** Tells every reader that the address changed (called by replacePath). */
export function pathChanged(): void {
  subs.forEach((f) => f());
}

const subscribe = (cb: () => void) => {
  subs.add(cb);
  window.addEventListener("popstate", cb);
  return () => {
    subs.delete(cb);
    window.removeEventListener("popstate", cb);
  };
};

export function useCurrentPath(): string {
  // Called so the page re-renders when Next.js itself navigates (a link); the value comes from the address bar.
  const next = usePathname();
  return useSyncExternalStore(subscribe, () => window.location.pathname, () => next);
}
