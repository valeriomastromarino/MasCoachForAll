// Changes to the sessions already on the calendar, said the way a person says them (25 November 2026: «falla
// davvero intelligente»): «sposta la lunga a sabato» (and if Saturday is taken, swap), «scambia sabato e domenica»,
// «cancella il weekend», «accorcia quella di domani a 45 minuti», «allunga la lunga a 4 ore», «la soglia falla con 3
// ripetute», «domani fallo sui rulli». The session is the one named (kind, day, name, or the one the conversation is
// about); when more than one fits, the chat asks with buttons. Every write waits for the «sì», as before.
import { type CalendarWorkout, isBikeSession, type LibraryWorkout, onTrainer } from "@/lib/calendar";
import { addDays } from "@/lib/dates";
import { durLabel } from "@/lib/training/build/compose";
import { parseIntervalsText, sectionsFromBlocks, toIntervalsText } from "@/lib/training/build/intervalsText";
import { BAND, blocksOf, estimateTss, mid, type Section, totalSecs } from "@/lib/training/build/model";
import { parseCap } from "@/lib/training/suggest";
import { fitFor, sectionLines } from "./build";
import type { Action, ChatContext, ChatResult, ChatState, Reply, WorkoutCard } from "./context";
import { dayLabel, minsText } from "./helpers";
import { destination, pickPlanned, sayPlanned, sourcePart, upcoming } from "./refs";
import { normalize, parseDates, parseMinutes, sayDate } from "./text";

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const dayOf = (ctx: ChatContext, date: string) => lower(dayLabel(ctx, date));
const weekday = (date: string) => new Intl.DateTimeFormat("it-IT", { weekday: "long" }).format(new Date(`${date}T12:00:00`));

function ask(state: ChatState, action: Action, text: string, lines: string[] = [], extra: Partial<Reply> = {}, focus?: ChatState["focus"]): ChatResult {
  return { reply: { text, lines, chips: ["Sì", "No"], confirm: action, ...extra }, state: { ...state, pending: action, awaiting: null, focus: focus ?? state.focus } };
}
const plain = (state: ChatState, reply: Reply, focus?: ChatState["focus"]): ChatResult => ({ reply, state: { ...state, pending: null, awaiting: null, focus: focus ?? state.focus } });

/** A question with buttons: each button sends a phrase the chat understands on its own. */
export function choose(state: ChatState, text: string, choices: string[], focus: ChatState["focus"] = {}): ChatResult {
  return { reply: { text, chips: choices, choices }, state: { ...state, pending: null, awaiting: null, focus: { ...state.focus, ...focus, choices } } };
}

/** Which session: one, or a question listing them. `verb` builds the phrase of each button («Sposta quella di sabato a …»). */
function oneOf(ctx: ChatContext, state: ChatState, text: string, verb: (w: CalendarWorkout) => string, none: string): { w: CalendarWorkout; kind?: string } | ChatResult {
  const p = pickPlanned(ctx, state, sourcePart(text));
  if (p.list.length === 1) return { w: p.list[0], kind: p.kind };
  if (!p.list.length) {
    const left = upcoming(ctx);
    if (!left.length) return plain(state, { text: "Non vedo sedute in programma nei prossimi giorni.", chips: ["I prossimi giorni", "Cosa faccio oggi?"] });
    return choose(state, `${none} Quale intendi?`, left.slice(0, 4).map(verb));
  }
  // A plain «sposta l'allenamento» with only one session in the next days: that one.
  if (p.by === "none") {
    const soon = p.list.filter((w) => w.date <= addDays(ctx.today, 1));
    if (soon.length === 1 && /\b(oggi|domani|di oggi|di domani)\b/.test(normalize(text))) return { w: soon[0] };
  }
  return choose(state, "Di quale seduta parli?", p.list.slice(0, 4).map(verb));
}

const isResult = (x: unknown): x is ChatResult => !!x && typeof x === "object" && "reply" in x;

/** What the scheda says about a day: is it a training day, how long can a session be. */
function dayRules(ctx: ChatContext, date: string, w: CalendarWorkout): string[] {
  const out: string[] = [];
  const dow = (new Date(`${date}T12:00:00`).getDay() + 6) % 7;
  const days = ctx.profile?.giorni;
  if (days?.length && !days.includes(dow)) out.push(`Il ${weekday(date)} nella tua scheda è un giorno senza allenamento.`);
  const weekend = dow >= 5;
  const cap = parseCap(weekend ? ctx.profile?.durataWeekend : ctx.profile?.durataFeriali);
  if (cap && (w.secs ?? 0) / 60 > cap + 5) out.push(`Dura ${minsText(Math.round((w.secs ?? 0) / 60))}: nei ${weekend ? "weekend" : "feriali"} la tua scheda dice al massimo ${minsText(cap)}.`);
  return out;
}

