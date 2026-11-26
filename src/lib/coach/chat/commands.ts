// The reader of commands (26 November 2026). Before the old rules, a message is read as a person reads it: what it asks
// (a question or a change), which session it is about (today's proposal, or a planned one named by kind, day or
// pronoun), and the details (minutes, «5x4», easier or harder, rulli or fuori, another day). «Invece di…», «anziché…»,
// «al posto di…» name what is being replaced, so «fuori invece che sui rulli» means outdoors and «sabato invece che
// domenica» means a move from Sunday to Saturday. «Una soglia venerdì» (indefinite) is a new session; «la soglia di
// venerdì» (definite) is the one on the calendar. Questions never change anything: they get the answer about the session.
// Built from the 90 phrases run on real data, where the chat got 40 wrong.
import { type CalendarWorkout, isBikeSession } from "@/lib/calendar";
import * as W from "./actions";
import { buildChat } from "./build";
import type { ChatContext, ChatResult, ChatState } from "./context";
import * as E from "./edits";
import { suggestFor } from "./helpers";
import { classFrom } from "./intents";
import * as M from "./more";
import { pickPlanned, sourcePart, upcoming } from "./refs";
import { normalize, parseDates, parseMinutes } from "./text";

/** «invece della z2», «anziché sui rulli», «al posto di 2x20», «invece di 90 minuti», «invece che domenica». */
const INSTEAD = /\b(?:invece (?:che|di|del|della|dello|dei|delle|degli|dell)|anziche|al posto (?:di|del|della|dello|dei|dell))\s+((?:(?:i|il|la|lo|le|l|sui|sul|ai|al|un|una|quello|quella)\s+)?(?:sweet spot|zona 2|\d{1,2} ?x ?\d{1,2}|\d+(?: (?:minuti|min|ore|ora|h))?|[a-z0-9]+))/;
const DAY = /\b(oggi|domani|dopodomani|lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica)\b/;
const IMPERATIVE = /\b(fammi|fammela|fammelo|fai|falla|fallo|mettimi|metti|mettila|mettilo|mettine|aggiungi\w*|inserisci\w*|programm\w*|segna\w*|portala|portalo|rendila|rendilo|trasforma\w*|cambia|cambiami|cambiala|cambialo|sostituisci\w*|voglio|vorrei|preferisco|facciamo|diventare|diventa|fare)\b/;
const QUESTION_START = /^(come|cosa|che|quale|quali|quanto|quanta|quanti|quante|quando|dove|perche|posso|potrei|devo|dovrei|e meglio|va bene|ha senso|conviene|sono|c e|spiegami|spiega|dimmi)\b/;
const EASIER = /\b(piu facil\w*|meno dur\w*|piu legger\w*|piu soft|piu tranquill\w*|meno impegnativ\w*|meno intens\w*)\b/;
const HARDER = /\b(piu dur\w*|piu intens\w*|piu impegnativ\w*|piu tost\w*|piu cattiv\w*)\b/;
const NEW_KIND = /\b(un|una|un altra|un altro)\s+(soglia|z2|recupero|vo2|vo2max|sweet spot|sweetspot|sprint|tempo|fondo|seduta di \w+|ripetute|anaerobico|uscita facile|sgambata)\b/;
const LONG_RIDE = /\b(un|una)\s+(lungo|lunga|giro|uscita|uscita lunga)\b/;

type Frame = {
  t: string;
  /** The message without the «invece di …» part. */
  main: string;
  instead: string | null;
  question: boolean;
  imperative: boolean;
};

function frame(text: string, raw: string): Frame {
  const t = normalize(text);
  const m = t.match(INSTEAD);
  const instead = m ? m[1].replace(/^(i|il|la|lo|le|l|sui|sul|ai|al|un|una|quello|quella)\s+/, "") : null;
  const main = m ? `${t.slice(0, m.index)} ${t.slice((m.index ?? 0) + m[0].length)}`.replace(/\s+/g, " ").trim() : t;
  return { t, main, instead, question: raw.includes("?") || QUESTION_START.test(t), imperative: IMPERATIVE.test(main) };
}

