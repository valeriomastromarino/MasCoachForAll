// What a coach knows (25 November 2026: «riempila di nozioni»): training, recovery, nutrition, position on the
// bike, weather, racing, the head. Each notion answers in a few lines, with the athlete's own numbers where they help
// (FTP, W/kg, zones, carbohydrates tolerated, phase of the season, readiness of today). Conservative, mainstream sports
// science; anything that sounds medical sends to a doctor. A notion is found by its topic words (`re`, on the normalized
// message) and, among those that match, by how close the message is to its examples (similar.ts).
import { PHASE_INFO, weekFor } from "@/lib/training/season";
import { toleratedCarbs } from "@/lib/training/suggest";
import type { ChatContext } from "./context";

export type Notion = {
  id: string;
  title: string;
  /** Topic words: the notion is a candidate only when these match. */
  re: RegExp;
  /** Phrases that ask for it, for the matching and the tests. */
  ex: string[];
  say: (c: ChatContext) => { text: string; lines: string[]; chips?: string[] };
};

const r0 = (x: number) => String(Math.round(x));
const r1 = (x: number) => x.toFixed(1).replace(".", ",");
const ftp = (c: ChatContext) => c.data.athlete.ftp;
const kg = (c: ChatContext) => c.data.athlete.weight;
const wkg = (c: ChatContext) => (ftp(c) && kg(c) ? ftp(c)! / kg(c)! : null);
const pct = (c: ChatContext, lo: number, hi: number) => (ftp(c) ? `${r0((ftp(c)! * lo) / 5 * 5)}-${r0(Math.round((ftp(c)! * hi) / 5) * 5)} W` : `${Math.round(lo * 100)}-${Math.round(hi * 100)}% FTP`);
const phase = (c: ChatContext) => {
  const w = weekFor(c.plan, c.today);
  return w ? PHASE_INFO[w.phase] : null;
};
const carbCap = (c: ChatContext) => toleratedCarbs(c.profile?.carboTollerati);
const ready = (c: ChatContext) => c.data.status.readiness.level;

