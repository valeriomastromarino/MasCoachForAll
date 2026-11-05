// Single-file build: connect the app to Intervals.icu. The key is saved in this browser only.
import { useState } from "react";
import { apiKey, athleteId, saveCredentials } from "@/lib/intervals/credentials.browser";

/** Asks Intervals.icu once before saving: a wrong key or ID would otherwise show up as errors scattered over every page. */
async function checkIntervals(k: string, a: string): Promise<string | null> {
  try {
    const res = await fetch(`https://intervals.icu/api/v1/athlete/${encodeURIComponent(a || "0")}`, {
      headers: { Authorization: `Basic ${btoa(`API_KEY:${k}`)}`, Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    if (res.status === 401 || res.status === 403) return "Intervals.icu non accetta questa chiave (o questo ID atleta). Ricopiala da Settings → Developer Settings.";
    if (!res.ok) return `Intervals.icu ha risposto ${res.status}: riprova tra poco.`;
    return null;
  } catch {
    return "Non riesco a contattare Intervals.icu: controlla la connessione e riprova.";
  }
}

/** First-launch step: the same check and save as the settings card, with the guide to find the key. */
export function IntervalsKeyStep({ onSaved }: { onSaved: () => void }) {
  const [key, setKey] = useState("");
  const [athlete, setAthlete] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const field = "w-full rounded-xl px-3 py-2 text-sm outline-none";
  const fieldStyle = { background: "var(--background)", border: "1px solid var(--border)" };
  const connect = async () => {
    const k = key.trim();
    const a = athlete.trim();
    if (k.length < 8) return setError("Incolla la chiave API: è più lunga di così.");
    if (a && !/^i?\d+$/.test(a)) return setError("L'ID atleta è un numero, di solito preceduto da i (esempio: i123456).");
    setChecking(true);
    setError(null);
    const problem = await checkIntervals(k, a);
    setChecking(false);
    if (problem) return setError(problem);
    saveCredentials(k, a || null);
    onSaved();
  };
  return (
    <>
      <h2 className="text-lg font-medium">Collega Intervals.icu</h2>
      <p className="mt-1 text-sm text-muted">Serve la tua chiave personale. Resta solo su questo dispositivo.</p>
      <label className="mt-4 block text-xs text-muted">
        Chiave API
        <input
          type="password"
          autoComplete="off"
          placeholder="Incolla la chiave"
          value={key}
          onChange={(e) => {
            setKey(e.target.value);
            setError(null);
          }}
          className={`mt-1.5 ${field}`}
          style={fieldStyle}
        />
      </label>
      <label className="mt-4 block text-xs text-muted">
        ID atleta (facoltativo, es. i123456)
        <input
          value={athlete}
          onChange={(e) => {
            setAthlete(e.target.value);
            setError(null);
          }}
          className={`mt-1.5 ${field}`}
          style={fieldStyle}
        />
      </label>
      {error && (
        <p className="mt-3 text-xs" style={{ color: "var(--critical)" }} role="alert">
          {error}
        </p>
      )}
      <div className="mt-4 rounded-xl px-3 py-2 text-xs text-muted" style={{ background: "var(--background)" }}>
        <b className="font-medium" style={{ color: "var(--foreground)" }}>
          Dove trovare la chiave
        </b>
        <br />
        1. Apri intervals.icu e accedi.
        <br />
        2. Vai in Impostazioni, poi Developer Settings.
        <br />
        3. Premi Generate API key e copia la chiave.
        <br />
        4. L&apos;ID atleta inizia con la lettera i: lo vedi nello stesso schermo.
      </div>
      <button
        className="mt-5 w-full rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-50"
        style={{ background: "var(--accent-bg)", color: "var(--accent-ink)" }}
        disabled={!key.trim() || checking}
        onClick={() => void connect()}
      >
        {checking ? "Controllo la chiave…" : "Verifica collegamento"}
      </button>
    </>
  );
}

export function IntervalsKeyCard() {
  const connected = Boolean(apiKey());
  const [key, setKey] = useState("");
  const [athlete, setAthlete] = useState(athleteId() === "0" ? "" : athleteId());
  const field = "w-full rounded-xl px-3 py-2 text-sm outline-none";
  const fieldStyle = { background: "var(--background)", border: "1px solid var(--border)" };

  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const k = key.trim();
    const a = athlete.trim();
    setChecking(true);
    setError(null);
    const problem = await checkIntervals(k, a);
    setChecking(false);
    if (problem) {
      setError(problem);
      return;
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
