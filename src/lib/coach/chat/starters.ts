// The empty chat (26 November 2026, the athlete's choice «2 · Del momento» among three previews):
// the coach opens with the point of the day and offers the four questions that matter today, each with the reason it is
// there, taken from the data the app already has (readiness, the night, the sessions on the calendar, the last ride, an
// illness still open). Pure: every question is a phrase the chat understands (tested in starters.test.ts).
import { type CalendarWorkout, isBikeSession } from "@/lib/calendar";
import { addDays } from "@/lib/dates";
import { classifyWorkout } from "@/lib/training/classify";
import type { ChatContext } from "./context";
import { hoursText, minsText, n0 } from "./helpers";
import { KINDS, upcoming } from "./refs";

export type StartTone = "warn" | "good" | "night" | "session" | "food" | "ride" | "plan";
export type StartQuestion = { ask: string; why: string; tone: StartTone };
export type StartPage = { hello: string; questions: StartQuestion[]; more: string[] };

const weekday = (date: string) => new Intl.DateTimeFormat("it-IT", { weekday: "long" }).format(new Date(`${date}T12:00:00`));
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
/** «domani», «dopodomani», «giovedì». */
const whenWord = (ctx: ChatContext, date: string) => (date === ctx.today ? "oggi" : date === addDays(ctx.today, 1) ? "domani" : date === addDays(ctx.today, 2) ? "dopodomani" : weekday(date));
/** «di domani», «di dopodomani», «di giovedì» (the chat reads them all). */
const ofDay = (ctx: ChatContext, date: string) => `di ${whenWord(ctx, date)}`;
/** «la soglia», «la lunga», «il VO2»: how the chat names a session by kind (refs.ts), or none. */
const kindOf = (w: CalendarWorkout) => {
  const cls = classifyWorkout({ ...w, id: 0 }).cls;
  return KINDS.slice(0, 10).find((k) => k.test(w, cls))?.say;
};
const isLong = (w: CalendarWorkout) => (w.secs ?? 0) >= 140 * 60;

/** The questions for the empty chat, best first. `hour` only picks the greeting. */
export function startPage(ctx: ChatContext, hour = 9): StartPage {
  const { data } = ctx;
  const r = data.status.readiness;
  const qs: StartQuestion[] = [];
  const add = (q: StartQuestion) => {
    if (qs.length < 4 && !qs.some((x) => x.ask === q.ask)) qs.push(q);
  };

  // An illness or injury still open: the first thing to tell the coach is that it is over.
  const open = ctx.life.find((e) => (e.category === "SICK" || e.category === "INJURED") && e.from <= ctx.today && e.to >= ctx.today);
  if (open) add({ ask: "Sto meglio", why: `${open.category === "SICK" ? "Malattia" : "Infortunio"} sul calendario fino a ${whenWord(ctx, open.to)}`, tone: "plan" });

  // The colour of the day, when it is not green.
  if (r.level === "giallo" || r.level === "rosso") add({ ask: `Perché sono ${r.level}?`, why: r.headline, tone: "warn" });

  // Last night, when the watch sent it.
  const rec = data.recovery.find((x) => x.date === ctx.today);
  const sl = data.sleep.find((x) => x.date === ctx.today);
  if (rec?.rmssd != null || sl?.hours != null) {
    const low = rec?.rmssd != null && rec.hrvRange != null && Math.round(rec.rmssd) < Math.round(rec.hrvRange[0]);
    const why = rec?.anomaly ? "Notte anomala: HRV e FC a riposo fuori dal tuo normale" : [sl?.hours != null ? `${hoursText(sl.hours * 3600)} di sonno` : null, low ? "HRV sotto il tuo range" : null].filter(Boolean).join(", ");
    add({ ask: "Com'è andata stanotte?", why: why || "Sonno, HRV e FC a riposo", tone: "night" });
  }

  // The next session of quality in the next three days: is the athlete ready for it?
  const next = upcoming(ctx).filter((w) => w.date <= addDays(ctx.today, 3) && !w.race);
  const quality = next.find((w) => w.date > ctx.today && classifyWorkout({ ...w, id: 0 }).quality && kindOf(w));
  if (quality) {
    const sameKind = next.filter((w) => kindOf(w) === kindOf(quality)).length === 1;
    if (sameKind) add({ ask: `Sono recuperato per ${kindOf(quality)} ${ofDay(ctx, quality.date)}?`, why: `«${quality.name}», ${minsText(Math.round((quality.secs ?? 0) / 60))}`, tone: "session" });
  }

  // The long ride of the week: what to eat.
  const long = upcoming(ctx).filter((w) => w.date <= addDays(ctx.today, 6) && isLong(w) && !w.race);
  if (long.length === 1) add({ ask: `Quanti carboidrati per la lunga ${ofDay(ctx, long[0].date)}?`, why: `${minsText(Math.round((long[0].secs ?? 0) / 60))}, ${whenWord(ctx, long[0].date)}`, tone: "food" });

  // The last ride, if it was yesterday or today.
  const last = [...data.activities].filter((a) => a.date >= addDays(ctx.today, -1) && a.date <= ctx.today && a.movingTime > 0).sort((a, b) => b.date.localeCompare(a.date))[0];
  if (last) add({ ask: `Com'è andata l'uscita di ${last.date === ctx.today ? "oggi" : "ieri"}?`, why: `«${last.name}», ${minsText(Math.round(last.movingTime / 60))}${last.tss ? `, TSS ${n0(last.tss)}` : ""}`, tone: "ride" });

  // Whatever is left: the day and the week.
  add({ ask: "Cosa faccio oggi?", why: r.level === "grigio" ? lower(r.advice) : `Prontezza ${r.level}: ${lower(r.headline)}`, tone: r.level === "verde" ? "good" : "warn" });
  add({ ask: "Come va la settimana?", why: "Carico e qualità fatti finora", tone: "plan" });

  const greet = hour < 13 ? "Buongiorno" : hour < 18 ? "Buon pomeriggio" : "Buonasera";
  const parts = [`${greet}. Oggi sei ${r.level}: ${lower(r.headline)}.`];
  const soon = upcoming(ctx).filter((w) => w.date > ctx.today && w.date <= addDays(ctx.today, 6) && isBikeSession(w) && (isLong(w) || classifyWorkout({ ...w, id: 0 }).quality || w.race));
  const said = soon.slice(0, 2).map((w) => `${whenWord(ctx, w.date)} ${w.race ? "la gara" : (kindOf(w) ?? `«${w.name}»`)}`);
  if (said.length) parts.push(`In calendario: ${said.join(", ")}.`);
  if (open) parts.push(`${open.category === "SICK" ? "Per la malattia" : "Per l'infortunio"} tengo le sedute leggere.`);

  const more = ["Come va la settimana?", "Sono migliorato?", "I miei record", "Cosa posso chiederti?"].filter((m) => !qs.some((q) => q.ask === m)).slice(0, 4);
  return { hello: parts.join(" "), questions: qs, more };
}
