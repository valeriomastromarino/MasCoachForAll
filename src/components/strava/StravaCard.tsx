"use client";

// Impostazioni → Strava (19 November 2026): connected once from the website, then the
// trainer sessions recorded by the app go to Strava too. On the phone app the card shows the website's connection and
// this device's switch.
import { useEffect, useState } from "react";
import { loadStravaStatus, setStravaAuto, useStravaAuto, useStravaStatus } from "../data/strava";
import { ON_SITE, serverFetch } from "../data/transport";

/** What Strava's page sent back (?strava=…), said once on the card. */
const OUTCOME: Record<string, string> = {
  ok: "Strava è collegato: le prossime sedute dei rulli andranno anche lì.",
  negato: "Su Strava l'autorizzazione non è stata data.",
  permessi: "Su Strava manca il permesso di caricare le attività: ricollega e lascia spuntata quella casella.",
  chiavi: "Mancano le chiavi dell'app Strava sul server (STRAVA_CLIENT_ID e STRAVA_CLIENT_SECRET su Vercel).",
  errore: "Il collegamento con Strava non è riuscito: riprova.",
};

function when(iso: string): string {
  const d = new Date(iso);
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(new Date()) - day(d)) / 86_400_000);
  const label = diff === 0 ? "oggi" : diff === 1 ? "ieri" : d.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
  return `${label} alle ${d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`;
}

export function StravaCard() {
  const status = useStravaStatus();
  const auto = useStravaAuto();
  const [outcome, setOutcome] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Back from Strava's page: say how it went once, then clean the address.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("strava");
    if (!q) return;
    const text = OUTCOME[q] ?? OUTCOME.errore;
    queueMicrotask(() => setOutcome(text));
    const url = new URL(window.location.href);
    url.searchParams.delete("strava");
    window.history.replaceState(window.history.state, "", url.toString());
    void loadStravaStatus();
  }, []);

  const disconnect = async () => {
    setBusy(true);
    setError(null);
    const res = await serverFetch("/api/strava/disconnect", { method: "POST" }).catch(() => null);
    if (!res?.ok) setError("Non sono riuscito a scollegare Strava: riprova.");
    await loadStravaStatus();
    setBusy(false);
  };

  const connected = !!status && !("error" in status) && status.connected;
  return (
    <section className="card max-w-xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <span className="grid h-[22px] w-[22px] place-items-center rounded-md text-[13px] font-extrabold leading-none text-white" style={{ background: "var(--strava)" }} aria-hidden>
            S
          </span>
          Strava
        </h3>
        {connected && (
          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11.5px]" style={{ background: "var(--good-bg)", color: "var(--good-ink)" }}>
            <span className="h-[7px] w-[7px] rounded-full" style={{ background: "currentColor" }} />
            {ON_SITE && status.athlete ? `Collegato come ${status.athlete}` : "Collegato dal sito"}
          </span>
        )}
      </div>
      {outcome && <p className="mt-2 text-xs" style={{ color: outcome === OUTCOME.ok ? "var(--good-ink)" : "var(--warning-ink)" }}>{outcome}</p>}

      {!status ? (
        <p className="mt-2 text-xs text-muted">Controllo il collegamento…</p>
      ) : "error" in status ? (
        <p className="mt-2 text-xs text-muted">
          {ON_SITE ? `Non riesco a leggere il collegamento: ${status.error}` : "Per vedere Strava servono la rete e la password dell'app online (qui sotto, in «Coach scritto»)."}
        </p>
      ) : !status.configured ? (
        <p className="mt-2 text-xs text-muted">{OUTCOME.chiavi}</p>
      ) : !status.connected ? (
        <>
          <p className="mt-2 text-[12.5px] text-muted">Le sedute dei rulli registrate dall&apos;app vanno anche su Strava, con lo stesso nome che hanno su Intervals e segnate come «sui rulli».</p>
          {ON_SITE ? (
            <>
              <a href="/api/strava/connect" className="mt-3 inline-flex h-9 items-center rounded-full px-4 text-[12.5px] font-semibold" style={{ background: "var(--accent-bg)", color: "var(--accent-ink)" }}>
                Collega Strava
              </a>
              <p className="mt-2 text-[11.5px] text-faint">Si apre Strava: tocca «Autorizza». Basta una volta, dal sito: vale anche per l&apos;app sul telefono.</p>
            </>
          ) : (
            <p className="mt-2 text-[11.5px] text-faint">Collegalo una volta dal sito, in Impostazioni: poi vale anche qui.</p>
          )}
        </>
      ) : (
        <>
          <button
            type="button"
            role="switch"
            aria-checked={auto}
            onClick={() => setStravaAuto(!auto)}
            className="mt-3 flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-2.5 text-left text-[12.5px]"
            style={{ background: "var(--background)" }}
          >
            <span>Manda in automatico le sedute dei rulli</span>
            <span className="relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors" style={{ background: auto ? "var(--brand)" : "var(--border)" }}>
              <span className="absolute top-[3px] h-4 w-4 rounded-full bg-white transition-all" style={{ left: auto ? 19 : 3 }} />
            </span>
          </button>
          {status.last && <p className="mt-2 text-[11.5px] text-faint">Ultima mandata: {status.last.name}, {when(status.last.at)}.</p>}
          {!ON_SITE && <p className="mt-2 text-[11.5px] text-faint">Il telefono le manda tramite il sito, con la password dell&apos;app (la stessa del coach e del widget).</p>}
          {ON_SITE && (
            <button type="button" disabled={busy} onClick={() => void disconnect()} className="mt-3 h-9 rounded-full px-4 text-[12.5px] disabled:opacity-60" style={{ border: "1px solid var(--border)", color: "var(--critical-ink)" }}>
              {busy ? "Scollego…" : "Scollega"}
            </button>
          )}
          {error && <p className="mt-2 text-xs" style={{ color: "var(--critical-ink)" }}>{error}</p>}
        </>
      )}
    </section>
  );
}
