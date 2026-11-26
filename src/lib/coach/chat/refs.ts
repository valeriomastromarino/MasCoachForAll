// Which planned session a message talks about: «la lunga», «la soglia di giovedì», «quella di sabato», «spostala» (the
// one the conversation is about), or a word of its name. And where it should go: «a venerdì», «di un giorno», «al giorno
// dopo», «rimanda» (the day after). Pure, so every phrase can be tested.
import { type CalendarWorkout, isBikeSession, onTrainer } from "@/lib/calendar";
import { addDays } from "@/lib/dates";
import { classifyWorkout, type WorkoutClass } from "@/lib/training/classify";
import type { ChatContext, ChatState } from "./context";
import { normalize, parseDates } from "./text";

/** What a word says about a session, tested on the session itself. */
type Kind = { re: RegExp; test: (w: CalendarWorkout, cls: WorkoutClass) => boolean; say: string };

const nameHas = (w: CalendarWorkout, re: RegExp) => re.test(w.name.toLowerCase());

export const KINDS: Kind[] = [
  { re: /\b(lunga|lungo|uscita lunga|fondo lungo|lunghissima|granfondo)\b/, test: (w) => (w.secs ?? 0) >= 140 * 60 || nameHas(w, /lung|long|granfondo|endurance [3-9] ?(h|ore)\b/), say: "la lunga" },
  { re: /\b(soglia|threshold|ftp|over ?under)\b/, test: (w, c) => c === "soglia" || nameHas(w, /soglia|threshold|ftp|over/), say: "la soglia" },
  { re: /\b(sweet ?spot|ss|sst)\b/, test: (w, c) => c === "sweetspot" || nameHas(w, /sweet|sst/), say: "lo sweet spot" },
  { re: /\b(vo2|vo 2|vo2max|30 ?15|40 ?20)\b/, test: (w, c) => c === "vo2" || nameHas(w, /vo2|30\/15|40\/20/), say: "il VO2" },
  { re: /\b(anaerobic\w*|lattato)\b/, test: (w, c) => c === "anaerobico", say: "l'anaerobico" },
  { re: /\b(sprint|scatti|volate)\b/, test: (w, c) => c === "sprint" || nameHas(w, /sprint|scatt/), say: "gli sprint" },
  { re: /\b(recupero|scarico|rigenerante|defaticante)\b/, test: (w, c) => c === "recupero" || nameHas(w, /recover|recupero/), say: "il recupero" },
  { re: /\b(z2|zona 2|endurance|fondo|facile|la facile)\b/, test: (w, c) => c === "z2" && (w.secs ?? 0) < 140 * 60, say: "la Z2" },
  { re: /\btempo\b(?! per)/, test: (w, c) => c === "tempo", say: "il tempo" },
  { re: /\b(gara|granfondo|corsa)\b/, test: (w) => w.race === true, say: "la gara" },
  { re: /\b(pesi|palestra)\b/, test: (w) => w.type === "WeightTraining", say: "i pesi" },
  { re: /\bpilates\b/, test: (w) => w.type === "Pilates", say: "il pilates" },
  { re: /\b(rulli|rullo|indoor)\b/, test: (w) => onTrainer(w), say: "quella sui rulli" },
];

/** «la», «quella», «spostala»: the message points at what the conversation is about. */
const POINTS = /\b(la|lo|quella|quello|questa|questo|essa|stessa)\b|(la|lo)$|\b\w+(la|lo|le|li)\b/;
const GENERIC = new Set(["indoor", "outdoor", "ride", "zone", "zona", "with", "min", "mins", "hour", "ore", "the", "and", "per", "con", "della", "delle", "nel", "nella", "workout", "allenamento", "seduta", "giro"]);

export type Picked = { list: CalendarWorkout[]; by: "kind" | "day" | "name" | "focus" | "none"; kind?: string };

/** The planned sessions from today on, in order (bike sessions; strength and Pilates only when named). */
export function upcoming(ctx: ChatContext, all = false): CalendarWorkout[] {
  return ctx.planned.filter((w) => w.date >= ctx.today && (all || isBikeSession(w))).sort((a, b) => a.date.localeCompare(b.date));
}

const clsOf = (w: CalendarWorkout) => classifyWorkout({ ...w, id: 0 }).cls;

/**
 * The planned sessions a phrase names. `source` is the part of the message that names the session (without the day it
 * should go to). Kind words come first («la lunga»), then a day («quella di sabato»), then words of the name, then the
 * session the conversation is about.
 */
