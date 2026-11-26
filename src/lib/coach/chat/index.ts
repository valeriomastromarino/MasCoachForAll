// The chat of the internal engine: a message in, a reply out, and the writes it asks for. No model, no network, no cost.
// The message is first cleaned like a person reads it (lexicon.ts: «ke», «cm», typos), then, in this order: the buttons of
// a question and the follow-ups of the conversation («e domani?», «cosa vuol dire?», «A sabato»), the changes to the
// sessions on the calendar (edits.ts), the session builder (build.ts), the rules (intents.ts), the coach's notions
// (knowledge.ts) and, for what is left, the nearest known phrase (examples.ts + similar.ts) — asking with buttons when
// it is not sure. Answers come from the app's own data (answers.ts, smart.ts); writes wait for a «sì» (actions.ts).
import * as A from "./answers";
import * as W from "./actions";
import { buildChat, buildKind, buildNewFromDraft, saveInLibrary } from "./build";
import { type ChatContext, type ChatResult, type ChatState, emptyState, type Reply } from "./context";
import * as E from "./edits";
import { examples, phraseFor } from "./examples";
import { findTerm, GLOSSARY } from "./glossary";
import { detectIntent, HELP, type Intent, type IntentType, ruleWords } from "./intents";
import { type Notion, NOTIONS, notionsFor } from "./knowledge";
import { clean, learnWords } from "./lexicon";
import { destination } from "./refs";
import * as S from "./smart";
import { normalize, parseDates, parseMinutes } from "./text";

export { emptyState } from "./context";
export type { Action, ChatContext, ChatResult, ChatState, Reply, TodayOverrides, UndoInfo } from "./context";

let primed = false;
/** Teaches the typo fixer the words of the rules, the notions and the examples (once). */
function prime() {
  if (primed) return;
  primed = true;
  learnWords(ruleWords());
  for (const n of NOTIONS) learnWords(`${n.re.source} ${n.title}`);
  for (const g of GLOSSARY) learnWords(g.keys.join(" "));
  examples();
}

const tokens = (s: string) => new Set(normalize(s).split(" ").filter((w) => w.length > 2));

/** The help phrases closest to a message that wasn't understood. */
export function suggestPhrases(text: string, n = 3): string[] {
  const mine = tokens(text);
  const scored = HELP.flatMap((g) => g.examples).map((ex) => {
    const t = tokens(ex);
    let hit = 0;
    for (const w of mine) if (t.has(w)) hit++;
    return { ex, score: hit / Math.max(1, Math.min(mine.size, t.size)) };
  });
  return scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score).slice(0, n).map((s) => s.ex);
}

const AWAITING_INTENT: Record<NonNullable<ChatState["awaiting"]>["intent"], IntentType> = { vita_ferie: "vita_ferie", vita_malattia: "vita_malattia", vita_infortunio: "vita_infortunio" };

function unknown(text: string, state: ChatState): ChatResult {
  const near = suggestPhrases(text);
  const reply: Reply = {
    text: near.length ? "Non ho capito bene. Forse intendevi:" : "Non ho capito. Parlo dei tuoi dati e del piano, e di allenamento in generale: salita, alimentazione, recupero, posizione in bici…",
    lines: near.length ? [] : ["Scrivi «cosa posso chiederti?» per gli esempi."],
    chips: near.length ? near : ["Cosa faccio oggi?", "Come sto?", "Cosa posso chiederti?"],
    choices: near.length ? near : undefined,
  };
  return { reply, state: { ...state, pending: null } };
}

const SAVE_LIBRARY = /^(si )?salva(la|lo)?( anche)? (in|nella) libreria\b/;
const NEW_FROM_DRAFT = /^si una nuova\b/;

/**
 * Messages the rules answer even when the written coach is on: building and changing sessions is done by the engine
 * (lib/training/build), at no cost, and a draft waiting for its changes stays with the rules.
 */
export function rulesFirst(text: string, state: ChatState, today: string): boolean {
  const t = normalize(text);
  if (SAVE_LIBRARY.test(t) || (NEW_FROM_DRAFT.test(t) && !!state.draft)) return true;
  if (state.draft && state.pending && /^(si|no|ok|annulla)\b/.test(t)) return true;
  if (E.editKind(text) !== null) return true;
  return buildKind(text, state, today) !== null;
}

