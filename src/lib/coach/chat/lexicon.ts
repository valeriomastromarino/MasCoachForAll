// Before the rules read a message, it is cleaned the way a person reads it: chat shorthand («ke», «cm», «xké», «nn»),
// letters typed too many times («siii»), and typos («allenamnto», «recuero») fixed against the words the chat knows.
// Only plain words are touched: numbers, minutes («12'»), percentages, «3x12», «30/30» stay as written.

/** Shorthand written in chats, as whole words. */
const SHORTHAND: Record<string, string> = {
  ke: "che", k: "che", kosa: "cosa", cs: "cosa", xke: "perche", xche: "perche", perke: "perche", pke: "perche", pk: "perche", prk: "perche",
  nn: "non", x: "per", cmq: "comunque", qnd: "quando", qndo: "quando", qdo: "quando", tt: "tutto", sn: "sono", qlc: "qualcosa", qlcs: "qualcosa",
  qcs: "qualcosa", nnt: "niente", bn: "bene", dmn: "domani", dom: "domenica", lun: "lunedi", merc: "mercoledi", gio: "giovedi", ven: "venerdi", sab: "sabato",
  grz: "grazie", thx: "grazie", xo: "pero", dv: "dove", allenam: "allenamento", allen: "allenamento", allena: "allenamento", ok: "ok", okk: "ok", okok: "ok",
  cmnq: "comunque", ankora: "ancora", anke: "anche", ki: "chi", kome: "come", qst: "questo", qsta: "questa", qsto: "questo",
  wk: "weekend", wknd: "weekend", hr: "fc", bpm: "bpm", ftp: "ftp", vo2max: "vo2",
};

/** «cm» is «come», unless it follows a number («2 cm»). */
const CM_AFTER_NUMBER = /^\d/;

/**
 * Everyday Italian and the words of cycling the chat must not «correct» into something else. The rules, the examples and
 * the notions add their own words to this list (see `learnWords`).
 */
const COMMON = `
a ad al allo ai agli alla alle anche ancora altro altra altri altre allora andare andato andata andiamo anni anno appena aspetta
avere avevo avuto bene benissimo bisogno boh brutto brutta buono buona basta bello bella caldo freddo capito capire casa
che chi ci come con cosa cose cosi cui da dal dai dalla dalle dei del della delle dello dentro devo deve dici dimmi dire
dopo dove dovrei e ecco era essere fa fai fare fatto fatta forse fra fuori gia giu grazie ha hai hanno ho i il in invece io
la le li lo lui lei loro ma mai male me meglio meno mi mia mio mie miei molto ne nei nel nella nelle no noi non nulla o oggi
ogni ok ora per perche pero piu poco poi posso potrei prima proprio puo qua qualche quale quali quando quanto quanta quanti
quante quasi quel quella quelle quelli quello questa queste questi questo qui se sei senza si sia siamo solo sono sopra sotto
sta stai stanno stare stato stata sto su sua sue sul sulla suo suoi tanto te ti tra tu tua tuo tutti tutto tutta tutte un una
uno va vado vai vedere vero voglio vorrei vuoi pensi pensa penso credo dico detto detta faccio facciamo fammi dammi mettimi
dimmelo spiegami spiega spiegare capisco sento sentire senti sembra sembri stanco stanca bravo ottimo perfetto certo davvero
magari comunque quindi infatti oppure tipo cioe insomma appunto ovvio subito tardi presto sempre spesso volte volta giorno
giorni settimana settimane mese mesi stagione anno ieri domani dopodomani stamattina stasera stanotte mattina sera notte
pomeriggio lunedi martedi mercoledi giovedi venerdi sabato domenica weekend fine inizio meta oretta ore ora minuti minuto
secondi mezz mezza mezzo poco tanto troppo abbastanza parecchio niente nessuno qualcosa qualcuno ciao buongiorno buonasera
salve hey ehi aiuto grazie scusa prego bici bicicletta ciclismo pedalare pedalata pedalo pedali pedale uscita uscite giro
giri lunga lungo lunghe lunghi corta corto breve facile facili duro dura duri dure forte forti piano veloce lento lenta
allenamento allenamenti allenarmi allenare allenato allenata allenando seduta sedute workout lavoro lavori ripetuta
ripetute ripetizioni serie recupero recuperi riposo riposare riposato riposata rulli rullo indoor strada salita salite
discesa discese pianura vento pioggia piove sole neve freddo caldo umido gara gare granfondo crono cronometro sprint scatti
volata volate soglia sweet spot tempo fondo endurance zona zone potenza watt cadenza frequenza cardiaca battiti cuore fc hrv
sonno dormito dormire dormo sveglio stanchezza fatica affaticato gambe gamba pesanti pesante dolore dolori male fastidio
ginocchio ginocchia schiena collo spalla spalle mano mani piede piedi sella manubrio pedivelle tacchette scarpe casco
peso chili chilo dieta mangiare mangio mangiato bere bevo bevuto acqua sali gel barretta barrette carboidrati carbo zuccheri
proteine grassi colazione pranzo cena caffe caffeina alcol vino birra integratori ferro magnesio crampi crampo idratazione
pesi palestra squat stacchi forza core pilates yoga stretching massaggio corsa correre nuoto camminare camminata
test rampa ftp cp vo2 fitness forma ctl atl tsb tss ramp carico scarico picco tapering piano programma programmare
calendario intervals garmin strava sposta spostare spostala spostalo sposti anticipa anticipare rimanda rimandare posticipa
scambia scambiare inverti invertire cancella cancellare elimina eliminare togli togliere rimuovi accorcia accorciare
allunga allungare aggiungi aggiungere metti mettere cambia cambiare modifica modificare sostituisci falla fallo fanne fai
migliorare miglioro migliorato peggiorato progressi crescere salire scendere aumentare diminuire ridurre abbassare alzare
motivazione voglia stress lavoro famiglia viaggio ferie vacanza vacanze malato malattia febbre influenza raffreddore tosse
infortunio caduto caduta medico fisioterapista biomeccanica posizione altezza
vuol vuole significa significato senso ovvero spiega meglio intendi intendevi capisco seconda secondo terza terzo prima primo
salva salvala salvalo libreria salvare fame sete pane pasta riso dolce frutta banana miele marmellata latte yogurt uova carne
pesce verdura legumi sale olio cosa cose fatte fatti dato dati numero numeri media medie valore valori vale valgono quanto
dimmi spiegami raccontami mostrami fammi fagli lasciala lascialo tienila tienilo tienile tienili serve servono basta bastano
`;

