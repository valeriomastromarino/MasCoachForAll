// Reading the athlete's Italian: normal form, dates ("dal 10 al 20 dicembre", "da ieri", "martedì", "per 3 giorni"),
// durations ("45 minuti", "un'ora e mezza") and numbers. Pure, so every phrase can be tested.
import { addDays, toIsoDate, weekStart } from "@/lib/dates";

/** Lower case, no accents, no punctuation worth keeping: "Così, un'ora!" → "cosi un ora". */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’'`´]/g, " ")
    .replace(/[^a-z0-9/:.,\s-]/g, " ")
    .replace(/[.,;:!?]+(\s|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const MONTHS: Record<string, number> = {
  gennaio: 1, gen: 1, febbraio: 2, feb: 2, marzo: 3, aprile: 4, apr: 4, maggio: 5, mag: 5, giugno: 6, giu: 6, luglio: 7, lug: 7,
  agosto: 8, ago: 8, settembre: 9, set: 9, sett: 9, ottobre: 10, ott: 10, novembre: 11, nov: 11, dicembre: 12, dic: 12,
};
const MONTH_RE = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|");

export const WEEKDAYS: Record<string, number> = { lunedi: 0, martedi: 1, mercoledi: 2, giovedi: 3, venerdi: 4, sabato: 5, domenica: 6 };
const WD_RE = Object.keys(WEEKDAYS).join("|");
export const WEEKDAY_NAMES = ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"];

const NUMBER_WORDS: Record<string, number> = { un: 1, uno: 1, una: 1, due: 2, tre: 3, quattro: 4, cinque: 5, sei: 6, sette: 7, otto: 8, nove: 9, dieci: 10 };
const NUM = `(\\d{1,3}|${Object.keys(NUMBER_WORDS).join("|")})`;
const num = (s: string): number => (NUMBER_WORDS[s] ?? Number(s));

export type DateSpan = { from: string; to: string };

const dow = (iso: string) => (new Date(`${iso}T12:00:00`).getDay() + 6) % 7;
const daysBetween = (a: string, b: string) => Math.round((new Date(`${b}T12:00:00`).getTime() - new Date(`${a}T12:00:00`).getTime()) / 86400000);
const pad = (n: number) => String(n).padStart(2, "0");

/** Day and month without a year: this year, unless that is long gone (then next year). */
function dayMonth(d: number, m: number, today: string): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const year = Number(today.slice(0, 4));
  const iso = (y: number) => `${y}-${pad(m)}-${pad(d)}`;
  const check = new Date(`${iso(year)}T12:00:00`);
  if (check.getMonth() + 1 !== m) return null; // 31 February
  return daysBetween(iso(year), today) > 60 ? iso(year + 1) : iso(year);
}

/** A weekday: the next one after today, or with `past` the latest one up to today. */
export function weekdayDate(wd: number, today: string, past = false): string {
  const diff = (wd - dow(today) + 7) % 7;
  if (past) return addDays(today, diff === 0 ? 0 : diff - 7);
  return addDays(today, diff === 0 ? 7 : diff);
}

function word(w: string, today: string, past: boolean): string | null {
  if (w === "oggi") return today;
  if (w === "ieri") return addDays(today, -1);
  if (w === "domani") return addDays(today, 1);
  if (w === "dopodomani") return addDays(today, 2);
  if (w === "altro ieri" || w === "altroieri") return addDays(today, -2);
  if (w in WEEKDAYS) return weekdayDate(WEEKDAYS[w], today, past);
  return null;
}

/**
 * The days a phrase talks about, or null. With `past`, "da martedì" means the latest Tuesday (for an illness that
 * already started); otherwise it is the next one.
 */
export function parseDates(text: string, today: string, opts: { past?: boolean } = {}): DateSpan | null {
  const t = normalize(text);
  const past = opts.past ?? false;
  const md = `(\\d{1,2})(?:/(\\d{1,2}))?(?: (${MONTH_RE}))?`;

  // "dal 10 al 20 dicembre", "dal 10/12 al 20/12", "dal 3 novembre al 8 novembre"
  let m = t.match(new RegExp(`(?:dal|da|tra il|fra il) ${md} (?:al|a|e il|fino al|fino a) ${md}`));
  if (m) {
    const [, d1, n1, mo1, d2, n2, mo3] = m;
    const toMonth = n2 ? Number(n2) : mo3 ? MONTHS[mo3] : null;
    const fromMonth = n1 ? Number(n1) : mo1 ? MONTHS[mo1] : toMonth;
    const nowMonth = Number(today.slice(5, 7));
    const to = dayMonth(Number(d2), toMonth ?? fromMonth ?? nowMonth, today);
    const from = dayMonth(Number(d1), fromMonth ?? toMonth ?? nowMonth, today);
    if (from && to) return to < from ? { from, to: from } : { from, to };
  }
  // "da lunedì a venerdì"
  m = t.match(new RegExp(`(?:dal|da) (${WD_RE}) (?:al|a|fino a|fino al) (${WD_RE})`));
  if (m) {
    const from = weekdayDate(WEEKDAYS[m[1]], today, past);
    let to = weekdayDate(WEEKDAYS[m[2]], today, past);
    while (to < from) to = addDays(to, 7);
    return { from, to };
  }
  // "da ieri", "da oggi fino a venerdì", "dal 10 fino a venerdì"
  m = t.match(new RegExp(`(?:dal|da) (oggi|ieri|domani|dopodomani|altro ieri|${WD_RE}) (?:fino a|fino al|al|a) (oggi|ieri|domani|dopodomani|${WD_RE})`));
  if (m) {
    const from = word(m[1], today, past);
    let to = word(m[2], today, false);
    if (from && to) {
      while (to < from) to = addDays(to, 7);
      return { from, to };
    }
  }
  // "per 3 giorni", "per due settimane" (starting today, or from the day named before)
  m = t.match(new RegExp(`per ${NUM} (giorni|giorno|settimane|settimana)`));
  if (m) {
    const n = num(m[1]) * (m[2].startsWith("sett") ? 7 : 1);
    const start = parseDates(t.replace(m[0], ""), today, opts)?.from ?? today;
    return { from: start, to: addDays(start, Math.max(1, n) - 1) };
  }
  // "il 14 e 15 novembre": two days in a row
  m = t.match(new RegExp(`(\\d{1,2}) e (\\d{1,2}) (${MONTH_RE})`));
  if (m) {
    const from = dayMonth(Number(m[1]), MONTHS[m[3]], today);
    const to = dayMonth(Number(m[2]), MONTHS[m[3]], today);
    if (from && to) return { from, to: to < from ? from : to };
  }
  // "10 dicembre", "il 14/11"
  m = t.match(new RegExp(`(?:^|\\s)${md}(?=\\s|$)`));
  if (m && (m[2] || m[3])) {
    const d = dayMonth(Number(m[1]), m[2] ? Number(m[2]) : MONTHS[m[3]], today);
    if (d) {
      const to = t.match(new RegExp(`(?:fino al|fino a|al) ${md}`));
      const end = to && (to[2] || to[3]) ? dayMonth(Number(to[1]), to[2] ? Number(to[2]) : MONTHS[to[3]], today) : null;
      return { from: d, to: end && end >= d ? end : d };
    }
  }
  // "settimana prossima", "questa settimana", "weekend"
  if (/(settimana prossima|prossima settimana)/.test(t)) {
    const s = addDays(weekStart(today), 7);
    return { from: s, to: addDays(s, 6) };
  }
  if (/(questa settimana|tutta la settimana|in settimana)/.test(t)) {
    const s = weekStart(today);
    return { from: s, to: addDays(s, 6) };
  }
  if (/(weekend|fine settimana)/.test(t)) {
    const sat = weekdayDate(5, addDays(today, -1), false);
    return { from: sat, to: addDays(sat, 1) };
  }
  // "da ieri", "fino a venerdì", "ieri", "domani", "martedì"
  m = t.match(new RegExp(`(?:fino a|fino al) (oggi|domani|dopodomani|${WD_RE})`));
  if (m) {
    const to = word(m[1], today, false);
    if (to) return { from: today, to };
  }
  m = t.match(new RegExp(`(?:^|\\s)(oggi|ieri|domani|dopodomani|altro ieri|${WD_RE})(?=\\s|$)`));
  if (m) {
    const d = word(m[1], today, past);
    if (d) {
      const since = new RegExp(`(?:^|\\s)(?:da|dal) ${m[1]}(?=\\s|$)`).test(t);
      return since && past ? { from: d, to: today } : { from: d, to: d };
    }
  }
  return null;
}

/** Minutes in "45 minuti", "1h30", "un'ora e mezza", "mezz'ora", "due ore"; null when none. */
export function parseMinutes(text: string): number | null {
  const t = normalize(text);
  let m = t.match(/(\d{1,2})\s?h\s?(\d{1,2})\b/) ?? t.match(/(\d{1,2}):(\d{2})\b/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  if (/mezz ora|mezza ora/.test(t)) return 30;
  m = t.match(new RegExp(`${NUM} (?:ore|ora) e (mezza|mezzo)`));
  if (m) return num(m[1]) * 60 + 30;
  m = t.match(new RegExp(`${NUM} (?:ore|ora) e (\\d{1,2})`));
  if (m) return num(m[1]) * 60 + Number(m[2]);
  m = t.match(new RegExp(`${NUM} ?(?:ore|ora|h)\\b`));
  if (m) return num(m[1]) * 60;
  m = t.match(/(\d{1,3}) ?(?:minuti|minuto|min|m)\b/);
  if (m) return Number(m[1]);
  return null;
}

/** "RPE 8", "8 su 10": a number from 1 to 10. */
export function parseRpe(text: string): number | null {
  const t = normalize(text);
  const m = t.match(/rpe ?(\d{1,2})/) ?? t.match(/(\d{1,2}) su 10/) ?? t.match(/sforzo (?:da )?(\d{1,2})/);
  const n = m ? Number(m[1]) : NaN;
  return n >= 1 && n <= 10 ? n : null;
}

/** "5 ore", "10 ore": hours in a week (a number followed by ore). */
export function parseHours(text: string): number | null {
  const t = normalize(text);
  const m = t.match(new RegExp(`${NUM} ?(?:ore|ora|h)\\b`));
  return m ? num(m[1]) : null;
}

export function weekdayFrom(text: string): number | null {
  const m = normalize(text).match(new RegExp(`\\b(${WD_RE})\\b`));
  return m ? WEEKDAYS[m[1]] : null;
}

export function todayIso(d = new Date()): string {
  return toIsoDate(d);
}

const itDate = new Intl.DateTimeFormat("it-IT", { weekday: "long", day: "numeric", month: "long" });
/** "giovedì 5 novembre". */
export function sayDate(iso: string): string {
  return itDate.format(new Date(`${iso}T12:00:00`));
}
/** "il 14", "l'8": the article before a day of the month. */
const il = (d: number) => (d === 8 || d === 11 || d === 18 ? "l'" : "il ");
/** "al 20", "all'8". */
const al = (d: number) => (d === 8 || d === 11 || d === 18 ? "all'" : "al ");
/** "dal 10 al 20 dicembre", "il 14 novembre", "dal 14 giugno all'8 agosto". */
export function sayRange(from: string, to: string): string {
  const a = Number(from.slice(8));
  const b = Number(to.slice(8));
  if (from === to) return `${il(a)}${a} ${monthName(from)}`;
  if (from.slice(0, 7) === to.slice(0, 7)) return `dal ${a} ${al(b)}${b} ${monthName(to)}`;
  return `dal ${a} ${monthName(from)} ${al(b)}${b} ${monthName(to)}`;
}
export function monthName(iso: string): string {
  return ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"][Number(iso.slice(5, 7)) - 1];
}
