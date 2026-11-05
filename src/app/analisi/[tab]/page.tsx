import { Suspense } from "react";
import Analisi from "@/components/sections/Analisi";

export default function Page() {
  // The tab is read from the address, which is only known at request time: inside a Suspense boundary.
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted">Carico…</div>}>
      <Analisi />
    </Suspense>
  );
}
