# Player per rulli — specifica

Versione 3 · 31 ottobre 2026 · stato: **fasi 1–3 scritte (da provare sul rullo vero)**, fasi 4–5 da fare.
Decisioni prese e punti aperti in §12.

## 1. Obiettivo

Dentro l'app MasCoach (Vercel) una sezione che esegue sui rulli gli allenamenti del calendario di Intervals.icu:
comanda il rullo in **ERG** o **resistenza**, legge cardio (con RR e **DFA α1** dal vivo), potenza e cadenza,
registra la seduta e la carica su **Intervals.icu**. Funziona anche **senza internet** durante la seduta.

## 2. Piattaforme e vincoli

| Dove | Funziona | Note |
|---|---|---|
| Windows 11, Chrome o Edge | ✅ | serve Bluetooth 4.0+; se il segnale è debole, chiavetta USB Bluetooth 5 |
| Android, Chrome (anche app installata) | ✅ | schermo sempre acceso (Wake Lock) e app in primo piano: se si cambia app o si spegne lo schermo la connessione può cadere |
| iPhone / iPad (Safari), Firefox | ❌ | niente Web Bluetooth (su iOS solo browser di terze parti come Bluefy) |
| Artefatto su claude.ai | ❌ | il Bluetooth è bloccato: l'artefatto ha solo il pulsante che apre il player nell'app |

- Tutto il Bluetooth gira **nel browser** (Web Bluetooth). Vercel serve l'app e le API verso Intervals, niente altro.
- **Collegamento a ogni seduta**: per sicurezza il browser chiede di scegliere ogni sensore da una finestra (un tocco a sensore).
  Il ricollegamento automatico (`getDevices()` + `watchAdvertisements()`) esiste ma è instabile e varia per sistema:
  lo si prova come comodità, mai come unica strada.
- Un rullo accetta **un solo controllore**: chiudere My E-Training, Zwift ecc. prima di pedalare. L'Edge non si usa.

## 3. Dispositivi

### 3.1 Rulli

Prima di iniziare aggiornare il firmware del rullo con l'app del produttore (per Elite: Upgrado), così espone FTMS.

| Protocollo | Copre | Fase |
|---|---|---|
| **FTMS** (Fitness Machine Service `0x1826`) | quasi tutti i rulli dal 2018–2020 con firmware aggiornato: Elite (Direto II/X/XR, Suito, Justo, Avanti), Wahoo KICKR/CORE, Tacx Neo/Flux, Saris, Zwift Hub, Van Rysel, JetBlack, Magene, ThinkRider | 1–2 |
| Wahoo legacy (caratteristica `A026E005-…` nel servizio potenza `0x1818`) | Wahoo con firmware vecchio | 5 |
| Tacx FE-C su Bluetooth (servizio `6E40FEC1-…`) | Tacx con firmware vecchio | 5 |
| ANT+ FE-C puro | ❌ non praticabile dal browser | — |

Caratteristiche FTMS usate: Feature `0x2ACC`, Indoor Bike Data `0x2AD2` (velocità, cadenza, potenza),
Supported Resistance Level Range `0x2AD6`, Supported Power Range `0x2AD8`, Control Point `0x2AD9`, Machine Status `0x2ADA`.
Comandi del Control Point: Request Control `0x00` (sempre per primo), Start/Resume `0x07`, Stop/Pause `0x08`,
Set Target Power `0x05` (ERG), Set Target Resistance Level `0x04` (resistenza),
Set Indoor Bike Simulation `0x11` (solo come ripiego se il rullo non accetta il livello di resistenza: pendenza fissa per gradino).
Le risposte arrivano come *indication*: ogni comando aspetta la conferma prima del successivo.

### 3.2 Potenza

Fonte = **il dispositivo associato**: se è collegato un misuratore (servizio Cycling Power `0x1818`, es. Assioma) fa fede quello,
altrimenti la potenza del rullo. Con i pedali come fonte, in ERG il player **corregge l'obiettivo inviato al rullo**
(media mobile del rapporto pedali/rullo su ~30 s, correzione lenta e limitata) come il "power match" di Zwift.

### 3.3 Cardio

Qualsiasi fascia con il servizio standard Heart Rate `0x180D` (caratteristica `0x2A37`).
Gli **RR** arrivano nello stesso dato quando la fascia li manda (flag RR, valori in 1/1024 s): servono per il DFA.
- Polar H10: ok. Se è già collegata a orologio o telefono via Bluetooth, attivare "dual Bluetooth" dall'app Polar.
- Fasce che non mandano RR e sensori ottici: FC sì, DFA "non disponibile".

### 3.4 Cadenza

Dal rullo (Indoor Bike Data), oppure da pedali o sensore (Cycling Power / Cycling Speed and Cadence `0x1816`).

