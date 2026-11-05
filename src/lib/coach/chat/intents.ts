// What the athlete is asking, read with rules (no model, no network). The order of the rules is the priority:
// the strong signals (illness, injury, holidays, "sto meglio") come before the general questions.
import type { WorkoutClass } from "@/lib/training/suggest";
import type { ChatState } from "./context";
import { findTerm } from "./glossary";
import { normalize } from "./text";

export type IntentType =
  | "si" | "no" | "annulla" | "aiuto" | "saluto" | "grazie" | "briefing" | "consiglio"
  | "stato" | "recupero" | "forma" | "oggi" | "perche" | "cambia" | "programma" | "programma_settimana" | "sposta" | "cancella"
  | "settimana_piano" | "settimana_bilancio" | "piano" | "what_if" | "posso"
  | "ultima_uscita" | "record" | "ftp" | "zone" | "profilo" | "libreria" | "carbo" | "confronto" | "mese" | "distribuzione" | "test_cp" | "glossario"
  | "reset_oggi" | "vita_malattia" | "vita_infortunio" | "vita_ferie" | "vita_guarito" | "dolore"
  | "pref_giorno" | "pref_ore" | "pref_ramp" | "pref_picco" | "pref_luogo" | "pref_minuti" | "riposo_oggi"
  | "sensazione" | "sensazione_buona" | "rpe" | "registra_carbo" | "unknown";

export type Intent = { type: IntentType; text: string; raw: string };

const BODY = "ginocchio|ginocchia|caviglia|schiena|lombare|spalla|anca|polso|gomito|piede|tallone|polpaccio|coscia|femorale|quadricipite|collo|mano|clavicola|costola|costole|achille|tendine|inguine|cervicale|stinco|rotula|ischio";
export const BODY_RE = new RegExp(`\\b(${BODY})\\b`);

/** "vo2", "soglia", "sweet spot"... → the engine's workout class. */
export function classFrom(t: string): WorkoutClass | null {
  if (/\b(recupero|rigenerante)\b/.test(t)) return "recupero";
  if (/\b(sweet spot|sweetspot|ss)\b/.test(t)) return "sweetspot";
  if (/\b(vo2|vo 2|vo2max)\b/.test(t)) return "vo2";
  if (/\b(soglia|threshold|ftp)\b/.test(t) && !/\bftp\b.*\b(alta|bassa|giusta|cambia)/.test(t)) return "soglia";
  if (/\b(anaerobico|anaerobica|anaerobic)\b/.test(t)) return "anaerobico";
  if (/\b(sprint|scatti|neuromuscolare)\b/.test(t)) return "sprint";
  if (/\b(z2|zona 2|fondo|endurance)\b/.test(t)) return "z2";
  if (/\btempo\b/.test(t) && !/(ho|poco|tanto|molto|abbastanza|non ho|piu|meno|di) tempo/.test(t)) return "tempo";
  return null;
}

type Rule = [IntentType, RegExp | ((t: string) => boolean)];
const test = (rule: RegExp | ((t: string) => boolean), t: string) => (typeof rule === "function" ? rule(t) : rule.test(t));

