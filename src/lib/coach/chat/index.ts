// The chat of the internal engine: a message in, a reply out, and the writes it asks for. It reads the athlete's Italian with
// rules (intents.ts), answers from the app's own data (answers.ts) and changes things only after a "sì" (actions.ts).
import * as A from "./answers";
import * as W from "./actions";
import { type ChatContext, type ChatResult, type ChatState, emptyState, type Reply } from "./context";
import { detectIntent, HELP, type IntentType } from "./intents";
import { normalize, parseDates } from "./text";

export { emptyState } from "./context";
export type { Action, ChatContext, ChatResult, ChatState, Reply, TodayOverrides, UndoInfo } from "./context";

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
    text: near.length ? "Non ho capito bene. Forse intendevi:" : "Non ho capito. Parlo dei tuoi dati e del piano: allenamento di oggi, recupero, settimana, stagione, ferie, malattia, infortuni.",
    lines: near.length ? [] : ["Scrivi «cosa posso chiederti?» per gli esempi."],
    chips: near.length ? near : ["Cosa faccio oggi?", "Come sto?", "Cosa posso chiederti?"],
  };
  return { reply, state: { ...state, pending: null } };
}

export function chat(text: string, ctx: ChatContext, state: ChatState = emptyState()): ChatResult {
  let intent = detectIntent(text, state);

  // A question left open ("dimmi le date"): the next message with dates answers it.
  if (state.awaiting && !state.pending && (intent.type === "unknown" || intent.type === "oggi" || intent.type === "settimana_piano" || intent.type === "pref_minuti")) {
    const span = parseDates(text, ctx.today, { past: state.awaiting.intent !== "vita_ferie" });
    if (span) intent = { ...intent, type: AWAITING_INTENT[state.awaiting.intent] };
  }

  switch (intent.type) {
    case "si": {
      const action = state.pending;
      if (!action) return { reply: { text: "Non c'è nulla in sospeso da confermare.", chips: ["Cosa faccio oggi?"] }, state };
      return { reply: { text: "Lo scrivo…" }, state: { ...state, pending: null }, run: action };
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
      return A.perche(ctx, state, text);
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
    case "dolore":
      return W.dolore(ctx, state, text);
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
    case "pref_minuti":
      return W.prefMinuti(ctx, state, text);
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
    default:
      return unknown(text, state);
  }
}
