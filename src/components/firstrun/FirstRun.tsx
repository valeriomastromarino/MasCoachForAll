"use client";

// First launch: welcome → Intervals key (only where the app holds the key itself) → data check → power profile
// (diesel / glycolytic) → athlete sheet in three screens → summary. Answers are kept on this device and the text of
// Scheda_atleta.md is generated for the coach's Claude Project.
import { IconCheck } from "@tabler/icons-react";
import { type ComponentType, type ReactNode, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { apiFetch } from "@/components/data/transport";
import { applyCloud, isRedo, pullCloud, scheduleCloudPush } from "@/components/data/cloud";
import { useDashboard } from "@/components/data/remote";
import type { CloudPayload } from "@/lib/profile/cloud";
import type { HistoryData, LibraryData } from "@/lib/api/handlers";
import { assessPhenotype, type Phenotype } from "@/lib/profile/phenotype";
import {
  type AthleteProfile,
  DAY_LABELS,
  isSkipped,
  loadDraft,
  loadProfile,
  notifyProfile,
  PROFILE_EVENT,
  saveDraft,
  saveProfile,
  sheetText,
  skipFirstRun,
} from "@/lib/profile/profile";

const STEPS = ["welcome", "key", "check", "pheno", "who", "time", "gear", "done"] as const;
type StepId = (typeof STEPS)[number];

const field = "w-full rounded-xl px-3 py-2 text-sm outline-none";
const fieldStyle = { background: "var(--background)", border: "1px solid var(--border)" };

const FORTE = ["Scatti e ripartenze", "Salite brevi", "Salite lunghe", "Pianura a ritmo", "Sforzi molto lunghi", "Tecnica MTB"];
const EXCLUSIVE = ["Nessuno", "Nessuna", "Preferisco non dirlo"];

// ── Small form pieces ────────────────────────────────────────────────────────────────────────────

export function Label({ children }: { children: ReactNode }) {
  return <div className="mt-4 mb-1.5 text-xs text-muted">{children}</div>;
}

export function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mr-1.5 mb-1.5 rounded-full px-3 py-1.5 text-sm"
      style={{ background: on ? "var(--accent-bg)" : "transparent", color: on ? "var(--accent-ink)" : "var(--foreground)", border: `1px solid ${on ? "var(--accent-ink)" : "var(--border)"}` }}
    >
      {children}
    </button>
  );
}

export function One({ options, value, onChange }: { options: string[]; value: string | undefined; onChange: (v: string) => void }) {
  return (
    <div>
      {options.map((o) => (
        <Chip key={o} on={value === o} onClick={() => onChange(o)}>
          {o}
        </Chip>
      ))}
    </div>
  );
}

export function Many({ options, value, onChange }: { options: string[]; value: string[] | undefined; onChange: (v: string[]) => void }) {
  const cur = value ?? [];
  const toggle = (o: string) => {
    if (cur.includes(o)) return onChange(cur.filter((x) => x !== o));
    // "Nessuno", "Nessuna" and "Preferisco non dirlo" exclude the others, and are excluded by them.
    onChange(EXCLUSIVE.includes(o) ? [o] : [...cur.filter((x) => !EXCLUSIVE.includes(x)), o]);
  };
  return (
    <div>
      {options.map((o) => (
        <Chip key={o} on={cur.includes(o)} onClick={() => toggle(o)}>
          {o}
        </Chip>
      ))}
    </div>
  );
}

export function Text({ label, value, onChange, placeholder, type = "text" }: { label: string; value: string | undefined; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <label className="mt-4 block text-xs text-muted">
      {label}
      <input type={type} value={value ?? ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={`mt-1.5 ${field}`} style={fieldStyle} />
    </label>
  );
}

export function Pick({ label, value, options, onChange }: { label: string; value: string | undefined; options: string[]; onChange: (v: string) => void }) {
  return (
    <label className="mt-4 block text-xs text-muted">
      {label}
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value)} className={`mt-1.5 ${field}`} style={fieldStyle}>
        <option value="">Scegli…</option>
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}

export const Grid2 = ({ children }: { children: ReactNode }) => <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">{children}</div>;
export const Divider = ({ children }: { children: ReactNode }) => (
  <div className="mt-6 border-t pt-3 text-xs font-medium text-faint" style={{ borderColor: "var(--border)" }}>
    {children}
  </div>
);
export const Note = ({ children, tone }: { children: ReactNode; tone?: "warning" }) => (
  <div
    className="mt-4 rounded-xl px-3 py-2 text-xs"
    style={tone === "warning" ? { background: "var(--warning-bg)", color: "var(--warning-ink)" } : { background: "var(--background)", color: "var(--muted)" }}
  >
    {children}
  </div>
);

