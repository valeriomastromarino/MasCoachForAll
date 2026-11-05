"use client";

// Where the pager is while the finger moves (0 = first page, 4 = last, in between while sliding): the dots under the logo follow it.
import { useSyncExternalStore } from "react";

let pos = 0;
const subs = new Set<() => void>();

export function setPagerPos(p: number): void {
  if (Math.abs(p - pos) < 0.002) return;
  pos = p;
  subs.forEach((f) => f());
}

export const usePagerPos = (): number =>
  useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => void subs.delete(cb);
    },
    () => pos,
    () => 0,
  );