const words = new Set(COMMON.split(/\s+/).filter(Boolean));

/** Adds the words of the rules, examples and notions to what counts as correct. */
export function learnWords(text: string): void {
  cache.clear();
  for (const w of text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").match(/[a-z]{3,}/g) ?? []) words.add(w);
}

export const knownWord = (w: string) => words.has(w);

/** Edit distance with swaps of two letters (Damerau), stopping early once it passes `max`. */
export function editDistance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      rowMin = Math.min(rowMin, d[i][j]);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
}

const cache = new Map<string, string>();
const CLITICS = ["gliela", "glielo", "mela", "melo", "tela", "telo", "cela", "celo", "mene", "la", "lo", "le", "li", "ne", "mi", "ti", "ci", "gli"];

/** The known word a typo stands for, or the word itself when nothing is close enough (or two words are equally close). */
export function fixWord(w: string): string {
  if (w.length < 4 || words.has(w) || /\d/.test(w)) return w;
  // A verb with a pronoun on the end («accorciala», «spostarla», «fammelo») is a word, not a typo of the verb.
  for (const end of CLITICS) {
    if (!w.endsWith(end) || w.length - end.length < 3) continue;
    const stem = w.slice(0, -end.length);
    if (words.has(stem) || words.has(`${stem}e`) || words.has(stem.replace(/r$/, "re"))) return w;
  }
  const hit = cache.get(w);
  if (hit !== undefined) return hit;
  const max = w.length >= 8 ? 2 : 1;
  let best: string | null = null;
  let bestD = max + 1;
  let tie = false;
  for (const v of words) {
    if (v.length < 3 || Math.abs(v.length - w.length) > max) continue;
    const dd = editDistance(w, v, max);
    if (dd < bestD) {
      best = v;
      bestD = dd;
      tie = false;
    } else if (dd === bestD && best !== null && v !== best) {
      // Two words at the same distance: the one with the same first letter wins, otherwise it stays unknown.
      if (v[0] === w[0] && best[0] !== w[0]) best = v;
      else if (!(best[0] === w[0] && v[0] !== w[0])) tie = true;
    }
  }
  const out = best && bestD <= max && !tie ? best : w;
  cache.set(w, out);
  return out;
}

const plain = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * The message as the rules should read it. Words are fixed one by one, keeping what is around them (punctuation,
 * apostrophes, numbers), so the session builder still finds «3x12'» and «88%».
 */
export function clean(raw: string, typos = true): string {
  const tokens = raw.split(/(\s+)/);
  return tokens
    .map((tok, i) => {
      if (/^\s*$/.test(tok)) return tok;
      // Keep anything with digits or the marks the builder reads.
      if (/[\d%/]/.test(tok)) return tok;
      return tok
        .split(/(['’`´])/)
        .map((part) => {
          if (/^['’`´]$/.test(part) || !part) return part;
          const m = part.match(/^([^A-Za-zÀ-ÿ]*)([A-Za-zÀ-ÿ]+)([^A-Za-zÀ-ÿ]*)$/);
          if (!m) return part;
          const [, pre, core, post] = m;
          let w = plain(core).replace(/([a-z])\1{2,}/g, "$1");
          if (w === "cm") {
            const before = tokens.slice(0, i).reverse().find((x) => !/^\s*$/.test(x)) ?? "";
            if (CM_AFTER_NUMBER.test(before.trim())) return part;
          }
          if (w === "x") {
            const before = tokens.slice(0, i).reverse().find((x) => !/^\s*$/.test(x)) ?? "";
            if (/\d$/.test(before.trim())) return part;
          }
          if (w in SHORTHAND) w = SHORTHAND[w];
          else if (typos) w = fixWord(w);
          return w === plain(core) ? part : `${pre}${w}${post}`;
        })
        .join("");
    })
    .join("");
}
