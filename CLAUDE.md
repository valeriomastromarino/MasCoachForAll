@AGENTS.md

# MasCoach — guida per le sessioni di Claude

App personale di allenamento ciclismo per un atleta. Dati da **Intervals.icu** (che li riceve da Garmin, Wahoo, Strava…).
Interfaccia e risposte **sempre in italiano**; i commenti nel codice possono restare in inglese.

## Prima installazione

Se in questa cartella non c'è ancora `.env.local`, il progetto non è installato: proponi il comando **`/installa-mascoach`**
(`.claude/commands/installa-mascoach.md`), che porta da zero all'app online su Vercel e al coach collegato a Claude.
Per pubblicare le modifiche successive: **`/aggiorna-mascoach`**. Guida manuale equivalente: `INSTALLAZIONE.md`.

## Comandi

- `npm run dev` → http://localhost:3000 (senza `INTERVALS_API_KEY` in `.env.local` mostra dati demo)
- `npx vitest run` → test dei calcoli fisiologici e dei dati
- `npm run check` → tipi delle route (`next typegen`), `tsc`, `eslint src standalone` e test: controlli prima di chiudere ogni modifica
- `npm run build:file` → **versione file unico** `dist-file/index.html` (da copiare dove si vuole, es. `MasCoach.html`): si apre con doppio clic, nessun server.
  Il browser parla direttamente con Intervals.icu (CORS consentito, anche da `file://`); la chiave si inserisce in Impostazioni e resta in `localStorage`, mai nel file.
  Vite (`standalone/vite.config.mts`) riusa le pagine di `src/app` sostituendo: `next/link|navigation|dynamic` → `standalone/shims`, `credentials.ts` → `credentials.browser.ts`, `transport.ts` → `transport.browser.ts` (le API girano nella pagina).
- **Versione online (Vercel)**: stessa app Next.js, variabili `INTERVALS_API_KEY`, `INTERVALS_ATHLETE_ID`, `APP_PASSWORD`, `MCP_SECRET`.
  `src/proxy.ts` + `lib/auth/session.ts`: senza cookie di accesso le pagine vanno a `/login` e `/api/*` risponde 401; cookie firmato con la password, 60 giorni.
  Senza `APP_PASSWORD`: aperta in locale, bloccata su Vercel. `app/manifest.ts` + `public/icons/` rendono l'app installabile da Chrome su Android.
- **Connettore per Claude (MCP)**: `POST /api/mcp/<MCP_SECRET>` (fuori dal login, segreto ≥ 24 caratteri; senza segreto risponde 404).
  `lib/coach/mcp.ts` (JSON-RPC senza sessioni) + `lib/coach/tools.ts` (attrezzi in italiano: letture via `handleApi`, scritture su Intervals).
  Gli allenamenti del coach hanno `external_id` `mascoach-coach-…` o `mascoach-prova-…` (`lib/coach/marks.ts`) e tag "MasCoach Coach": etichetta nel calendario,
  e il coach può modificare/cancellare solo i suoi. `prova` è il default di `crea_allenamento`.
  `eventi` e `calendario.gare_impegni_note`: gare A/B/C, vacanze, malattia, note, inizio stagione, obiettivi settimanali (`calendarEvents` in `lib/calendar.ts`).
  `w_balance` (W′bal di Intervals: per uscita o elenco degli svuotamenti), `fueling_log` + `registra_carboidrati` (`carbs_ingested` delle uscite),
  `salva_in_libreria` (cartella "MasCoach Coach"; se Intervals legge male il testo il workout viene tolto). W′ impostato in `stato_di_oggi`.
  **Formato passi**: le ripetute "Titolo 3x" vanno precedute da una riga vuota, altrimenti Intervals le ignora (`parseWarning` lo segnala).
  `storico` (fino a 4 anni, `lib/history.ts` via `GET /api/history?years=`): anni e mesi con ore, TSS, CTL, eFTP, migliori watt per anno, HRV/FC/sonno e notti anomale Altini, elenco test.
- `prompt-coach/` — prompt del coach per il Progetto Claude: `MasCoach_prompt.txt` contiene `{{NOME}}`, che
  `node scripts/prompt-pronto.mjs` sostituisce con il nome dell'atleta in `prompt-coach/prompt-pronto.txt` (escluso da git).
- **Artefatto claude.ai** (`artefatto/`, vedi il suo README; si pubblica con `/crea-artefatto`): pagina unica con prontezza,
  allenamenti da fare (sposta/cancella) e ultime 3 sedute, dati dal connettore via capacità `mcp`, chat col coach
  (`prompt-coach/prompt-pronto.txt`, scritture con conferma) via `sample`. Indirizzo in `artefatto/indirizzo.txt` (fuori da git).
- Anteprima nel Browser pane: configurazione `mascoach` in `.claude/launch.json`.
  **Il dev server spesso non ricarica i file lato server e il CSS**: dopo modifiche a `src/lib/**`, route API o `globals.css`, riavviarlo (preview_stop + preview_start) prima di verificare.

## Struttura