const asLib = (w: CalendarWorkout): LibraryWorkout => ({ ...w, id: 0 });

/** The day's checks for a session moved to another day (readiness, illness, hard days in a row, gym). */
function fitLines(ctx: ChatContext, date: string, w: CalendarWorkout | LibraryWorkout, drop: string[]): string[] {
  const fit = fitFor(ctx, date, "id" in w && typeof w.id === "string" ? asLib(w as CalendarWorkout) : (w as LibraryWorkout), drop);
  if (fit.ok) return [];
  return [`Attenzione: ${fit.why}`];
}

// ── Move and swap ────────────────────────────────────────────────────────────────────────────────

export function sposta(ctx: ChatContext, state: ChatState, text: string): ChatResult {
  const picked = oneOf(ctx, state, text, (w) => `Sposta ${sayPlanned(w, kindWord(w))}`, "Non trovo la seduta che dici.");
  if (isResult(picked)) return picked;
  return moveTo(ctx, state, picked.w, destination(text, picked.w.date, ctx.today));
}

/** A planned session moved to a day (a swap when another session is there); no day: the question with free days. */
export function moveTo(ctx: ChatContext, state: ChatState, w: CalendarWorkout, to: string | null): ChatResult {
  const focus = { intent: "sposta", eventId: w.id, date: w.date };
  if (!to) {
    const free = [1, 2, 3, 4, 5, 6].map((i) => addDays(w.date, i)).filter((d) => !upcoming(ctx).some((x) => x.date === d)).slice(0, 3);
    const back = addDays(w.date, -1) >= ctx.today && !upcoming(ctx).some((x) => x.date === addDays(w.date, -1)) ? [addDays(w.date, -1)] : [];
    return choose(state, `A che giorno sposto ${sayPlanned(w, kindWord(w))}?`, [...back, ...free].slice(0, 4).map((d) => `A ${weekday(d)}`), focus);
  }
  if (to < ctx.today) return plain(state, { text: "Non posso spostarla nel passato: dimmi un giorno da oggi in poi.", chips: [`A ${weekday(addDays(ctx.today, 1))}`] }, focus);
  if (to === w.date) return plain(state, { text: `È già ${dayOf(ctx, to)}.`, chips: [] }, focus);
  const there = upcoming(ctx).filter((x) => x.date === to && x.id !== w.id && isBikeSession(x));
  const moved = { ...w, date: to };
  if (there.length === 1 && !there[0].race) {
    const o = there[0];
    const label = `${w.name} a ${sayDate(to)} e ${o.name} a ${sayDate(w.date)}`;
    const action: Action = { type: "swap", a: { eventId: w.id, name: w.name, from: w.date, to }, b: { eventId: o.id, name: o.name, from: o.date, to: w.date }, label };
    const lines = [...dayRules(ctx, to, w), ...dayRules(ctx, w.date, o), ...fitLines(ctx, to, moved, [w.id, o.id])];
    return ask(state, action, `${dayLabel(ctx, to)} c'è già «${o.name}». Le scambio: «${w.name}» ${dayOf(ctx, to)} e «${o.name}» ${dayOf(ctx, w.date)}. Confermi?`, lines, {}, focus);
  }
  if (there.length > 1 || there[0]?.race) return plain(state, { text: `${dayLabel(ctx, to)} hai già ${there.map((x) => `«${x.name}»`).join(" e ")}: scegli un altro giorno.`, chips: [`A ${weekday(addDays(to, 1))}`] }, focus);
  const label = `${w.name} da ${sayDate(w.date)} a ${sayDate(to)}`;
  const lines = [...dayRules(ctx, to, w), ...fitLines(ctx, to, moved, [w.id])];
  return ask(state, { type: "move", eventId: w.id, name: w.name, to, from: w.date, label }, `Sposto «${w.name}» da ${dayOf(ctx, w.date)} a ${dayOf(ctx, to)}. Confermi?`, lines, {}, { ...focus, date: to });
}

/** «la lunga», «la soglia»: the kind word for a session, to name it in buttons and replies. */
export function kindWord(w: CalendarWorkout): string | undefined {
  if ((w.secs ?? 0) >= 140 * 60) return "la lunga";
  const n = w.name.toLowerCase();
  if (/sweet|sst/.test(n)) return "lo sweet spot";
  if (/soglia|threshold|ftp/.test(n)) return "la soglia";
  if (/vo2|30\/15|40\/20/.test(n)) return "il VO2";
  if (/recover|recupero/.test(n)) return "il recupero";
  return undefined;
}

