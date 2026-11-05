"use client";

// Settings: the saved athlete sheet, its copy in Intervals.icu, and the way to redo the first-launch setup.
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
  const [message, setMessage] = useState("");
  const button = "rounded-xl px-4 py-2 text-sm";

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
      {date ? (
        <>
          <p className="mt-2 text-xs text-muted">
            Salvata il {date}. Il coach la usa per scegliere gli allenamenti.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={redo} className={button} style={{ border: "1px solid var(--border)" }}>
              Rifai la configurazione iniziale
            </button>
          </div>
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