function Buttons({ onBack, onNext, nextLabel }: { onBack?: () => void; onNext: () => void; nextLabel: string }) {
  return (
    <div className="mt-6 flex gap-2">
      {onBack && (
        <button type="button" onClick={onBack} className="rounded-xl px-4 py-2 text-sm" style={{ border: "1px solid var(--border)" }}>
          Indietro
        </button>
      )}
      <button type="button" onClick={onNext} className="flex-1 rounded-xl px-4 py-2 text-sm font-medium" style={{ background: "var(--accent-bg)", color: "var(--accent-ink)" }}>
        {nextLabel}
      </button>
    </div>
  );
}

export const Err = ({ text }: { text: string }) =>
  text ? (
    <p className="mt-3 text-xs" style={{ color: "var(--critical)" }} role="alert">
      {text}
    </p>
  ) : null;

// ── Gate ─────────────────────────────────────────────────────────────────────────────────────────

const subscribe = (cb: () => void) => {
  window.addEventListener(PROFILE_EVENT, cb);
  return () => window.removeEventListener(PROFILE_EVENT, cb);
};
const snapshot = () => (loadProfile() || isSkipped() ? "done" : "first");

/** Shows the first-launch screens over the app until the sheet is saved (or skipped). The app keeps loading behind it. */
export function FirstRunGate({ children, needsKey = false, KeyStep }: { children: ReactNode; needsKey?: boolean; KeyStep?: ComponentType<{ onSaved: () => void }> }) {
  const state = useSyncExternalStore(subscribe, snapshot, () => "loading");
  return (
    <>
      {children}
      {state === "first" && (
        <div className="fixed inset-0 z-[60] overflow-y-auto" style={{ background: "var(--background)" }}>
          <FirstRun needsKey={needsKey && Boolean(KeyStep)} KeyStep={KeyStep} />
        </div>
      )}
    </>
  );
}

// ── The flow ─────────────────────────────────────────────────────────────────────────────────────

type Best = { s5: number | null; m1: number | null; m5: number | null; m20: number | null };

export function bestOfLastSeasons(history: HistoryData | null): Best {
  const out: Best = { s5: null, m1: null, m5: null, m20: null };
  for (const y of (history?.anni ?? []).slice(-2)) {
    const b = y.migliori_watt as Record<string, number | null>;
    const take = (cur: number | null, v: number | null | undefined) => (typeof v === "number" && (cur === null || v > cur) ? v : cur);
    out.s5 = take(out.s5, b["5s"]);
    out.m1 = take(out.m1, b["1m"]);
    out.m5 = take(out.m5, b["5m"]);
    out.m20 = take(out.m20, b["20m"]);
  }
  return out;
}

const fmt1 = (x: number) => x.toFixed(1).replace(".", ",");
const kg = (w: number | null | undefined) => (w === null || w === undefined ? "–" : fmt1(w));