export function scambia(ctx: ChatContext, state: ChatState, text: string): ChatResult {
  const t = normalize(text);
  const list = upcoming(ctx);
  // «scambia sabato e domenica», «inverti giovedì con sabato».
  const parts = t.split(/\b(?:e|con|col|coi)\b/);
  let a: CalendarWorkout | undefined;
  let b: CalendarWorkout | undefined;
  if (parts.length >= 2) {
    const pa = pickPlanned(ctx, state, parts[0]);
    const pb = pickPlanned(ctx, state, parts.slice(1).join(" "));
    a = pa.by !== "none" && pa.list.length === 1 ? pa.list[0] : undefined;
    b = pb.by !== "none" && pb.list.length === 1 ? pb.list[0] : undefined;
    // A day without a session: it's a move.
    if (a && !b) {
      const d = parseDates(parts.slice(1).join(" "), ctx.today);
      if (d && !list.some((x) => x.date === d.from)) return sposta(ctx, state, `sposta ${parts[0]} a ${parts.slice(1).join(" ")}`);
    }
  }
  if (!a || !b || a.id === b.id) {
    const choices = list.length >= 2 ? list.slice(0, 3).flatMap((x, i) => list.slice(i + 1, i + 2).map((y) => `Scambia ${weekday(x.date)} e ${weekday(y.date)}`)) : [];
    return choose(state, list.length >= 2 ? "Quali due sedute scambio? Dimmi i giorni, per esempio «scambia sabato e domenica»." : "Per scambiare servono due sedute in programma.", choices);
  }
  const label = `${a.name} a ${sayDate(b.date)} e ${b.name} a ${sayDate(a.date)}`;
  const lines = [...dayRules(ctx, b.date, a), ...dayRules(ctx, a.date, b), ...fitLines(ctx, b.date, { ...a, date: b.date }, [a.id, b.id]), ...fitLines(ctx, a.date, { ...b, date: a.date }, [a.id, b.id])];
  return ask(state, { type: "swap", a: { eventId: a.id, name: a.name, from: a.date, to: b.date }, b: { eventId: b.id, name: b.name, from: b.date, to: a.date }, label }, `Scambio: «${a.name}» ${dayOf(ctx, b.date)} e «${b.name}» ${dayOf(ctx, a.date)}. Confermi?`, lines);
}

// ── Delete ───────────────────────────────────────────────────────────────────────────────────────

export function cancella(ctx: ChatContext, state: ChatState, text: string): ChatResult {
  const t = normalize(text);
  const span = parseDates(t, ctx.today);
  const wide = /\b(weekend|fine settimana|settimana|tutto|tutte|tutti|da \w+ a \w+|dal \d+ al \d+)\b/.test(t) && span && span.to > span.from;
  if (wide && span) {
    const items = upcoming(ctx).filter((w) => w.date >= span.from && w.date <= span.to && !w.race);
    if (!items.length) return plain(state, { text: `Non vedo sedute in programma ${span.from === span.to ? dayOf(ctx, span.from) : `da ${dayOf(ctx, span.from)} a ${dayOf(ctx, span.to)}`}.`, chips: ["I prossimi giorni"] });
    if (items.length === 1) return askRemove(ctx, state, items[0]);
    const label = `${items.length} sedute (${items.map((w) => `${w.name}, ${weekday(w.date)}`).join("; ")})`;
    return ask(state, { type: "remove_many", items: items.map((w) => ({ eventId: w.id, name: w.name, date: w.date })), label }, `Cancello da Intervals ${items.length} sedute: ${items.map((w) => `«${w.name}» ${weekday(w.date)}`).join(", ")}. Confermi?`, ["Vanno via anche dal Garmin. I giorni restano liberi: se vuoi, poi ti propongo cosa fare."]);
  }
  const picked = oneOf(ctx, state, text, (w) => `Cancella ${sayPlanned(w, kindWord(w))}`, "Non trovo la seduta da cancellare.");
  if (isResult(picked)) return picked;
  return askRemove(ctx, state, picked.w);
}

function askRemove(ctx: ChatContext, state: ChatState, w: CalendarWorkout): ChatResult {
  const label = `${w.name} (${sayDate(w.date)})`;
  return ask(state, { type: "remove", eventId: w.id, name: w.name, label }, `Cancello da Intervals «${w.name}» di ${dayOf(ctx, w.date)}. Confermi?`, [], {}, { intent: "cancella", eventId: w.id, date: w.date });
}

