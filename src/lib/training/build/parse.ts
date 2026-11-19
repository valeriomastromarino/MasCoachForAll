// The athlete's words → what the session must contain (19 November 2026). Read with rules, no model: repeats ("3x12'",
// "5 volte 4 minuti", "6 ripetute da 3'", "5x30/30", "40 on 20 off"), sprints ("6 sprint"), steady blocks ("20' a soglia"),
// intensities ("al 95%", "230-240 w", "Z2", "sweet spot", "a tutta"), recoveries ("rec 5'", "4' facili"), the ride around
// them ("2 ore fuori", "riscaldamento 20'", "a metà", "nel finale"), day, place and name. What it does not find it leaves
// empty: compose.ts fills it with the method's defaults and says so.
import type { WorkoutClass } from "@/lib/training/classify";
import { parseDates } from "@/lib/coach/chat/text";

export type BandName = "z1" | "z2" | "tempo" | "sweetspot" | "soglia" | "vo2" | "anaerobico" | "sprint";
export type Intensity = { kind: "band"; band: BandName } | { kind: "pct"; lo: number; hi: number } | { kind: "watts"; lo: number; hi: number };

export type SetSpec = {
  reps: number;
  workSecs: number;
  work: Intensity | null;
  /** null: the method's recovery for this kind of work. */
  recSecs: number | null;
  rec: Intensity | null;
  rpm: number | null;
  /** "2 serie di 8×30/30": the whole set repeated, with a rest between. */
  series: number;
  seriesRestSecs: number | null;
  /** Short efforts spread inside an easy ride ("6 sprint nella Z2") rather than a block of repeats. */
  spread: boolean;
  /** Said by the athlete: a unit-less "6x30" was read as seconds or minutes. */
  guessedUnit: boolean;
};

export type Where = "inizio" | "meta" | "fine" | { afterMins: number };

export type Spec = {
  sets: SetSpec[];
  totalMins: number | null;
  base: Intensity | null;
  where: Where | null;
  /** Minutes; 0 = without; null = the method's. */
  warmupMins: number | null;
  cooldownMins: number | null;
  date: string | null;
  place: "indoor" | "outdoor" | null;
  name: string | null;
  /** A session asked by type only ("dammi una soglia da 60'"): the engine chooses the dose. */
  vague: { cls: WorkoutClass; mins: number | null } | null;
  /** Words like "ripetute" with nothing to build them from: the chat asks. */
  incomplete: boolean;
};

const WORDS: Record<string, number> = { un: 1, uno: 1, una: 1, due: 2, tre: 3, quattro: 4, cinque: 5, sei: 6, sette: 7, otto: 8, nove: 9, dieci: 10, undici: 11, dodici: 12, quindici: 15, venti: 20, trenta: 30 };
const NUM = `(\\d+(?:[.,]\\d+)?|${Object.keys(WORDS).join("|")})`;
const num = (s: string) => WORDS[s] ?? Number(s.replace(",", "."));
const UNIT = "(ore|ora|h|minuti|minuto|min|m|secondi|secondo|sec|s)";
const DUR = `${NUM} ?${UNIT}\\b`;
const unitSecs = (u: string) => (/^(ore|ora|h)$/.test(u) ? 3600 : /^(secondi|secondo|sec|s)$/.test(u) ? 1 : 60);

/**
 * The text the rules read: lower case, no accents, minutes and seconds written as words (12' → 12min, 30" → 30sec,
 * 1h30 → 90min, un'ora e mezza → 90min), × → x.
 */
