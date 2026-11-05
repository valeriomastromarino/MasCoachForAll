"use client";

// Phone app only: the password of the online MasCoach, so the coach can answer written questions (the Anthropic key stays online).
import { useState } from "react";
import { coachPassword, coachServer, DEFAULT_SERVER, saveCoachServer } from "@/lib/coach/server";

export function CoachServerCard() {
  const [password, setPassword] = useState(() => coachPassword());
  const [server, setServer] = useState(() => (coachServer() === DEFAULT_SERVER ? "" : coachServer()));
  const [saved, setSaved] = useState(false);
  return (
    <section className="card max-w-xl p-5">
      <h2 className="text-sm font-medium">Coach scritto</h2>
      <p className="mt-0.5 text-xs text-muted">
        Per chiedere al coach con Claude Sonnet serve la password dell&apos;app online (quella del tuo sito online su Vercel) e la rete. Senza, la chat risponde con le regole dell&apos;app. La password resta solo su questo telefono.
      </p>
      <form
        className="mt-3 space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          saveCoachServer(server, password);
          setSaved(true);
        }}
      >
        <input
          type="password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setSaved(false);
          }}
          placeholder="Password dell'app online"
          aria-label="Password dell'app online"
          autoComplete="off"
          className="w-full rounded-xl px-3 py-2 text-sm outline-none"
          style={{ background: "var(--background)", border: "1px solid var(--border)" }}
        />
        <input
          value={server}
          onChange={(e) => {
            setServer(e.target.value);
            setSaved(false);
          }}
          placeholder="Indirizzo del tuo sito (https://…vercel.app)"
          aria-label="Indirizzo del server"
          autoCapitalize="none"
          className="w-full rounded-xl px-3 py-2 text-sm outline-none"
          style={{ background: "var(--background)", border: "1px solid var(--border)" }}
        />
        <button type="submit" className="rounded-xl px-4 py-2 text-sm font-medium" style={{ background: "var(--accent-bg)", color: "var(--accent-ink)" }}>
          Salva
        </button>
        {saved && <span className="ml-3 text-xs text-muted">Salvato.</span>}
      </form>
    </section>
  );
}