// ── Change a planned session: length, repeats, place ─────────────────────────────────────────────

const ftpFor = (ctx: ChatContext, indoor: boolean) => (indoor ? (ctx.data.athlete.indoorFtp ?? ctx.data.athlete.ftp) : ctx.data.athlete.ftp);

function sectionsOf(ctx: ChatContext, w: CalendarWorkout): Section[] {
  const ftp = ftpFor(ctx, onTrainer(w));
  return parseIntervalsText(w.description, ftp) ?? sectionsFromBlocks(w.blocks);
}

const EASY = 0.76;
const clone = (s: Section[]): Section[] => s.map((x) => ({ ...x, steps: x.steps.map((st) => ({ ...st, target: { ...st.target } })) }));

/**
 * The session made `target` seconds long by changing its easy parts (Z1-Z2, not repeated): the work stays the same.
 * Shorter: the longest easy steps shrink, none under 5 minutes; if that is not enough, repeats of the main set go, one at a
 * time. Longer: the longest easy step in the middle grows; a session made only of work gets a Z2 block before the cool-down.
 */
export function resize(sections: Section[], target: number): { sections: Section[]; note: string | null } | null {
  const out = clone(sections);
  let delta = target - totalSecs(out);
  if (Math.abs(delta) < 60) return { sections: out, note: null };
  const easy = out.flatMap((s, si) => (s.reps === 1 ? s.steps.map((st, i) => ({ si, i, st })) : [])).filter((x) => mid(x.st.target) < EASY && !x.st.ramp);
  if (delta > 0) {
    const middle = easy.filter((x) => x.si > 0 && x.si < out.length - 1);
    const pick = (middle.length ? middle : easy).sort((a, b) => b.st.secs - a.st.secs)[0];
    if (pick) pick.st.secs += delta;
    else out.splice(Math.max(1, out.length - 1), 0, { title: "Fondo", reps: 1, steps: [{ secs: delta, target: { ...BAND.z2 } }] });
    return { sections: out, note: null };
  }
  const MIN = 300;
  for (const x of [...easy].sort((a, b) => b.st.secs - a.st.secs)) {
    if (delta >= 0) break;
    const room = x.st.secs - MIN;
    if (room <= 0) continue;
    const cut = Math.min(room, -delta);
    x.st.secs -= cut;
    delta += cut;
  }
  let note: string | null = null;
  if (delta < -60) {
    const main = out.filter((s) => s.reps > 1).sort((a, b) => b.reps * b.steps.reduce((q, st) => q + st.secs, 0) - a.reps * a.steps.reduce((q, st) => q + st.secs, 0))[0];
    if (!main) return null;
    const one = main.steps.reduce((q, st) => q + st.secs, 0);
    let dropped = 0;
    while (delta < -60 && main.reps > 1) {
      main.reps -= 1;
      delta += one;
      dropped++;
    }
    if (delta < -60) return null;
    note = `Per starci ho tolto ${dropped === 1 ? "una ripetuta" : `${dropped} ripetute`}: restano ${main.reps}.`;
  }
  // Give back what was cut too much to the longest easy step.
  if (delta > 60) {
    const longest = out.flatMap((s) => (s.reps === 1 ? s.steps : [])).filter((st) => mid(st.target) < EASY).sort((a, b) => b.secs - a.secs)[0];
    if (longest) longest.secs += delta;
  }
  return { sections: out, note };
}

/** The main set: the repeated section with the hardest step. */
function mainSet(sections: Section[]): Section | undefined {
  return sections.filter((s) => s.reps > 1 && s.steps.some((st) => mid(st.target) >= EASY)).sort((a, b) => Math.max(...b.steps.map((x) => mid(x.target))) - Math.max(...a.steps.map((x) => mid(x.target))))[0];
}

function cardFor(ctx: ChatContext, w: CalendarWorkout, sections: Section[], indoor: boolean, notes: string[], drop: string[]): { card: WorkoutCard; secs: number; tss: number; warning?: string } {
  const ftp = ftpFor(ctx, indoor);
  const secs = totalSecs(sections);
  const tss = estimateTss(sections);
  const lib: LibraryWorkout = { id: 0, name: w.name, type: indoor ? "VirtualRide" : "Ride", secs, tss, description: toIntervalsText(sections), blocks: blocksOf(sections) };
  const fit = fitFor(ctx, w.date, lib, drop);
  const card: WorkoutCard = {
    name: w.name,
    when: sayDate(w.date),
    meta: `${durLabel(secs)} · TSS ${tss} · ${indoor ? "sui rulli" : "fuori"}${ftp ? `, FTP ${ftp} W` : ""}`,
    blocks: lib.blocks,
    steps: sectionLines(sections, ftp),
    notes,
    tag: "modificata",
    ...(fit.ok ? { ok: "Adatta alla giornata e alla settimana." } : { warning: fit.why }),
  };
  return { card, secs, tss, warning: fit.ok ? undefined : fit.why };
}

