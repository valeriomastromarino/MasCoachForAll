// The athlete sheet filled at first launch: the answers, where they are kept (this device only) and the text of
// "Scheda_atleta.md" for the coach's Claude Project (prompt §15), which the app can't write by itself.
import type { Phenotype } from "./phenotype";

/** Single choices and free text. Multiple choices are arrays of the option labels. */
export type AthleteProfile = {
  fcMaxKind?: string;
  eta?: string;
  sesso?: string;
  altezza?: string;
  esperienza?: string;
  disciplina?: string;
  disciplina2?: string;
  forte?: string[];
  debole?: string[];
  visita?: string;
  dolori?: string[];
  condizioni?: string[];
  lavoro?: string;
  stress?: string;
  rpe?: string;
  /** 0 = Monday … 6 = Sunday. */
  giorni?: number[];
  oreSettimana?: string;
  oreMax?: string;
  durataFeriali?: string;
  durataWeekend?: string;
  lunga?: string;
  riposo?: string;
  palestra?: string;
  obiettivi?: string[];
  garaA?: { nome?: string; data?: string; tipo?: string; dettagli?: string };
  garaB?: { nome?: string; data?: string };
  obiettivoPotenza?: string;
  obiettivoPeso?: string;
  stop?: string;
  rischio?: string;
  bici?: string[];
  misuratore?: string;
  calibrazione?: string;
  rullo?: string;
  differenzaRulli?: string;
  fascia?: string;
  rr?: string;
  orologio?: string;
  z2Dove?: string;
  intervalliDove?: string;
  sedutaMin?: string;
  ruliMax?: string;
  mangia?: string;
  carboTollerati?: string;
  digiuno?: string;
  restrizioni?: string[];
  stile?: string;
};

export const DAY_LABELS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

const KEY = "mascoach-profile";
const DRAFT_KEY = "mascoach-firstrun-draft";
const SKIP_KEY = "mascoach-firstrun-skipped";

/** `sheet` is the text of Scheda_atleta.md as it was when saved (the numbers come from Intervals at that moment). */
export type StoredProfile = { savedAt: string; profile: AthleteProfile; sheet: string; phenotype?: "diesel" | "all_rounder" | "glicolitico" | null };

/** Tells the first-launch gate that the sheet was saved, skipped or cleared. */
export const PROFILE_EVENT = "mascoach-profile";
export const notifyProfile = () => {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(PROFILE_EVENT));
};
export type Draft = { step: number; profile: AthleteProfile };

function read(name: string): string | null {
  try {
    return localStorage.getItem(name);
  } catch {
    return null;
  }
}
function write(name: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(name);
    else localStorage.setItem(name, value);
  } catch {
    // Storage blocked: the sheet is asked again next time.
  }
}
function parse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export const loadProfile = (): StoredProfile | null => parse<StoredProfile>(read(KEY));
/** The raw saved text: a stable value for `useSyncExternalStore` (parsing it gives a new object every time). */
export const profileSnapshot = (): string => read(KEY) ?? "";
export const saveProfile = (profile: AthleteProfile, sheet: string, phenotype: StoredProfile["phenotype"] = null, now = new Date()) => {
  write(KEY, JSON.stringify({ savedAt: now.toISOString().slice(0, 10), profile, sheet, phenotype } satisfies StoredProfile));
  write(DRAFT_KEY, null);
  write(SKIP_KEY, null);
};
export const clearProfile = () => {
  write(KEY, null);
  write(DRAFT_KEY, null);
  write(SKIP_KEY, null);
};
export const loadDraft = (): Draft | null => parse<Draft>(read(DRAFT_KEY));
export const saveDraft = (draft: Draft) => write(DRAFT_KEY, JSON.stringify(draft));
export const isSkipped = () => read(SKIP_KEY) === "1";
export const skipFirstRun = () => write(SKIP_KEY, "1");

/** Everything a step may leave empty must not break the sheet: empty answers become "–". */
const or = (x: string | undefined | null, empty = "–") => (x && x.trim() ? x.trim() : empty);
const list = (x: string[] | undefined) => (x && x.length ? x.join(", ") : "–");

export type SheetAthlete = {
  name: string;
  weight: number | null;
  ftp: number | null;
  indoorFtp: number | null;
  lthr: number | null;
  maxHr: number | null;
  wPrime: number | null;
  cpValid: boolean | null;
  cp: number | null;
};