const RULES: Rule[] = [
  ["annulla", /^(annulla|torna indietro|disfa|togli l ultim|cancella l ultim|rimetti come prima)|annulla (l ultima|quello che hai fatto|tutto)/],
  ["aiuto", /(cosa (posso|puoi|sai)|che cosa (posso|puoi|sai)|aiuto|^help|comandi|come funzion|esempi|cosa sai fare|cosa mi puoi)/],
  ["glossario", (t) => /(cos e|che cos e|cosa significa|cosa vuol dire|che vuol dire|spiegami|spiega|come si calcola|a cosa serve|differenza tra|cosa sono|cosa e)/.test(t) && findTerm(t) !== null],
  ["vita_guarito", /(sto meglio|sono guarit|guarit|non ho piu la febbre|finita la febbre|febbre (passata|finita)|torno ad allenarmi|posso riprendere|infortunio (finito|passato)|va meglio|sono tornato in forma|ho finito la malattia)/],
  ["vita_infortunio", /(infortun|mi sono fatto male|sono caduto|sono caduta|caduta|frattura|distorsion|strappo|contrattura|tendinite|lesione)/],
  ["vita_malattia", /(malat|febbre|influenza|raffreddor|covid|gastro|bronchite|polmonite|tosse forte|sono a letto|mal di gola forte)/],
  ["vita_ferie", /(ferie|vacanz|viaggio|trasferta|sono via|parto|partenza|vado (a|in|via)|sono fuori|stop (dal|da|per)|pausa (dal|da|per)|non mi alleno (dal|da|per|fino)|non potro allenarmi)/],
  ["dolore", /(mi fa male|ho male|male a|male al|dolore|fastidio|indolenzit|mi duole)/],
  ["reset_oggi", /(azzera|ricomincia|resetta|togli (le|i) (richieste|vincoli)|come prima|dimentica quello che ti ho detto)/],
  ["riposo_oggi", /(oggi non (mi )?alleno|oggi riposo|salto oggi|oggi salto|riposo oggi|non riesco ad allenarmi oggi|oggi niente|non posso allenarmi oggi|oggi non posso|oggi mi riposo)/],
  ["what_if", /(e se |cosa succede se|cosa cambia se|se salto|se mi fermo|se non mi alleno|se perdo|se salto)/],
  ["posso", /^(posso|potrei|conviene|mi conviene|e il caso|me la sento|e troppo|sarebbe ok|e una buona idea|faccio bene|dovrei)/],
  ["perche", /^(perche|come mai|per quale motivo|che motivo|spiegami (la|il) (scelta|motivo)|motiva)/],
  ["pref_picco", (t) => /(picco|forma al massimo|forma massima)/.test(t) && /(dal|da |a |nel|per|sposta|metti|vorrei|voglio|cambia|settiman)/.test(t) && !/(quanto manca|come arrivo|a che punto)/.test(t)],
  ["pref_giorno", /(non posso (allenarmi )?(il |di |nei |la )?(lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica)|(il |di )?(lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica) (non posso|sono occupat|non riesco|sono impegnat|riposo)|posso (anche )?allenarmi (il |di |la )?(lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica)|(libero|disponibile) (il |di |la )?(lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica))/],
  ["pref_ramp", (t) => (/(ramp|carico|crescita|progressione)/.test(t) && /(piu |meno |prudente|bilanciato|aggressiv|alz|abbass|aument|dimin|riduci)/.test(t) && !/(com e|come|quanto|valore|e il mio|cos e)/.test(t)) || /(voglio|vorrei|facciamo|andiamo).*(piu|meno) (forte|prudente|cauto|piano|aggressiv)/.test(t)],
  ["pref_ore", (t) => /\d+ ?(ore|h)\b|(una|due|tre|quattro|cinque|sei|sette|otto|nove|dieci) ore/.test(t) && /(massimo|solo|al massimo|non piu di|a disposizione|disponibil|ho .* ore (a|in|questa|la) settimana|settimana)/.test(t) && !/(oggi|adesso|stasera|stamattina|domani)/.test(t)],
  ["pref_luogo", (t) => classFrom(t) === null && (/(oggi|stamattina|stasera|adesso).*(rulli|indoor|fuori|all aperto|in strada)|(faccio|vado|preferisco|meglio|metti|solo|sui|sul) (sui |sul )?(rulli|indoor|fuori|all aperto)|^(sui |sul )?(rulli|indoor|fuori|all aperto)$|piove|c e vento forte|fa troppo freddo/.test(t))],
  ["pref_minuti", (t) => /(ho (solo |soltanto )?(tempo|\d+|un ora|mezz ora|due ore)|solo \d+ ?(min|minuti)|ho \d+ ?(min|minuti)|dispongo|tempo per)/.test(t) && !/(settimana)/.test(t)],
  ["programma_settimana", /(programma|pianifica|metti|scrivi|inserisci|manda)\b.*(la settimana|tutta la settimana|i prossimi giorni|i prossimi 7|la prossima settimana)/],
  ["programma", (t) => /^(programma(lo|la)?|ok programma|programmalo|programma (questo|quello|l allenamento)|pianificalo|metti(lo)? in calendario|scrivilo|scrivi(lo)? su intervals|inseriscilo|mandalo)\b/.test(t) || /(metti|scrivi|manda|inserisci)\b.*(calendario|intervals|garmin)/.test(t)],
  ["sposta", /(sposta|rimanda|anticipa|posticipa|metti.*a (domani|dopodomani|lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica))/],
  ["cancella", /(cancella|elimina|togli|rimuovi).*(allenamento|oggi|domani|di (lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica)|dal calendario)/],
  ["registra_carbo", (t) => /(ho (preso|mangiato|assunto|bevuto)|assunti|carbo.*(preso|assunt))/.test(t) && /\d+ ?g(r|rammi)?\b|\d+ ?g ?\/ ?h|grammi/.test(t)],
  ["rpe", (t) => /(rpe|sforzo|su 10)/.test(t) && /\d/.test(t)],
  ["cambia", (t) => /(\bcambia\b|\bcambiami\b|\bcambialo\b|altro allenamento|un altro|un altra|diverso|sostituisci|alternativa|non mi va|non mi piace|propon\w* (altro|qualcos altro)|piu facile|meno duro|piu leggero|piu corto|piu breve|piu duro|piu intenso|piu lungo|piu impegnativo|qualcos altro|altro tipo)/.test(t) || (classFrom(t) !== null && /(voglio|vorrei|fammi|dammi|mettimi|proponimi|facciamo|oggi faccio|preferisco|fare)/.test(t))],
  ["libreria", (t) => classFrom(t) !== null && /(\d+ ?(min|minuti|ore|ora)|un ora|mezz ora)/.test(t) && !/(voglio|vorrei|fammi|dammi|mettimi|oggi|ho solo|ho \d)/.test(t)],
  ["sensazione", /(stanc|gambe (pesanti|dure|vuote|di legno)|sfinit|distrutt|dormito (male|poco)|sonno scarso|non ho dormito|mal di testa|nausea|mi sento (male|giu|scarico|vuoto|fiacco|a pezzi)|spossat|giornata no|affaticat|acciacc|non ne ho|poca energia|stressat|nervos)/],
  ["sensazione_buona", /(sto benissimo|mi sento (bene|benissimo|forte|in forma|fresco|carico)|gambe (leggere|buone|ottime|frizzanti)|ho dormito bene|pimpante|in gran forma|ho energia)/],
  ["ultima_uscita", /(ultima uscita|com e andata|com e andato|uscita di (ieri|ieri sera|oggi)|allenamento di ieri|ieri come|analizza.*(uscita|allenamento|ultima|ieri)|come sono andato|giudica.*uscita|com era l uscita)/],
  ["record", /(record|migliori (watt|potenze|sforzi)|picchi|potenza massima|best|watt massimi|curva di potenza|quanti watt)/],
  ["ftp", /(\bftp\b.*(giusta|corretta|alta|bassa|cambia|aggiorn|sbagliat|stima)|(devo|dovrei|conviene) (cambiare|aggiornare|rifare).*(ftp|soglia)|\bftp\b)/],
  ["zone", /(\bzone\b|le mie zone|zone di potenza|zone cardio|zone fc|che potenza.*(z2|z3|z4|z5|zona))/],
  ["profilo", /(diesel|glicolitic|puncheur|che atleta sono|il mio profilo|punti (forti|deboli)|fenotipo|sono uno scalatore|che tipo di atleta)/],
  ["libreria", /(libreria|quanti allenamenti|hai (un|dei|qualcosa)|cerca|trovami|c e un|mostrami (gli|i) allenamenti|elenco allenamenti)/],
  ["test_cp", /(test cp|cp classico|test dei 3|test 3.*7.*12|test.*potenza critica|devo fare.*test|quando.*test|test ftp|testare)/],
  ["carbo", /(carbo|carboidrat|mangiare|alimentaz|\bgel\b|quanto (devo )?(mangiare|bere)|quanti g\b|rifornimento|fueling|digiuno)/],
  ["confronto", /(un anno fa|anno scorso|rispetto a|confronto|come ero|miglior(ato|o) rispetto|peggiorat)/],
  ["mese", /(questo mese|mese scorso|ore (di )?bici|tss del mese|volume|chilometri|km del mese)/],
  ["distribuzione", /(polarizzat|piramidal|distribuzione|troppo z3|troppo tempo in z|tempo in zona|intensita (della|di questa) settimana|quanto lavoro duro)/],
  ["piano", /(piano|stagione|fase|picco|quanto manca|a che punto sono|come arrivo|ctl previsto|obiettivo|tapering|programmazione|prossime settimane|prossimo mese)/],
  ["settimana_bilancio", /(com e andata la settimana|bilancio|come va la settimana|questa settimana come|ho fatto abbastanza|sono in linea|sono indietro|a che punto.*settimana|tss della settimana)/],
  ["settimana_piano", /(settimana|prossimi giorni|prossimi 7|programma della settimana|cosa mi aspetta|domani e dopo|nei prossimi giorni)/],
  ["forma", /(ramp|\btsb\b|\bctl\b|\batl\b|fitness|fatica|carico|forma)/],
  ["recupero", /(hrv|sonno|fc a riposo|frequenza a riposo|battiti a riposo|recuper|riposat|dormito)/],
  ["stato", /(come sto|\bstato\b|prontezza|sono pronto|come (va|andiamo|e messo)|sono in forma|come mi vedi|posso allenarmi|via libera|semaforo)/],
  ["oggi", /(cosa (faccio|devo fare|mi consigli|propon)|che (faccio|alleno|fare)|allenamento (di|per) (oggi|domani)|oggi (che|cosa)|programma di (oggi|domani)|cosa c e (oggi|domani)|domani cosa|proposta|allenamento del giorno|che allenamento|cosa mi fai fare)/],
  ["briefing", /(briefing|riassunto|riepilogo|fammi il punto|situazione|novita|aggiornami)/],
  ["consiglio", /(consigli|suggerimento|cosa ne pensi|che ne dici|dammi un consiglio|che strategia|come mi gestisco)/],
  ["saluto", /^(ciao|buongiorno|buonasera|buon pomeriggio|salve|hey|ehi|ola)\b/],
  ["grazie", /\b(grazie|perfetto grazie|ottimo|bravo|top)\b/],
];