// ── Reading the conversation ──────────────────────────────────────────────────────────────────────

const TIME = /\b(oggi|domani|dopodomani|ieri|stanotte|stasera|stamattina|adesso|lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica|weekend|questa settimana|prossima settimana|settimana prossima|dal \d{1,2}|il \d{1,2}|\d{1,2} (gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre))\b/;
const ADVICE = /\b(come|cosa faccio|che faccio|devo|dovrei|posso|potrei|conviene|meglio|serve|servono|consigli\w*|e utile|aiuta|funziona|ha senso|vale la pena|e normale|e vero|quanto|quanta|quanti|quante|quale|quali|da (giorni|settimane|una settimana|tempo|mesi))\b/;
/** «e se piove domenica?», «se fa freddo sabato»: the session that day, moved onto the trainer. */
const BAD_WEATHER = /\b(se piove|se dovesse piovere|se c e brutto|se fa brutto|se fa freddo|se nevica|con la pioggia|se c e vento)\b/;
/** Rules that a notion answers better when the message is a general question (no day, an advice word). */
const OVERRIDABLE = new Set<IntentType>(["unknown", "vita_ferie", "vita_malattia", "vita_infortunio", "sensazione", "posso", "carbo", "consiglio", "piano", "forma", "recupero", "distribuzione", "stato", "settimana_piano", "libreria", "what_if", "test_cp", "ftp", "sonno", "perche", "cambia", "oggi", "pref_luogo", "durata_check", "record", "mese", "profilo", "zone"]);
const ORDINAL: Record<string, number> = { prima: 0, primo: 0, "1": 0, uno: 0, seconda: 1, secondo: 1, "2": 1, due: 1, terza: 2, terzo: 2, "3": 2, tre: 2, quarta: 3, quarto: 3, "4": 3, quattro: 3 };

function notionReply(n: Notion, ctx: ChatContext, state: ChatState): ChatResult {
  const r = n.say(ctx);
  const chips = [...(r.chips ?? []), "Cosa faccio oggi?"].filter((c, i, a) => a.indexOf(c) === i).slice(0, 3);
  return { reply: { text: r.text, lines: r.lines, chips }, state: { ...state, pending: null, awaiting: null, focus: { intent: "notion", term: n.id } } };
}

/** The notion a general question asks for, if it is clearly one of them (or a question between two). */
function knowledge(t: string, raw: string, ctx: ChatContext, state: ChatState, intent: Intent): ChatResult | null {
  const found = notionsFor(t);
  if (!found.length) return null;
  if (!OVERRIDABLE.has(intent.type)) return null;
  const idx = examples();
  const scored = found.map((n) => ({ n, s: idx.score(t, `n:${n.id}`) })).sort((a, b) => b.s - a.s);
  const best = scored[0];
  if (intent.type !== "unknown") {
    if (TIME.test(t) && intent.type !== "consiglio") return null;
    const mine = idx.score(t, `i:${intent.type}`);
    const asks = ADVICE.test(t) || raw.includes("?");
    // «da una settimana», «da giorni»: not today's feeling but something that lasts, which is a coach's question.
    const lasting = /\bda (giorni|settimane|una settimana|tempo|mesi|un mese)\b/.test(t);
    if (!lasting && !(asks && best.s >= mine - 0.1) && !(best.s > mine + 0.05)) return null;
  }
  const second = scored[1];
  if (second && best.s < 0.25 && best.s - second.s < 0.04) {
    const choices = scored.slice(0, 3).map((x) => x.n.ex[0]);
    return E.choose(state, "Ti rispondo volentieri: di quale di questi parli?", choices, { intent: "notion" });
  }
  return notionReply(best.n, ctx, state);
}

