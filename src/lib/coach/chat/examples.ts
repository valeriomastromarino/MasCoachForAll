// Phrases for every question the chat answers from the data (25 November 2026): the nearest one decides a message the
// rules did not read, and the first of each list is the button offered when the chat is not sure («Forse intendevi…»).
// The notions (knowledge.ts) bring their own examples. All these words also count as correct spelling (lexicon.ts).
import { GLOSSARY } from "./glossary";
import { NOTIONS } from "./knowledge";
import { learnWords } from "./lexicon";
import { type Doc, Index } from "./similar";

export const INTENT_EXAMPLES: Record<string, string[]> = {
  oggi: ["Cosa faccio oggi?", "che allenamento faccio oggi", "cosa mi proponi per oggi", "cosa devo fare oggi in bici", "allenamento del giorno", "cosa faccio domani?", "cosa mi fai fare oggi", "dammi l'allenamento di oggi", "oggi che si fa"],
  stato: ["Come sto?", "come sto oggi", "sono pronto per allenarmi?", "com'è la prontezza", "via libera per oggi?", "come mi vedi", "sono in forma oggi?", "che semaforo ho oggi"],
  recupero: ["Come va il recupero?", "sono recuperato?", "come sto recuperando", "il mio recupero com'è", "sono riposato?"],
  notte: ["Com'è andata stanotte?", "come ho dormito stanotte", "com'è stata la notte", "dati di stanotte", "hrv di stanotte", "come è andata la nottata"],
  sonno: ["Come sto dormendo?", "quanto dormo in media", "il mio sonno com'è", "dormo abbastanza?", "come sono le mie notti", "ore di sonno della settimana"],
  hrv_settimana: ["Come va l'HRV questa settimana?", "come sta andando l'hrv", "andamento dell'hrv", "la mia hrv negli ultimi giorni", "trend dell'hrv", "hrv media della settimana"],
  fc_riposo: ["La FC a riposo è alta?", "come va la frequenza a riposo", "battiti a riposo stamattina", "la mia fc a riposo", "frequenza cardiaca a riposo alta"],
  perche_colore: ["Perché sono giallo?", "perché oggi sono rosso", "come mai sono giallo", "perché la prontezza è gialla", "perché verde?"],
  forma: ["Com'è la mia forma?", "quanto è il mio tsb", "fitness e fatica", "come va il carico", "il mio ctl"],
  perche: ["Perché questo allenamento?", "perché mi proponi questa seduta", "come mai questo", "perché soglia oggi?"],
  perche_seduta: ["Perché mi hai messo la soglia domani?", "perché sabato c'è la lunga", "perché quella di giovedì"],
  seduta_di: ["Cosa ho domenica?", "cosa c'è sabato", "che allenamento ho domani", "cosa è in programma giovedì", "cosa mi aspetta venerdì"],
  pronto_per: ["Sono recuperato per la soglia di domani?", "riesco a fare la lunga domenica?", "ce la faccio per il vo2 di giovedì", "sono pronto per la lunga"],
  durata_check: ["Domenica posso fare 4 ore invece di 3?", "posso fare 5 ore sabato?", "posso allungare a 3 ore domenica", "va bene se faccio 4 ore domenica"],
  altro_sport: ["Oggi ho fatto 2 ore di MTB, cambio qualcosa?", "stamattina ho corso un'ora", "ho fatto calcetto ieri sera", "oggi ho fatto palestra di gambe", "ho fatto un'ora di nuoto"],
  voglia: ["Non ho voglia", "oggi non ho voglia di allenarmi", "boh non ho voglia", "mi manca la voglia oggi", "che palle allenarsi oggi"],
  volume: ["Sto facendo abbastanza?", "quante ore sto facendo", "volume delle ultime settimane", "faccio abbastanza volume?"],
  settimana_piano: ["Cosa mi aspetta questa settimana?", "programma della settimana", "prossimi giorni", "cosa faccio nei prossimi giorni", "la settimana com'è organizzata"],
  settimana_bilancio: ["Com'è andata la settimana?", "bilancio della settimana", "sono in linea con la settimana?", "tss della settimana"],
  piano: ["A che punto sono col piano?", "in che fase sono", "quanto manca al picco", "come arrivo all'obiettivo", "la mia stagione"],
  what_if: ["E se salto la prossima settimana?", "cosa succede se non mi alleno 5 giorni", "e se mi fermo una settimana"],
  posso: ["Posso fare un VO2 domani?", "posso fare una soglia oggi?", "conviene fare la lunga sabato?", "dovrei riposare oggi?"],
  ultima_uscita: ["Com'è andata l'uscita di ieri?", "analizza l'ultima uscita", "come sono andato ieri", "giudica l'allenamento di ieri"],
  record: ["I miei record", "i miei migliori watt", "la mia curva di potenza", "quanti watt faccio sui 5 minuti"],
  ftp: ["Devo cambiare l'FTP?", "la mia ftp è giusta?", "stima della ftp", "aggiorno la soglia?"],
  zone: ["Le mie zone", "zone di potenza", "zone cardio", "che watt è la z2"],
  profilo: ["Che atleta sono?", "sono diesel o glicolitico", "i miei punti forti", "il mio profilo"],
  libreria: ["Hai una soglia da 60 minuti?", "cerca un vo2 da 45 minuti", "quanti allenamenti ci sono in libreria"],
  carbo: ["Quanti carbo per oggi?", "quanto devo mangiare oggi", "carboidrati per questo allenamento", "quanti grammi per l'uscita di oggi"],
  confronto: ["Rispetto a un anno fa?", "sono migliorato rispetto all'anno scorso", "confronto con l'anno scorso"],
  mese: ["Com'è andato il mese?", "ore di bici questo mese", "tss del mese", "chilometri del mese"],
  distribuzione: ["Come è distribuito il mio allenamento?", "quanto tempo in zona", "sono polarizzato?", "troppo z3?"],
  test_cp: ["Test CP: quando?", "quando faccio il test", "devo fare un test?"],
  briefing: ["Fammi il punto", "riassunto della situazione", "aggiornami", "briefing di oggi"],
  consiglio: ["Dammi un consiglio", "cosa ne pensi", "che strategia mi consigli"],
  cambia: ["Cambia", "più facile", "un altro allenamento", "voglio fare sweet spot", "proponimi qualcos'altro"],
  pref_minuti: ["Ho solo 45 minuti", "ho un'ora", "stasera ho un'oretta", "oggi ho solo mezz'ora"],
  pref_luogo: ["Sui rulli", "oggi faccio i rulli", "oggi vado fuori", "piove, faccio indoor"],
  sensazione: ["Gambe pesanti", "sono stanco", "ho dormito male", "sono a pezzi", "mi sento scarico", "giornata no"],
  sensazione_buona: ["Sto benissimo", "gambe leggere oggi", "mi sento in forma"],
  riposo_oggi: ["Oggi non mi alleno", "oggi riposo", "salto oggi"],
  vita_ferie: ["Ferie dal 10 al 20 dicembre", "sono via dal 3 al 7", "vacanza la prossima settimana"],
  vita_malattia: ["Ho la febbre da ieri", "sono malato", "ho l'influenza"],
  vita_infortunio: ["Infortunio al ginocchio", "mi sono fatto male alla caviglia", "sono caduto in bici"],
  vita_guarito: ["Sto meglio", "la febbre è passata", "sono guarito"],
  dolore: ["Mi fa male il ginocchio", "ho un fastidio alla schiena", "mi fa un po' male la caviglia"],
  pref_ore: ["Massimo 8 ore a settimana", "questa settimana solo 5 ore"],
  pref_ramp: ["Più prudente col carico", "voglio crescere più in fretta"],
  pref_giorno: ["Il martedì non posso", "posso allenarmi anche il lunedì"],
  programma: ["Programma", "mettilo in calendario", "scrivilo su Intervals"],
  rpe: ["RPE 8 per ieri", "sforzo 7 su 10"],
  registra_carbo: ["Ho preso 60 g/h", "ho mangiato 80 grammi l'ora"],
  aiuto: ["Cosa posso chiederti?", "cosa sai fare", "esempi"],
  saluto: ["Ciao", "buongiorno"],
  edit_sposta: ["Sposta la lunga a sabato", "rimanda di un giorno", "anticipa la soglia a mercoledì"],
  edit_scambia: ["Scambia sabato e domenica", "inverti martedì e giovedì"],
  edit_cancella: ["Cancella il weekend", "togli la soglia di giovedì", "elimina quella di domani"],
  edit_durata: ["Accorcia quella di domani a 45 minuti", "allunga la lunga a 4 ore", "falla più corta"],
  edit_ripetute: ["La soglia falla con 3 ripetute", "togli una ripetuta", "aggiungi una serie"],
  edit_luogo: ["Domani fallo sui rulli", "la soglia di giovedì falla fuori"],
};