### 3.5 Esclusi

Ventola Xiaomi (Wi-Fi, protocollo cifrato: non raggiungibile da una pagina web; eventualmente in futuro via Home Assistant).
Garmin Edge (non serve). Modalità pendenza/simulazione e pedalata libera (non richieste). Caricamento su Strava (basta Intervals).

## 4. Allenamenti

- **Fonte**: allenamenti pianificati del calendario di Intervals (passi già interpretati da `lib/calendar.ts` / `workout.ts`
  dai `workout_doc.steps`), con nome, descrizione (note) e durata.
- **Watt**: le % sono sulla **FTP da rulli** (`indoor_ftp` delle impostazioni sport di Intervals); i watt assoluti restano tali;
  rampe come rampe (obiettivo aggiornato ogni secondo); ripetute espanse.
- Passi con solo target di cadenza: mostrato in "Prossimo"/note, non comanda il rullo.
- Gli allenamenti hanno sempre obiettivi di potenza: niente obiettivi di FC. Uno step senza potenza mantiene l'obiettivo precedente.
- **Pulsante "PEDALA"** (icona rulli + scritta): nel pop-up dell'allenamento del calendario (computer e telefono, `WeekList`),
  nella pagina Oggi e nell'artefatto (dall'artefatto apre l'app). Apre il player con quell'allenamento.

## 5. Schermata del player (disegno approvato)

Tema Day / Night / Paper come l'app. Dall'alto in basso:

1. **Intestazione**: chiudi · nome e durata dell'allenamento · suoni on/off.
2. **Griglia 2×2**: Potenza (W) · Obiettivo (W; in resistenza diventa "Livello") · FC (bpm) · Cadenza (rpm).
3. **Profilo**: tempo rimanente dello step, "Prossimo" (es. "5min @ 162W"), blocchi colorati per zona, cursore di posizione,
   tempo trascorso e rimanente totale.