export function pickPlanned(ctx: ChatContext, state: ChatState, source: string): Picked {
  const t = normalize(source);
  const named = KINDS.filter((k) => k.re.test(t) && !(k.say === "il tempo" && /(ho|poco|non ho) tempo/.test(t)));
  const strength = named.some((k) => k.say === "i pesi" || k.say === "il pilates");
  let list = upcoming(ctx, strength);
  const span = parseDates(t, ctx.today);
  const days = span ? list.filter((w) => w.date >= span.from && w.date <= span.to) : null;
  if (named.length) {
    const kinds = named.filter((k) => k.say !== "quella sui rulli" || named.length === 1);
    const hit = list.filter((w) => kinds.some((k) => k.test(w, clsOf(w))));
    const both = days ? hit.filter((w) => days.includes(w)) : hit;
    if (both.length) return { list: both, by: "kind", kind: kinds[0].say };
    if (hit.length && !days) return { list: hit, by: "kind", kind: kinds[0].say };
    if (days?.length) return { list: days, by: "day" };
    // «la lunga» when no session is long enough to be called so: the longest of the next days, if it is a real ride.
    if (kinds.length === 1 && kinds[0].say === "la lunga") {
      const longest = list.filter(isBikeSession).sort((a, b) => (b.secs ?? 0) - (a.secs ?? 0))[0];
      if (longest && (longest.secs ?? 0) >= 75 * 60) return { list: [longest], by: "kind", kind: "la lunga" };
    }
    return { list: [], by: "kind", kind: kinds[0].say };
  }
  if (days) return { list: days, by: "day" };
  const words = t.split(" ").filter((w) => w.length >= 4 && !GENERIC.has(w));
  const byName = list.filter((w) => {
    const name = normalize(w.name);
    return words.some((x) => new RegExp(`\\b${x}`).test(name));
  });
  if (byName.length && byName.length < list.length) return { list: byName, by: "name" };
  const focus = state.focus?.eventId ? list.find((w) => w.id === state.focus!.eventId) : undefined;
  if (focus && POINTS.test(t)) return { list: [focus], by: "focus" };
  list = list.filter((w) => w.date >= ctx.today);
  return { list, by: "none" };
}

/** Where a session should go: an absolute day, or a shift («di un giorno», «rimanda»). null when the message doesn't say. */
export function destination(text: string, from: string, today: string): string | null {
  const t = normalize(text);
  const shift = t.match(/\bdi (un|uno|1|due|2|tre|3|quattro|4) (giorno|giorni)\b/);
  const n = shift ? ({ un: 1, uno: 1, "1": 1, due: 2, "2": 2, tre: 3, "3": 3, quattro: 4, "4": 4 } as Record<string, number>)[shift[1]] : null;
  const back = /\b(anticip\w*|prima)\b/.test(t) && !/\bdopo\b/.test(t);
  if (n) return addDays(from, back ? -n : n);
  if (/\b(al )?giorno (dopo|successivo)\b/.test(t)) return addDays(from, 1);
  if (/\b(al )?giorno prima\b/.test(t)) return addDays(from, -1);
  // The day after the last «a / al / per / su»: «sposta la lunga di domenica a sabato».
  const m = t.match(/.*\b(?:a|al|all|ad|per|su|verso|entro|in)\b\s+(.+)$/);
  const dest = m ? parseDates(m[1], today) : null;
  if (dest) return dest.from;
  if (/\b(rimand\w*|posticip\w*)\b/.test(t)) return addDays(from, 1);
  return null;
}

/** The message without the part that says where the session goes, so «a sabato» doesn't pick Saturday's session. */
export function sourcePart(text: string): string {
  const t = normalize(text);
  const m = t.match(/^(.*)\b(?:a|al|all|ad|per|su|verso)\b\s+(oggi|domani|dopodomani|lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica|\d{1,2}\b.*|il \d.*|la settimana.*|settimana.*|dopo.*|prima.*)$/);
  return (m ? m[1] : t).replace(/\bdi (un|uno|1|due|2|tre|3) (giorno|giorni)\b/, "").trim();
}

/** How a session is named in a reply: «la soglia di giovedì» or «Sweet Spot 3x12 di sabato». */
export function sayPlanned(w: CalendarWorkout, kind?: string): string {
  const d = new Intl.DateTimeFormat("it-IT", { weekday: "long" }).format(new Date(`${w.date}T12:00:00`));
  return `${kind ?? `«${w.name}»`} di ${d}`;
}
