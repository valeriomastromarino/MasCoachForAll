// Single-file build: connect the app to Intervals.icu. The key is saved in this browser only.
import { useState } from "react";
import { apiKey, athleteId, saveCredentials } from "@/lib/intervals/credentials.browser";

export function IntervalsKeyCard() {
  const connected = Boolean(apiKey());
  const [key, setKey] = useState("");
  const [athlete, setAthlete] = useState(athleteId() === "0" ? "" : athleteId());
  const field = "w-full rounded-xl px-3 py-2 text-sm outline-none";
  const fieldStyle = { background: "var(--background)", border: "1px solid var(--border)" };

  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Asks Intervals.icu once before saving: a wrong key or ID would otherwise show up as errors scattered over every page.
  const save = async () => {
    const k = key.trim();
    const a = athlete.trim();
    setChecking(true);
    setError(null);
    try {
      const res = await fetch(`https://intervals.icu/api/v1/athlete/${encodeURIComponent(a || "0")}`, {
        headers: { Authorization: `Basic ${btoa(`API_KEY:${k}`)}`, Accept: "application/json" },
        signal: AbortSignal.timeout(15000),
      });
      if (res.status === 401 || res.status === 403) {
        setError("Intervals.icu non accetta questa chiave (o questo ID atleta). Ricopiala da Settings → Developer Settings.");
        return;
      }
      if (!res.ok) {
        setError(`Intervals.icu ha risposto ${res.status}: riprova tra poco.`);
        return;
      }
    } catch {
      setError("Non riesco a contattare Intervals.icu: controlla la connessione e riprova.");
      return;
    } finally {
      setChecking(false);
    }
    saveCredentials(k, a || null);
    // Start clean with the new account: everything in memory belongs to the old one.
    window.location.hash = "/";
    window.location.reload();
  };

  return (
    <section className="card max-w-xl p-5">
      <h2 className="text-sm font-medium">Collegamento a Intervals.icu</h2>
      {connected ? (
        <>
          <p className="mt-2 text-xs text-muted">
            Collegato. La chiave è salvata solo in questo browser, non dentro il file: se mandi MasCoach a qualcuno, vedrà i dati
            demo finché non inserisce la sua.
          </p>
          <button
            className="mt-4 rounded-xl px-4 py-2 text-sm"
            style={{ background: "var(--critical-bg)", color: "var(--critical)" }}
            onClick={() => {
              saveCredentials(null);
              window.location.reload();
            }}
          >
            Scollega e cancella la chiave
          </button>
        </>
      ) : (
        <>
          <p className="mt-2 text-xs text-muted">
            Su Intervals.icu apri Settings → Developer Settings e copia la API key. La chiave resta solo in questo browser e viene
            usata per parlare direttamente con Intervals.icu.
          </p>
          <label className="mt-4 block text-xs text-muted">
            API key
            <input
              type="password"
              autoComplete="off"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              className={`mt-1 ${field}`}
              style={fieldStyle}
            />
          </label>
          <label className="mt-3 block text-xs text-muted">
            ID atleta (facoltativo, es. i12345)
            <input value={athlete} onChange={(e) => setAthlete(e.target.value)} className={`mt-1 ${field}`} style={fieldStyle} />
          </label>
          {error && (
            <p className="mt-3 rounded-xl px-3 py-2 text-xs" style={{ background: "var(--warning-bg)", color: "var(--warning-ink)" }} role="alert">
              {error}
            </p>
          )}
          <button
            className="mt-4 rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-50"
            style={{ background: "var(--accent-bg)", color: "var(--accent-ink)" }}
            disabled={!key.trim() || checking}
            onClick={() => void save()}
          >
            {checking ? "Controllo la chiave…" : "Salva e carica i miei dati"}
          </button>
        </>
      )}
    </section>
  );
}

/** Reminder on every page while the app shows demo data. */
export function DemoBanner() {
  if (apiKey()) return null;
  return (
    <div className="mx-auto mt-4 w-full max-w-6xl px-4">
      <a href="#/impostazioni" className="block rounded-xl px-4 py-2.5 text-xs" style={{ background: "var(--accent-bg)", color: "var(--accent-ink)" }}>
        Stai vedendo dati demo. <b className="font-medium">Collega il tuo Intervals.icu →</b>
      </a>
    </div>
  );
}