const placeOf = (s: string): boolean | null => {
  const noTrainer = /\b(niente|no|senza|non (sui|sul|ai)?) ?(rulli|rullo|indoor)\b/.test(s);
  return /\b(rulli|rullo|indoor|in casa|trainer)\b/.test(s) && !noTrainer ? true : /\b(fuori|all aperto|in strada|outdoor)\b/.test(s) || noTrainer ? false : null;
};
const dayOf = (s: string, today: string): string | null => {
  if (!DAY.test(s) && !/\b\d{1,2} (gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\b|\bil \d{1,2}\b/.test(s)) return null;
  const span = parseDates(s, today);
  return span && span.from >= today ? span.from : null;
};

/** The planned session the words name (by kind, day, words of its name or pronoun), one or a question with buttons. */
function target(ctx: ChatContext, state: ChatState, source: string): { w: CalendarWorkout } | { many: CalendarWorkout[] } | null {
  const p = pickPlanned(ctx, state, source);
  if (p.by === "none" || !p.list.length) return null;
  const bike = p.list.filter(isBikeSession);
  if (bike.length === 1) return { w: bike[0] };
  return bike.length ? { many: bike } : null;
}

const which = (state: ChatState, list: CalendarWorkout[], verb: string) =>
  E.choose(state, "Di quale seduta parli?", list.slice(0, 4).map((w) => `${verb} ${w.name} di ${new Intl.DateTimeFormat("it-IT", { weekday: "long" }).format(new Date(`${w.date}T12:00:00`))}`));

/** Today's pick changed: another class, and the current one left out when the athlete said no to it. */
function cambiaOggi(ctx: ChatContext, state: ChatState, phrase: string, avoidCurrent: boolean): ChatResult {
  if (!avoidCurrent) return W.cambia(ctx, state, phrase);
  const shown = state.options[state.index];
  const s = shown ? null : suggestFor(ctx, ctx.today);
  const current = shown?.workout.id ?? (s?.kind === "workout" ? s.main.workout.id : null);
  return W.cambia(ctx, state, phrase, current !== null ? [current] : []);
}

/** What the reader understood and did, or null to leave the message to the rules. */
export function command(text: string, raw: string, ctx: ChatContext, state: ChatState): ChatResult | null {
  if (state.draft) return null;
  const f = frame(text, raw);
  const { t, main } = f;

  // «ok», «sì», «dai» with nothing to confirm: not a «non ho capito».
  if (/^(ok|okay|ok ok|va bene|vabbe|va be|dai|bene|perfetto|capito|d accordo|si|sisi|certo|ottimo|ok grazie)$/.test(t) && !state.pending) {
    if (state.focus?.choices?.length) return E.choose(state, "Dimmi quale: tocca uno dei pulsanti.", state.focus.choices);
    if (state.options.length) return { reply: { text: "Bene. Se vuoi la scrivo su Intervals, oppure te ne propongo un'altra.", chips: ["Programma", "Cambia", "Perché?"] }, state };
    return { reply: { text: "Ok. Dimmi pure: posso cambiare le sedute, spostarle, spiegarle, o risponderti su allenamento e recupero.", chips: ["Cosa faccio oggi?", "Cosa ho questa settimana?", "Cosa posso chiederti?"] }, state };
  }

  // ── The week ──
  if (/\b(alleggerisc\w*|legger\w*|di scarico|scaricare)\b/.test(t) && /\bsettiman\w*\b|\balleggerisc\w*\b/.test(t) && !/\b(cos e|cosa e|a cosa serve|perche|quando|ogni quanto|come funziona|come si fa)\b/.test(t) && (f.imperative || /\b(alleggerisc\w*|rendi\w*)\b/.test(t))) {
    return M.leggera(ctx, state, t);
  }
  if (/\b(sposta|rimanda|anticipa|posticipa)\w*\b.*\btutt[oaie]\b|\btutt[oaie]\b.*\b(sposta|rimanda|anticipa|posticipa)\w*\b/.test(t) && /\bdi (un|uno|1|due|2|tre|3) (giorno|giorni)\b|\b(rimand\w*|posticip\w*|anticip\w*|avanti|indietro)\b/.test(t)) {
    return E.spostaTutto(ctx, state, t);
  }
  if (/^(programm\w*|pianific\w*|organizzami|preparami|scrivimi|mettimi)\b.*\bsettiman\w*\b/.test(t)) return W.programmaSettimana(ctx, state);

  // ── Races ──
  if (/\b(gara|granfondo|gran fondo|mediofondo|medio fondo|crono\w*|criterium)\b/.test(t) && !/^(come|cosa|che|quanto|quando|perche)\b/.test(t) && !/\b(ho fatto|era|e andata|giorno della gara|prima della gara|dopo la gara|preparare|preparo|prepararmi)\b/.test(t) && (!f.question || /\b(ho|faccio|c e) (una |la |un )?(gara|granfondo|gran fondo|mediofondo|crono\w*)\b/.test(t))) {
    const r = M.gara(ctx, state, t);
    if (r) return r;
  }

  // ── Weather ──
  if (/\b(che tempo fa|che tempo|meteo|previsioni|piovera|pioggia|vento|ventoso|temperatura|fara freddo|fara caldo|nevichera|piove)\b/.test(t) && f.question && (DAY.test(t) || /\b(che tempo fa|meteo|previsioni|weekend|fine settimana)\b/.test(t)) &&!/\b(se piove|se c e|se fa|cosa mi metto|come mi vesto|come si|con il vento|col vento|controvento)\b/.test(t)) {
    return M.meteo(ctx, state, t);
  }

  // ── Numbers of the rides ──
  if (/\b(calorie|kcal|kj|kilojoule|chilojoule|bruciat\w*)\b/.test(t)) return M.calorie(ctx, state, t);
  if (/\b(sono migliorat\w*|sto miglioran\w*|sto crescendo|sono cresciut\w*|progressi|miglioramenti|vado piu forte|sono piu forte|sto andando piu forte|vado meglio|sto andando meglio|sono peggiorat\w*|sto peggiorando)\b/.test(t) && !/\bcome (faccio a )?(miglior|andare)/.test(t)) {
    return M.progressi(ctx, state);
  }
  if (/\b(ho fatto bene|e andata bene|ho esagerato|ho fatto troppo|ho fatto poco|era giust\w*|ho spinto troppo|sono andato troppo forte|ho tirato troppo)\b/.test(t)) {
    const r = M.giudizio(ctx, state, t);
    if (r) return r;
  }

  // ── Gym and bike ──
  if (/\b(palestra|pesi)\b/.test(t) && dayOf(t, ctx.today) && !/\b(ho fatto|fatto)\b/.test(t) && (f.question || /\b(posso|va bene|ok|faccio|vorrei|metto)\b/.test(t))) return M.palestra(ctx, state, t);

  // ── A group ride ──
  if (/\b(con gli amici|con amici|in gruppo|col gruppo|con il gruppo|con la squadra|uscita sociale|giro (di|con|da))\b/.test(t) && parseMinutes(t) && dayOf(t, ctx.today) && !f.question) {
    const r = M.giroLibero(ctx, state, t);
    if (r) return r;
  }

  const day = dayOf(main, ctx.today);
  const insteadDay = f.instead ? dayOf(f.instead, ctx.today) : null;
  const todayOnly = (!day || day === ctx.today) && !insteadDay;
  const plannedToday = upcoming(ctx).some((w) => w.date === ctx.today);

  // ── Today's proposal (no session on the calendar today) ──
  if (todayOnly && !plannedToday && !f.question) {
    const cls = classFrom(main);
    const sayNo = /\b(niente|no|non mi va|non voglio|basta)\b/.test(main);
    if (/\bsolo (un )?recupero\b|\boggi recupero\b/.test(t)) return cambiaOggi(ctx, state, "oggi voglio recupero", true);
    if (/\boggi\b/.test(t) && cls && (f.imperative || sayNo || /\bsolo\b/.test(t))) return cambiaOggi(ctx, state, main.replace(/\bniente \w+/, ""), sayNo || !!f.instead);
    if (/\boggi\b/.test(t) && (/\b(piu cort\w*|piu brev\w*|accorcia\w*|meno tempo)\b/.test(t) || (parseMinutes(t) && placeOf(t) !== null))) return W.cambia(ctx, state, t);
  }

  // ── A planned session: the questions about it ──
  const aspect: M.Aspect | null = /\bquanto dura\b|\bdurata\b|\bquanto tempo (dura|ci vuole|ci metto)\b/.test(t)
    ? "dura"
    : /\b(quanti watt|che watt|a che watt|a quanti watt|che potenza|quale potenza|a che potenza|quanto devo spingere|che ritmo)\b/.test(t)
      ? "watt"
      : /\b(quanti carbo\w*|quanto mangio|quanto devo mangiare|quanti gel|quanti grammi|cosa mangio durante)\b/.test(t)
        ? "carbo"
        : /\b(spiegami|spiega|com e fatt[oa]|com e strutturat\w*|cosa c e dentro|in cosa consiste|cosa prevede|descrivi\w*)\b/.test(t)
          ? "spiega"
          : null;
  // «quanti watt in z2?» is about the zones; «quanti watt nel VO2?» about a session.
  // «quanto mangio in una lunga?» (indefinite) is a general question, not the long ride on the calendar.
  const general = /\b(un|una|uno)\s+(lung[ao]|soglia|vo2|z2|sweet spot|recupero|uscita|seduta|allenamento|ripetut\w*|gara|granfondo)\b/.test(main);
  const aboutSession = !general && (aspect !== "watt" || DAY.test(main) || /\b(nel|nella|nello|della|del|dello|di quell[oa]|per il|per la)\b/.test(main));
  if (aspect && aboutSession) {
    const tg = target(ctx, state, sourcePart(main));
    if (tg && "w" in tg) return M.infoSeduta(ctx, state, tg.w, aspect);
    if (tg && "many" in tg) return which(state, tg.many, aspect === "dura" ? "Quanto dura" : aspect === "watt" ? "I watt di" : aspect === "carbo" ? "I carbo per" : "Spiegami");
  }
  // A question never changes anything («domenica posso fare 4 ore invece di 3?» is answered by the rules).
  if (f.question) return null;

  // ── «sabato invece che domenica»: a move ──
  if (insteadDay && day && insteadDay !== day) {
    const kinds = main.replace(DAY, " ");
    const tg = target(ctx, state, `${kinds} ${f.instead}`) ?? target(ctx, state, f.instead!);
    if (tg && "w" in tg && tg.w.date === insteadDay) return E.moveTo(ctx, state, tg.w, day);
    const there = upcoming(ctx).filter((w) => w.date === insteadDay);
    if (there.length === 1) return E.moveTo(ctx, state, there[0], day);
  }

  // ── A new session on another day: «mettimi una soglia venerdì», «venerdì fammi un recupero» ──
  if (NEW_KIND.test(main) && day && day !== ctx.today && (f.imperative || /\b(aggiungi|metti)\b/.test(t))) {
    return buildChat("new", ctx, { ...state, draft: null }, main);
  }

  // ── A planned session: the changes ──
  const indefiniteLong = LONG_RIDE.test(main);
  if (NEW_KIND.test(main)) return null;
  // «più facile» is how, not which: without it «facile» would name the easy ride.
  const source = sourcePart(main).replace(EASIER, " ").replace(HARDER, " ").replace(/\b(qualcosa|qualcos altro|con qualcosa di)\b/g, " ");
  let tg = target(ctx, state, source);
  if (!tg && indefiniteLong && day) {
    const there = upcoming(ctx).filter((w) => w.date === day);
    if (there.length === 1) tg = { w: there[0] };
  }
  if (!tg) return null;
  const easier = EASIER.test(main);
  const harder = HARDER.test(main);
  const mins = parseMinutes(main.replace(/\b\d{1,2} ?x ?\d{1,2}\b/g, " "));
  const structure = main.match(/\b(\d{1,2}) ?x ?(\d{1,2})\b/) ?? main.match(/\b(\d{1,2}) (?:ripetute|serie|volte) da (\d{1,2})\b/);
  const place = placeOf(main);
  const asks = f.imperative || !!f.instead || indefiniteLong;
  if (!asks && !easier && !harder) return null;
  if ("many" in tg) return which(state, tg.many, easier ? "Rendi più facile" : harder ? "Rendi più dura" : "Cambia");
  const w = tg.w;
  if (easier || harder) return E.intensita(ctx, state, w, harder && !easier);
  if (structure) {
    const reps = Number(structure[1]);
    const len = Number(structure[2]);
    // «il VO2 4x4» names the session: only a different structure is a change.
    if (!new RegExp(`\\b${reps} ?x ?${len}\\b`).test(normalize(w.name)) || f.instead) return E.struttura(ctx, state, w, reps, len * 60);
  }
  if (mins && mins >= 20 && (asks || /\blung[oa] di\b/.test(main))) return E.resizeTo(ctx, state, w, () => mins * 60, place ?? undefined);
  if (place !== null && asks) return E.luogoTo(ctx, state, w, place);
  return null;
}
