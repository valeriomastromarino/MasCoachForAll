// Hash router of the single-file build: "MasCoach.html#/potenza" works when opened straight from disk.
import { useSyncExternalStore } from "react";

function current(): string {
  const h = decodeURIComponent(window.location.hash.replace(/^#/, ""));
  return h.startsWith("/") ? h : "/";
}

function subscribe(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

export function usePath(): string {
  return useSyncExternalStore(subscribe, current, () => "/");
}

export function navigate(path: string) {
  window.location.hash = path;
}