export const NOTIONS: Notion[] = [
  // ── Getting faster ──────────────────────────────────────────────────────────────────────────────
  {
    id: "salita",
    title: "Andare più forte in salita",
    re: /\b(salit\w*|scalat\w*|pendenz\w*|arrampic\w*|montagn\w*|colle|colli|passo dello|dislivello)\b/,
    ex: ["come miglioro in salita?", "vado piano in salita", "come si va più forte in salita", "allenamento per le salite", "in salita mi staccano"],
    say: (c) => ({
      text: "💪 In salita conta quanta potenza tieni per 10-40 minuti rispetto al peso (W/kg).",
      lines: [
        wkg(c) ? `Tu oggi: FTP ${r0(ftp(c)!)} W su ${r1(kg(c)!)} kg = ${r1(wkg(c)!)} W/kg. Ogni +10 W di soglia valgono più o meno quanto 3 kg in meno, ma senza perdere forza.` : "Servono FTP e peso per i tuoi W/kg: il peso lo leggo da Intervals.",
        `Gli allenamenti che spostano la salita: soglia lunga (2×15'-3×12' a ${pct(c, 0.95, 1.0)}), VO2max (5×4' a ${pct(c, 1.1, 1.2)}) e, nel Build, ripetute in salita vera.`,
        "In gara: parti più piano di quanto vorresti, tieni la potenza costante, seduto a 75-90 rpm; ci si alza solo sugli strappi.",
        phase(c) ? `Ora sei in ${phase(c)!.label}: ${phase(c)!.focus.toLowerCase()}. Le salite specifiche arrivano col Build.` : "Prima la base aerobica, poi le salite specifiche.",
      ],
      chips: ["Che atleta sono?", "Come perdo peso senza perdere watt?"],
    }),
  },
  {
    id: "pianura",
    title: "Andare più forte in pianura",
    re: /\b(pianura|piano veloce|velocita|media orari\w*|km ?h|kmh|andare veloce|aerodinamic\w*|aero)\b/,
    ex: ["come vado più veloce in pianura?", "come alzo la media?", "conviene la posizione aero?", "come aumento la velocità media"],
    say: (c) => ({
      text: "🚴 In pianura conta la potenza assoluta e soprattutto l'aria: sopra i 25 km/h è il 70-80% della resistenza.",
      lines: [
        "Posizione più bassa e stretta (gomiti piegati, avambracci paralleli), abbigliamento aderente, casco aero: sono watt gratis.",
        `Per il motore: tempo e sweet spot lunghi (2×20' a ${pct(c, 0.88, 0.93)}) e soglia.`,
        "Gomme buone a pressione giusta valgono 5-10 W.",
        "La media sale anche stando a ruota: in gruppo si risparmia il 25-35%.",
      ],
    }),
  },
  {
    id: "sprint_migliorare",
    title: "Migliorare lo sprint",
    re: /\b(sprint\w*|volat\w*|scatt\w*|esplosiv\w*|picco di potenza|watt massimi)\b/,
    ex: ["come miglioro lo sprint?", "voglio essere più esplosivo", "come faccio volate più forti", "allenare lo scatto"],
    say: () => ({
      text: "⚡ Lo sprint si allena con sforzi brevissimi a tutta e recuperi lunghi.",
      lines: [
        "6-8 sprint da 8-15\" con 3-5' facili tra uno e l'altro, da lanciati (30-35 km/h) e qualcuno da fermo in rapporto duro.",
        "Una volta a settimana basta, a gambe fresche: dentro una Z2 o all'inizio di una seduta.",
        "La forza in palestra (squat, stacchi, 3-5 serie da 3-6) aiuta il picco più di qualsiasi altra cosa.",
        "Tecnica: parti in piedi, mani basse, bici che oscilla sotto di te; cambia rapporto prima di finire la cadenza.",
      ],
      chips: ["Inseriscimi 6 sprint nella z2 di domani"],
    }),
  },
  {
    id: "soglia_migliorare",
    title: "Alzare la soglia (FTP)",
    re: /\b(alzare|alzo|alzarla|aumentare|aumento|aumentarla|migliorare|miglioro|migliorarla|crescere|salire|far salire|spingere su)\b.*\b(ftp|soglia)\b|\b(ftp|soglia)\b.*\b(alzare|aumentare|migliorare|crescere|salire|ferma|bloccat\w*|stallo|non sale)\b/,
    ex: ["come alzo la mia ftp?", "come miglioro la soglia?", "la ftp non sale più", "la soglia è ferma da mesi"],
    say: (c) => ({
      text: "📈 La soglia cresce con tanto lavoro poco sotto e attorno all'FTP, sopra una base aerobica larga.",
      lines: [
        `Sweet spot (${pct(c, 0.88, 0.93)}): da 2×15' fino a 2×30' o 3×20'. Soglia (${pct(c, 0.95, 1.02)}): da 3×10' a 2×20'. Over-under per chi è già avanti.`,
        "1-2 sedute a settimana, mai due giorni di fila; si cresce allungando i minuti, non alzando i watt ogni volta.",
        "Se è ferma da mesi: più volume in Z2, una settimana leggera vera ogni 3-4, un blocco di VO2max, sonno e carboidrati nelle sedute dure.",
        "Un aumento sotto il 3-5% non si vede da un test all'altro: guarda il trend dell'eFTP.",
      ],
      chips: ["Devo cambiare l'FTP?", "Test CP: quando?"],
    }),
  },
  {
    id: "vo2_migliorare",
    title: "Migliorare il VO2max",
    re: /\b(vo2|vo 2|massimo consumo|potenza aerobica massima|map)\b.*\b(miglior\w*|alzare|aumentar\w*|allenar\w*|come)\b|\b(come|miglior\w*|allenar\w*)\b.*\b(vo2|vo 2)\b/,
    ex: ["come miglioro il vo2max?", "come si allena il vo2", "che ripetute per il vo2max"],
    say: (c) => ({
      text: "🫀 Il VO2max si allena con 15-25 minuti totali tra il 106 e il 120% dell'FTP.",
      lines: [
        `Classici: 5×4' o 4×5' a ${pct(c, 1.08, 1.18)} con recupero uguale; 30"/15" (3×10' di 30 secondi forti e 15 facili); 5×3' per cominciare.`,
        "Conta il tempo vicino al massimo: le ultime ripetute devono essere dure ma con la stessa potenza delle prime.",
        "Una volta a settimana per 4-6 settimane rende molto; poi si mantiene con meno.",
        "Il giorno prima facile e la prontezza verde: col VO2 la fatica pesa più che con la Z2.",
      ],
    }),
  },
  {
    id: "resistenza",
    title: "Resistere più a lungo",
    re: /\b(resistenz\w*|durability|durabilita|calo nel finale|crollo|crollare|reggere di piu|resistere|mi pianto|scoppio|cedo|nel finale)\b/,
    ex: ["come reggo di più nelle uscite lunghe?", "dopo 3 ore crollo", "nel finale delle granfondo cedo", "come miglioro la resistenza"],
    say: () => ({
      text: "🔋 La resistenza (durability) si costruisce con lunghe progressive e mangiando bene.",
      lines: [
        "La lunga cresce di 15-30 minuti a settimana, quasi tutta in Z2; dal Build un po' di lavoro nel finale (sweet spot o tempo dopo 2-3 ore).",
        "Il crollo nel finale è spesso fame: 60-90 g di carboidrati l'ora dalla prima mezz'ora, non quando hai già fame.",
        "Il dato da guardare: la potenza dei tuoi migliori 5-20' dopo 2-3 ore rispetto a quella da fresco (pagina Potenza → durability).",
        "Disaccoppiamento sotto il 5% nella lunga = fondo solido.",
      ],
      chips: ["Quanto mangio in una lunga?"],
    }),
  },
  {
    id: "ftp_stallo",
    title: "Prestazioni ferme",
    re: /\b(non miglior\w*|sono fermo|fermo da|stallo|plateau|peggiorat\w*|vado piu piano|non progredisco|non cresco)\b/,
    ex: ["non miglioro più", "sono fermo da mesi", "vado più piano di prima", "non progredisco"],
    say: (c) => ({
      text: "Quando non si migliora, quasi sempre è una di queste: poco recupero, poca varietà, poco volume facile, poco carburante.",
      lines: [
        `Recupero: oggi sei ${ready(c)}; se l'HRV è spesso sotto il range, il carico non viene assorbito.`,
        "Varietà: lo stesso stimolo per mesi smette di funzionare; un blocco di 4-6 settimane con un focus diverso (VO2max, o forza) sblocca.",
        "Volume: la base in Z2 è ciò che sostiene tutto il resto.",
        "Carburante: sedute dure a stomaco vuoto o con pochi carboidrati rendono meno.",
        "Prima di concludere guarda il trend: eFTP e record degli ultimi 3 mesi, non una singola uscita.",
      ],
      chips: ["I miei record", "Devo cambiare l'FTP?", "Rispetto a un anno fa?"],
    }),
  },
  // ── Racing and events ───────────────────────────────────────────────────────────────────────────
  {
    id: "granfondo",
    title: "Preparare una granfondo",
    re: /\b(granfondo|gran fondo|mediofondo|medio fondo|randonnee|brevetto|ciclosportiv\w*)\b/,
    ex: ["come mi preparo a una granfondo?", "consigli per la granfondo", "quanto allenarsi per una mediofondo"],
    say: (c) => ({
      text: "🏁 Per una granfondo servono tre cose: reggere la durata, tenere il ritmo in salita, mangiare bene.",
      lines: [
        "Lunghe che arrivano almeno all'80% della durata di gara nelle ultime 4-6 settimane, con salite al ritmo gara nel finale.",
        "Soglia e VO2max una volta a settimana ciascuno nel Build; la settimana prima scarico (tapering) con qualche apertura breve.",
        `Mangiare: 60-90 g/h${carbCap(c) ? ` (tu ne tolleri ${carbCap(c)}: allenati per salire)` : ""} e prova in allenamento tutto quello che userai in gara.`,
        "In gara: prime salite sotto soglia (85-90% FTP), stai a ruota in pianura, l'ultima ora è dove si fa la differenza.",
      ],
      chips: ["A che punto sono col piano?", "Cos'è il tapering?"],
    }),
  },
  {
    id: "gara_giorno",
    title: "Il giorno della gara",
    re: /\b(giorno della gara|prima della gara|in gara|alla partenza|riscaldamento pre gara|strategia di gara|gareggiare|domani gara|domenica gara)\b/,
    ex: ["cosa faccio il giorno della gara?", "come mi riscaldo prima della gara?", "strategia in gara", "domenica ho una gara, consigli?"],
    say: () => ({
      text: "🏁 Il giorno della gara: niente di nuovo, tutto provato.",
      lines: [
        "Colazione 3 ore prima, 1-3 g di carboidrati per kg (pane, marmellata, riso, poco grasso e poche fibre).",
        "Riscaldamento: per gare lunghe 10-15' facili con 2-3 accelerazioni; per crono o gare corte 20-25' con qualche minuto a soglia.",
        "Alla partenza tutti vanno fortissimo: prendi una ruota e resta sotto soglia per i primi 15-20 minuti.",
        "Mangia dalla prima mezz'ora e bevi a sorsi ogni 15'.",
      ],
    }),
  },
  {
    id: "crono",
    title: "Cronometro",
    re: /\b(crono\w*|contro il tempo|time trial|tt)\b/,
    ex: ["come si fa una cronometro?", "consigli per la crono", "come gestisco una crono"],
    say: (c) => ({
      text: "⏱️ La crono si vince con il ritmo più costante possibile e la posizione.",
      lines: [
        `Ritmo: per 20-40 minuti 95-100% FTP (${pct(c, 0.95, 1.0)}), i primi 2 minuti sotto, non sopra; ultimo quarto a tutta.`,
        "Salite: +5-10% di potenza; discese e vento a favore: un po' meno, conta l'aerodinamica.",
        "Riscaldamento 20-25' con 2-3 tratti a soglia e uno breve sopra.",
        "Posizione: provala in allenamento, una posizione che non tieni costa più di quanto rende.",
      ],
    }),
  },
  {
    id: "gruppo",
    title: "Andare in gruppo",
    re: /\b(gruppo|gruppetto|scia|scie|a ruota|ruota|ventagli\w*|tirare|cambi in testa|uscita di gruppo)\b/,
    ex: ["come si sta a ruota?", "quanto si risparmia in scia?", "come gestisco l'uscita di gruppo", "come si fanno i ventagli"],
    say: () => ({
      text: "👥 A ruota risparmi il 25-35% della fatica: è la cosa che conta di più in gruppo.",
      lines: [
        "Stai a 30-60 cm dalla ruota davanti, un po' di lato, guarda 2-3 corridori avanti e non i freni.",
        "Quando tiri: pochi secondi in più a ritmo costante, non accelerare; esci dalla parte del vento.",
        "Con vento laterale il riparo è di lato (ventaglio): se resti in coda alla fila sei al vento.",
        "Un'uscita di gruppo veloce conta come seduta di qualità: il giorno dopo facile.",
      ],
    }),
  },
  {
    id: "discesa",
    title: "Andare in discesa",
    re: /\b(discesa|discese|scendere|curve|curva|tornanti|frenare|frenata|freni)\b/,
    ex: ["come miglioro in discesa?", "ho paura in discesa", "come si fanno le curve in discesa", "come frenare in discesa"],
    say: () => ({
      text: "↘️ In discesa la regola è: freni prima della curva, mai dentro.",
      lines: [
        "Sguardo lontano, verso l'uscita della curva; la bici va dove guardi.",
        "In curva pedale esterno in basso con il peso sopra, ginocchio interno leggermente aperto, mani basse sul manubrio.",
        "Frena con entrambi i freni, più l'anteriore, in modo progressivo; con il bagnato tutto prima e più piano.",
        "La paura si toglie ripetendo la stessa discesa conosciuta, piano, poi un po' meno piano.",
      ],
    }),
  },
  // ── Weather ─────────────────────────────────────────────────────────────────────────────────────
  {
    id: "vento",
    title: "Allenarsi col vento",
    re: /\b(vento|ventoso|raffiche|bora|scirocco|maestrale|tramontana)\b/,
    ex: ["c'è vento, come mi alleno?", "con il vento forte cosa faccio?", "come gestisco il vento contro"],
    say: () => ({
      text: "🌬️ Col vento tieni d'occhio la potenza, non la velocità.",
      lines: [
        "Parti controvento e torna col vento a favore: è più sicuro e arrivi a casa meno cotto.",
        "Controvento: posizione più bassa, cadenza un po' più alta, potenza costante nella zona della seduta.",
        "Raffiche laterali forti: niente ruote ad alto profilo e strade meno esposte; sopra i 50 km/h meglio i rulli.",
        "Il vento di oggi e dei prossimi giorni lo vedi in Piano → Settimana, con la mappa.",
      ],
    }),
  },
  {
    id: "caldo",
    title: "Allenarsi col caldo",
    re: /\b(caldo|calore|afa|temperatur\w* alt\w*|estate|umidita|colpo di calore|sudo|sudore)\b/,
    ex: ["come mi alleno col caldo?", "con 35 gradi cosa faccio?", "quanto bere col caldo", "sudo tantissimo"],
    say: () => ({
      text: "☀️ Col caldo la stessa potenza costa di più: la FC sale e la seduta va adattata.",
      lines: [
        "Bevi 500-1000 ml l'ora, con 300-600 mg di sodio per litro; pesati prima e dopo: perdere oltre il 2% del peso è troppo.",
        "Esci presto la mattina; per la qualità abbassa di 5-10% la potenza oppure falla sui rulli con un buon ventilatore.",
        "Ci si abitua in 7-14 giorni di uscite al caldo, ma tranquille.",
        "Brividi, testa che gira, nausea: fermati all'ombra e bevi. È un colpo di calore.",
      ],
    }),
  },
  {
    id: "freddo",
    title: "Allenarsi col freddo",
    re: /\b(freddo|gelo|ghiaccio|inverno|invernale|temperatur\w* bass\w*|sotto zero|guanti|copriscarpe)\b/,
    ex: ["come mi vesto col freddo?", "con 3 gradi esco?", "allenarsi in inverno", "ho le mani gelate in bici"],
    say: () => ({
      text: "🥶 Col freddo vestiti a strati e scaldati più a lungo.",
      lines: [
        "Sotto i 10 °C: intimo tecnico, maglia termica, giacca antivento; sotto i 5 °C anche copriscarpe, guanti invernali e scaldacollo.",
        "Riscaldamento di 15-20': i muscoli freddi rendono meno e si strappano più facilmente.",
        "Si beve meno ma serve lo stesso, e si mangia come sempre: il freddo consuma energie.",
        "Con ghiaccio o sotto lo zero: rulli. Non vale una caduta.",
      ],
    }),
  },
  {
    id: "pioggia",
    title: "Allenarsi con la pioggia",
    re: /\b(pioggia|piove|piovere|bagnato|bagnata|acqua sulla strada|temporale)\b/,
    ex: ["con la pioggia esco?", "come si va in bici col bagnato?", "piove, cosa faccio?"],
    say: () => ({
      text: "🌧️ Col bagnato si può uscire, ma tutto più piano: le frenate si allungano e le strisce scivolano.",
      lines: [
        "Gomme 0,3-0,5 bar più sgonfie, frena prima e dritto, evita strisce, tombini e foglie.",
        "Luci accese anche di giorno e giacca impermeabile chiara.",
        "La seduta di qualità falla sui rulli: con la pioggia fuori si tiene male e si rischia.",
      ],
      chips: ["Oggi sui rulli"],
    }),
  },
  {
    id: "rulli_fuori",
    title: "Rulli o fuori",
    re: /\b(rulli|rullo|indoor|trainer|zwift)\b.*\b(fuori|strada|differenz\w*|meglio|uguale|vale)\b|\b(fuori|strada)\b.*\b(rulli|rullo|indoor)\b|\bperche\b.*\b(ftp|soglia)\b.*\b(rulli|indoor)\b|\b(rulli|rullo|indoor)\b.*\b(ftp|soglia|watt)\b.*\b(bass\w*|meno|diversa|inferiore|piu bassa)\b/,
    ex: ["meglio rulli o fuori?", "perché sui rulli la ftp è più bassa?", "un'ora di rulli vale come fuori?", "differenza tra rulli e strada"],
    say: (c) => ({
      text: "🏠 I rulli sono perfetti per la qualità; fuori per la durata e la tecnica.",
      lines: [
        c.data.athlete.indoorFtp && ftp(c) ? `Sui rulli la tua FTP è ${r0(c.data.athlete.indoorFtp)} W contro ${r0(ftp(c)!)} fuori: calore, niente inerzia e muscoli sempre in tiro fanno rendere un po' meno.` : "Sui rulli si rende un po' meno (calore, niente inerzia): per questo c'è una FTP dei rulli.",
        "Un'ora di rulli strutturata vale circa quanto 1 h 15-1 h 30 fuori, perché non ci sono pause; ma le lunghe vanno fatte fuori.",
        "Ventilatore forte e un asciugamano: il caldo è il primo limite indoor.",
        "Sui rulli oltre 75-90 minuti la testa si stanca prima delle gambe.",
      ],
    }),
  },
  // ── Technique ───────────────────────────────────────────────────────────────────────────────────
  {
    id: "cadenza",
    title: "La cadenza",
    re: /\b(cadenz\w*|rpm|pedalata rotonda|agilita|frequenza di pedalata|rapporto duro|rapporti duri|rapporto agile)\b/,
    ex: ["che cadenza devo tenere?", "è meglio pedalare agile o duro?", "come miglioro la cadenza", "quante rpm in salita"],
    say: () => ({
      text: "🔄 Per la maggior parte delle persone la cadenza migliore è tra 80 e 95 rpm in pianura, 70-90 in salita.",
      lines: [
        "Agile stanca meno i muscoli e più il cuore; duro il contrario. Nelle gare lunghe agile risparmia le gambe per il finale.",
        "Per allargare la tua gamma: qualche minuto a 100-110 rpm nella Z2 e qualche tratto a 60 rpm in salita (forza).",
        "Non serve forzare una cadenza che non è la tua: si sposta di poco con gli anni di allenamento.",
      ],
    }),
  },
  {
    id: "forza_resistente",
    title: "Forza resistente (SFR)",
    re: /\b(sfr|forza resistente|bassa cadenza|basse cadenze|agilita e forza|50 rpm|60 rpm)\b/,
    ex: ["servono le SFR?", "come si fa la forza resistente?", "le salite a bassa cadenza servono?"],
    say: (c) => ({
      text: "🧱 La forza resistente (SFR): salite a 50-60 rpm, seduto, a potenza medio-alta.",
      lines: [
        `Classico: 4-6 × 5' in salita a 50-60 rpm, ${pct(c, 0.8, 0.9)}, busto fermo, recupero 3-5' agile.`,
        "Utile in Base per abituare i muscoli alla forza; non sostituisce la palestra.",
        "Se hai fastidio alle ginocchia: no. È il primo esercizio che le irrita.",
      ],
    }),
  },
  // ── Strength and other sports ───────────────────────────────────────────────────────────────────
  {
    id: "palestra",
    title: "Pesi e bici",
    re: /\b(pesi|palestra|squat|stacchi|affondi|leg press|forza in palestra|sollevamento)\b/,
    ex: ["va bene fare pesi il giorno prima della lunga?", "come combino palestra e bici?", "quante volte faccio pesi?", "pesi prima o dopo la bici?"],
    say: (c) => ({
      text: "🏋️ I pesi aiutano la bici (sprint, salita, ossa, età), se sono messi nel posto giusto della settimana.",
      lines: [
        "2 volte a settimana in Base (squat o leg press, stacchi, affondi, core: 3-4 serie da 4-8), 1 volta nel Build per mantenere.",
        "Il giorno dopo pesi di gambe niente qualità: la forza ne risente per 24-48 ore. L'app lo controlla da sola.",
        "Il giorno prima della lunga: pesi leggeri o di busto sì; gambe pesanti no, la lunga diventerebbe faticosa e brutta.",
        "Meglio lo stesso giorno della seduta dura, dopo e a distanza di qualche ora: così il giorno facile resta facile.",
        c.data.gymDays?.length ? "Le sedute di Pesi in calendario le vedo: il motore ne tiene conto." : "Se metti «Pesi» nel calendario (foglio del giorno), il motore ne tiene conto.",
      ],
    }),
  },
  {
    id: "core",
    title: "Core e pilates",
    re: /\b(core|addominal\w*|pilates|plank|stabilita|lombari)\b/,
    ex: ["serve il core per la bici?", "il pilates aiuta?", "esercizi di core"],
    say: () => ({
      text: "🧘 Un core forte tiene il busto fermo e protegge la schiena, soprattutto nelle lunghe e in posizione bassa.",
      lines: [
        "15-20 minuti 2-3 volte a settimana: plank frontale e laterale, ponte glutei, dead bug, bird dog.",
        "Il pilates va benissimo e non affatica le gambe: si può fare anche nei giorni di Z2.",
      ],
    }),
  },
  {
    id: "stretching",
    title: "Stretching e mobilità",
    re: /\b(stretching|allungamento|allungament\w*|mobilita|flessibilita|yoga|rigid\w*)\b/,
    ex: ["devo fare stretching?", "lo stretching serve?", "lo yoga aiuta il ciclista?"],
    say: () => ({
      text: "Lo stretching non previene gli infortuni né accelera il recupero, ma la mobilità aiuta la posizione in bici.",
      lines: [
        "Utili: anche e flessori, femorali, petto e dorso (chi sta piegato tante ore si chiude in avanti).",
        "10 minuti la sera o dopo l'uscita, tenendo 30-60 secondi senza molleggiare.",
        "Prima di una seduta dura meglio un riscaldamento in bici che lo stretching statico.",
      ],
    }),
  },
  {
    id: "massaggio",
    title: "Massaggi e foam roller",
    re: /\b(massagg\w*|foam roller|rullo di gommapiuma|pistola massaggiante|massaggiator\w*|compressione|calze compressive)\b/,
    ex: ["il foam roller serve?", "i massaggi aiutano il recupero?", "le calze a compressione funzionano?"],
    say: () => ({
      text: "Massaggi e foam roller fanno stare meglio (meno indolenzimento), ma non recuperano al posto del sonno.",
      lines: [
        "Foam roller 5-10 minuti su quadricipiti, glutei e polpacci: piacevole e utile per la mobilità.",
        "Calze a compressione: effetto piccolo, utili soprattutto in viaggio.",
        "Il recupero vero: sonno, carboidrati e proteine, giorni facili davvero facili.",
      ],
    }),
  },
  {
    id: "altri_sport",
    title: "Altri sport",
    re: /\b(corsa|correre|nuoto|nuotare|calcio|calcetto|tennis|padel|sci|camminat\w*|trekking|escursion\w*|altri sport|cross training)\b/,
    ex: ["posso correre nei giorni senza bici?", "il nuoto aiuta il ciclismo?", "calcetto e bici insieme", "in inverno faccio sci, va bene?"],
    say: () => ({
      text: "Gli altri sport vanno bene: contano come carico, e il piano lo vede quando arrivano su Intervals.",
      lines: [
        "Corsa: utile per le ossa, ma le prime settimane fa male alle gambe (impatto): poca e piano.",
        "Nuoto, camminate e sci di fondo: ottimo fondo aerobico senza stancare le gambe da ciclista.",
        "Calcetto, padel, tennis: sono sedute intense a strappi; il giorno dopo niente qualità in bici.",
      ],
    }),
  },
  // ── Recovery ───────────────────────────────────────────────────────────────────────────────────
  {
    id: "riposo",
    title: "Quanto riposare",
    re: /\b(quanto riposo|quanti giorni di riposo|giorno di riposo|giorni liberi|riposare quanto|riposo completo|recupero attivo|giorno off)\b/,
    ex: ["quanti giorni di riposo devo fare?", "il giorno di riposo è meglio completo o attivo?", "quanto devo riposare"],
    say: (c) => ({
      text: "😌 Di solito 1-2 giorni a settimana senza bici, o con 30-45' facilissimi (recupero attivo).",
      lines: [
        "Recupero attivo: Z1 vera, sotto il 55% FTP, gambe che girano senza spingere. Se diventa Z2 non è più riposo.",
        "Ogni 3-4 settimane una settimana leggera (30-50% in meno): è lì che il corpo assorbe il lavoro.",
        `I tuoi giorni di allenamento nella scheda: ${c.profile?.giorni?.length ? c.profile.giorni.map((d) => ["lun", "mar", "mer", "gio", "ven", "sab", "dom"][d]).join(", ") : "non li ho"}; gli altri sono riposo.`,
      ],
    }),
  },
  {
    id: "sonno_quanto",
    title: "Quanto dormire",
    re: /\b(quanto dormire|quante ore dormire|dormire meglio|dormo meglio|dormire bene|dormo male|dormo poco|insonnia|addormentarmi|svegli\w* di notte|sonno migliore|migliorare il sonno)\b/,
    ex: ["quanto dovrei dormire?", "come dormo meglio?", "mi sveglio di notte", "faccio fatica ad addormentarmi"],
    say: (c) => {
      const n = c.data.sleep.slice(-7).map((s) => s.hours).filter((h): h is number => h != null);
      const m = n.length ? n.reduce((a, b) => a + b, 0) / n.length : null;
      return {
        text: "😴 Chi si allena dovrebbe dormire 7-9 ore: è il recupero più potente e gratuito.",
        lines: [
          m ? `Tu nelle ultime notti: in media ${r1(m)} ore.` : "Non ho i tuoi dati di sonno recenti.",
          "Orari regolari (anche nel weekend), camera fresca (17-19 °C) e buia, niente schermi nell'ultima mezz'ora.",
          "Caffè non dopo le 14-15; alcol la sera peggiora sonno e HRV anche se fa addormentare.",
          "Allenamento duro la sera tardi può tenere svegli: meglio finire 2-3 ore prima di dormire.",
        ],
      };
    },
  },
  {
    id: "sovrallenamento",
    title: "Sovrallenamento",
    re: /\b(sovrallenament\w*|overtraining|overreaching|troppo carico|mi alleno troppo|esaurito|sempre stanco|sempre stanca)\b|\b(stanc\w*|sfinit\w*|senza energi\w*|scaric\w*|svuotat\w*|a pezzi|cotto|cotta) da (giorni|una settimana|settimane|tempo|mesi|un po)\b/,
    ex: ["sono sovrallenato?", "come capisco se mi alleno troppo?", "sono sempre stanco da giorni", "segnali di overtraining"],
    say: (c) => ({
      text: "⚠️ I segnali di troppo carico: stanchezza che non passa, voglia che manca, sonno peggiore, HRV sotto il range e FC a riposo sopra per più giorni.",
      lines: [
        `I tuoi numeri oggi: prontezza ${ready(c)}, ${c.data.status.autonomic.title.toLowerCase()}.`,
        "Non è mai una seduta: è la somma di settimane. Una settimana leggera vera di solito risolve; se dopo 2 settimane facili sei ancora a terra, senti il medico (anche per gli esami del sangue).",
        "Le gambe pesanti dopo una settimana di carico sono normali: devono passare con 2-3 giorni facili.",
      ],
      chips: ["Come va l'HRV questa settimana?", "Come sto?"],
    }),
  },
  {
    id: "hrv_bassa",
    title: "HRV bassa: cosa fare",
    re: /\b(hrv)\b.*\b(bassa|basso|cala|calata|scesa|giu|crollata|male)\b|\b(bassa|cala|calata|scesa|crollata)\b.*\bhrv\b/,
    ex: ["ho l'hrv bassa, cosa faccio?", "l'hrv è calata, mi alleno?", "perché l'hrv è scesa?"],
    say: () => ({
      text: "Un'HRV bassa per una notte dice poco; conta la media di 7 giorni contro il tuo normale (metodo Altini).",
      lines: [
        "Una notte bassa: allenamento previsto, ma ascoltati. Due o tre di fila, o media sotto il range: giornate facili finché risale.",
        "Le cause più comuni: carico alto, poco sonno, alcol, stress, viaggi, un malanno in arrivo (la FC a riposo che sale insieme lo conferma).",
        "Non inseguire il numero alto: un'HRV molto sopra il normale con gambe vuote a volte è fatica profonda.",
      ],
      chips: ["Come va l'HRV questa settimana?", "Com'è andata stanotte?"],
    }),
  },
  {
    id: "malato_allenarsi",
    title: "Allenarsi da malati",
    re: /\b(raffreddor\w*|raffreddat\w*|naso chiuso|mal di gola|tosse|febbricola|mi sto ammalando|sto male)\b.*\b(allen\w*|bici|uscire|pedalare|posso)\b|\b(posso|devo)\b.*\b(allen\w*|bici|uscire)\b.*\b(raffreddor\w*|raffreddat\w*|mal di gola|tosse|malato)\b/,
    ex: ["ho il raffreddore, posso allenarmi?", "ho mal di gola, esco in bici?", "mi sto ammalando, mi alleno?"],
    say: () => ({
      text: "🤒 La regola del collo: sintomi solo sopra il collo (naso, gola leggera) → al massimo Z1-Z2 breve; sotto il collo o febbre → stop.",
      lines: [
        "Con la febbre: riposo finché dura, poi 7 giorni di sola Z1-Z2 sotto i 45 minuti. Allenarsi con la febbre può dare problemi al cuore.",
        "Tosse al petto, dolori muscolari, mal di pancia: niente bici.",
        "Se hai la febbre scrivimi «ho la febbre da ieri»: la segno su Intervals e il piano si adatta.",
      ],
      chips: ["Ho la febbre da oggi"],
    }),
  },
  {
    id: "rientro",
    title: "Ripartire dopo uno stop",
    re: /\b(ripartire|ripresa|riprendere|rientro|ricominciare|dopo le ferie|dopo la vacanza|dopo uno stop|dopo la pausa|fermo da)\b/,
    ex: ["come riparto dopo le ferie?", "sono stato fermo due settimane, come riprendo?", "rientro dopo uno stop"],
    say: () => ({
      text: "🔁 Dopo uno stop si riparte facile: la fitness torna più in fretta di quanto si perde.",
      lines: [
        "Fino a 1 settimana ferma: quasi niente perso, 2-3 giorni facili e poi normale.",
        "2-3 settimane: una settimana di Z2 crescente, poi qualità corta; dopo 4 settimane conta come una nuova base.",
        "Il piano mette da solo una settimana leggera di rientro dopo le ferie segnate su Intervals.",
      ],
    }),
  },
  {
    id: "alcol",
    title: "Alcol",
    re: /\b(alcol|alcool|birra|birre|vino|spritz|aperitivo|sbronz\w*|bevuto troppo|serata fuori)\b/,
    ex: ["l'alcol fa male agli allenamenti?", "ieri sera ho bevuto, mi alleno?", "una birra dopo l'uscita va bene?"],
    say: () => ({
      text: "🍷 L'alcol peggiora sonno, HRV e recupero, anche in piccole dosi la sera.",
      lines: [
        "Un bicchiere ogni tanto non cambia nulla; due o più la sera si vedono nell'HRV della notte (spesso una notte anomala).",
        "Dopo una serata: la mattina dopo niente qualità, Z2 o riposo, e acqua.",
        "Dopo l'uscita lunga la birra non reintegra: prima acqua, carboidrati e proteine.",
      ],
    }),
  },
  {
    id: "caffeina",
    title: "Caffeina",
    re: /\b(caffe|caffeina|espresso|energy drink|gel con caffeina)\b/,
    ex: ["il caffè prima dell'allenamento aiuta?", "quanta caffeina prima della gara?", "posso usare gel con caffeina?"],
    say: (c) => ({
      text: "☕ La caffeina migliora la prestazione di qualche punto percentuale: è uno dei pochi aiuti che funzionano.",
      lines: [
        `Dose utile: 2-3 mg per kg 45-60 minuti prima${kg(c) ? ` (per te ${r0(kg(c)! * 2)}-${r0(kg(c)! * 3)} mg: un espresso ne ha circa 60-80)` : ""}.`,
        "Nelle gare lunghe un gel con caffeina nell'ultima ora aiuta.",
        "Non oltre il primo pomeriggio se vuoi dormire, e provala prima in allenamento (a qualcuno dà nausea o tremori).",
      ],
    }),
  },
  {
    id: "stress",
    title: "Stress e lavoro",
    re: /\b(stress|stressat\w*|lavoro pesante|settimana pesante al lavoro|ansia|preoccupat\w*|esami|trasloco|figli piccoli)\b/,
    ex: ["sono molto stressato al lavoro, mi alleno?", "periodo pesante al lavoro", "lo stress conta per l'allenamento?"],
    say: () => ({
      text: "Lo stress della vita pesa sul recupero quanto l'allenamento: il corpo non distingue.",
      lines: [
        "Nei periodi pesanti meglio meno intensità e più Z2 breve: tiene la forma e scarica la testa.",
        "Si vede nell'HRV: se cala senza che tu abbia caricato di più, è lo stress.",
        "Puoi dirmi «questa settimana solo 5 ore»: abbasso il carico solo per quella settimana.",
      ],
      chips: ["Questa settimana solo 5 ore"],
    }),
  },
  {
    id: "viaggio",
    title: "Viaggi e fuso",
    re: /\b(viaggio|viaggi|aereo|volo|fuso orario|jet lag|trasferta)\b/,
    ex: ["come gestisco l'allenamento in viaggio?", "dopo un volo lungo mi alleno?", "jet lag e allenamento"],
    say: () => ({
      text: "✈️ Viaggi e voli lunghi stancano più di quanto sembri: il giorno dopo facile.",
      lines: [
        "Il giorno del volo bevi tanto e muoviti; la sera una passeggiata o 30' facili, niente qualità.",
        "Col fuso: un giorno di adattamento ogni ora o due di differenza prima delle sedute dure.",
        "Se sei via giorni senza bici, scrivimi le date («ferie dal 10 al 20 dicembre»): il piano si adatta.",
      ],
    }),
  },
  {
    id: "eta",
    title: "Età e recupero",
    re: /\b(eta|over ?40|over ?50|anni che passano|invecchiare|alla mia eta|piu vecchio|master)\b/,
    ex: ["alla mia età recupero più lentamente?", "dopo i 40 come mi alleno?", "da master cosa cambia"],
    say: () => ({
      text: "Con gli anni si perde prima la potenza massima e si recupera un po' più piano: si compensa.",
      lines: [
        "Tieni l'intensità (VO2max e sprint) ma con più spazio tra le sedute dure.",
        "La palestra diventa importante: muscoli e ossa si perdono prima della resistenza.",
        "Sonno e proteine (1,6-2 g per kg) contano di più.",
      ],
    }),
  },
  // ── Nutrition ───────────────────────────────────────────────────────────────────────────────────
  {
    id: "colazione",
    title: "Cosa mangiare prima",
    re: /\b(colazione|prima dell uscita|prima di uscire|prima dell allenamento|prima di pedalare|cosa mangio prima|pasto prima)\b/,
    ex: ["cosa mangio a colazione prima di uscire?", "cosa mangiare prima dell'allenamento?", "quanto prima devo mangiare?"],
    say: (c) => ({
      text: "🍞 Prima di uscire: carboidrati facili da digerire, poco grasso e poche fibre.",
      lines: [
        `2-3 ore prima: 1-2 g di carboidrati per kg${kg(c) ? ` (${r0(kg(c)!)}-${r0(kg(c)! * 2)} g per te)` : ""}: pane e marmellata o miele, fette biscottate, riso, banana, un caffè.`,
        "Se esci subito: qualcosa di piccolo 30-60' prima (una banana, una barretta) e cominci a mangiare in bici prima.",
        "Per la Z2 breve va bene anche poco; per le sedute dure e le lunghe no: si rende meno.",
      ],
    }),
  },
  {
    id: "carico_carbo",
    title: "Carico di carboidrati",
    re: /\b(carico di carboidrati|caricare carboidrati|carico di carbo|cena prima della gara|giorno prima della gara|pasta party|giorni prima della gara)\b/,
    ex: ["devo fare il carico di carboidrati?", "cosa mangio il giorno prima della gara?", "cena prima della granfondo"],
    say: (c) => ({
      text: "🍝 Per gare oltre i 90 minuti il carico di carboidrati serve: 1-2 giorni prima.",
      lines: [
        `8-10 g di carboidrati per kg al giorno nelle 36-48 ore prima${kg(c) ? ` (${r0(kg(c)! * 8)}-${r0(kg(c)! * 10)} g per te)` : ""}: pasta, riso, pane, patate, succhi, dolci semplici.`,
        "Meno fibre e grassi in quei giorni, per non appesantire la pancia.",
        "Cena normale-abbondante la sera prima, non un'abbuffata: il grosso lo fanno i giorni prima.",
      ],
    }),
  },
  {
    id: "mangiare_uscita",
    title: "Mangiare in bici",
    re: /\b(mangiare in bici|mangio in bici|durante l uscita|durante la lunga|in uscita|ogni quanto mangiare|quanto mangio|cosa mangio in bici|rifornimento|fame in bici|crisi di fame)\b/,
    ex: ["quanto mangio in una lunga?", "ogni quanto devo mangiare in bici?", "cosa mangio durante l'uscita?", "ho avuto una crisi di fame"],
    say: (c) => ({
      text: "🍌 In bici si mangia per durata e intensità, cominciando presto.",
      lines: [
        "Sotto i 60': acqua. 60-150': 30-60 g/h. Oltre 150' o in gara: 60-90 g/h.",
        carbCap(c) ? `Tu ne tolleri ${carbCap(c)} g/h: resta lì e sali di 10 g/h ogni 2-4 settimane.` : "Comincia da quanto tolleri e sali di 10 g/h ogni 2-4 settimane.",
        "Ogni 20-30 minuti, dalla prima mezz'ora: la crisi di fame arriva quando è già tardi.",
        "Esempi: un gel ≈ 25-40 g, una barretta ≈ 30-45 g, una banana ≈ 25 g, una borraccia di sport drink ≈ 30-60 g.",
      ],
      chips: ["Ho preso 60 g/h"],
    }),
  },
  {
    id: "gel_barrette",
    title: "Gel, barrette e bevande",
    re: /\b(gel|barrett\w*|maltodestrin\w*|sport drink|bevanda|isotonic\w*|fruttosio|glucosio)\b/,
    ex: ["meglio gel o barrette?", "che bevanda metto nella borraccia?", "cos'è il rapporto glucosio fruttosio?"],
    say: () => ({
      text: "Gel, barrette e bevande sono solo modi diversi di portare carboidrati: scegli quelli che digerisci.",
      lines: [
        "Sopra i 60 g/h serve un mix di glucosio (o maltodestrine) e fruttosio, circa 2:1: l'intestino ne assorbe di più.",
        "Barrette e cibo vero nella prima parte, gel e bevande nel finale e quando l'intensità sale.",
        "In borraccia: 30-60 g di carboidrati e un pizzico di sodio per mezzo litro.",
      ],
    }),
  },
  {
    id: "train_gut",
    title: "Allenare la pancia",
    re: /\b(pancia|stomaco|intestino|nausea mangiando|mal di pancia in bici|non digerisco|tollerare carboidrati|train the gut)\b/,
    ex: ["mi viene mal di pancia quando mangio in bici", "come tollero più carboidrati?", "lo stomaco non regge i gel"],
    say: (c) => ({
      text: "La pancia si allena come le gambe: con l'abitudine si tollerano più carboidrati.",
      lines: [
        `Sali di 10 g/h ogni 2-4 settimane nelle uscite lunghe${carbCap(c) ? ` (ora sei a ${carbCap(c)} g/h)` : ""}.`,
        "Prova i prodotti della gara sempre in allenamento; evita fibre, grassi e latte prima e durante.",
        "Bevi insieme ai gel: concentrati e senza acqua sono la causa più comune del mal di pancia.",
      ],
    }),
  },
  {
    id: "idratazione",
    title: "Bere e sali",
    re: /\b(bere|bevo|idratazion\w*|acqua|borracc\w*|disidratat\w*|sali minerali|sodio|elettroliti)\b/,
    ex: ["quanto devo bere in bici?", "servono i sali minerali?", "quante borracce per 3 ore?"],
    say: () => ({
      text: "💧 In bici si beve 400-800 ml l'ora, di più col caldo; non serve bere oltre la sete.",
      lines: [
        "Sodio: 300-600 mg per litro nelle uscite oltre le 2 ore o col caldo.",
        "Una borraccia da 500-750 ml l'ora è un buon riferimento; pesarti prima e dopo ti dice quanto perdi.",
        "Bere troppa acqua senza sali nelle uscite lunghe è pericoloso quanto bere troppo poco.",
      ],
    }),
  },
  {
    id: "crampi",
    title: "Crampi",
    re: /\b(crampi|crampo|crampetti)\b/,
    ex: ["ho sempre i crampi", "come evito i crampi?", "i crampi sono per il magnesio?"],
    say: () => ({
      text: "I crampi in bici vengono quasi sempre dalla fatica del muscolo, meno da sali e magnesio.",
      lines: [
        "Succedono quando vai oltre quello a cui sei abituato: più durata, più intensità, più caldo del solito.",
        "Aiuta: ritmo più regolare, cadenza un po' più alta, carboidrati e sodio nelle lunghe, allenare la durata.",
        "Se vengono a riposo o di notte spesso, parlane col medico.",
      ],
    }),
  },
  {
    id: "dopo_allenamento",
    title: "Mangiare dopo",
    re: /\b(dopo l allenamento|dopo l uscita|dopo la lunga|recupero alimentare|cosa mangio dopo|pasto dopo|proteine dopo|finestra anabolica)\b/,
    ex: ["cosa mangio dopo l'allenamento?", "quante proteine dopo l'uscita?", "pasto dopo la lunga"],
    say: (c) => ({
      text: "🥗 Dopo le sedute dure e le lunghe: carboidrati e proteine entro 1-2 ore.",
      lines: [
        `Carboidrati 1-1,2 g per kg${kg(c) ? ` (${r0(kg(c)!)}-${r0(kg(c)! * 1.2)} g)` : ""} e 20-40 g di proteine: pasta o riso con legumi, pesce, uova o yogurt.`,
        "Dopo una Z2 corta basta il pasto normale.",
        "Se il giorno dopo hai qualità, il pasto della sera conta quanto quello subito dopo.",
      ],
    }),
  },
  {
    id: "proteine",
    title: "Proteine",
    re: /\b(proteine|proteico|proteica|whey|carne|legumi)\b/,
    ex: ["quante proteine devo mangiare?", "servono le proteine in polvere?", "il ciclista ha bisogno di proteine?"],
    say: (c) => ({
      text: "🥚 Chi si allena tanto ha bisogno di 1,4-2 g di proteine per kg al giorno.",
      lines: [
        kg(c) ? `Per te: circa ${r0(kg(c)! * 1.4)}-${r0(kg(c)! * 2)} g al giorno, divisi in 3-4 pasti da 20-40 g.` : "Divise in 3-4 pasti da 20-40 g.",
        "Le polveri sono comode, non necessarie: uova, latticini, pesce, carne, legumi bastano.",
        "Quando dimagrisci servono di più (verso i 2 g/kg) per non perdere muscolo.",
      ],
    }),
  },
  {
    id: "peso",
    title: "Perdere peso senza perdere watt",
    re: /\b(dimagrir\w*|perdere peso|calare di peso|perdo peso|scendere di peso|chili in meno|dieta|deficit|peso forma|grasso)\b/,
    ex: ["come perdo peso senza perdere watt?", "voglio dimagrire", "conviene fare la dieta?", "come arrivo al peso forma"],
    say: (c) => ({
      text: "⚖️ Si dimagrisce piano: 0,25-0,5 kg a settimana, senza togliere carboidrati alle sedute importanti.",
      lines: [
        kg(c) ? `Oggi pesi ${r1(kg(c)!)} kg${wkg(c) ? ` (${r1(wkg(c)!)} W/kg)` : ""}.` : "Il peso lo leggo da Intervals.",
        "Deficit di 300-500 kcal al giorno nei giorni facili; nei giorni di qualità e nelle lunghe mangia normale.",
        "Proteine alte (circa 2 g/kg) e pesi 2 volte a settimana: si perde grasso e non muscolo.",
        "Il periodo giusto è la Base, non il Build né il picco. E niente digiuni prima della qualità.",
      ],
    }),
  },
  {
    id: "digiuno",
    title: "Allenarsi a digiuno",
    re: /\b(digiuno|a stomaco vuoto|senza colazione|fasted|low carb|chetogenic\w*)\b/,
    ex: ["è utile allenarsi a digiuno?", "posso fare la Z2 senza colazione?", "la dieta low carb va bene per il ciclismo?"],
    say: (c) => ({
      text: "Il digiuno va bene solo per uscite facili e corte; per la qualità rende meno.",
      lines: [
        "Z1-Z2 fino a 60-90 minuti a stomaco vuoto, se ti senti bene; acqua e qualcosa in tasca.",
        "Mai prima di soglia, VO2max o lunghe: la prestazione cala e la seduta vale meno.",
        c.profile?.digiuno ? `La tua scheda dice: «${c.profile.digiuno}». Il motore lo rispetta.` : "Nella scheda puoi dire se lo fai: il motore lo rispetta.",
      ],
    }),
  },
  {
    id: "integratori",
    title: "Integratori",
    re: /\b(integrator\w*|magnesio|potassio|creatina|beta alanina|bicarbonato|nitrati|barbabietola|vitamina|vitamine|omega|collagene)\b/,
    ex: ["quali integratori servono?", "il magnesio serve?", "la creatina va bene per il ciclista?", "il succo di barbabietola funziona?"],
    say: () => ({
      text: "💊 Pochi integratori funzionano davvero; il resto è soprattutto marketing.",
      lines: [
        "Con prove solide: caffeina, carboidrati in bici, nitrati (succo di barbabietola, 2-3 ore prima), bicarbonato (sforzi da 1-10 minuti, ma dà problemi di pancia).",
        "Creatina: utile per sprint e palestra, meno per le gare lunghe (fa salire un po' il peso).",
        "Ferro, vitamina D, B12: solo se gli esami dicono che mancano.",
        "Magnesio e sali per i crampi: utili solo se ne perdi tanti col sudore.",
      ],
    }),
  },
  {
    id: "ferro",
    title: "Ferro e stanchezza",
    re: /\b(ferro|ferritina|anemia|anemico|emoglobina|esami del sangue|analisi del sangue)\b/,
    ex: ["mi sento sempre stanco, può essere il ferro?", "devo fare gli esami del sangue?", "la ferritina bassa conta?"],
    say: () => ({
      text: "La ferritina bassa è una causa frequente di stanchezza negli sportivi di resistenza.",
      lines: [
        "Gli esami utili una o due volte l'anno: emocromo, ferritina, vitamina D, tiroide; chiedili al medico.",
        "Il ferro si prende solo se manca davvero e su indicazione del medico: in eccesso fa male.",
      ],
    }),
  },
  // ── Methods ─────────────────────────────────────────────────────────────────────────────────────
  {
    id: "z2_perche",
    title: "Perché la Z2",
    re: /\b(z2|zona 2|fondo lento|fondo facile|endurance|lento)\b.*\b(perche|serve|utile|a cosa|tanto|troppa|sempre)\b|\b(perche|serve|a cosa)\b.*\b(z2|zona 2|andare piano|fondo lento)\b/,
    ex: ["perché devo fare così tanta z2?", "a cosa serve la zona 2?", "andare piano serve davvero?", "la z2 è inutile?"],
    say: (c) => ({
      text: "🐢 La Z2 costruisce il motore: più mitocondri e capillari, più grassi bruciati, più resistenza. E si recupera in fretta.",
      lines: [
        `La tua Z2: ${pct(c, 0.56, 0.75)}, un ritmo in cui riesci a parlare a frasi intere.`,
        "È il 70-80% del tempo della settimana in quasi tutti i metodi seri, anche quello dell'app (piramidale).",
        "Non serve farne solo quella per mesi: la qualità c'è tutto l'anno, a dosi diverse.",
      ],
      chips: ["Le mie zone", "Polarizzato o piramidale?"],
    }),
  },
  {
    id: "zona_grigia",
    title: "Zona grigia",
    re: /\b(zona grigia|troppo z3|sempre a medio|sempre forte|tutte le uscite forte|vado sempre forte|ritmo medio)\b/,
    ex: ["vado sempre forte, è sbagliato?", "cos'è la zona grigia?", "faccio troppo z3?"],
    say: (c) => ({
      text: "Andare sempre «medio-forte» stanca troppo per recuperare e troppo poco per migliorare: è la zona grigia.",
      lines: [
        "Facile quando è facile, duro quando è duro: così le sedute di qualità riescono davvero.",
        `Nelle tue ultime settimane: ${r0(c.data.distribution.low * 100)}% del tempo in Z1-Z2, ${r0(c.data.distribution.mid * 100)}% in Z3, ${r0(c.data.distribution.high * 100)}% sopra (${c.data.distribution.pattern}).`,
      ],
    }),
  },
  {
    id: "riscaldamento",
    title: "Riscaldamento e defaticamento",
    re: /\b(riscald\w*|defatic\w*|scaldarsi|warm ?up|cool ?down)\b/,
    ex: ["quanto devo riscaldarmi?", "serve il defaticamento?", "come mi scaldo prima delle ripetute"],
    say: () => ({
      text: "🔥 Prima del lavoro duro: 10-20 minuti progressivi, con un paio di minuti al ritmo della prima ripetuta.",
      lines: [
        "Prima del VO2 e degli sprint qualche accelerazione breve (10-20 secondi) aiuta tanto.",
        "Defaticamento: 5-10 minuti facili. Non accelera il recupero di molto, ma ti lascia più sciolto.",
        "Le sedute che crea l'app hanno già riscaldamento e defaticamento.",
      ],
    }),
  },
  {
    id: "recupero_ripetute",
    title: "Recupero tra le ripetute",
    re: /\b(recupero tra|recuperi tra|quanto recupero|pausa tra le ripetute|recupero delle ripetute)\b/,
    ex: ["quanto recupero tra le ripetute?", "recupero tra le serie di soglia", "quanto deve durare la pausa tra le ripetute di vo2?"],
    say: () => ({
      text: "Il recupero dipende dallo scopo: più l'intensità è alta, più deve essere lungo.",
      lines: [
        "Sweet spot e soglia: 1/4-1/2 della ripetuta (2×20' con 5-10', 3×10' con 3-5').",
        "VO2max: circa uguale alla ripetuta (4' forte, 3-4' facile).",
        "Sprint e anaerobico: lungo, 3-5 minuti, per farli tutti al massimo.",
      ],
    }),
  },
  {
    id: "tapering",
    title: "Scarico prima della gara",
    re: /\b(tapering|taper|scarico pre gara|scarico prima|scaricare prima|scaric\w* prima della gara|settimana prima della gara|ultima settimana prima)\b/,
    ex: ["come faccio lo scarico prima della gara?", "cosa faccio la settimana prima della granfondo?", "come funziona il tapering?"],
    say: () => ({
      text: "📉 Lo scarico (tapering): 7-14 giorni con il volume giù del 40-60%, l'intensità no.",
      lines: [
        "Si tengono sedute brevi e intense (qualche ripetuta a soglia o VO2), si accorcia tutto il resto.",
        "Due giorni prima riposo o facile, il giorno prima 30-45' con 2-3 aperture brevi.",
        "Ti sentirai un po' strano, pesante: è normale. La forma arriva il giorno della gara.",
      ],
    }),
  },
  {
    id: "scarico",
    title: "Settimana leggera",
    re: /\b(settimana di scarico|settimana leggera|settimana di recupero|scaricare|quando scaricare)\b/,
    ex: ["quando faccio la settimana di scarico?", "a cosa serve la settimana leggera?", "come si fa una settimana di recupero?"],
    say: (c) => {
      const next = c.plan?.weeks.find((w) => w.start > c.today && w.kind === "scarico");
      return {
        text: "🛌 Una settimana leggera ogni 3-4: il volume scende del 30-50%, resta una qualità corta.",
        lines: [
          "È lì che il corpo assorbe il lavoro: saltarla è il modo più rapido per fermarsi.",
          next ? `La tua prossima: dal ${Number(next.start.slice(8))}/${next.start.slice(5, 7)}.` : "Nel tuo piano la vedi nella pagina Stagione.",
          "Se HRV e sonno peggiorano, si può anticipare: «rendi leggera questa settimana».",
        ],
      };
    },
  },
  {
    id: "quante_ore",
    title: "Quante ore servono",
    re: /\b(quante ore|quanto devo allenarmi|quanto tempo devo|ore a settimana|ore settimanali|abbastanza ore|mi alleno abbastanza)\b/,
    ex: ["quante ore devo allenarmi a settimana?", "mi alleno abbastanza?", "quanto tempo serve per migliorare?"],
    say: (c) => ({
      text: "⏳ Con 6-10 ore a settimana un amatore migliora tanto, se le ore sono ben distribuite.",
      lines: [
        c.setup?.maxHours ? `Nel tuo piano: al massimo ${c.setup.maxHours} ore a settimana.` : "Il massimo di ore lo scegli nella Stagione.",
        "Con poche ore conta di più la qualità (2 sedute dure) e la costanza; con tante ore conta di più la Z2.",
        "Meglio 8 ore ogni settimana che 15 una e 3 quella dopo.",
      ],
      chips: ["Com'è andata la settimana?", "Massimo 8 ore a settimana"],
    }),
  },
  {
    id: "progressione",
    title: "Quanto aumentare il carico",
    re: /\b(aumentare il carico|quanto aumentare|progressione|crescere di carico|caricare di piu|alzare il volume)\b/,
    ex: ["quanto posso aumentare il carico ogni settimana?", "come faccio la progressione?", "posso caricare di più?"],
    say: (c) => ({
      text: "📈 Il CTL può salire di 3-5 punti a settimana in modo sostenibile per un amatore.",
      lines: [
        c.setup ? `Il tuo piano è «${c.setup.ramp}».` : "Il ritmo di crescita lo scegli nella Stagione.",
        c.data.status.rampRate != null ? `Negli ultimi 7 giorni il CTL è salito di ${r1(c.data.status.rampRate)}.` : "",
        "Oltre +7-8 a settimana per più settimane il rischio di fermarsi sale molto.",
      ].filter(Boolean),
      chips: ["Più prudente col carico", "A che punto sono col piano?"],
    }),
  },
  {
    id: "doppia",
    title: "Due sedute nello stesso giorno",
    re: /\b(doppia seduta|due sedute|due allenamenti|mattina e sera|doppio allenamento)\b/,
    ex: ["posso fare due sedute nello stesso giorno?", "mattina rulli e sera palestra va bene?"],
    say: () => ({
      text: "Due sedute nello stesso giorno vanno bene se una è facile o di forza, con almeno 6 ore in mezzo.",
      lines: ["Prima quella più importante (la qualità), poi l'altra.", "Due sedute dure nello stesso giorno: solo per atleti molto allenati, raramente."],
    }),
  },
  {
    id: "fc_potenza",
    title: "Frequenza o potenza",
    re: /\b(frequenza cardiaca|cardio|battiti|fc)\b.*\b(potenza|watt|meglio|differenz\w*|alta|sale|deriva)\b|\b(potenza|watt)\b.*\b(frequenza|battiti|cardio)\b/,
    ex: ["meglio allenarsi a frequenza o a potenza?", "perché la frequenza sale anche se i watt sono uguali?", "la fc è alta in allenamento, è normale?"],
    say: () => ({
      text: "La potenza dice quanto lavori, la frequenza come stai rispondendo: servono entrambe.",
      lines: [
        "Per le ripetute brevi usa la potenza: il cuore arriva in ritardo di 1-2 minuti.",
        "Con caldo, poco sonno o disidratazione la FC sale a parità di watt (deriva): normale fino a un 5% nelle lunghe.",
        "FC molto più alta del solito a parità di watt da giorni: fatica o malanno.",
      ],
    }),
  },
  {
    id: "test_quale",
    title: "Quale test fare",
    re: /\b(quale test|che test|test dei 20|test 20|ramp test|test a rampa|test incrementale|come si fa il test|fare un test)\b/,
    ex: ["che test devo fare per l'ftp?", "meglio il test dei 20 minuti o la rampa?", "come si fa un test?"],
    say: (c) => ({
      text: "🧪 Il test migliore per te è quello classico della potenza critica: 3', 7' e 12' a tutta.",
      lines: [
        "Dà CP e W′ insieme, è meno legato al tipo di atleta della rampa e del 20'.",
        "Rampa: comoda e breve, ma sovrastima l'FTP a chi ha tanto spunto; 20': 95% della media, ma va gestito bene il ritmo.",
        `Momento giusto: settimana leggera, prontezza verde. Oggi sei ${ready(c)}.`,
      ],
      chips: ["Test CP: quando?", "Devo cambiare l'FTP?"],
    }),
  },
  {
    id: "w_prime",
    title: "W′ (W primo)",
    re: /\b(w prime|w primo|wprime|w bal|wbal|riserva anaerobica)\b/,
    ex: ["cos'è il w prime?", "a cosa serve il w′?", "cos'è il w bal?"],
    say: (c) => ({
      text: "W′ è la riserva di energia sopra la potenza critica: quanto lavoro puoi fare oltre la soglia prima di piantarti.",
      lines: [
        c.data.athlete.wPrime ? `Il tuo W′ impostato: ${r1(c.data.athlete.wPrime / 1000)} kJ.` : "Il W′ lo stima il test CP.",
        "W′bal è quanto ne resta durante un'uscita: scende negli scatti e si ricarica sotto la soglia.",
        "Chi ha un W′ grande regge meglio scatti e salite brevi.",
      ],
    }),
  },
  // ── Position and pain ───────────────────────────────────────────────────────────────────────────
  {
    id: "sella_altezza",
    title: "Altezza della sella",
    re: /\b(altezza della sella|sella alta|sella bassa|alzare la sella|abbassare la sella|regolare la sella|posizione in bici|bike fit|biomeccanic\w*)\b/,
    ex: ["come regolo l'altezza della sella?", "la mia sella è troppo alta?", "serve un bike fit?", "come capisco se la posizione è giusta"],
    say: () => ({
      text: "📐 Sella giusta: col pedale in basso il ginocchio resta piegato di 25-35°.",
      lines: [
        "Prova veloce: tallone sul pedale in basso, gamba quasi tesa; pedalando col metatarso il ginocchio si piega un po'.",
        "Troppo alta: bacino che dondola, dolore dietro al ginocchio. Troppo bassa: dolore davanti al ginocchio.",
        "Cambia di 3-5 mm alla volta e prova qualche uscita. Con dolori che restano, un bike fit da un biomeccanico vale i soldi.",
      ],
    }),
  },
  {
    id: "ginocchio",
    title: "Dolore al ginocchio",
    re: /\b(ginocchio|ginocchia|rotula|tendine rotuleo)\b/,
    ex: ["il ginocchio mi fa male quando spingo", "dolore al ginocchio in bici", "fastidio alla rotula"],
    say: () => ({
      text: "🦵 Il ginocchio in bici si lamenta quasi sempre per posizione o carico troppo duro.",
      lines: [
        "Davanti (rotula): sella bassa o arretrata, rapporti troppo duri, troppe salite a bassa cadenza.",
        "Dietro: sella alta. Di lato: tacchette ruotate o banda ileotibiale.",
        "Intanto: cadenza più alta, niente SFR né sprint, Z1-Z2. Se il dolore resta oltre una settimana o gonfia, medico o fisioterapista.",
      ],
      chips: ["Infortunio al ginocchio", "Come regolo la sella?"],
    }),
  },
  {
    id: "schiena",
    title: "Mal di schiena",
    re: /\b(schiena|lombar\w*|mal di schiena|zona lombare|bassa schiena)\b/,
    ex: ["mi fa male la schiena in bici", "dolore lombare dopo le lunghe", "come evito il mal di schiena"],
    say: () => ({
      text: "La schiena fa male in bici per posizione troppo distesa o core debole, spesso tutte e due.",
      lines: [
        "Manubrio troppo lontano o basso, sella troppo alta: il bacino ruota e la lombare lavora.",
        "Core e glutei 2-3 volte a settimana (plank, ponte, bird dog) risolvono tanti casi.",
        "Alzati sui pedali ogni 15-20 minuti nelle lunghe. Dolore che scende nella gamba o formicolii: medico.",
      ],
    }),
  },
  {
    id: "collo_spalle",
    title: "Collo e spalle",
    re: /\b(collo|cervical\w*|spalle|spalla|trapezi)\b/,
    ex: ["ho male al collo in bici", "dolore alle spalle nelle uscite lunghe"],
    say: () => ({
      text: "Collo e spalle si stancano quando il manubrio è troppo lontano o basso, o quando si irrigidiscono le braccia.",
      lines: ["Gomiti morbidi e leggermente piegati, spalle basse e rilassate.", "Se dura: attacco manubrio più corto o più alto, e un bike fit."],
    }),
  },
  {
    id: "mani_piedi",
    title: "Mani o piedi che formicolano",
    re: /\b(formicol\w*|intorpidit\w*|addormentat\w*|bruciore ai piedi|piedi che bruciano|mani che formicolano|dita)\b/,
    ex: ["mi formicolano le mani in bici", "mi bruciano i piedi nelle lunghe", "dita addormentate"],
    say: () => ({
      text: "Mani e piedi che formicolano: c'è troppa pressione su un nervo.",
      lines: [
        "Mani: guanti imbottiti, cambia spesso presa, meno peso in avanti (sella non inclinata in giù, manubrio non troppo basso).",
        "Piedi: scarpe un po' più larghe o meno strette, tacchette un po' più indietro, plantare con supporto metatarsale.",
        "Se resta anche fuori dalla bici, senti il medico.",
      ],
    }),
  },
  {
    id: "sella_dolore",
    title: "Dolore alla sella",
    re: /\b(perineo|soprasella|irritazion\w*|sfregamento|fondello|crema|male alla sella|dolore alla sella|sella scomoda)\b/,
    ex: ["mi fa male sul sellino", "la sella mi dà fastidio", "che crema per il fondello?"],
    say: () => ({
      text: "Il dolore alla sella dipende quasi sempre da sella sbagliata, altezza o fondello.",
      lines: [
        "La sella va scelta sulla larghezza delle ossa del bacino; un buon negozio la misura.",
        "Fondello di qualità, crema antisfregamento nelle lunghe, mai biancheria sotto.",
        "Dolore o intorpidimento che non passa: sella più larga o con canale, e bike fit.",
      ],
    }),
  },
  {
    id: "gomme",
    title: "Pressione delle gomme",
    re: /\b(pressione|gomme|gomma|copertoni|tubeless|bar|psi|forature|forare)\b/,
    ex: ["a che pressione gonfio le gomme?", "conviene il tubeless?", "quante atmosfere metto?"],
    say: (c) => ({
      text: "Le gomme veloci oggi sono larghe (28-32 mm) e meno gonfie di una volta.",
      lines: [
        kg(c) ? `Con ${r0(kg(c)!)} kg e gomme da 28: circa ${r1(kg(c)! * 0.07)} bar dietro e ${r1(kg(c)! * 0.065)} davanti con le camere, 0,3-0,5 in meno tubeless (indicativo, segui il produttore).` : "Con gomme da 28: indicativamente 5-6 bar con le camere, un po' meno tubeless.",
        "Sui fondi rovinati meno pressione è anche più veloce.",
        "Col bagnato togli 0,3-0,5 bar per avere più aderenza.",
      ],
    }),
  },
  {
    id: "dolore_muscolare",
    title: "Dolore muscolare o articolare",
    re: /\b(indolenzit\w*|doms|dolori muscolari|muscoli doloranti|male ai muscoli|male alle gambe|polpacci duri|contrattur\w*)\b/,
    ex: ["ho le gambe indolenzite", "ho i muscoli che fanno male dopo i pesi", "polpacci duri dopo l'uscita"],
    say: () => ({
      text: "L'indolenzimento muscolare dopo una seduta nuova o dura è normale: passa in 2-4 giorni.",
      lines: [
        "Intanto Z1-Z2 breve aiuta più del riposo assoluto; niente qualità finché fa male.",
        "Dolore in un punto preciso, a un'articolazione o che peggiora pedalando non è indolenzimento: fermati e senti un fisioterapista.",
      ],
    }),
  },
  {
    id: "caduta",
    title: "Dopo una caduta",
    re: /\b(caduto|caduta|cadere|incidente|botta|sbattut\w*|investito)\b/,
    ex: ["sono caduto, cosa faccio?", "ho preso una botta in bici", "dopo una caduta quando riprendo?"],
    say: () => ({
      text: "🚑 Dopo una caduta: prima tu, poi la bici.",
      lines: [
        "Hai battuto la testa, hai mal di testa, nausea, confusione o un dolore forte: pronto soccorso, anche se ti senti bene.",
        "Casco: dopo una botta va cambiato anche se sembra intatto.",
        "Se è un infortunio scrivimi «infortunio al …»: lo segno e il piano resta facile finché passa.",
      ],
      chips: ["Infortunio"],
    }),
  },
  // ── The head ────────────────────────────────────────────────────────────────────────────────────
  {
    id: "motivazione",
    title: "Motivazione",
    re: /\b(motivazion\w*|demotivat\w*|svogliat\w*|non ho voglia|nessuna voglia|annoiat\w*|noia|stufo|stufa)\b/,
    ex: ["non ho più motivazione", "mi sono stufato di allenarmi", "come trovo la motivazione?"],
    say: () => ({
      text: "La motivazione va e viene: la costanza la tengono le abitudini e un obiettivo chiaro.",
      lines: [
        "Un obiettivo con una data (una granfondo, un giro, un test) rende ogni seduta più facile da fare.",
        "Varia: un giro nuovo, un'uscita in compagnia, un gravel, una settimana diversa.",
        "Se manca da settimane insieme a sonno e umore peggiori, può essere troppo carico: una settimana leggera vera.",
      ],
    }),
  },
  {
    id: "ansia_gara",
    title: "Ansia prima della gara",
    re: /\b(ansia|agitat\w*|nervosismo|paura della gara|tensione prima)\b/,
    ex: ["ho ansia prima delle gare", "sono agitato per la granfondo", "come gestisco la tensione prima della gara?"],
    say: () => ({
      text: "Un po' di tensione prima della gara aiuta: vuol dire che ci tieni.",
      lines: [
        "Prepara tutto il giorno prima (bici, borse, cibo), così la mattina non ci sono sorprese.",
        "Pensa al piano (ritmo, cibo, punti chiave del percorso), non al risultato.",
        "Respiri lenti alla partenza; i primi 15 minuti sono per entrare nel ritmo, non per vincere.",
      ],
    }),
  },
  {
    id: "altitudine",
    title: "Quota",
    re: /\b(quota|altitudine|altura|alta montagna|sopra i 2000)\b/,
    ex: ["come cambia in quota?", "allenarsi in altitudine serve?", "pedalare sopra i 2000 metri"],
    say: () => ({
      text: "In quota l'aria ha meno ossigeno: sopra i 1500-2000 m la potenza cala del 5-10%.",
      lines: [
        "Le prime volte: ritmo più basso, si beve di più, il cuore sale prima.",
        "Per un vantaggio vero servono almeno 2-3 settimane in quota: un weekend non basta.",
      ],
    }),
  },
];

/** The notion whose topic words match, best first (order of the list breaks ties). */
export function notionsFor(t: string): Notion[] {
  return NOTIONS.filter((n) => n.re.test(t));
}