const BARE_TERMS = new Set(["ctl", "atl", "tsb", "ramp rate", "ramp", "tss", "np", "rmssd", "dfa", "rpe", "disaccoppiamento", "tapering", "durability", "overreaching", "sweet spot", "w prime", "map", "if", "ef"]);

export function detectIntent(raw: string, state: Pick<ChatState, "pending" | "awaiting">): Intent {
  const t = normalize(raw);
  const make = (type: IntentType): Intent => ({ type, text: t, raw });
  if (!t) return make("unknown");
  if (state.pending) {
    if (/^(si|sii|sisi|ok|okay|va bene|certo|confermo|conferma|fallo|procedi|esatto|d accordo|daccordo|perfetto|yes|dai|vai|fai pure)\b/.test(t)) return make("si");
    if (/^(no|nono|lascia stare|stop|niente|non farlo|ferma|aspetta|indietro|meglio di no)\b/.test(t) || /^annulla\b/.test(t)) return make("no");
  }
  // A bare technical term ("tsb", "ramp rate", "dfa") is a question about it.
  if (BARE_TERMS.has(t) && findTerm(t) !== null) return make("glossario");
  for (const [type, rule] of RULES) if (test(rule, t)) return make(type);
  return make("unknown");
}

/** Phrases that work, per group: the help page and the suggestions when a message isn't understood. */
export const HELP: { title: string; examples: string[] }[] = [
  { title: "Come sto e cosa faccio", examples: ["come sto?", "cosa faccio oggi?", "perché soglia?", "fammi il punto", "posso fare un VO2 domani?"] },
  { title: "Cambiare l'allenamento", examples: ["cambia", "più facile", "ho solo 45 minuti", "sui rulli", "voglio fare sweet spot", "programma"] },
  { title: "Eventi della vita", examples: ["ferie dal 10 al 20 dicembre", "ho la febbre da ieri", "infortunio al ginocchio", "sto meglio", "oggi non mi alleno"] },
  { title: "Piano e stagione", examples: ["a che punto sono col piano?", "e se salto la prossima settimana?", "questa settimana solo 5 ore", "più prudente col carico", "picco dal 14 giugno per 8 settimane"] },
  { title: "Analisi", examples: ["com'è andata l'uscita di ieri?", "devo cambiare l'FTP?", "i miei record", "com'è andata la settimana?", "rispetto a un anno fa?", "che atleta sono?"] },
  { title: "Sensazioni e dati", examples: ["gambe pesanti", "ho dormito male", "RPE 8 per ieri", "ho preso 60 g/h"] },
  { title: "Preferenze", examples: ["il martedì non posso", "massimo 8 ore a settimana", "quanti carbo per questo?", "cos'è il TSB?"] },
];