- `src/lib/physio/` — motore fisiologico (puro, testato):
  `power.ts` (Coggan: zone, NP, IF, TSS) · `pmc.ts` (CTL/ATL/TSB, forma in % di CTL come Intervals) ·
  `baseline.ts` + `hrv.ts` + `autonomic.ts` (Altini: ln rMSSD, baseline 7 gg vs range 60 gg, HRV letta insieme alla FC a riposo, notti anomale) ·
  `readiness.ts` (stato di oggi) · `criticalPower.ts` (Monod 2P 3–20', flag se sforzi lunghi non massimali) ·
  `distribution.ts` (Seiler 3 zone) · `hrZones.ts` (Friel) · `fitnessTest.ts` (test: rampa = frazione del MAP personale 0,72–0,80 dal flesso + flesso FC corretto per il ritardo (pendenza × 1–1,5 min) → valore con intervallo e validazione; 95% 20' / 90% 8', flessione FC Dmax, soglie DFA α1 0,75/0,5)
- `src/lib/intervals/` — client API Intervals.icu (chiave solo lato server) e tipi
- `src/lib/dashboard.ts`, `ride.ts`, `activities.ts` — trasformano i dati grezzi per le pagine
- `src/lib/insights.ts` — eFTP nel tempo (`icu_rolling_ftp`), record del mese, pianificato vs fatto (eventi WORKOUT), sonno, peso, zone per settimana, EF
- `src/lib/physio/durability.ts` — durability: migliori sforzi dopo 2 h e 3 h confrontati con il profilo da fresco
- `src/lib/api/handlers.ts` — **tutta la logica di `/api/*`** (`handleApi`), usata dalle route Next (`respond.ts`) e dal file unico; i componenti chiamano sempre `apiFetch` (`components/data/transport.ts`), mai `fetch` diretto
- `src/app/api/` — route sottili che passano a `handleApi`: `dashboard`, `durability` (stream potenza delle uscite > 2 h, 84 gg), `activities` (archivio a blocchi di 365 gg), `activity/[id]` (dettaglio + stream)
- Pagine (sezioni): `/` Oggi · `/forma` · `/potenza` · `/cuore` · `/recupero` · `/attivita` Uscite · `/test` · `/impostazioni` (tema) · `/coach` (pulsanti che aprono Claude con la richiesta pronta; indirizzo del Progetto in `localStorage`) · `/allenamenti` segnaposto
- `src/lib/calendar.ts` + `workout.ts` — calendario della home (uscite + eventi WORKOUT), libreria allenamenti, profilo a blocchi dai `workout_doc.steps`
- API di scrittura su Intervals.icu: `PATCH /api/activity/[id]` (nome, tipo, descrizione, RPE `icu_rpe`), `POST /api/calendar/events` (da libreria), `PATCH|DELETE /api/calendar/events/[id]`
- `src/components/calendar/` — computer: calendario a 4 settimane (2 prima, questa, 1 dopo) con trascinamento per spostare; telefono (sotto `sm`): `WeekList.tsx`, una settimana in verticale (la terza delle quattro caricate) con notte, gare/impegni, uscite e allenamenti per esteso. Pop-up per giorno, uscita e allenamento in entrambi
- `src/components/nav/` — barra laterale a sole icone colorate (desktop) e barra in basso con "Altro" (telefono); elenco sezioni in `sections.ts`
- `src/components/sections/` — una pagina per sezione dentro `SectionPage`; `parts.tsx` pezzi condivisi; `data/remote.ts` carica i dati una volta per tutte le sezioni
- `src/components/brand/` — logo, selettore temi, barra in alto (slot `topbar-actions` per i pulsanti di pagina)

## Particolarità dei dati Intervals.icu (verificate sui dati reali)

- Le attività importate **solo da Strava** arrivano senza `type` (nota "STRAVA activities are not available via the API"): si mostrano in grigio; il loro carico si recupera da `wellness.atlLoad`.
- `icu_zone_times` contiene anche `SS` (sweet spot) che **si sovrappone** a Z3/Z4: non va sommato.
- `wellness.atlLoad` include la palestra; `ctlLoad` no (impostazione dell'atleta). Il carico settimanale usa `atlLoad`.
- `icu_intensity` è in percentuale (65.7 = IF 0,657).
- Power curve: `/athlete/0/power-curves.json?type=Ride&curves=84d` → `list[0].secs/values` + `powerModels`.
- Stream: `latlng` ha la longitudine in `data2`; `dfa_a1` presente solo se la Polar H10 ha registrato gli RR.
- Mappe: le tile CARTO ora richiedono una chiave → si usa OpenStreetMap con filtro CSS per tema.
- Curve di potenza per periodo: `curves=84d,r.2026-10-01.2026-10-27,…` (più curve in una chiamata). Il filtro "dopo X kJ" non è esposto dall'API: la durability si calcola dagli stream.
- `icu_ftp` delle attività cambia tra rulli e strada: per la FTP impostata usare quella dell'atleta, non quella della singola uscita.
- Peso: poche pesate (circa una ogni 2 settimane); sonno quasi tutte le notti (`sleepSecs`, `sleepScore`).

## Convenzioni grafiche

- Tre temi su `<html data-theme>`: `day` (stile A pastello), `night`, `paper` (grana carta). Etichette del selettore in **inglese**: Day / Night / Paper.
- Usare sempre i token CSS di `globals.css` (mai colori esadecimali nei componenti, salvo Leaflet).
- Colori metriche come Intervals: fitness blu, fatica lavanda, forma giallo, HRV verde acqua, FC a riposo rosa, zone grigio→lilla.
- Grafici: mai doppio asse Y; un solo tooltip nel grafico sotto il mouse, linea tratteggiata negli altri.
- Prima di grosse modifiche grafiche mostrare un'anteprima e aspettare la scelta.

## Roadmap

1. ✅ Dashboard, archivio uscite, dettaglio uscita, analisi test, temi e logo
2. Creazione allenamenti (editor + Claude) e invio a Intervals.icu / Garmin — serve una chiave API Anthropic
3. Player per rulli: Elite Justo in ERG via Web Bluetooth FTMS, Polar H10 con RR e DFA α1 (Chrome su Windows/Android)
4. Coach Claude con chat: pianificazione e adattamento su HRV e carico — ✅ prima versione via connettore MCP in Claude (abbonamento, senza chiave API); chat dentro l'app quando ci sarà una chiave Anthropic
