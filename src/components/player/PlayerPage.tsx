"use client";

// /rulli/[id]: loads the planned workout (targets in watts) and opens the player.
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { TrainerWorkoutData } from "@/lib/api/handlers";
import type { PlayerWorkout } from "@/lib/player/timeline";
import { apiFetch } from "../data/transport";
import { Player } from "./Player";

export default function PlayerPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [state, setState] = useState<{ id: string; workout: PlayerWorkout } | { id: string; error: string } | null>(null);

  useEffect(() => {
    let alive = true;
    apiFetch(`/api/rulli/workout/${encodeURIComponent(id)}`)
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!alive) return;
        if (res.ok) setState({ id, workout: (json as TrainerWorkoutData).workout });
        else setState({ id, error: (json as { error?: string }).error ?? res.statusText });
      })
      .catch((e) => alive && setState({ id, error: e instanceof Error ? e.message : String(e) }));
    return () => {
      alive = false;
    };
  }, [id]);

  const current = state?.id === id ? state : null;
  if (!current) return <div className="p-6 text-sm text-muted">Carico l&apos;allenamento…</div>;
  if ("error" in current) {
    return (
      <main className="mx-auto w-full max-w-xl space-y-3 px-4 py-6">
        <div className="card p-5">
          <div className="text-sm font-medium">Allenamento non disponibile</div>
          <p className="mt-1 text-sm text-muted">{current.error}</p>
          <button className="mt-3 rounded-lg px-3 py-1.5 text-xs font-medium" style={{ background: "var(--accent-bg)", color: "var(--accent-ink)" }} onClick={() => router.push("/rulli")}>
            Torna a Rulli
          </button>
        </div>
      </main>
    );
  }
  return <Player workout={current.workout} onExit={() => router.push("/rulli")} />;
}