export function prepare(raw: string): string {
  const s = raw
    .replace(/(\d+)\s*(?:''|"|″|”|“)/g, "$1sec ")
    .replace(/(\d+)\s*['’′]/g, "$1min ")
    .replace(/×/g, "x");
  // Like the chat's normalize, but keeping "%" (and "/" for 30/30).
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’'`´]/g, " ")
    .replace(/[^a-z0-9/%.,\s-]/g, " ")
    .replace(/[.,;:!?]+(\s|$)/g, " ")
    .replace(/(\d)\s*%/g, "$1%")
    .replace(/(\d+)\s?h\s?(\d{1,2})\b/g, (_, h, m) => `${Number(h) * 60 + Number(m)}min`)
    .replace(/\b(un|1) ora e mezza\b/g, "90min")
    .replace(/\bmezz ora\b/g, "30min")
    .replace(/\bun ora\b/g, "60min")
    .replace(/\b(\d+)\s?min(?:uti|uto)?\b/g, "$1min")
    .replace(/\b(\d+)\s?(?:sec|secondi|secondo)\b/g, "$1sec")
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s+/g, " ")
    .trim();
}

const BAND_WORDS: [BandName, RegExp][] = [
  ["sprint", /\b(a tutta|massimal\w*|all out|sprint\w*|al massimo)\b/],
  ["anaerobico", /\b(anaerobic\w*|z6|zona 6)\b/],
  ["vo2", /\b(vo2 ?max|vo2|vo 2|z5|zona 5)\b/],
  ["soglia", /\b(soglia|threshold|ftp|z4|zona 4)\b/],
  ["sweetspot", /\b(sweet ?spot|ss)\b/],
  ["tempo", /\b(tempo|medio|z3|zona 3)\b/],
  ["z2", /\b(z2|zona 2|fondo|endurance|aerobic\w*)\b/],
  ["z1", /\b(z1|zona 1|facil\w*|agile|scarico|recupero attivo|rigenerante|piano)\b/],
];

/** The intensity a piece of text asks for, or null. */
export function intensityIn(t: string): Intensity | null {
  let m = t.match(/(\d{2,3})(?: ?- ?(\d{2,3}))? ?%/);
  if (m) {
    const lo = Number(m[1]) / 100;
    return { kind: "pct", lo, hi: m[2] ? Number(m[2]) / 100 : lo };
  }
  m = t.match(/(\d{2,4})(?: ?- ?(\d{2,4}))? ?(?:w|watt)\b/);
  if (m) return { kind: "watts", lo: Number(m[1]), hi: m[2] ? Number(m[2]) : Number(m[1]) };
  for (const [band, re] of BAND_WORDS) if (re.test(t)) return { kind: "band", band };
  return null;
}

const CLASS_OF_BAND: Record<BandName, WorkoutClass> = { z1: "recupero", z2: "z2", tempo: "tempo", sweetspot: "sweetspot", soglia: "soglia", vo2: "vo2", anaerobico: "anaerobico", sprint: "sprint" };

/** Durations like "12min", "30sec", "2 ore" in seconds. */
function durIn(t: string): number | null {
  const m = t.match(new RegExp(DUR));
  return m ? Math.round(num(m[1]) * unitSecs(m[2])) : null;
}

/** Split a piece of text into the work part and the recovery part ("… rec 5min facile"). */
function splitRecovery(seg: string): { work: string; rec: string | null } {
  const m = seg.match(/\b(rec|recupero|recuperi|riposo|pausa)\b|(\d+(?:min|sec)) (?:facili|facile|di recupero|recupero|piano|agili|easy)\b|\bcon (\d+(?:min|sec)) di (?:recupero|riposo|pausa)\b/);
  if (!m || m.index === undefined) return { work: seg, rec: null };
  return { work: seg.slice(0, m.index), rec: seg.slice(m.index) };
}

type Hit = { at: number; end: number; set: SetSpec };

function newSet(reps: number, workSecs: number, extra: Partial<SetSpec> = {}): SetSpec {
  return { reps, workSecs, work: null, recSecs: null, rec: null, rpm: null, series: 1, seriesRestSecs: null, spread: false, guessedUnit: false, ...extra };
}

/** Every repeat or block the text names, in order. */
function findSets(t: string): Hit[] {
  const hits: Hit[] = [];
  const taken = (a: number, b: number) => hits.some((h) => a < h.end && b > h.at);
  const add = (m: RegExpMatchArray, set: SetSpec) => {
    const at = m.index ?? 0;
    const end = at + m[0].length;
    if (!taken(at, end)) hits.push({ at, end, set });
  };

  // "5x30/30", "10 volte 40/20", "30/15" (seconds on / off; "min" after them for minutes).
  for (const m of t.matchAll(new RegExp(`(?:${NUM} ?(?:x|volte|ripetute di|ripetute da|serie di) ?)?(\\d{1,2})(?:sec|min)? ?/ ?(\\d{1,2})(sec|min)?\\b`, "g"))) {
    const u = m[4] === "min" ? 60 : 1;
    add(m, newSet(m[1] ? num(m[1]) : 0, Number(m[2]) * u, { recSecs: Number(m[3]) * u }));
  }
  // "40 on 20 off"
  for (const m of t.matchAll(/(?:(\d+) ?(?:x|volte) ?)?(\d+)(?:sec)? on (\d+)(?:sec)? off/g)) add(m, newSet(m[1] ? Number(m[1]) : 0, Number(m[2]), { recSecs: Number(m[3]) }));
  // "6 sprint", "sei sprint da 15sec"
  for (const m of t.matchAll(new RegExp(`${NUM} (?:sprint|scatti|volate|partenze)(?: (?:da|di) (\\d+)(sec|min))?`, "g"))) {
    const secs = m[2] ? Number(m[2]) * (m[3] === "min" ? 60 : 1) : 10;
    add(m, newSet(num(m[1]), secs, { work: { kind: "band", band: "sprint" }, spread: true }));
  }
  // "3x12min", "4 x 8", "5 volte 4min", "6 ripetute da 3min", "2 serie da 20min"
  for (const m of t.matchAll(new RegExp(`${NUM} ?(?:x|per|volte|ripetute|ripetizioni|serie)(?: (?:da|di))? ?(\\d+(?:[.,]\\d+)?) ?(min|sec|ore|h)?\\b`, "g"))) {
    const reps = num(m[1]);
    const n = Number(m[2].replace(",", "."));
    if (!(reps >= 1 && reps <= 40) || !(n > 0)) continue;
    // Without a unit: up to 20 is minutes ("4x8"), 30 and more seconds ("8x30").
    const guessed = !m[3];
    const secs = m[3] ? n * unitSecs(m[3]) : n >= 30 ? n : n * 60;
    add(m, newSet(reps, Math.round(secs), { guessedUnit: guessed }));
  }
  // "20min a soglia", "2x" not said: a single block of work above Z2 ("15min tempo", "10min al 95%").
  for (const m of t.matchAll(/(\d+)(min|sec) (?:a |al |in |di )?(soglia|sweet ?spot|ss|tempo|medio|vo2(?: ?max)?|z[3-7]|zona [3-7]|\d{2,3}(?: ?- ?\d{2,3})? ?%|\d{2,4}(?: ?- ?\d{2,4})? ?w)/g)) {
    add(m, newSet(1, Number(m[1]) * (m[2] === "min" ? 60 : 1)));
  }
  return hits.sort((a, b) => a.at - b.at);
}

export function parseSpec(raw: string, today: string): Spec {
  const t = prepare(raw);
  const spec: Spec = { sets: [], totalMins: null, base: null, where: null, warmupMins: null, cooldownMins: null, date: null, place: null, name: null, vague: null, incomplete: false };

  const span = parseDates(raw, today);
  if (span) spec.date = span.from;
  if (/\b(rulli|rullo|indoor|trainer|in casa|smart ?trainer)\b/.test(t)) spec.place = "indoor";
  else if (/\b(fuori|all aperto|in strada|outdoor|su strada|in salita)\b/.test(t)) spec.place = "outdoor";
  const name = raw.match(/(?:chiamal[ao]|nome|titolo)\s*[:«"“]?\s*([^»"”\n]{2,60})/i);
  if (name) spec.name = name[1].trim();

  let rest = t;
  const warm = rest.match(/\b(senza riscaldamento)\b|\briscaldamento (?:di |da )?(\d+)min\b|\b(\d+)min (?:di )?riscaldamento\b/);
  if (warm) {
    spec.warmupMins = warm[1] ? 0 : Number(warm[2] ?? warm[3]);
    rest = rest.replace(warm[0], " ");
  }
  const cool = rest.match(/\b(senza defaticamento)\b|\bdefatic\w* (?:di |da )?(\d+)min\b|\b(\d+)min (?:di )?defatic\w*/);
  if (cool) {
    spec.cooldownMins = cool[1] ? 0 : Number(cool[2] ?? cool[3]);
    rest = rest.replace(cool[0], " ");
  }

  if (/\b(a meta|nel mezzo|in mezzo|a meta uscita|centrale)\b/.test(rest)) spec.where = "meta";
  else if (/\b(alla fine|nel finale|finale|ultima ora|negli ultimi|in fondo)\b/.test(rest)) spec.where = "fine";
  else if (/\b(all inizio|subito|in apertura|nella prima parte)\b/.test(rest)) spec.where = "inizio";
  const after = rest.match(/\bdopo (?:i primi )?(\d+)min\b|\bdopo (\d+(?:[.,]\d)?) (?:ore|ora|h)\b/);
  if (after) spec.where = { afterMins: after[1] ? Number(after[1]) : Math.round(Number(after[2].replace(",", ".")) * 60) };

  const hits = findSets(rest);
  for (let i = 0; i < hits.length; i++) {
    const h = hits[i];
    const seg = rest.slice(h.end, i + 1 < hits.length ? hits[i + 1].at : rest.length);
    const before = rest.slice(i ? hits[i - 1].end : 0, h.at);
    const { work, rec } = splitRecovery(seg);
    const set = h.set;
    // The intensity is said after the repeat ("3x12min sweet spot") or just before it ("sweet spot 3x12min").
    set.work ??= intensityIn(work) ?? intensityIn(before.split(/\b(e|poi|con|,)\b/).pop() ?? "");
    const rpm = work.match(/(\d{2,3}) ?(?:rpm|di cadenza|pedalate)/) ?? work.match(/cadenza (?:a |di )?(\d{2,3})/);
    if (rpm) set.rpm = Number(rpm[1]);
    if (rec) {
      const secs = durIn(rec);
      if (secs) set.recSecs = secs;
      set.rec = intensityIn(rec.replace(/\b(rec|recupero|recuperi|riposo|pausa)\b/g, " "));
    }
    const series = seg.match(/\b(?:per )?(\d|due|tre|quattro) (?:serie|volte|blocchi)\b(?:.*?(?:tra le serie|fra le serie|tra i blocchi) (\d+)min)?/) ?? before.match(/\b(\d|due|tre|quattro) (?:serie|blocchi) (?:di|da)\s*$/);
    if (series) {
      set.series = num(series[1]);
      if (series[2]) set.seriesRestSecs = Number(series[2]) * 60;
    }
    // Spread efforts only when they are short: anything longer is a block of repeats.
    if (set.spread && set.workSecs > 30) set.spread = false;
    spec.sets.push(set);
  }

  // The whole ride: "2 ore", "uscita di 3 ore", "90min z2 con …". A duration not used by a repeat, of 40 minutes or more.
  const used = (at: number) => hits.some((h) => at >= h.at && at < h.end);
  for (const m of rest.matchAll(new RegExp(DUR, "g"))) {
    if (used(m.index ?? 0)) continue;
    const secs = num(m[1]) * unitSecs(m[2]);
    if (secs >= 40 * 60 && (!spec.totalMins || secs / 60 > spec.totalMins)) spec.totalMins = Math.round(secs / 60);
  }
  if (spec.totalMins) {
    const around = rest.replace(/\d+ ?(?:x|volte)[^,]*?(?=\bcon\b|$)/g, " ");
    const base = intensityIn(around.split(/\bcon\b/)[0]);
    spec.base = base && base.kind === "band" && (base.band === "z1" || base.band === "z2") ? base : null;
  }

  if (!spec.sets.length) {
    const it = intensityIn(rest);
    const cls = it?.kind === "band" ? CLASS_OF_BAND[it.band] : null;
    if (cls) spec.vague = { cls, mins: spec.totalMins ?? (durIn(rest) ? Math.round(durIn(rest)! / 60) : null) };
    else if (/\b(ripetute|ripetizioni|intervalli|lavori|serie|blocchi)\b/.test(rest)) spec.incomplete = true;
  }
  return spec;
}

/** The type a set of work belongs to, from its intensity (a percentage or watts read on the FTP). */
export function bandOf(i: Intensity | null, ftp: number | null): BandName | null {
  if (!i) return null;
  if (i.kind === "band") return i.band;
  const f = i.kind === "pct" ? (i.lo + i.hi) / 2 : ftp ? (i.lo + i.hi) / 2 / ftp : null;
  if (f === null) return null;
  if (f < 0.56) return "z1";
  if (f < 0.76) return "z2";
  if (f < 0.875) return "tempo";
  if (f < 0.945) return "sweetspot";
  if (f < 1.055) return "soglia";
  if (f < 1.21) return "vo2";
  if (f < 1.6) return "anaerobico";
  return "sprint";
}

export const classOfBand = (b: BandName): WorkoutClass => CLASS_OF_BAND[b];
