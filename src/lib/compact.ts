"use client";

// The phone app shows a shorter version of MasCoach: today, the coach, the trainer and one "Altro" page for everything else.
// The web app and the computer keep the full version. For trying it in a browser: localStorage "mascoach-compact" = "1".
import { useSyncExternalStore } from "react";
import { isApp } from "./native";

const KEY = "mascoach-compact";
const flag = () => {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
};

export const isCompact = () => isApp() || flag();

const subscribe = (cb: () => void) => {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
};

/** False on the server and on the first paint, so the page never differs between server and browser. */
export const useCompact = (): boolean => useSyncExternalStore(subscribe, isCompact, () => false);