let index: Index | null = null;

/** Every example, for the matching: «i:<intent>», «n:<notion>», «g:<term>». Built once. */
export function examples(): Index {
  if (index) return index;
  const docs: Doc[] = [];
  for (const [intent, list] of Object.entries(INTENT_EXAMPLES)) for (const ex of list) docs.push({ label: `i:${intent}`, text: ex });
  for (const n of NOTIONS) {
    docs.push({ label: `n:${n.id}`, text: n.title });
    for (const ex of n.ex) docs.push({ label: `n:${n.id}`, text: ex });
  }
  for (const g of GLOSSARY) docs.push({ label: `g:${g.keys[0]}`, text: `cos'è ${g.keys[0]} ${g.title}` });
  for (const d of docs) learnWords(d.text);
  index = new Index(docs);
  return index;
}

/** The phrase to put on a button for a label. */
export function phraseFor(label: string): string {
  const [kind, id] = [label.slice(0, 1), label.slice(2)];
  if (kind === "i") return INTENT_EXAMPLES[id]?.[0] ?? id;
  if (kind === "n") return NOTIONS.find((n) => n.id === id)?.ex[0] ?? id;
  const g = GLOSSARY.find((x) => x.keys[0] === id);
  return g ? `Cos'è ${g.keys[0].toUpperCase().length <= 4 ? g.keys[0].toUpperCase() : g.keys[0]}?` : id;
}
