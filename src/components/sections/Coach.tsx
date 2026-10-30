"use client";

// Launch pad for MasCoach Coach: the coach is Claude (claude.ai or the Claude app) with the MasCoach connector.
// Each button opens Claude with the request ready; the coach then reads the data and writes workouts on Intervals.icu.
import { IconBike, IconCalendarWeek, IconMessageCircle, IconMoon, IconStopwatch, IconSun } from "@tabler/icons-react";
import { useState, useSyncExternalStore } from "react";
import { fmt } from "../format";
import { SectionPage } from "./SectionPage";

const URL_KEY = "mascoach-coach-url";
const NEW_CHAT = "https://claude.ai/new";

const REQUESTS = [
  { icon: IconSun, label: "Analizza oggi", text: "Analizza il mio stato di oggi con i dati di MasCoach e dimmi cosa mi conviene fare." },
  {
    icon: IconBike,
    label: "Allenamento di domani",
    text: "Preparami l'allenamento di domani. Mostrami l'anteprima prima di scriverlo su Intervals.",
  },
  {
    icon: IconCalendarWeek,
    label: "Pianifica la settimana",
    text: "Pianifica i prossimi 7 giorni guardando il calendario e il mio recupero. Prima l'anteprima, poi scrivi su Intervals solo quello che approvo.",
  },
  {
    icon: IconMoon,
    label: "Ho dormito male",
    text: "Stanotte ho dormito male e mi sento stanco: guarda i dati di oggi e adatta l'allenamento previsto.",
  },
  { icon: IconStopwatch, label: "Analizza l'ultimo test", text: "Analizza il mio ultimo test e dimmi se devo cambiare FTP o zone." },
];

function savedUrl(): string {
  try {
    return localStorage.getItem(URL_KEY) || "";
  } catch {
    return "";
  }
}

// The saved Project address, read like an external store (it lives in this browser only).
const listeners = new Set<() => void>();
function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}
function storeUrl(url: string) {
  try {
    if (url) localStorage.setItem(URL_KEY, url);
    else localStorage.removeItem(URL_KEY);
  } catch {}
  listeners.forEach((f) => f());
}

/** A new chat can receive the request in the address; a Project can't, so the request goes to the clipboard. */
async function openCoach(projectUrl: string, text: string): Promise<boolean> {
  if (!projectUrl) {
    window.open(`${NEW_CHAT}?q=${encodeURIComponent(text)}`, "_blank", "noopener");
    return false;
  }
  await navigator.clipboard.writeText(text).catch(() => {});
  window.open(projectUrl, "_blank", "noopener");
  return true;
}

export default function Coach() {
  const projectUrl = useSyncExternalStore(subscribe, savedUrl, () => "");
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);

  const go = async (text: string) => {
    if (!text.trim()) return;
    setCopied(await openCoach(projectUrl, text.trim()));
  };

  const saveUrl = (value: string) => {
    storeUrl(value.trim());
    setEditing(false);
  };

  const field = "w-full rounded-xl px-3 py-2 text-sm outline-none";
  const fieldStyle = { background: "var(--background)", border: "1px solid var(--border)" };

  return (
    <SectionPage id="coach">
      {(data) => {
        const { status } = data;
        const hrv7 = status.hrv.baseline7 !== null ? Math.exp(status.hrv.baseline7) : null;
        return (
          <div className="max-w-3xl space-y-4">
            <section className="card p-5">
              <div className="text-xs text-muted">Il coach vede questi dati</div>
              <p className="mt-1 text-sm font-medium">{status.readiness.headline}</p>
              <p className="num mt-1 text-xs text-muted">
                HRV 7 gg {fmt(hrv7, 0, " ms")} ({status.hrv.status}) · FC a riposo {fmt(status.rhr.today, 0, " bpm")} · forma{" "}
                {fmt(status.tsb)} · fitness {fmt(status.ctl)}
              </p>
            </section>

            <div className="grid gap-2 sm:grid-cols-2">
              {REQUESTS.map((r) => (
                <button
                  key={r.label}
                  onClick={() => go(r.text)}
                  className="card flex items-center gap-3 p-4 text-left text-sm transition-opacity hover:opacity-80"
                >
                  <r.icon size={20} className="shrink-0" style={{ color: "var(--accent-ink)" }} aria-hidden />
                  <span>
                    <span className="block font-medium">{r.label}</span>
                    <span className="block text-xs text-muted">{r.text}</span>
                  </span>
                </button>
              ))}
            </div>

            <section className="card p-5">
              <label className="block text-xs text-muted" htmlFor="coach-draft">
                Oppure scrivi tu
              </label>
              <textarea
                id="coach-draft"
                rows={3}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Sabato ho una granfondo di 120 km: come preparo la settimana?"
                className={`mt-1 ${field}`}
                style={fieldStyle}
              />
              <button
                onClick={() => go(draft)}
                className="mt-3 inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium"
                style={{ background: "var(--accent-bg)", color: "var(--accent-ink)" }}
              >
                <IconMessageCircle size={16} aria-hidden /> Chiedi al coach
              </button>
              {copied && (
                <p className="mt-2 text-xs" style={{ color: "var(--accent-ink)" }}>
                  Richiesta copiata: incollala nella chat del Progetto che si è appena aperto.
                </p>
              )}
            </section>

            <section className="card p-5">
              <h2 className="text-sm font-medium">Dove si apre il coach</h2>
              {editing ? (
                <form
                  className="mt-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    saveUrl(new FormData(e.currentTarget).get("url") as string);
                  }}
                >
                  <input name="url" type="url" defaultValue={projectUrl} placeholder="https://claude.ai/project/…" className={field} style={fieldStyle} />
                  <button type="submit" className="mt-2 rounded-xl px-4 py-2 text-sm" style={{ background: "var(--neutral-bg)" }}>
                    Salva
                  </button>
                </form>
              ) : (
                <>
                  <p className="mt-1 text-xs text-muted">
                    {projectUrl
                      ? "Nel tuo Progetto Claude, con le istruzioni del coach. La richiesta viene copiata: la incolli nella chat."
                      : "In una chat nuova di Claude, con la richiesta già scritta. Incolla qui l'indirizzo del tuo Progetto per usare le istruzioni del coach."}
                  </p>
                  {projectUrl && <p className="mt-1 break-all text-xs">{projectUrl}</p>}
                  <button onClick={() => setEditing(true)} className="mt-3 rounded-xl px-4 py-2 text-sm" style={{ background: "var(--neutral-bg)" }}>
                    {projectUrl ? "Cambia" : "Imposta il Progetto"}
                  </button>
                </>
              )}
              <p className="mt-4 text-xs text-muted">
                Gli allenamenti scritti dal coach compaiono nel calendario con l&apos;etichetta <b className="font-medium">Coach</b>; finché
                lo stai provando sono marcati <b className="font-medium">Coach · prova</b> e lui li può cancellare tutti insieme.
              </p>
            </section>
          </div>
        );
      }}
    </SectionPage>
  );
}
