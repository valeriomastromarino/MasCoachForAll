import { Suspense } from "react";
import PlayerPage from "@/components/player/PlayerPage";

export default function Page() {
  // The workout id is only known at request time, so it is read inside a Suspense boundary.
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted">Carico l&apos;allenamento…</div>}>
      <PlayerPage />
    </Suspense>
  );
}