export function sheetText(p: AthleteProfile, a: SheetAthlete, pheno: Phenotype | null, date: string): string {
  const days = (p.giorni ?? []).map((d) => DAY_LABELS[d]).join(", ") || "–";
  const gara = p.garaA?.nome || p.garaA?.data ? `${or(p.garaA?.nome)} (${or(p.garaA?.data)}, ${or(p.garaA?.tipo)}${p.garaA?.dettagli ? `, ${p.garaA.dettagli}` : ""})` : "–";
  const garaB = p.garaB?.nome || p.garaB?.data ? `${or(p.garaB?.nome)} (${or(p.garaB?.data)})` : "–";
  const lines = [
    `# Scheda atleta — ${a.name}`,
    `Aggiornata al: ${date}`,
    "",
    "## Identità ciclistica",
    `- Età: ${or(p.eta)} | Sesso: ${or(p.sesso)} | Altezza: ${or(p.altezza)} cm | Peso: ${a.weight === null ? "–" : a.weight.toFixed(1).replace(".", ",")} kg (da Intervals)`,
    `- Anni di allenamento strutturato: ${or(p.esperienza)}`,
    `- Disciplina attiva: ${or(p.disciplina)} | secondaria: ${or(p.disciplina2)}`,
    `- Profilo di potenza: ${pheno?.verdict ? `${pheno.headline.toLowerCase()} (calcolato dall'app, indicativo; affidabilità ${pheno.reliability.level})` : "non calcolato"}`,
    `- CP stimata: ${a.cp ? `${Math.round(a.cp)} W` : "–"} | validità: ${a.cpValid === null ? "non nota" : a.cpValid ? "sì" : "no, serve il test CP classico (3', 7', 12')"}`,
    `- FTP impostata: ${a.ftp ?? "–"} W (outdoor), ${a.indoorFtp ?? "–"} W (rulli) | W': ${a.wPrime ? `${(a.wPrime / 1000).toFixed(1).replace(".", ",")} kJ` : "–"}`,
    `- FC max: ${a.maxHr ?? "–"} bpm (${or(p.fcMaxKind, "origine non indicata")}) | FC soglia: ${a.lthr ?? "–"} bpm`,
    `- Dove va forte: ${list(p.forte)} | dove soffre: ${list(p.debole)}`,
    "",
    "## Salute e vita",
    `- Visita medico-sportiva: ${or(p.visita)}`,
    `- Dolori o infortuni in corso: ${list(p.dolori)}`,
    `- Condizioni da segnalare: ${list(p.condizioni)}`,
    `- Lavoro: ${or(p.lavoro)} | stress di lavoro: ${or(p.stress)} | scala RPE: ${or(p.rpe)}`,
    "",
    "## Attrezzatura e misura",
    `- Bici usate: ${list(p.bici)}`,
    `- Misuratore: ${or(p.misuratore)} (ultima calibrazione: ${or(p.calibrazione)}) | Rullo: ${or(p.rullo)} | Differenza rulli e strada: ${or(p.differenzaRulli)}`,
    `- Fascia cardio: ${or(p.fascia)} (registra RR: ${or(p.rr)}) | Orologio o ciclocomputer: ${or(p.orologio)}`,
    "",
    "## Obiettivi",
    `- Cosa vuole: ${list(p.obiettivi)}`,
    `- Gara A: ${gara}`,
    `- Gara B: ${garaB}`,
    `- Obiettivo di potenza: ${or(p.obiettivoPotenza)} | di peso: ${or(p.obiettivoPeso)}`,
    `- Rischio accettato nella progressione: ${or(p.rischio)}`,
    "",
    "## Disponibilità",
    `- Giorni disponibili: ${days} | Ore in una settimana normale: ${or(p.oreSettimana)} (massimo ${or(p.oreMax)})`,
    `- Durata massima: feriali ${or(p.durataFeriali)}, weekend ${or(p.durataWeekend)} | Giorno della lunga: ${or(p.lunga)} | Riposo fisso: ${or(p.riposo)}`,
    `- Palestra: ${or(p.palestra)} | Altri periodi di stop: ${or(p.stop)}`,
    "",
    "## Preferenze",
    `- Z2 lungo: ${or(p.z2Dove)} | Intervalli duri: ${or(p.intervalliDove)} | Seduta più corta utile: ${or(p.sedutaMin)} | Rulli, durata massima: ${or(p.ruliMax)}`,
    `- In uscita mangia: ${or(p.mangia)} | Carboidrati tollerati: ${or(p.carboTollerati)} g/h | Digiuno: ${or(p.digiuno)} | Restrizioni: ${list(p.restrizioni)}`,
    `- Stile delle risposte: ${or(p.stile)}`,
    "",
    "## Risposta all'allenamento",
    "- Cosa funziona / cosa no: [da compilare con il coach]",
    "- Conclusioni verificate (con data e fonte nei dati): [da compilare con il coach]",
    "",
    "## Storico modifiche",
    `- ${date} — creata dalla configurazione iniziale dell'app`,
  ];
  return lines.join("\n");
}
