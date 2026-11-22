"use client";

// The home-screen widget gets today's day from the app while the app is open (Android only, mounted by AppShell): the same
// verdict, numbers and session as the Oggi card, including the chat's «solo per oggi» requests that the site cannot know.
// It is pushed again, a moment later, whenever something changes: a session programmed, moved or removed, a ride uploaded,
// «Aggiorna dati», a new day. With the app closed the widget asks the site by itself (at 8:00 and with «Aggiorna»).
import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { DashboardData } from "@/lib/dashboard";
import { widgetPush } from "@/lib/native";
import { loadProfile, PROFILE_EVENT, profileSnapshot } from "@/lib/profile/profile";
import { loadSeason, SEASON_EVENT, seasonSnapshot } from "@/lib/training/seasonStore";
import { buildWidget } from "@/lib/widget";
import { useDashboard } from "./remote";
import { useLibrary, useLife, useOverrides, usePlanned } from "./trainingData";

const listen = (event: string) => (cb: () => void) => {
  window.addEventListener(event, cb);
  return () => window.removeEventListener(event, cb);
};
const onProfile = listen(PROFILE_EVENT);
const onSeason = listen(SEASON_EVENT);
/** Changes come in bursts (dashboard, library, calendar): push once they have settled. */
const SETTLE_MS = 1500;

export function WidgetSync() {
  const { data } = useDashboard();
  // Demo data never goes on the home screen.
  return data && data.source !== "demo" ? <Push data={data} /> : null;
}

function Push({ data }: { data: DashboardData }) {
  const library = useLibrary();
  const planned = usePlanned(data.today, data.athlete.ftp);
  const life = useLife(data.today);
  const overrides = useOverrides(data.today);
  const rawProfile = useSyncExternalStore(onProfile, profileSnapshot, () => "");
  const rawSeason = useSyncExternalStore(onSeason, seasonSnapshot, () => "");
  const sent = useRef("");

  const json = useMemo(() => {
    // Without the library and the calendar the session would be wrong: wait for them.
    if (!library || !planned) return null;
    const stored = rawProfile ? loadProfile() : null;
    return JSON.stringify(
      buildWidget({ dash: data, library, planned, setup: rawSeason ? loadSeason() : null, profile: stored?.profile ?? null, phenotype: stored?.phenotype ?? null, life, overrides, from: "app" }),
    );
  }, [data, library, planned, life, overrides, rawProfile, rawSeason]);

  useEffect(() => {
    if (!json) return;
    // The time of building changes at every run: compare the rest.
    const same = json.replace(/"at":"[^"]*",/, "");
    if (same === sent.current) return;
    const t = setTimeout(() => {
      sent.current = same;
      widgetPush(json);
    }, SETTLE_MS);
    return () => clearTimeout(t);
  }, [json]);
  return null;
}