/** «e domani?», «cosa vuol dire?», «perché?», «A sabato», «la seconda»: what the last answer left open. */
function followUp(text: string, t: string, ctx: ChatContext, state: ChatState): ChatResult | null {
  const f = state.focus;
  if (!f) return null;
  const words = t.split(" ").length;
  // A button of the last question, or «la seconda».
  if (f.choices?.length) {
    const m = t.match(/^(?:la |il |l )?(prima|primo|seconda|secondo|terza|terzo|quarta|quarto|1|2|3|4|uno|due|tre|quattro)(?: opzione| proposta)?$/);
    if (m && f.choices[ORDINAL[m[1]]]) return route(clean(f.choices[ORDINAL[m[1]]]), ctx, { ...state, focus: { ...f, choices: undefined } }, f.choices[ORDINAL[m[1]]]);
  }
  // «cosa vuol dire?», «cioè?»: the word of the last answer.
  if (/^(cosa vuol dire|che vuol dire|cosa significa|che significa|cioe|in che senso|spiegami( meglio)?|spiega( meglio)?|ovvero|cos e|che cos e|non ho capito)\??$/.test(t)) {
    const term = f.term ? GLOSSARY.find((g) => g.keys.includes(f.term!)) : undefined;
    if (term) return A.glossario(ctx, state, term.keys[0]);
    const notion = f.term ? NOTIONS.find((n) => n.id === f.term) : undefined;
    if (notion) return notionReply(notion, ctx, state);
  }
  // «perché?» about the session the conversation is on.
  if (/^(perche|come mai|e perche|perche questa|perche quella)\??$/.test(t) && f.eventId) {
    const r = S.perSeduta(ctx, state, "perche questa");
    if (r) return r;
  }
  // The day for a session being moved: «A sabato», «sabato», «al giorno dopo».
  if (f.intent === "sposta" && f.eventId && words <= 5 && !E.editKind(text)) {
    const p = ctx.planned.find((w) => w.id === f.eventId);
    if (p && destination(t, p.date, ctx.today)) return E.sposta(ctx, state, `sposta quella ${t}`);
  }
  // «e domani?», «e sabato?», «e ieri?»: the same question for another day.
  const m = t.match(/^(?:e|ed|e invece|invece|e per|e per la notte di|e la notte di|e quella di|e il|e la|mentre)\s+(.+?)$/);
  if (m && words <= 6 && m[1].split(" ").length <= 4 && !/^(se|come|cosa|perche|quanto|quando|dove|chi|non|io|tu|poi)\b/.test(m[1])) {
    const back = f.intent === "notte" || f.intent === "sonno" || f.intent === "ultima_uscita" || /\b(ieri|scorso|scorsa|fa)\b/.test(m[1]);
    const span = back ? (parseDates(m[1], ctx.today, { past: true }) ?? parseDates(m[1], ctx.today)) : (parseDates(m[1], ctx.today) ?? parseDates(m[1], ctx.today, { past: true }));
    if (span) {
      const day = span.from;
      const same: Intent = { type: (f.intent as IntentType) ?? "oggi", text: t, raw: text };
      if (f.intent === "notte" || f.intent === "sonno") return S.notte(ctx, state, m[1]);
      if (f.intent === "durata" && parseMinutes(t) === null) return S.sedutaDi(ctx, state, m[1]);
      if (f.intent && ["oggi", "seduta_di", "pronto_per", "durata_check", "posso", "carbo", "ultima_uscita", "mese"].includes(f.intent)) return rules(m[1], ctx, state, same);
      if (day > ctx.today) return S.sedutaDi(ctx, state, m[1]);
      if (day < ctx.today) return /\b(notte|dormito|hrv)\b/.test(t) ? S.notte(ctx, state, m[1]) : A.ultimaUscita(ctx, state, m[1]);
      return A.oggi(ctx, state, m[1]);
    }
  }
  return null;
}

function runEdit(kind: NonNullable<ReturnType<typeof E.editKind>>, ctx: ChatContext, state: ChatState, text: string): ChatResult | null {
  switch (kind) {
    case "sposta":
      return E.sposta(ctx, state, text);
    case "scambia":
      return E.scambia(ctx, state, text);
    case "cancella":
      return E.cancella(ctx, state, text);
    case "durata":
      return E.durata(ctx, state, text);
    case "ripetute":
      return E.ripetute(ctx, state, text);
    case "luogo":
      return E.luogo(ctx, state, text);
  }
}