function FirstRun({ needsKey, KeyStep }: { needsKey: boolean; KeyStep?: ComponentType<{ onSaved: () => void }> }) {
  const visible = STEPS.filter((s) => s !== "key" || needsKey);
  const [draft] = useState(loadDraft);
  const [stepId, setStepId] = useState<StepId>(() => {
    const id = STEPS[draft?.step ?? 0] ?? "welcome";
    return visible.includes(id) ? id : "check";
  });
  const [profile, setProfile] = useState<AthleteProfile>(draft?.profile ?? {});
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<"" | "ok" | "manual">("");

  const dash = useDashboard();
  // A copy of the sheet and the season kept in Intervals.icu: offered after a reinstall (when the key is already here).
  const [found, setFound] = useState<CloudPayload | null>(null);
  const [offerDone, setOfferDone] = useState(false);
  useEffect(() => {
    if (needsKey || isRedo()) return;
    let live = true;
    void pullCloud().then((p) => live && setFound(p && (p.profile || p.season) ? p : null));
    return () => {
      live = false;
    };
  }, [needsKey]);
  const [history, setHistory] = useState<HistoryData | null>(null);
  const [library, setLibrary] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    apiFetch("/api/history?years=2")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => live && setHistory(j as HistoryData | null))
      .catch(() => {});
    apiFetch("/api/library")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: LibraryData | null) => live && setLibrary(j ? j.folders.reduce((n, f) => n + f.workouts.length, 0) : null))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    saveDraft({ step: STEPS.indexOf(stepId), profile });
  }, [stepId, profile]);

  const set = (patch: Partial<AthleteProfile>) => {
    setProfile((p) => ({ ...p, ...patch }));
    setError("");
  };
  const go = (id: StepId) => {
    setStepId(id);
    setError("");
    if (typeof window !== "undefined") window.scrollTo(0, 0);
  };
  const idx = visible.indexOf(stepId);
  const next = () => go(visible[Math.min(idx + 1, visible.length - 1)]);
  const back = () => go(visible[Math.max(idx - 1, 0)]);
  const need = (ok: unknown, msg: string) => {
    if (!ok) setError(msg);
    return Boolean(ok);
  };

  const athlete = dash.data?.athlete ?? null;
  const pheno: Phenotype | null = useMemo(() => {
    if (!dash.data) return null;
    const recent = dash.data.mmp.find((p) => p.secs === 1200)?.watts ?? null;
    return assessPhenotype({
      weightKg: dash.data.athlete.weight,
      ftp: dash.data.athlete.ftp,
      wPrimeSetJ: dash.data.athlete.wPrime,
      modelWPrimeJ: dash.data.cp?.wPrime ?? null,
      modelReliable: dash.data.cp?.reliable ?? null,
      best: bestOfLastSeasons(history),
      recent20: recent !== null ? Math.round(recent) : null,
    });
  }, [dash.data, history]);

  const sheet = useMemo(
    () =>
      sheetText(
        profile,
        {
          name: athlete?.name ?? "Atleta",
          weight: athlete?.weight ?? null,
          ftp: athlete?.ftp ?? null,
          indoorFtp: athlete?.indoorFtp ?? null,
          lthr: athlete?.lthr ?? null,
          maxHr: athlete?.maxHr ?? null,
          wPrime: athlete?.wPrime ?? null,
          cp: dash.data?.cp?.cp ?? null,
          cpValid: dash.data?.cp ? false : null, // validity needs a classic CP test the app can't see
        },
        pheno,
        dash.data?.today ?? new Date().toISOString().slice(0, 10),
      ),
    [profile, athlete, dash.data, pheno],
  );

  const days = profile.giorni ?? [];
  const toggleDay = (d: number) => set({ giorni: days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort() });

  const finish = () => {
    saveProfile(profile, sheet, pheno?.verdict ?? null);
    notifyProfile();
    scheduleCloudPush();
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(sheet);
      setCopied("ok");
    } catch {
      setCopied("manual");
    }
  };

  const dots = (
    <div className="mb-5 flex items-center justify-between">
      <div className="flex gap-1">
        {visible.map((s, i) => (
          <span key={s} className="h-1.5 rounded-full" style={{ width: i === idx ? 18 : 7, background: i <= idx ? "var(--accent-ink)" : "var(--border)" }} />
        ))}
      </div>
      <span className="text-xs text-faint">
        Passo {idx + 1} di {visible.length}
      </span>
    </div>
  );

  let body: ReactNode;
  if (stepId === "welcome") {
    body = (
      <div className="py-8 text-center">
        <div className="font-mono text-3xl font-medium">
          MasCoach<span style={{ color: "var(--accent-ink)" }}>▌</span>
        </div>
        <p className="mx-auto mt-4 max-w-xs text-sm text-muted">Allenamento, recupero e rulli in un&apos;app sola. I dati arrivano da Intervals.icu, che li riceve dal tuo Garmin.</p>
        <button type="button" onClick={next} className="mt-8 w-full rounded-xl px-4 py-2.5 text-sm font-medium" style={{ background: "var(--accent-bg)", color: "var(--accent-ink)" }}>
          Inizia
        </button>
        <button
          type="button"
          onClick={() => {
            skipFirstRun();
            notifyProfile();
          }}
          className="mt-3 text-xs text-faint underline"
        >
          Salta per ora
        </button>
      </div>
    );
  } else if (stepId === "key" && KeyStep) {
    body = (
      <>
        <KeyStep
          onSaved={() => {
            saveDraft({ step: STEPS.indexOf("check"), profile });
            window.location.reload();
          }}
        />
        <button type="button" onClick={back} className="mt-4 rounded-xl px-4 py-2 text-sm" style={{ border: "1px solid var(--border)" }}>
          Indietro
        </button>
      </>
    );
  } else if (stepId === "check") {
    const d = dash.data;
    const rows: [string, string | null][] = [
      ["Atleta", d ? `${d.athlete.name}: FTP ${d.athlete.ftp ?? "–"} W, rulli ${d.athlete.indoorFtp ?? "–"} W, FC soglia ${d.athlete.lthr ?? "–"}, FC max ${d.athlete.maxHr ?? "–"}, peso ${kg(d.athlete.weight)} kg` : null],
      ["Attività", d ? `${d.activities.length} attività negli ultimi 120 giorni` : null],
      ["Recupero", d ? `${d.recovery.filter((r) => r.rmssd !== null).length} notti con HRV negli ultimi 120 giorni` : null],
      ["Storico", history ? `${history.anni.length} stagioni lette, con i migliori sforzi` : null],
      ["Libreria allenamenti", library !== null ? `${library} allenamenti trovati su Intervals` : null],
    ];
    body = (
      <>
        <h2 className="text-lg font-medium">Controllo dei dati</h2>
        <p className="mt-1 text-sm text-muted">Leggo cosa c&apos;è su Intervals.icu.</p>
        {dash.error && <Note tone="warning">Non riesco a leggere i dati: {dash.error}</Note>}
        {d?.source === "demo" && <Note tone="warning">Questi sono dati demo: collega Intervals.icu (Impostazioni) per avere i tuoi.</Note>}
        <div className="mt-3">
          {rows.map(([label, text]) => (
            <div key={label} className="flex items-start gap-2.5 border-b py-2.5 text-sm" style={{ borderColor: "var(--border)" }}>
              <span className="mt-0.5 w-4 shrink-0" style={{ color: text ? "var(--good)" : "var(--faint)" }}>
                {text ? <IconCheck size={16} /> : "…"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="font-medium">{label}</span>
                <br />
                <span className="text-xs text-muted">{text ?? "lettura in corso"}</span>
              </span>
            </div>
          ))}
        </div>
        <Buttons onBack={back} onNext={() => need(d, "Aspetta che i dati siano letti.") && next()} nextLabel="Analizza il mio profilo" />
        <Err text={error} />
      </>
    );
  } else if (stepId === "pheno") {
    body = <PhenotypeStep pheno={pheno} best={bestOfLastSeasons(history)} weight={athlete?.weight ?? null} loading={!dash.data} onBack={back} onNext={next} />;
  } else if (stepId === "who") {
    body = (
      <>
        <h2 className="text-lg font-medium">Scheda atleta: chi sei</h2>
        <p className="mt-1 text-sm text-muted">1 di 3. Più sei preciso, meno il coach deve indovinare.</p>
        {athlete && <Note>Già letti da Intervals: peso {kg(athlete.weight)} kg, FC max {athlete.maxHr ?? "–"} bpm, FC soglia {athlete.lthr ?? "–"} bpm, FTP {athlete.ftp ?? "–"} W (rulli {athlete.indoorFtp ?? "–"} W).</Note>}
        <Label>La FC max è</Label>
        <One options={["Misurata in sforzo", "Stimata", "Non so"]} value={profile.fcMaxKind} onChange={(v) => set({ fcMaxKind: v })} />
        <Grid2>
          <Text label="Età" type="number" placeholder="anni" value={profile.eta} onChange={(v) => set({ eta: v })} />
          <Pick label="Sesso" value={profile.sesso} options={["Uomo", "Donna", "Preferisco non dirlo"]} onChange={(v) => set({ sesso: v })} />
          <Text label="Altezza (cm)" type="number" value={profile.altezza} onChange={(v) => set({ altezza: v })} />
          <Pick label="Anni di allenamento strutturato" value={profile.esperienza} options={["Meno di 1", "1-3", "3-6", "Oltre 6"]} onChange={(v) => set({ esperienza: v })} />
        </Grid2>
        <Label>Disciplina principale</Label>
        <One options={["Strada", "MTB XC", "MTB marathon", "Gravel", "Granfondo"]} value={profile.disciplina} onChange={(v) => set({ disciplina: v })} />
        <Label>Disciplina secondaria</Label>
        <One options={["Nessuna", "Strada", "MTB", "Gravel", "Corsa", "Palestra"]} value={profile.disciplina2} onChange={(v) => set({ disciplina2: v })} />
        <Label>Dove senti di andare forte</Label>
        <Many options={FORTE} value={profile.forte} onChange={(v) => set({ forte: v })} />
        <Label>Dove senti di soffrire</Label>
        <Many options={FORTE} value={profile.debole} onChange={(v) => set({ debole: v })} />
        <Divider>Salute</Divider>
        <Label>Visita medico-sportiva</Label>
        <One options={["Valida", "Scaduta", "Mai fatta"]} value={profile.visita} onChange={(v) => set({ visita: v })} />
        <Label>Dolori o infortuni in corso</Label>
        <Many options={["Nessuno", "Ginocchio", "Schiena", "Anca", "Spalle o mani", "Altro"]} value={profile.dolori} onChange={(v) => set({ dolori: v })} />
        <Label>Condizioni da segnalare al coach</Label>
        <Many options={["Nessuna", "Diabete", "Cuore o pressione", "Asma", "Altro", "Preferisco non dirlo"]} value={profile.condizioni} onChange={(v) => set({ condizioni: v })} />
        <Note>Salute e condizioni restano su questo telefono e finiscono solo nel testo della scheda che incolli tu nel Progetto.</Note>
        <Divider>Vita fuori dalla bici</Divider>
        <Grid2>
          <Pick label="Lavoro" value={profile.lavoro} options={["Sedentario", "In piedi o attivo", "A turni"]} onChange={(v) => set({ lavoro: v })} />
          <Pick label="Stress di lavoro" value={profile.stress} options={["Basso", "Medio", "Alto"]} onChange={(v) => set({ stress: v })} />
        </Grid2>
        <Label>Conosci la scala RPE (fatica percepita da 0 a 10)?</Label>
        <One options={["Sì, la uso", "Un po'", "No, spiegamela"]} value={profile.rpe} onChange={(v) => set({ rpe: v })} />
        <Err text={error} />
        <Buttons
          onBack={back}
          nextLabel="Continua"
          onNext={() => {
            if (!need(profile.disciplina, "Scegli la disciplina principale.")) return;
            if (!need(Number(profile.eta) >= 14 && Number(profile.eta) <= 90, "Inserisci l'età (tra 14 e 90 anni).")) return;
            if (!need(profile.visita, "Indica la visita medico-sportiva: serve per i test massimali.")) return;
            if (!need(profile.dolori?.length, "Scegli almeno un'opzione sui dolori (anche Nessuno).")) return;
            if (!need(profile.condizioni?.length, "Scegli almeno un'opzione sulle condizioni (anche Nessuna).")) return;
            next();
          }}
        />
      </>
    );
  } else if (stepId === "time") {
    const gA = profile.garaA ?? {};
    const gB = profile.garaB ?? {};
    body = (
      <>
        <h2 className="text-lg font-medium">Scheda atleta: tempo e obiettivi</h2>
        <p className="mt-1 text-sm text-muted">2 di 3.</p>
        <Label>Giorni in cui puoi allenarti</Label>
        <div className="flex flex-wrap">
          {DAY_LABELS.map((l, i) => (
            <Chip key={l} on={days.includes(i)} onClick={() => toggleDay(i)}>
              {l}
            </Chip>
          ))}
        </div>
        <Grid2>
          <Pick label="Ore in una settimana normale" value={profile.oreSettimana} options={["3-5", "5-8", "8-12", "Oltre 12"]} onChange={(v) => set({ oreSettimana: v })} />
          <Pick label="Ore massime in una settimana" value={profile.oreMax} options={["5", "8", "10", "12", "15", "Oltre"]} onChange={(v) => set({ oreMax: v })} />
          <Pick label="Durata massima nei feriali" value={profile.durataFeriali} options={["45 min", "1 h", "1,5 h", "2 h"]} onChange={(v) => set({ durataFeriali: v })} />
          <Pick label="Durata massima nel weekend" value={profile.durataWeekend} options={["2 h", "3 h", "4 h", "5 h", "Oltre"]} onChange={(v) => set({ durataWeekend: v })} />
        </Grid2>
        <Label>Giorno della lunga</Label>
        <One options={["Sabato", "Domenica", "Altro", "Nessuna fissa"]} value={profile.lunga} onChange={(v) => set({ lunga: v })} />
        <Label>Giorno di riposo fisso</Label>
        <One options={["Lunedì", "Venerdì", "Nessuno", "Cambia ogni settimana"]} value={profile.riposo} onChange={(v) => set({ riposo: v })} />
        <Label>Palestra</Label>
        <One options={["No", "1 giorno", "2 giorni", "3 giorni"]} value={profile.palestra} onChange={(v) => set({ palestra: v })} />
        <Divider>Obiettivi</Divider>
        <Label>Cosa vuoi (anche più di uno)</Label>
        <Many options={["Una gara", "Granfondo", "Più W/kg", "FTP più alta", "Forma e salute", "Perdere peso"]} value={profile.obiettivi} onChange={(v) => set({ obiettivi: v })} />
        <Grid2>
          <Text label="Gara A: nome" placeholder="facoltativo" value={gA.nome} onChange={(v) => set({ garaA: { ...gA, nome: v } })} />
          <Text label="Data" type="date" value={gA.data} onChange={(v) => set({ garaA: { ...gA, data: v } })} />
          <Pick label="Tipo gara A" value={gA.tipo} options={["XC", "Marathon", "Granfondo", "Strada", "Criterium", "Altro"]} onChange={(v) => set({ garaA: { ...gA, tipo: v } })} />
          <Text label="Distanza o dislivello" placeholder="es. 90 km, 1500 m" value={gA.dettagli} onChange={(v) => set({ garaA: { ...gA, dettagli: v } })} />
          <Text label="Gara B: nome" placeholder="facoltativo" value={gB.nome} onChange={(v) => set({ garaB: { ...gB, nome: v } })} />
          <Text label="Data" type="date" value={gB.data} onChange={(v) => set({ garaB: { ...gB, data: v } })} />
          <Text label="Obiettivo di potenza" placeholder="es. FTP 280 W" value={profile.obiettivoPotenza} onChange={(v) => set({ obiettivoPotenza: v })} />
          <Text label="Obiettivo di peso" placeholder="es. 67 kg" value={profile.obiettivoPeso} onChange={(v) => set({ obiettivoPeso: v })} />
        </Grid2>
        <Text label="Periodi in cui non ti alleni (vacanze, trasferte)" placeholder="es. 14-15 novembre, 20-27 dicembre" value={profile.stop} onChange={(v) => set({ stop: v })} />
        <Label>Quanto rischio vuoi nella progressione</Label>
        <One options={["Prudente", "Bilanciato", "Aggressivo"]} value={profile.rischio} onChange={(v) => set({ rischio: v })} />
        <Err text={error} />
        <Buttons
          onBack={back}
          nextLabel="Continua"
          onNext={() => {
            if (!need(days.length, "Scegli almeno un giorno in cui puoi allenarti.")) return;
            if (!need(profile.obiettivi?.length, "Scegli almeno un obiettivo.")) return;
            if (!need(profile.rischio, "Scegli quanto rischio vuoi nella progressione.")) return;
            next();
          }}
        />
      </>
    );
  } else if (stepId === "gear") {
    body = (
      <>
        <h2 className="text-lg font-medium">Scheda atleta: attrezzatura e abitudini</h2>
        <p className="mt-1 text-sm text-muted">3 di 3.</p>
        <Label>Con quali bici ti alleni</Label>
        <Many options={["Strada", "MTB", "Gravel"]} value={profile.bici} onChange={(v) => set({ bici: v })} />
        <Grid2>
          <Text label="Misuratore di potenza" placeholder="es. i tuoi pedali o la tua guarnitura" value={profile.misuratore} onChange={(v) => set({ misuratore: v })} />
          <Text label="Ultima calibrazione" type="date" value={profile.calibrazione} onChange={(v) => set({ calibrazione: v })} />
          <Text label="Rullo" placeholder="es. il tuo rullo" value={profile.rullo} onChange={(v) => set({ rullo: v })} />
          <Text label="Differenza rulli e strada" placeholder="es. -10 W" value={profile.differenzaRulli} onChange={(v) => set({ differenzaRulli: v })} />
        </Grid2>
        <Label>Fascia cardio</Label>
        <One options={["Polar H10", "Altra fascia", "Solo orologio", "Nessuna"]} value={profile.fascia} onChange={(v) => set({ fascia: v })} />
        <Label>Registra gli intervalli RR (serve per il DFA α1)</Label>
        <One options={["Sì", "No", "Non so"]} value={profile.rr} onChange={(v) => set({ rr: v })} />
        <Text label="Orologio o ciclocomputer" placeholder="es. il tuo ciclocomputer" value={profile.orologio} onChange={(v) => set({ orologio: v })} />
        <Divider>Preferenze di allenamento</Divider>
        <Grid2>
          <Pick label="Z2 lungo" value={profile.z2Dove} options={["Fuori", "Rulli", "Indifferente"]} onChange={(v) => set({ z2Dove: v })} />
          <Pick label="Intervalli duri" value={profile.intervalliDove} options={["Fuori", "Rulli", "Indifferente"]} onChange={(v) => set({ intervalliDove: v })} />
          <Pick label="Seduta più corta utile" value={profile.sedutaMin} options={["30 min", "45 min", "1 h"]} onChange={(v) => set({ sedutaMin: v })} />
          <Pick label="Rulli: durata massima" value={profile.ruliMax} options={["45 min", "1 h", "1,5 h", "2 h"]} onChange={(v) => set({ ruliMax: v })} />
        </Grid2>
        <Divider>Alimentazione</Divider>
        <Label>In uscita mangi</Label>
        <One options={["Gel e barrette", "Cibo vero", "Solo acqua", "Dipende"]} value={profile.mangia} onChange={(v) => set({ mangia: v })} />
        <Label>Carboidrati che tolleri adesso (g all&apos;ora)</Label>
        <One options={["Meno di 30", "30-60", "60-90", "Oltre 90", "Non so"]} value={profile.carboTollerati} onChange={(v) => set({ carboTollerati: v })} />
        <Label>Allenamenti a digiuno</Label>
        <One options={["Mai", "Solo Z1-Z2", "Va bene"]} value={profile.digiuno} onChange={(v) => set({ digiuno: v })} />
        <Label>Restrizioni alimentari</Label>
        <Many options={["Nessuna", "Senza lattosio", "Senza glutine", "Vegetariano", "Altro"]} value={profile.restrizioni} onChange={(v) => set({ restrizioni: v })} />
        <Divider>Come vuoi il coach</Divider>
        <Label>Stile delle risposte</Label>
        <One options={["Breve e diretto", "Con spiegazioni", "Dettagliato con numeri"]} value={profile.stile} onChange={(v) => set({ stile: v })} />
        <Err text={error} />
        <Buttons
          onBack={back}
          nextLabel="Salva scheda"
          onNext={() => {
            if (!need(profile.bici?.length, "Scegli almeno una bici.")) return;
            if (!need(profile.fascia, "Scegli la fascia cardio (anche Nessuna).")) return;
            if (!need(profile.mangia, "Indica cosa mangi in uscita.")) return;
            if (!need(profile.carboTollerati, "Indica i carboidrati che tolleri (anche Non so).")) return;
            next();
          }}
        />
      </>
    );
  } else {
    const rows: [string, string][] = [
      ["Profilo", pheno?.verdict ? pheno.headline : "non calcolato"],
      ["Disciplina", profile.disciplina ?? "–"],
      ["Punti forti", profile.forte?.join(", ") || "–"],
      ["Ore e giorni", `${profile.oreSettimana ?? "3-5"} h, ${days.map((d) => DAY_LABELS[d]).join(" ") || "–"}`],
      ["Obiettivi", profile.obiettivi?.join(", ") || "–"],
      ["Rischio", profile.rischio ?? "–"],
      ["Fascia cardio", profile.fascia ?? "–"],
      ["Carboidrati tollerati", profile.carboTollerati ?? "–"],
    ];
    body = (
      <>
        <div className="py-2 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full" style={{ background: "var(--good-bg)", color: "var(--good)" }}>
            <IconCheck size={24} />
          </div>
          <h2 className="mt-3 text-lg font-medium">Tutto pronto</h2>
        </div>
        {rows.map(([l, v]) => (
          <div key={l} className="flex gap-3 border-b py-2 text-sm" style={{ borderColor: "var(--border)" }}>
            <span className="flex-1 text-muted">{l}</span>
            <span className="max-w-[60%] text-right font-medium">{v}</span>
          </div>
        ))}
        <Note>
          Il coach sceglie dalla tua libreria su Intervals e ti propone il test CP classico (3′, 7′, 12′) per confermare il profilo. La scheda è salvata su questo
          dispositivo: per il Progetto Claude copia il testo qui sotto e sostituisci il file «Scheda_atleta.md».
        </Note>
        <button type="button" onClick={copy} className="mt-4 w-full rounded-xl px-4 py-2 text-sm" style={{ border: "1px solid var(--border)" }}>
          {copied === "ok" ? "Scheda copiata" : "Copia il testo della Scheda atleta"}
        </button>
        {copied === "manual" && (
          <textarea readOnly value={sheet} rows={8} onFocus={(e) => e.currentTarget.select()} className={`mt-2 ${field} font-mono text-xs`} style={fieldStyle} aria-label="Testo della Scheda atleta" />
        )}
        <Buttons onBack={back} onNext={finish} nextLabel="Apri MasCoach" />
      </>
    );
  }

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-6">
      {dots}
      {found && !offerDone && stepId !== "who" && stepId !== "time" && stepId !== "gear" && stepId !== "done" && (
        <section className="card mb-4 p-4" style={{ border: "1px solid var(--accent-ink)" }}>
          <div className="text-sm font-medium">Ho trovato i tuoi dati su Intervals</div>
          <p className="mt-1 text-xs text-muted">
            {found.profile ? "Scheda atleta" : ""}
            {found.profile && found.season ? " e " : ""}
            {found.season ? "stagione" : ""}, salvate il {found.savedAt.slice(0, 10)}. Le ripristino o ricominci da zero?
          </p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => setOfferDone(true)} className="rounded-xl px-3 py-1.5 text-xs" style={{ border: "1px solid var(--border)" }}>
              Ricomincia da zero
            </button>
            <button
              type="button"
              onClick={() => {
                applyCloud(found);
                setOfferDone(true);
              }}
              className="flex-1 rounded-xl px-3 py-1.5 text-xs font-medium"
              style={{ background: "var(--accent-bg)", color: "var(--accent-ink)" }}
            >
              Ripristina
            </button>
          </div>
        </section>
      )}
      <section className="card p-5">{body}</section>
    </div>
  );
}

