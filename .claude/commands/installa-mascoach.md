---
description: Installa MasCoach da zero - dati Intervals.icu, app online su Vercel, coach collegato a Claude
---

Installa MasCoach per l'utente, dall'inizio alla fine, seguendo questi passi **in ordine**. Parla sempre in italiano, con frasi semplici: l'utente può non essere uno sviluppatore. Prima di iniziare spiegagli in 4-5 righe cosa succederà e cosa dovrà fare lui (creare la chiave Intervals, fare il login su Vercel, aggiungere il connettore e il Progetto su claude.ai), poi parti.

Regole per tutta l'installazione:
- **Non scrivere mai in chat** la chiave Intervals, la password dell'app o il segreto del connettore: stanno in `.env.local` e in `credenziali-mascoach.txt`, e all'utente indichi quei file.
- Esegui tu ogni comando che puoi; chiedi all'utente solo quello che può fare solo lui (login, creazione di account, impostazioni su siti web).
- Se un passo fallisce, leggi l'errore, correggi e riprova; se non riesci, spiega il problema in parole semplici e fermati lì.
- Se l'installazione era già iniziata (esiste `.env.local`), riprendi dal primo passo non completato.

## 1. Requisiti
- `node -v` deve essere 20.9 o più recente, e serve `git --version`. Se mancano, spiega come installarli (Node LTS da nodejs.org, Git da git-scm.com) e fermati finché l'utente non conferma.
- L'utente deve avere: un account **Intervals.icu** con i suoi dati (Garmin, Wahoo, Strava… collegati), un account **Vercel** gratuito (vercel.com, piano Hobby, va bene "Continue with GitHub") e un abbonamento **Claude** che permetta i connettori personalizzati. Chiedi conferma con una sola domanda.

## 2. Dipendenze
`npm install` nella cartella del progetto.

## 3. Collegamento a Intervals.icu
1. Chiedi all'utente di aprire intervals.icu → **Settings → Developer Settings → API Key**, generare la chiave e incollarla in chat. Se preferisce non incollarla, può creare lui il file `.env.local` con la riga `INTERVALS_API_KEY=<chiave>`.
2. Esegui `node scripts/setup-env.mjs` passando la chiave come variabile d'ambiente (es. in bash `INTERVALS_API_KEY='<chiave>' node scripts/setup-env.mjs`, in PowerShell `$env:INTERVALS_API_KEY='<chiave>'; node scripts/setup-env.mjs`). Lo script verifica la chiave sull'account vero, crea la password dell'app e il segreto del connettore e scrive `.env.local` e `credenziali-mascoach.txt`.
3. Riporta all'utente il riepilogo dello script (nome, FTP, uscite e notti con HRV degli ultimi 30 giorni) e gli **avvisi**: senza FTP impostata o senza HRV alcune parti dell'app restano vuote, e va detto subito.

## 4. Controlli e prova in locale
1. `npm run check` deve passare (genera i tipi delle route, poi TypeScript, lint e test).
2. Avvia l'app in locale (configurazione `mascoach` in `.claude/launch.json`, oppure `npm run dev` in background) e controlla che `http://localhost:3000/api/dashboard` risponda con `"source":"intervals"`. In locale non c'è password. Se puoi, mostra la pagina all'utente.
3. Ferma il server locale.

## 5. Pubblicazione su Vercel
1. Login: esegui `npx --yes vercel login` **in background** e leggi l'output: mostra all'utente il link e il codice da aprire nel browser, e aspetta che il login sia completato. Non chiedere mai la password di Vercel.
2. Collega il progetto: `npx --yes vercel link --yes --project mascoach`. Se il nome è già usato nel suo account, usa `mascoach-<nome>`.
3. Variabili: `node scripts/vercel-env.mjs` (passa le 4 variabili come segreti, dalla stdin). Devono risultare tutte `ok`.
4. Pubblica: `npx --yes vercel deploy --prod --yes`. Dall'output prendi l'indirizzo di produzione (`https://….vercel.app`, quello indicato come Production/Aliased; se ce ne sono più di uno, preferisci il più corto con il nome del progetto).
5. `node scripts/setup-env.mjs --url https://….vercel.app` per completare `credenziali-mascoach.txt` con l'indirizzo del connettore.
6. `node scripts/check-online.mjs https://….vercel.app`: tutte le righe devono essere `ok`. Se "dati DEMO" o "App bloccata", le variabili non sono arrivate: rifai il punto 3 e ripubblica.

## 6. Coach su Claude (passi dell'utente, guidali uno alla volta)
1. **Connettore**: claude.ai → Impostazioni → Connettori → **Aggiungi connettore personalizzato**. Nome `MasCoach`, URL quello scritto in `credenziali-mascoach.txt`. Consiglia: letture "Consenti sempre", scritture (crea/modifica/cancella allenamento, cancella prove, registra carboidrati, salva in libreria) "Chiedi ogni volta". Vale anche nell'app Claude sul telefono.
2. **Prompt**: chiedi all'utente come vuole che il coach lo chiami (su Intervals spesso c'è solo il nome utente), poi esegui `node scripts/prompt-pronto.mjs --nome <Nome>`. Crea `prompt-coach/prompt-pronto.txt`.
3. **Progetto**: claude.ai → Progetti → Nuovo progetto `MasCoach Coach` → nelle istruzioni incolla **tutto** `prompt-coach/prompt-pronto.txt`. Aprilo nell'editor per l'utente se puoi.
4. Prima chat nel Progetto: scrivere **"Fai la prima analisi"**. Il coach farà l'intervista per la Scheda atleta e la restituirà in un blocco da salvare come file `Scheda_atleta.md` nel Progetto.
5. In MasCoach → **Coach → Imposta il Progetto**: incollare l'indirizzo del Progetto (`https://claude.ai/project/…`).

## 7. App sul telefono e sul computer
- Telefono Android: aprire l'indirizzo in Chrome, entrare con la password di `credenziali-mascoach.txt`, menu ⋮ → **Installa app**.
- Computer: in Chrome, icona di installazione nella barra degli indirizzi.

## 8. Riepilogo finale
Riassumi in poche righe: indirizzo dell'app, dove sono password e connettore (`credenziali-mascoach.txt`, da conservare e non condividere), cosa è stato verificato (`check-online`), cosa resta da fare all'utente, e che per pubblicare modifiche future basta `/aggiorna-mascoach`.
