"use client";

// Settings: the saved athlete sheet (copy its text for the Claude Project), its copy in Intervals.icu, and the way to
// redo the first-launch setup.
import { useState, useSyncExternalStore } from "react";
import { applyCloud, markRedo, pullCloud, pushCloud, useCloudStatus } from "@/components/data/cloud";
import { clearProfile, loadProfile, notifyProfile, PROFILE_EVENT } from "@/lib/profile/profile";

const subscribe = (cb: () => void) => {
  window.addEventListener(PROFILE_EVENT, cb);
  return () => window.removeEventListener(PROFILE_EVENT, cb);
};
const savedAt = () => loadProfile()?.savedAt ?? "";

export function ProfileCard() {
  const date = useSyncExternalStore(subscribe, savedAt, () => "");
  const cloud = useCloudStatus();
  const [copied, setCopied] = useState<"" | "ok" | "manual">("");
  const [message, setMessage] = useState("");
  const sheet = date ? (loadProfile()?.sheet ?? "") : "";
  const button = "rounded-xl px-4 py-2 text-sm";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(sheet);
      setCopied("ok");
    } catch {
      setCopied("manual");
    }
  };
  const redo = () => {
    markRedo();
    clearProfile();
    notifyProfile();
  };
  const save = async () => {
    setMessage("");
    const err = await pushCloud();
    setMessage(err ? "" : "Salvata su Intervals.");
  };
  const restore = async () => {
    setMessage("");
    const p = await pullCloud();
    if (!p || (!p.profile && !p.season)) return setMessage("Su Intervals non c'è ancora una copia.");
    applyCloud(p);
    setMessage(`Ripristinata la copia del ${p.savedAt.slice(0, 10)}.`);
  };

  const cloudLine =
    cloud.state === "saving"
      ? "Salvo su Intervals…"
      : cloud.state === "error"
        ? `Non sono riuscito a salvare su Intervals: ${cloud.error}`
        : cloud.state === "ok"
          ? `Salvata anche su Intervals (${cloud.at.slice(0, 10)}).`
          : "Scheda e stagione si salvano da sole anche su Intervals, così non si perdono se reinstalli l'app.";

  return (
    <section className="card max-w-xl p-5">
      <h2 className="text-sm font-medium">Scheda atleta</h2>
      {date && sheet ? (
        <>
          <p className="mt-2 text-xs text-muted">
            Salvata il {date}. Per il coach copia il testo e sostituisci il file «Scheda_atleta.md» nel Progetto Claude.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={copy} className={button} style={{ background: "var(--accent-bg)", color: "var(--accent-ink)" }}>
              {copied === "ok" ? "Scheda copiata" : "Copia il testo"}
            </button>
            <button type="button" onClick={redo} className={button} style={{ border: "1px solid var(--border)" }}>
              Rifai la configurazione iniziale
            </button>
          </div>
          {copied === "manual" && (
            <textarea
              readOnly
              value={sheet}
              rows={8}
              onFocus={(e) => e.currentTarget.select()}
              className="mt-3 w-full rounded-xl px-3 py-2 font-mono text-xs outline-none"
              style={{ background: "var(--background)", border: "1px solid var(--border)" }}
              aria-label="Testo della Scheda atleta"
            />
          )}
        </>
      ) : (
        <>
          <p className="mt-2 text-xs text-muted">Non l&apos;hai ancora compilata: serve al coach per scegliere gli allenamenti.</p>
          <button type="button" onClick={redo} className={`mt-4 ${button}`} style={{ background: "var(--accent-bg)", color: "var(--accent-ink)" }}>
            Compila la scheda
          </button>
        </>
      )}
      <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--border)" }}>
        <div className="text-xs font-medium">Copia su Intervals</div>
        <p className="mt-1 text-xs" style={{ color: cloud.state === "error" ? "var(--critical)" : "var(--muted)" }}>
          {cloudLine}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => void save()} disabled={cloud.state === "saving"} className="rounded-xl px-3 py-1.5 text-xs disabled:opacity-60" style={{ border: "1px solid var(--border)" }}>
            Salva ora
          </button>
          <button type="button" onClick={() => void restore()} className="rounded-xl px-3 py-1.5 text-xs" style={{ border: "1px solid var(--border)" }}>
            Ripristina da Intervals
          </button>
        </div>
        {message && <p className="mt-2 text-xs text-muted">{message}</p>}
      </div>
    </section>
  );
}