function update(ctx: ChatContext, state: ChatState, w: CalendarWorkout, sections: Section[], indoor: boolean, lead: string, notes: string[]): ChatResult {
  const { card, secs, tss } = cardFor(ctx, w, sections, indoor, notes, [w.id]);
  const changesPlace = indoor !== onTrainer(w);
  const action: Action = {
    type: "update_workout",
    eventId: w.id,
    name: w.name,
    text: toIntervalsText(sections),
    secs,
    tss,
    prev: { name: w.name, text: w.description ?? toIntervalsText(sectionsOf(ctx, w)), secs: w.secs, tss: w.tss, indoor: onTrainer(w) },
    label: `la modifica di «${w.name}»`,
    ...(changesPlace ? { indoor } : {}),
  };
  return ask(state, action, `${lead} La scrivo su Intervals?`, [], { workout: card }, { intent: "modifica", eventId: w.id, date: w.date });
}

export function durata(ctx: ChatContext, state: ChatState, text: string): ChatResult {
  const t = normalize(text);
  const picked = oneOf(ctx, state, text, (w) => `${/allung|piu lung/.test(t) ? "Allunga" : "Accorcia"} ${sayPlanned(w, kindWord(w))}`, "Non trovo la seduta da cambiare.");
  if (isResult(picked)) return picked;
  const { w } = picked;
  const longer = /\b(allung\w*|piu lung\w*|aggiungi)\b/.test(t);
  const mins = parseMinutes(t.replace(/\b(di )?(un|uno|1|due|2) (giorno|giorni)\b/, ""));
  const by = /\b(di|in meno|in piu)\b/.test(t) && !/\ba\b \d|\bad\b|\bfino a\b/.test(t) && mins !== null && !/\ba (\d|un|una|mezz)/.test(t);
  return resizeTo(ctx, state, w, (now) => (mins === null ? Math.round((now * (longer ? 1.25 : 0.75)) / 300) * 300 : by ? now + (longer ? 1 : -1) * mins * 60 : mins * 60));
}