/** What a label of the examples does: an intent, a change, a notion or a word of the glossary. */
function dispatch(label: string, text: string, ctx: ChatContext, state: ChatState): ChatResult | null {
  const id = label.slice(2);
  if (label.startsWith("n:")) {
    const n = NOTIONS.find((x) => x.id === id);
    return n ? notionReply(n, ctx, state) : null;
  }
  if (label.startsWith("g:")) return A.glossario(ctx, state, id);
  if (id.startsWith("edit_")) return runEdit(id.slice(5) as NonNullable<ReturnType<typeof E.editKind>>, ctx, state, text);
  return rules(text, ctx, state, { type: id as IntentType, text: normalize(text), raw: text });
}

/** A message the rules did not read: the nearest known phrase, or a question with the closest ones. */
function nearest(text: string, ctx: ChatContext, state: ChatState): ChatResult {
  const t = normalize(text);
  const near = examples().nearest(t, 4, (l) => !["i:si", "i:saluto", "i:programma", "i:rpe", "i:registra_carbo", "i:pref_ore", "i:pref_ramp", "i:pref_giorno", "i:vita_ferie", "i:vita_malattia", "i:vita_infortunio", "i:vita_guarito"].includes(l) && !l.startsWith("i:edit_"));
  const top = near[0];
  if (top && top.score >= 0.5) {
    const r = dispatch(top.label, text, ctx, state);
    if (r) return r;
  }
  const options = near.filter((x) => x.score >= 0.2).slice(0, 3);
  if (options.length) {
    const choices = options.map((x) => phraseFor(x.label)).filter((c, i, a) => a.indexOf(c) === i);
    return E.choose(state, "Non sono sicuro di aver capito. Intendevi una di queste?", choices, { intent: "unknown" });
  }
  return unknown(text, state);
}

/** After the answer: what the conversation is now about, for the next message. */
function remember(r: ChatResult, before: ChatState, intent: string | null): ChatResult {
  if (!r.state) return r;
  const changed = r.state.focus !== before.focus;
  const words = normalize([r.reply.text, ...(r.reply.lines ?? [])].join(" "));
  const term = findTerm(words)?.keys[0];
  if (changed) return r.state.focus?.term || !term ? r : { ...r, state: { ...r.state, focus: { ...r.state.focus, term } } };
  if (intent === "si" || intent === "no" || intent === "annulla") return r;
  return { ...r, state: { ...r.state, focus: { intent: intent ?? undefined, term } } };
}

export function chat(text: string, ctx: ChatContext, state: ChatState = emptyState()): ChatResult {
  prime();
  const st: ChatState = { ...emptyState(), ...state };
  // Shorthand and repeated letters are always safe to fix; a typo fix is tried only when the message as written says
  // nothing to the chat (a real word close to another, «salva» and «salve», must not change meaning).
  const safe = clean(text, false);
  const fixed = clean(text, true);
  if (fixed === safe || understood(safe, ctx, st)) return route(safe, ctx, st, text);
  return route(fixed, ctx, st, text);
}

/** Whether a message reaches anything but the «didn't understand» answer. */
function understood(text: string, ctx: ChatContext, st: ChatState): boolean {
  const t = normalize(text);
  if (SAVE_LIBRARY.test(t) || NEW_FROM_DRAFT.test(t)) return true;
  if (detectIntent(text, st).type !== "unknown") return true;
  if (E.editKind(text) || buildKind(text, st, ctx.today)) return true;
  if (followUp(text, t, ctx, st)) return true;
  return notionsFor(t).length > 0;
}

function route(text: string, ctx: ChatContext, st: ChatState, raw: string): ChatResult {
  const t = normalize(text);
  const intent = detectIntent(text, st);
  // These start with «sì» or read like other intents, so they are checked first.
  if (SAVE_LIBRARY.test(t)) return saveInLibrary(st);
  if (NEW_FROM_DRAFT.test(t)) {
    const r = buildNewFromDraft(ctx, st);
    if (r) return r;
  }
  const answer = intent.type === "si" || intent.type === "no" || intent.type === "annulla";
  if (!answer) {
    const follow = followUp(text, t, ctx, st);
    if (follow) return remember(follow, st, null);
    // A session being built takes its changes first («spostala a sabato» is about the draft).
    const kind = buildKind(text, st, ctx.today);
    if (kind && st.draft) return buildChat(kind, ctx, st, text);
    const edit = E.editKind(text);
    if (edit && !(edit === "luogo" && (kind === "new" || kind === "insert"))) {
      const r = runEdit(edit, ctx, st, text);
      if (r) return remember(r, st, `edit_${edit}`);
    }
    if (kind) return buildChat(kind, ctx, st, text);
    if (BAD_WEATHER.test(t) && TIME.test(t)) {
      const r = E.luogo(ctx, st, `${t.replace(BAD_WEATHER, "")} falla sui rulli`);
      if (r) return remember(r, st, "edit_luogo");
    }
    const known = knowledge(t, raw, ctx, st, intent);
    if (known) return remember(known, st, "notion");
  }
  if (intent.type === "unknown" && !(st.awaiting && parseDates(text, ctx.today, { past: st.awaiting.intent !== "vita_ferie" }))) {
    const r = nearest(text, ctx, st);
    return remember(st.draft ? { ...r, state: { ...r.state, draft: null } } : r, st, null);
  }
  const r = rules(text, ctx, st, intent);
  // Anything else closes the session being built.
  return remember(st.draft ? { ...r, state: { ...r.state, draft: null } } : r, st, intent.type);
}

