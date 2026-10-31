"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { PlayerWorkout } from "@/lib/player/timeline";
import { PlayerEngine } from "./engine";

/** The session engine of one workout, and its current view (updated once a second and on device changes). */
export function usePlayer(workout: PlayerWorkout) {
  const [engine] = useState(() => new PlayerEngine(workout));
  const view = useSyncExternalStore(engine.subscribe, engine.getView, engine.getView);
  useEffect(() => {
    engine.open();
    return () => engine.close();
  }, [engine]);
  return { engine, view };
}
