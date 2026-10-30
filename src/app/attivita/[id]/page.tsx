import { Suspense } from "react";
import RideView from "@/components/ride/RideView";

export default function Page() {
  // The ride id is only known at request time, so it is read inside a Suspense boundary.
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted">Carico l&apos;uscita…</div>}>
      <RideView />
    </Suspense>
  );
}
