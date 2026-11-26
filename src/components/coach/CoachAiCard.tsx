"use client";

// The switch of the written coach (Claude Haiku). Off by default: the chat answers with the app's own engine, at no cost.
import { useState, useSyncExternalStore } from "react";
import { coachAiOn, setCoachAi } from "@/lib/coach/server";

const noSubscribe = () => () => {};

export function CoachAiCard() {
  // Read after the first paint (the server page doesn't see this device's choice), then the switch decides.
  const stored = useSyncExternalStore(noSubscribe, coachAiOn, () => false);
  const [picked, setOn] = useState<boolean | null>(null);
  const on = picked ?? stored;
  return (
    <section className="card max-w-xl p-5">
      <h3 className="text-sm font-medium">Coach scritto (Claude)</h3>
      <p className="mt-0.5 text-xs text-muted">
        {on
          ? "Acceso: le domande libere vanno a Claude Haiku, che costa qualche decimo di centesimo a messaggio sulla chiave API. Creare e cambiare sedute resta al motore dell'app."
          : "Spento: la chat risponde con il motore dell'app, gratis e anche senza rete. Capisce i refusi, segue la conversazione e conosce le nozioni da coach."}
      </p>
      <label className="mt-3 flex min-h-11 cursor-pointer items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => {
            setCoachAi(e.target.checked);
            setOn(e.target.checked);
          }}
          className="h-5 w-5 accent-[var(--brand)]"
        />
        Usa il coach scritto (a pagamento)
      </label>
    </section>
  );
}
