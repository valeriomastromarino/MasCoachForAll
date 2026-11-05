// "Cos'è il TSB?": short coach-style explanations, with the athlete's own numbers where they help.
import type { ChatContext } from "./context";

export type Term = { keys: string[]; title: string; text: (ctx: ChatContext) => string };

const n0 = (x: number | null | undefined) => (x == null ? "–" : String(Math.round(x)));

export const GLOSSARY: Term[] = [
  {
    keys: ["ctl", "fitness", "forma fisica cronica"],
    title: "CTL (fitness)",
    text: (c) => `È la media del tuo carico degli ultimi 42 giorni: più è alta, più sei allenato. Il tuo è ${n0(c.data.status.ctl)}. Sale lento e scende lento: per questo il piano lo fa crescere di pochi punti a settimana.`,
  },
  {
    keys: ["atl", "fatica acuta"],
    title: "ATL (fatica)",
    text: (c) => `È la media del carico degli ultimi 7 giorni: sale e scende in fretta. La tua è ${n0(c.data.status.atl)}. Se è molto sopra il CTL sei affaticato.`,
  },
  {
    keys: ["tsb", "forma", "form"],
    title: "TSB (forma)",
    text: (c) => `È CTL meno ATL: quanto sei fresco. Il tuo oggi è ${n0(c.data.status.tsb)} (zona ${c.data.status.formZone ?? "–"}). Zone: sopra 20 transizione, 5-20 fresco, da −10 a 5 grigia, da −10 a −30 ottimale per allenarsi, sotto −30 alto rischio. Un TSB molto negativo non è un divieto da solo: conta con HRV e sonno.`,
  },
  {
    keys: ["ramp rate", "ramp", "rampa di carico"],
    title: "Ramp rate",
    text: (c) => `È di quanto sale il CTL in 7 giorni: il tuo ora è ${c.data.status.rampRate == null ? "–" : c.data.status.rampRate.toFixed(1).replace(".", ",")}. Per un amatore +3-4 a settimana è sostenibile, sopra +8 è aggressivo. Nel piano è il tetto che scegli tu.`,
  },
  { keys: ["tss", "training stress score"], title: "TSS", text: () => "È il carico di una seduta: 100 TSS sono un'ora al 100% della FTP. Un'ora facile in Z2 vale circa 40-50, una gara dura anche 200." },
  { keys: ["if", "intensity factor", "fattore di intensita"], title: "IF", text: () => "L'intensità media di una seduta rispetto alla FTP: 0,65 è fondo, 0,85 è duro, sopra 1 è una gara o un test." },
  { keys: ["np", "normalized power", "potenza normalizzata"], title: "NP", text: () => "La potenza che 'costa' davvero quanto la tua uscita: pesa di più gli sforzi forti. Con molta variabilità è più alta della media." },
  {
    keys: ["ftp", "functional threshold power"],
    title: "FTP",
    text: (c) => `È la potenza che reggi circa un'ora. La tua su Intervals: ${n0(c.data.athlete.ftp)} W fuori e ${n0(c.data.athlete.indoorFtp)} W sui rulli. Le zone e le percentuali dei workout si basano su questa.`,
  },
  { keys: ["cp", "potenza critica", "critical power"], title: "Potenza critica", text: () => "Il limite sopra cui consumi la riserva anaerobica (W′). Si ricava da sforzi massimali di 3-20 minuti. Il test classico: tre sforzi da 3′, 7′ e 12′ in giorni diversi." },
  { keys: ["w prime", "w'", "w′", "wprime", "riserva anaerobica"], title: "W′", text: () => "La riserva di energia che puoi spendere sopra la potenza critica: si svuota negli scatti e si ricarica sotto la soglia. Più è grande, più sei da scatti." },
  {
    keys: ["hrv", "rmssd", "variabilita cardiaca"],
    title: "HRV",
    text: (c) => `La variabilità tra un battito e l'altro, misurata di notte: sale con il recupero e scende con stress e fatica. Conta la media di 7 giorni contro il tuo range normale (${n0(c.data.status.hrv.low == null ? null : Math.exp(c.data.status.hrv.low))}-${n0(c.data.status.hrv.high == null ? null : Math.exp(c.data.status.hrv.high))} ms), non la singola notte.`,
  },
  { keys: ["fc a riposo", "frequenza a riposo"], title: "FC a riposo", text: () => "Se sale per più notti insieme a un'HRV bassa, è il segnale di stress più chiaro (allenamento, malanno in arrivo, sonno, alcol)." },
  { keys: ["dfa", "dfa alpha", "alpha 1", "alfa 1"], title: "DFA α1", text: () => "Un indice dai battiti (serve la fascia Polar): 0,75 corrisponde alla soglia aerobica, 0,5 a quella anaerobica. Utile per tarare Z2 e soglia." },
  { keys: ["zone", "zone di potenza"], title: "Zone", text: () => "Z1 recupero, Z2 fondo, Z3 tempo, Z4 soglia, Z5 VO2max, Z6 anaerobico, Z7 neuromuscolare: percentuali della FTP (Coggan)." },
  { keys: ["z2", "zona 2", "fondo"], title: "Z2", text: () => "Il fondo: ritmo da conversazione, 56-75% della FTP. È la base che regge tutto il resto: mitocondri, capillari, grassi." },
  { keys: ["sweet spot", "ss"], title: "Sweet spot", text: () => "88-94% della FTP: il punto dolce, molto stimolo aerobico con poca fatica. Si fa in blocchi da 10-20 minuti." },
  { keys: ["soglia", "threshold", "z4"], title: "Soglia", text: () => "91-105% della FTP: blocchi da 5-12 minuti alla potenza che porti vicino al limite. Alza la FTP." },
  { keys: ["vo2", "vo2max", "z5"], title: "VO2max", text: () => "106-120% della FTP: ripetute da 3-5 minuti molto dure. Alzano il massimo che il motore può dare." },
  { keys: ["anaerobico", "z6"], title: "Anaerobico", text: () => "121-150% della FTP: ripetute da 30 secondi a 2 minuti. Allenano la capacità di fare scatti ripetuti." },
  { keys: ["sprint", "neuromuscolare", "z7"], title: "Sprint", text: () => "Sforzi massimali da 5-20 secondi: costano poco in carico ma allenano la potenza di picco." },
  { keys: ["tempo", "z3"], title: "Tempo", text: () => "76-90% della FTP: ritmo sostenuto, utile in base per la resistenza muscolare." },
  { keys: ["tapering", "tapering prima della gara", "scarico pre gara"], title: "Tapering", text: () => "Le ultime due settimane prima di una gara: il volume scende del 40-60%, l'intensità e la frequenza restano. Arrivi fresco senza perdere forma." },
  { keys: ["scarico", "settimana leggera", "recupero programmato"], title: "Settimana di scarico", text: () => "Ogni 3-4 settimane il carico scende di circa un terzo: è lì che il corpo assorbe e migliora." },
  { keys: ["base", "build", "periodizzazione", "fasi"], title: "Le fasi", text: () => "Base: fondo e volume. Build: sweet spot, soglia, VO2max. Picco: intensità alta e specifica. Tapering: scarico prima della gara. Il piano le costruisce all'indietro dal picco che hai scelto." },
  { keys: ["disaccoppiamento", "decoupling", "pw:hr", "deriva"], title: "Disaccoppiamento", text: () => "Quanto la FC sale rispetto alla potenza tra prima e seconda metà di un'uscita. Sotto il 5% il fondo è ben assorbito, sopra il 7% la base non è ancora solida (con caldo il dato sale da solo)." },
  { keys: ["ef", "efficienza aerobica", "efficiency factor"], title: "EF", text: () => "Potenza normalizzata divisa per la FC media: se cresce nel tempo con lo stesso sforzo, la tua base migliora." },
  { keys: ["durability", "tenuta"], title: "Durability", text: () => "Quanta potenza perdi dopo molte ore o kJ di lavoro. Si allena con fondi lunghi e sforzi a fine uscita." },
  { keys: ["rpe", "sforzo percepito"], title: "RPE", text: () => "Quanto ti è sembrata dura una seduta da 0 a 10: 3-4 fondo, 6-7 soglia, 9-10 massimale. Serve a capire quando le sensazioni non tornano con i numeri." },
  { keys: ["polarizzato", "piramidale", "distribuzione dell intensita"], title: "Distribuzione", text: () => "Polarizzato: tanto Z1-Z2, poco Z3, qualche Z4+ (per volumi alti). Piramidale: più Z3 che Z4+ (per volumi medi). Nessuno dei due è obbligatorio." },
  { keys: ["map", "massimo aerobico", "potenza aerobica massima"], title: "MAP", text: () => "La potenza che reggi alla fine di un test a rampa: in genere la FTP è il 72-80% del MAP." },
  { keys: ["overreaching", "sovrallenamento"], title: "Overreaching", text: () => "Fatica accumulata oltre ciò che assorbi: HRV in calo, FC a riposo alta, gambe vuote. Una settimana di scarico lo risolve; ignorarlo no." },
  { keys: ["carboidrati", "g/h", "gut training"], title: "Carboidrati", text: () => "Sotto l'ora basta acqua; 60-150 minuti 30-60 g/h; oltre 150 minuti 60-90 g/h. Sopra 60 g/h serve glucosio e fruttosio. Il gut training: +10 g/h richiede 2-4 settimane." },
  { keys: ["erg", "modalita erg"], title: "ERG", text: () => "Sul rullo il rullo impone la potenza del passo: tu pedali e basta. Utile per intervalli precisi." },
];

/** The term a phrase is about: the longest key found as whole words. */
export function findTerm(normalized: string): Term | null {
  let best: { term: Term; len: number } | null = null;
  for (const term of GLOSSARY) {
    for (const key of term.keys) {
      const pattern = new RegExp(`(^|\\s)${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=\\s|$)`);
      if (pattern.test(normalized) && (!best || key.length > best.len)) best = { term, len: key.length };
    }
  }
  return best?.term ?? null;
}