// ── Power profile step ───────────────────────────────────────────────────────────────────────────

const COACH_NOTE: Record<NonNullable<Phenotype["verdict"]>, string> = {
  glicolitico: "Intervalli più brevi e variati, recuperi un po' più lunghi, soglia in blocchi fino a 12′. Il margine è la base aerobica e la durata.",
  diesel: "Blocchi più lunghi e più volume, recuperi brevi. Il margine è la capacità anaerobica e gli scatti.",
  all_rounder: "Lavoro bilanciato: alterna lunghi a soglia e lavori brevi intensi.",
};

function PhenotypeStep({ pheno, best, weight, loading, onBack, onNext }: { pheno: Phenotype | null; best: Best; weight: number | null; loading: boolean; onBack: () => void; onNext: () => void }) {
  if (loading || !pheno) {
    return (
      <>
        <h2 className="text-lg font-medium">Il tuo profilo atletico</h2>
        <p className="mt-2 text-sm text-muted">Calcolo in corso…</p>
        <Buttons onBack={onBack} onNext={onNext} nextLabel="Continua" />
      </>
    );
  }
  const wkg = (w: number | null) => (w && weight ? `${fmt1(w / weight)} W/kg` : "");
  const leanStyle = (l: string) => (l === "diesel" ? { background: "var(--accent-bg)", color: "var(--accent-ink)" } : l === "glicolitico" ? { background: "var(--warning-bg)", color: "var(--warning-ink)" } : { background: "var(--neutral-bg)", color: "var(--muted)" });
  const stats: [string, number | null][] = [
    ["5 secondi", best.s5],
    ["1 minuto", best.m1],
    ["5 minuti", best.m5],
    ["20 minuti", best.m20],
  ];
  return (
    <>
      <h2 className="text-lg font-medium">Il tuo profilo atletico</h2>
      <p className="mt-1 text-sm text-muted">Calcolato dai tuoi migliori sforzi delle ultime due stagioni{weight ? ` e dal peso (${kg(weight)} kg)` : ""}.</p>
      {pheno.verdict === null ? (
        <Note tone="warning">Non ho abbastanza sforzi massimali per giudicare. Il profilo si completa con qualche test.</Note>
      ) : (
        <>
          <div className="mt-5">
            <div className="flex h-3 overflow-hidden rounded-full" style={{ border: "1px solid var(--border)" }}>
              <div style={{ flex: 30, background: "var(--accent-bg)" }} />
              <div style={{ flex: 40, background: "var(--background)" }} />
              <div style={{ flex: 30, background: "var(--warning-bg)" }} />
            </div>
            <div className="relative h-6">
              <span className="absolute -top-4 h-4 w-0.5" style={{ left: `${pheno.position}%`, background: "var(--foreground)" }} />
              <span className="absolute top-1 -translate-x-1/2 text-xs font-medium" style={{ left: `${pheno.position}%` }}>
                tu
              </span>
            </div>
            <div className="flex text-xs text-muted">
              <span style={{ flex: 30 }}>Diesel</span>
              <span style={{ flex: 40 }} className="text-center">
                All-rounder
              </span>
              <span style={{ flex: 30 }} className="text-right">
                Glicolitico
              </span>
            </div>
          </div>
          <div className="mt-4 rounded-xl px-4 py-3" style={leanStyle(pheno.verdict === "all_rounder" ? "neutro" : pheno.verdict)}>
            <div className="font-medium">{pheno.headline}</div>
          </div>
          <Divider>I criteri</Divider>
          {pheno.criteria.map((c) => (
            <div key={c.id} className="flex items-center gap-3 border-b py-2 text-sm" style={{ borderColor: "var(--border)" }}>
              <span className="min-w-0 flex-1">
                {c.label}
                <br />
                <span className="text-xs text-muted">{c.detail}</span>
              </span>
              <span className="rounded-full px-2 py-0.5 text-[11px]" style={leanStyle(c.lean)}>
                {c.lean}
              </span>
            </div>
          ))}
          <Divider>I tuoi migliori sforzi</Divider>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {stats.map(([l, w]) => (
              <div key={l} className="rounded-xl px-3 py-2" style={{ background: "var(--background)" }}>
                <div className="text-xs text-muted">{l}</div>
                <div className="num text-lg font-medium">{w ? `${w} W` : "–"}</div>
                <div className="text-xs text-faint">{wkg(w)}</div>
              </div>
            ))}
          </div>
          <Note>
            <b className="font-medium" style={{ color: "var(--foreground)" }}>
              Cosa cambia per il coach
            </b>
            <br />
            {COACH_NOTE[pheno.verdict]}
          </Note>
        </>
      )}
      <Note tone="warning">
        <b className="font-medium">Affidabilità: {pheno.reliability.level}</b>
        {pheno.reliability.reasons.map((r) => (
          <span key={r}>
            <br />
            {r}
          </span>
        ))}
        <br />
        Lettura indicativa su un continuum, non un&apos;etichetta. Il test CP classico (3′, 7′, 12′) la conferma o la corregge.
      </Note>
      <Buttons onBack={onBack} onNext={onNext} nextLabel="Continua" />
    </>
  );
}