function rules(text: string, ctx: ChatContext, state: ChatState, first: Intent): ChatResult {
  let intent = first;

  // A question left open ("dimmi le date"): the next message with dates answers it.
  if (state.awaiting && !state.pending && (intent.type === "unknown" || intent.type === "oggi" || intent.type === "settimana_piano" || intent.type === "pref_minuti")) {
    const span = parseDates(text, ctx.today, { past: state.awaiting.intent !== "vita_ferie" });
    if (span) intent = { ...intent, type: AWAITING_INTENT[state.awaiting.intent] };
  }

  switch (intent.type) {
    case "si": {
      const action = state.pending;
      if (!action) return { reply: { text: "Non c'è nulla in sospeso da confermare.", chips: ["Cosa faccio oggi?"] }, state };
      const built = action.type === "create_workout" || action.type === "update_workout" ? { name: action.name, text: action.text, indoor: action.type === "create_workout" ? action.indoor : /\bindoor\b/i.test(action.name) } : (state.lastBuilt ?? null);
      return { reply: { text: "Lo scrivo…" }, state: { ...state, pending: null, draft: null, lastBuilt: built }, run: action };
    }
    case "no":
      return { reply: { text: "Va bene, non scrivo nulla.", chips: ["Cosa faccio oggi?", "Cambia"] }, state: { ...state, pending: null } };
    case "annulla": {
      if (state.pending) return { reply: { text: "Ho lasciato stare: non scrivo nulla.", chips: ["Cosa faccio oggi?"] }, state: { ...state, pending: null } };
      if (!state.undo) return { reply: { text: "Non c'è nulla da annullare.", chips: ["Cosa faccio oggi?"] }, state };
      return { reply: { text: `Annullo: ${state.undo.label}…` }, state: { ...state, undo: null }, undo: state.undo };
    }
    case "aiuto":
      return A.aiuto(state);
    case "saluto":
      return A.saluto(ctx, state);
    case "grazie":
      return { reply: { text: "Figurati. Se ti serve altro, sono qui.", chips: ["Cosa faccio oggi?", "Fammi il punto"] }, state };
    case "briefing":
      return A.briefing(ctx, state);
    case "consiglio":
      return A.consiglio(ctx, state);
    case "stato":
      return A.stato(ctx, state);
    case "recupero":
      return A.recupero(ctx, state);
    case "forma":
      return A.forma(ctx, state);
    case "oggi":
      return A.oggi(ctx, state, text);
    case "perche":
      return (/\b(domani|dopodomani|lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica|lunga|soglia|vo2|sweet spot)\b/.test(normalize(text)) ? S.perSeduta(ctx, state, text) : null) ?? A.perche(ctx, state, text);
    case "settimana_piano":
      return A.settimanaPiano(ctx, state);
    case "settimana_bilancio":
      return A.settimanaBilancio(ctx, state);
    case "piano":
      return A.piano(ctx, state);
    case "what_if":
      return A.whatIf(ctx, state, text);
    case "posso":
      return A.posso(ctx, state, text);
    case "ultima_uscita":
      return A.ultimaUscita(ctx, state, text);
    case "record":
      return A.record(ctx, state);
    case "ftp":
      return A.ftp(ctx, state);
    case "zone":
      return A.zone(ctx, state, text);
    case "profilo":
      return A.profilo(ctx, state);
    case "libreria":
      return A.libreria(ctx, state, text);
    case "carbo":
      return A.carbo(ctx, state);
    case "confronto":
      return A.confronto(ctx, state);
    case "mese":
      return A.mese(ctx, state, text);
    case "distribuzione":
      return A.distribuzione(ctx, state);
    case "test_cp":
      return A.testCp(ctx, state);
    case "glossario":
      return A.glossario(ctx, state, text);
    case "cambia":
      return W.cambia(ctx, state, text);
    case "programma":
      return W.programma(ctx, state);
    case "programma_settimana":
      return W.programmaSettimana(ctx, state);
    case "sposta":
      return W.sposta(ctx, state, text);
    case "cancella":
      return W.cancella(ctx, state, text);
    case "vita_malattia":
      return W.vitaMalattia(ctx, state, text);
    case "vita_infortunio":
      return W.vitaInfortunio(ctx, state, text);
    case "vita_ferie":
      return W.vitaFerie(ctx, state, text);
    case "vita_guarito":
      return W.vitaGuarito(ctx, state);
    case "reset_oggi":
      return W.resetOggi(ctx, state);
    case "sensazione":
      return W.sensazione(ctx, state, text);
    case "sensazione_buona":
      return W.sensazioneBuona(ctx, state);
    case "riposo_oggi":
      return W.riposoOggi(ctx, state);
    case "pref_luogo":
      return W.prefLuogo(ctx, state, text);
    case "pref_minuti": {
      const r = W.prefMinuti(ctx, state, text);
      const mins = parseMinutes(text);
      const pick = r.state.options[0];
      // Nothing in the library is that short: the builder makes one of the minutes asked, of the same kind.
      if (mins && pick && pick.mins > mins + 5 && mins >= 20) {
        const word = pick.cls === "sweetspot" ? "sweet spot" : pick.cls === "soglia" || pick.cls === "vo2" || pick.cls === "tempo" || pick.cls === "sprint" ? pick.cls : "z2";
        const built = buildChat("new", ctx, { ...state, draft: null }, `oggi ${mins} minuti ${word}`);
        built.reply.text = `In libreria non c'è nulla da ${mins} minuti adatto a oggi: te ne ho costruita una. ${built.reply.text}`;
        return { ...built, overrides: r.overrides };
      }
      return r;
    }
    case "dolore": {
      const r = W.dolore(ctx, state, text);
      // The coach's notes on that part of the body, under the change of today.
      const n = notionsFor(normalize(text)).find((x) => ["ginocchio", "schiena", "collo_spalle", "mani_piedi", "sella_dolore", "dolore_muscolare"].includes(x.id));
      if (n) r.reply.lines = [...(r.reply.lines ?? []), ...n.say(ctx).lines.slice(0, 3)];
      return r;
    }
    case "pref_giorno":
      return W.prefGiorno(ctx, state, text);
    case "pref_ore":
      return W.prefOre(ctx, state, text);
    case "pref_ramp":
      return W.prefRamp(ctx, state, text);
    case "pref_picco":
      return W.prefPicco(ctx, state, text);
    case "rpe":
      return W.rpe(ctx, state, text);
    case "registra_carbo":
      return W.registraCarbo(ctx, state, text);
    case "notte":
      return S.notte(ctx, state, text);
    case "sonno":
      return S.sonno(ctx, state, text);
    case "hrv_settimana":
      return S.hrvSettimana(ctx, state);
    case "fc_riposo":
      return S.fcRiposo(ctx, state);
    case "perche_colore":
      return S.perColore(ctx, state, text);
    case "seduta_di":
      return S.sedutaDi(ctx, state, text);
    case "pronto_per":
      return S.prontoPer(ctx, state, text) ?? A.stato(ctx, state);
    case "perche_seduta":
      return S.perSeduta(ctx, state, text) ?? A.perche(ctx, state, text);
    case "durata_check":
      return S.durataCheck(ctx, state, text) ?? A.posso(ctx, state, text);
    case "altro_sport":
      return S.altroSport(ctx, state, text);
    case "voglia":
      return S.voglia(ctx, state);
    case "volume":
      return S.volume(ctx, state);
    default:
      return unknown(text, state);
  }
}