4. **DFA α1**: valore, etichetta (sopra/sotto VT1, sotto VT2), scala con VT2 = 0,5 e VT1 = 0,75, finestra 2′, % artefatti.
5. **Note allenamento** (descrizione dell'evento Intervals).
6. **Strumenti collegati**: un riquadro per rullo e cardio (più pedali se presenti) con nome, stato
   (collega · in corso · collegato · connessione persa, ricollego…) e pulsante per collegare.
7. **Selettore** `ERG · 125 W` | `Resistenza · 4` (numero del gradino accanto alla parola).
8. **Barra comandi**: − · indietro / play-pausa / avanti · +.
   In ERG ogni tocco di − / + cambia l'obiettivo di **5 W**; in resistenza di **un gradino**.

Selettore e barra comandi restano fissi in basso; il resto scorre.
**Gradini**: il rullo dichiara minimo, massimo e passo del livello; se la scala è molto fine (es. 0–100) si usano **10 gradini** uguali
(confermato: si regola dopo la prima prova sul rullo).
**Su PC (bozza, da approvare)**: si usa tutta la larghezza. A sinistra griglia 2×2 e DFA α1 con il grafico degli ultimi 10 minuti;
a destra profilo grande con la potenza dal vivo disegnata sopra e note; in basso una barra unica con strumenti collegati,
selettore ERG / Resistenza e comandi.

### Comportamenti

- **Pausa automatica** a cadenza 0 per più di 3 s (ferma tempo e registrazione), ripresa quando si pedala.
- **Salta step** avanti/indietro. Uno step non si allunga.
- **Nessun cambio automatico** tra ERG e resistenza: negli sprint si passa a mano con il selettore.
- Avvisi sonori 3-2-1 prima del cambio step (e vibrazione su Android), disattivabili.
- Schermo sempre acceso durante la seduta.

## 6. DFA α1 dal vivo

- RR dalla fascia → correzione artefatti (battiti che si scostano oltre ~20% dalla mediana locale) → **finestra 120 s**,
  ricalcolo ogni ~5 s, DFA di breve periodo (scale 4–16 battiti).
- Primi 2 minuti: "in calcolo". Artefatti > 5%: valore mostrato come poco affidabile. Senza RR: "non disponibile".
- Soglie indicative Rogers & Gronwald: 0,75 ≈ VT1, 0,5 ≈ VT2 (le stesse di `lib/physio/fitnessTest.ts`).
- **Solo visualizzazione**: il DFA non comanda niente.
- Calcolo puro e testato in `lib/physio/` (come il resto del motore fisiologico).

## 7. Registrazione e caricamento

- Campionamento 1 Hz: potenza, obiettivo, FC, cadenza, velocità del rullo; **RR grezzi** nel file (messaggi HRV del FIT, così Intervals
  ricalcola anche il suo `dfa_a1`); un giro (lap) per step; pause.
- File **FIT** (ciclismo indoor) con il nome dell'allenamento. Libreria di codifica: SDK FIT JavaScript di Garmin
  (*da verificare* che la versione npm scriva i file, altrimenti codificatore dedicato).
- Salvataggio **sul dispositivo** (IndexedDB) ogni pochi secondi: se il browser si chiude, la seduta si recupera.
- **Intervals.icu**: caricamento del FIT tramite una route dell'app (la chiave resta sul server). Intervals abbina l'uscita
  all'allenamento pianificato del giorno.

## 8. Offline

- App installabile con **service worker**: interfaccia del player disponibile senza rete.
- Allenamenti dei prossimi 7 giorni e FTP da rulli scaricati in anticipo (IndexedDB) a ogni apertura con rete.
- Sedute registrate in coda: caricamento su Intervals appena torna la rete, con stato visibile ("da caricare", "caricata").
- Il login dell'app dura 60 giorni: offline non serve rifarlo.

## 9. Architettura (indicativa)

- Pagina `/rulli?evento=<id>` (prende il posto del segnaposto `/allenamenti` o si affianca: si decide in fase 2).
- `lib/ble/`: FTMS, Heart Rate, Cycling Power, cadenza; più tardi Wahoo e Tacx legacy. Ogni protocollo con codifica/decodifica dei byte
  separata e testata.
- `lib/player/`: motore della seduta (linea del tempo dei passi, obiettivi, pausa automatica, sprint, ±), indipendente dall'interfaccia.
- `lib/physio/dfa.ts`: DFA α1 (puro, testato).
- `lib/fit/`: scrittura del FIT.
- Route: caricamento del FIT su Intervals.
- Versione file unico (`npm run build:file`): Web Bluetooth richiede un contesto sicuro; *da verificare* da `file://`.

## 10. Prove

- Test automatici: DFA su serie RR note, linea del tempo degli allenamenti (rampe, ripetute), codifica/decodifica FTMS sugli esempi
  della specifica, scrittura e rilettura del FIT.
- Dispositivi simulati per sviluppare l'interfaccia senza rullo.
- **Prove sul campo** con rullo e fascia cardio veri su Windows 11 e Android: Claude non può collegarsi a dispositivi veri.
- Confronto del DFA dal vivo con il `dfa_a1` che Intervals calcola dal FIT della stessa seduta.

## 11. Fasi

| Fase | Contenuto | Fatto quando |
|---|---|---|
| ✅ 1. Collegamenti | collega il rullo (lettura FTMS), la fascia cardio (FC + RR), pedali facoltativi; metriche dal vivo; DFA α1 | i numeri si vedono su PC e Android, il DFA è plausibile |
| ✅ 2. Controllo e player | ERG e resistenza, allenamento da Intervals, schermata §5, ± / salta / pausa automatica, suoni, pulsanti PEDALA | un allenamento del calendario si esegue dall'inizio alla fine in ERG e in resistenza |
| ✅ 3. Registrazione | FIT con RR, salvataggio locale, caricamento su Intervals | la seduta compare su Intervals (con DFA) |
| 4. Offline | service worker, allenamenti scaricati (già fatti: salvataggio sul dispositivo e coda di caricamento) | una seduta fatta senza rete si carica da sola dopo |
| 5. Compatibilità estesa | Wahoo e Tacx legacy, altre fasce, rifinitura power match, layout PC | prove con altri rulli |

Ogni fase si chiude con commit + push.

## 12. Decisioni e punti aperti

Deciso il 31 ottobre 2026:

1. Niente obiettivi di FC negli allenamenti.
2. Uno step non si allunga (solo salta avanti/indietro).
3. Nessun cambio automatico ERG → resistenza negli sprint: si fa a mano.
4. Gradini della resistenza: si fissano dopo la prima prova sul rullo.
5. Caricamento solo su Intervals.icu (niente Strava).

Bozza della schermata su PC approvata il 31 ottobre.

Scelte fatte scrivendo il codice (da confermare sul rullo):
- La seduta **parte quando inizi a pedalare** (o con Play) e si registra solo il tempo pedalato.
- −/+ in ERG valgono **solo per lo step in corso** (allo step successivo si torna all'obiettivo del piano).
- Il gradino di partenza della resistenza è il 3; con una scala 0–100 i gradini sono 10.
- Un rullo che rifiuta il livello di resistenza riceve una pendenza fissa (0–10% sui gradini).
- Se il caricamento non riesce (niente rete, dati demo) la seduta resta sul dispositivo: `/rulli` la ricarica appena c'è rete, o si scarica il FIT.

## 13. Cosa serve dall'atleta

- Aggiornare il firmware del rullo (app del produttore).
- H10: "dual Bluetooth" se è collegata anche a orologio o telefono.
- Prove sul rullo a ogni fase.