/** A planned session brought to the length `targetOf` gives for its current length (seconds). */
export function resizeTo(ctx: ChatContext, state: ChatState, w: CalendarWorkout, targetOf: (now: number) => number, indoor?: boolean): ChatResult {
  if (w.race || !isBikeSession(w)) return plain(state, { text: "Questa non la cambio: è una gara o non è un'uscita in bici.", chips: [] });
  const sections = sectionsOf(ctx, w);
  const now = totalSecs(sections);
  if (!sections.length || now <= 0) return plain(state, { text: `Di «${w.name}» non ho i passi: cambiala dal calendario.`, chips: [] });
  const target = targetOf(now);
  if (target < 20 * 60) return plain(state, { text: "Sotto i 20 minuti non la porto: se hai così poco tempo, meglio riposo o una sgambata libera.", chips: ["Oggi riposo"] });
  if (Math.abs(target - now) < 120) return plain(state, { text: `Dura già ${durLabel(now)}.`, chips: [] });
  const r = resize(sections, target);
  if (!r) return plain(state, { text: `Non riesco a portare «${w.name}» a ${durLabel(target)} senza snaturarla. Vuoi una seduta diversa da ${minsText(Math.round(target / 60))}?`, chips: [`${capitalize(dayOf(ctx, w.date))} ${Math.round(target / 60)}' z2`] });
  const notes = [`Prima durava ${durLabel(now)}: ${target < now ? "accorciata la parte facile" : "allungata la parte in Z2"}, il lavoro resta quello.`];
  if (r.note) notes.unshift(r.note);
  notes.push(...dayRules(ctx, w.date, { ...w, secs: totalSecs(r.sections) }));
  const where = indoor ?? onTrainer(w);
  return update(ctx, state, w, r.sections, where, `Ecco «${w.name}» di ${dayOf(ctx, w.date)} da ${durLabel(totalSecs(r.sections))}${where !== onTrainer(w) ? (where ? ", sui rulli" : ", fuori") : ""}.`, notes);
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const NUMS: Record<string, number> = { una: 1, un: 1, uno: 1, due: 2, tre: 3, quattro: 4, cinque: 5, sei: 6, sette: 7, otto: 8, nove: 9, dieci: 10 };

export function ripetute(ctx: ChatContext, state: ChatState, text: string): ChatResult {
  const t = normalize(text);
  const picked = oneOf(ctx, state, text, (w) => `Cambia le ripetute ${sayPlanned(w, kindWord(w)).replace(/^\w+ /, "del")}`, "Non trovo la seduta da cambiare.");
  if (isResult(picked)) return picked;
  const { w } = picked;
  const sections = sectionsOf(ctx, w);
  const main = mainSet(sections);
  if (!main) return plain(state, { text: `«${w.name}» non ha ripetute da cambiare.`, chips: [] });
  const m = t.match(/\b(\d{1,2}|una|un|uno|due|tre|quattro|cinque|sei|sette|otto|nove|dieci) (ripetut\w*|serie|volte|intervall\w*|blocchi)\b/);
  let reps: number | null = m ? (NUMS[m[1]] ?? Number(m[1])) : null;
  if (/\b(togli|leva|meno)\b.*\b(ripetut|serie|intervall)/.test(t)) reps = main.reps - (reps ?? 1);
  else if (/\b(aggiungi|metti|una in piu|piu)\b.*\b(ripetut|serie|intervall)/.test(t) && !/\bfalla con\b/.test(t)) reps = main.reps + (reps ?? 1);
  if (reps === null || reps < 1 || reps > 20) return plain(state, { text: `Quante ripetute? Adesso sono ${main.reps}.`, chips: [`Falla con ${Math.max(1, main.reps - 1)} ripetute`, `Falla con ${main.reps + 1} ripetute`] }, { intent: "ripetute", eventId: w.id });
  if (reps === main.reps) return plain(state, { text: `Sono già ${reps}.`, chips: [] });
  const out = clone(sections);
  const target = mainSet(out)!;
  const before = main.reps;
  target.reps = reps;
  const notes = [`Ripetute da ${before} a ${reps}: la seduta passa da ${durLabel(totalSecs(sections))} a ${durLabel(totalSecs(out))}.`];
  if (reps > before + 1) notes.push("Più di una ripetuta in più alla volta è un salto grande: se l'ultima la chiudi a fatica, la prossima volta torna indietro.");
  return update(ctx, state, w, out, onTrainer(w), `Ecco «${w.name}» con ${reps} ripetute.`, notes);
}

export function luogo(ctx: ChatContext, state: ChatState, text: string): ChatResult | null {
  const t = normalize(text);
  const indoor = /\b(rulli|rullo|indoor|in casa|trainer)\b/.test(t);
  const p = pickPlanned(ctx, state, t.replace(/\b(sui|sul|ai|al) (rulli|rullo)\b|\bindoor\b|\bfuori\b|\ball aperto\b|\bin strada\b/g, " "));
  const list = p.by === "none" ? [] : p.list;
  if (list.length !== 1) return null;
  return luogoTo(ctx, state, list[0], indoor);
}

/** A planned session moved onto the trainer or outdoors: same steps, the watts follow the FTP of the place. */
export function luogoTo(ctx: ChatContext, state: ChatState, w: CalendarWorkout, indoor: boolean): ChatResult {
  if (onTrainer(w) === indoor) return plain(state, { text: `«${w.name}» di ${dayOf(ctx, w.date)} è già ${indoor ? "sui rulli" : "fuori"}.`, chips: [] });
  const sections = sectionsOf(ctx, w);
  const from = ftpFor(ctx, onTrainer(w));
  const to = ftpFor(ctx, indoor);
  const notes = [indoor ? `Sui rulli vale la FTP dei rulli${to ? ` (${to} W)` : ""}: i watt dei passi si ricalcolano da soli.` : `Fuori vale la FTP di strada${to ? ` (${to} W)` : ""}.`];
  if (from && to && from !== to) notes.push(`Stessa fatica, ${Math.abs(Math.round(((to - from) / from) * 100))}% di watt ${to < from ? "in meno" : "in più"} sui passi.`);
  if (indoor && totalSecs(sections) > 90 * 60) notes.push(`Dura ${durLabel(totalSecs(sections))}: sui rulli è lunga. Se vuoi te la accorcio («accorciala a 75 minuti»).`);
  return update(ctx, state, w, sections, indoor, `«${w.name}» di ${dayOf(ctx, w.date)} ${indoor ? "sui rulli" : "fuori"}.`, notes);
}

// ── Structure and intensity of a planned session (26 November 2026) ─────────────────────────────────

/** The hardest step of a set: the work, as opposed to the recoveries between repeats. */
const workStep = (s: Section) => s.steps.reduce((a, b) => (mid(b.target) > mid(a.target) ? b : a), s.steps[0]);

const setText = (s: Section) => `${s.reps}×${Math.round(workStep(s).secs / 60) || `${workStep(s).secs}"`}${workStep(s).secs >= 60 ? "'" : ""}`;

/** «il VO2 fallo 5x4», «lo sweet spot 3x15 invece di 2x20»: repeats and length of the work of the main set. */
export function struttura(ctx: ChatContext, state: ChatState, w: CalendarWorkout, reps: number, workSecs: number | null): ChatResult {
  const sections = sectionsOf(ctx, w);
  const main = mainSet(sections);
  if (!main) return plain(state, { text: `«${w.name}» non ha ripetute da cambiare. Se vuoi una seduta nuova dimmi per esempio «${weekday(w.date)} 5x4' VO2».`, chips: [`${capitalize(weekday(w.date))} 5x4' VO2`] }, { intent: "modifica", eventId: w.id, date: w.date });
  if (reps < 1 || reps > 20 || (workSecs !== null && (workSecs < 10 || workSecs > 60 * 60))) return plain(state, { text: "Questi numeri non mi tornano: dimmi ripetute e minuti, per esempio «5x4».", chips: [] });
  const before = setText(main);
  const out = clone(sections);
  const target = mainSet(out)!;
  target.reps = reps;
  if (workSecs !== null) workStep(target).secs = workSecs;
  const after = setText(target);
  if (before === after) return plain(state, { text: `«${w.name}» è già ${after}.`, chips: [] });
  const work = (s: Section) => s.reps * workStep(s).secs;
  const notes = [`Lavoro da ${before} a ${after}: ${Math.round(work(main) / 60)} → ${Math.round(work(target) / 60)} minuti alla stessa intensità, la seduta passa da ${durLabel(totalSecs(sections))} a ${durLabel(totalSecs(out))}.`];
  if (work(target) > work(main) * 1.25) notes.push("È un salto di lavoro grande: se le ultime ripetute le chiudi a fatica, la prossima volta torna più vicino a quello di prima.");
  if (workSecs !== null && workStep(main).secs !== workSecs && mid(workStep(main).target) >= 1.05 && workSecs > workStep(main).secs * 1.5) notes.push("Ripetute più lunghe alla stessa potenza sono molto più dure: se non tieni il ritmo, abbassa di 5-10 W.");
  return update(ctx, state, w, out, onTrainer(w), `Ecco «${w.name}» di ${dayOf(ctx, w.date)} con ${after}.`, notes);
}

/** «rendila più facile», «più dura»: one repeat less or more (or a little less power when it has only two). */
export function intensita(ctx: ChatContext, state: ChatState, w: CalendarWorkout, harder: boolean): ChatResult {
  const sections = sectionsOf(ctx, w);
  const main = mainSet(sections);
  const focus = { intent: "modifica", eventId: w.id, date: w.date };
  if (!main) {
    if (harder) return plain(state, { text: `«${w.name}» è una seduta facile: per renderla più dura posso metterci dentro qualcosa senza allungarla.`, chips: [`Inserisci 5 sprint in quella di ${weekday(w.date)}`, `Inserisci 2x10' tempo in quella di ${weekday(w.date)}`] }, focus);
    return resizeTo(ctx, state, w, (now) => Math.max(30 * 60, Math.round((now * 0.8) / 300) * 300));
  }
  const out = clone(sections);
  const target = mainSet(out)!;
  const notes: string[] = [];
  if (harder) {
    target.reps += 1;
    notes.push(`Una ripetuta in più: ${setText(main)} → ${setText(target)}, stessa intensità.`);
  } else if (main.reps > 2) {
    target.reps -= 1;
    notes.push(`Una ripetuta in meno: ${setText(main)} → ${setText(target)}, stessa intensità.`);
  } else {
    const st = workStep(target);
    st.target = { ...st.target, lo: Math.round(st.target.lo * 0.96 * 100) / 100, hi: Math.round(st.target.hi * 0.96 * 100) / 100 };
    notes.push(`Con 2 ripetute ne tolgo una sola se me lo chiedi; intanto abbasso il lavoro del 4% (da ${Math.round(mid(workStep(main).target) * 100)}% a ${Math.round(mid(st.target) * 100)}% della FTP).`);
  }
  notes.push(`La seduta passa da ${durLabel(totalSecs(sections))} a ${durLabel(totalSecs(out))}.`);
  return update(ctx, state, w, out, onTrainer(w), `Ecco «${w.name}» di ${dayOf(ctx, w.date)} ${harder ? "più impegnativa" : "più facile"}.`, notes);
}

/** «sposta tutto di un giorno», «rimanda tutto», «anticipa tutto di 2 giorni»: every session ahead shifted together. */
export function spostaTutto(ctx: ChatContext, state: ChatState, text: string): ChatResult {
  const t = normalize(text);
  const span = /\b(da|dal)\s+(oggi|domani|lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica|\d{1,2})\b.*\b(in poi|in avanti)\b/.test(t) ? parseDates(t.replace(/\bin (poi|avanti)\b/, ""), ctx.today) : null;
  const items = upcoming(ctx).filter((w) => !w.race && (!span || w.date >= span.from));
  if (!items.length) return plain(state, { text: "Non vedo sedute in programma da spostare.", chips: ["I prossimi giorni"] });
  const shift = t.match(/\bdi (un|uno|1|due|2|tre|3) (giorno|giorni)\b/);
  const n = (shift ? ({ un: 1, uno: 1, "1": 1, due: 2, "2": 2, tre: 3, "3": 3 } as Record<string, number>)[shift[1]] : 1) * (/\banticip\w*|\bindietro\b|\bprima\b/.test(t) ? -1 : 1);
  if (items.some((w) => addDays(w.date, n) < ctx.today)) return plain(state, { text: "Così una seduta finirebbe nel passato: dimmi da che giorno, per esempio «sposta tutto da martedì in poi di un giorno».", chips: [] });
  const moves = items.map((w) => ({ eventId: w.id, name: w.name, from: w.date, to: addDays(w.date, n) }));
  const lines = moves.map((m) => `«${m.name}»: ${weekday(m.from)} → ${weekday(m.to)}`);
  const off = moves.filter((m) => {
    const dow = (new Date(`${m.to}T12:00:00`).getDay() + 6) % 7;
    return ctx.profile?.giorni?.length ? !ctx.profile.giorni.includes(dow) : false;
  });
  if (off.length) lines.push(`Attenzione: ${off.map((m) => weekday(m.to)).join(" e ")} nella tua scheda ${off.length === 1 ? "è un giorno" : "sono giorni"} senza allenamento.`);
  const hardDays = moves.filter((m) => /vo2|soglia|sweet|threshold|sst|30\/15|40\/20/i.test(m.name)).map((m) => m.to).sort();
  if (hardDays.some((d, i) => i > 0 && addDays(hardDays[i - 1], 1) === d)) lines.push("Attenzione: due sedute di qualità finiscono in giorni di fila.");
  const label = `${moves.length} sedute ${n > 0 ? "avanti" : "indietro"} di ${Math.abs(n) === 1 ? "un giorno" : `${Math.abs(n)} giorni`}`;
  return ask(state, { type: "move_many", items: moves, label }, `Sposto ${label}. Confermi?`, lines);
}

/** Which change of a planned session the words ask for, if any. */
export function editKind(text: string): "sposta" | "scambia" | "cancella" | "durata" | "ripetute" | "luogo" | null {
  const t = normalize(text);
  if (/\b(scambia\w*|inverti\w*|scambiale|scambiali)\b/.test(t)) return "scambia";
  if (/\b(sposta\w*|rimand\w*|anticip\w*|posticip\w*)\b/.test(t) && !/\b(se|e se)\b.*\?/.test(text)) return "sposta";
  if (/\b(cancella\w*|elimina\w*|togli\w*|rimuovi\w*|leva\w*)\b/.test(t) && !/\b(ripetut\w*|serie|sprint\w*|intervall\w*|riscaldamento|minuti|richieste|vincoli)\b/.test(t)) return "cancella";
  if (/\b(\d{1,2}|una|due|tre|quattro|cinque|sei|sette|otto) (ripetut\w*|serie|intervall\w*|blocchi)\b|\b(togli|leva|aggiungi) (una|un) (ripetut|serie|intervall)/.test(t) && /\b(falla|fallo|fai|metti|mettine|togli|leva|aggiungi|con)\b/.test(t)) return "ripetute";
  if (/\b(accorcia\w*|allunga\w*|piu corta|piu corto|piu lunga|piu lungo|riduci\w*)\b/.test(t)) return "durata";
  if (/\b(falla|fallo|farla|farlo|mettila|mettilo|portala|portalo|la faccio|lo faccio|spostala|facciamola)\b.*\b(rulli|rullo|indoor|fuori|all aperto|in strada)\b|\b(rulli|indoor|fuori)\b.*\b(domani|dopodomani|lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica)\b/.test(t)) return "luogo";
  return null;
}
