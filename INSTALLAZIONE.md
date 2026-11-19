# Installare MasCoach a mano

Con Claude Code basta scrivere `/installa-mascoach` nella cartella del progetto: fa da solo quasi tutto.
Questa guida è la stessa strada, passo per passo, per chi preferisce farla da sé.

Servono: **Node.js 20.9+** (nodejs.org, versione LTS), **Git**, un account **Intervals.icu** con i tuoi dati,
un account **Vercel** gratuito (piano Hobby) e un abbonamento **Claude** con i connettori personalizzati.

## 1. Scarica e prepara

```bash
git clone https://github.com/valeriomastromarino/MasCoachForAll.git
cd MasCoachForAll
npm install
```

## 2. Collega Intervals.icu

1. intervals.icu → **Settings → Developer Settings → API Key**: genera la chiave e copiala.
2. Crea la configurazione (verifica la chiave, crea password dell'app e segreto del connettore):

```bash
INTERVALS_API_KEY='la-tua-chiave' node scripts/setup-env.mjs
```

In PowerShell: `$env:INTERVALS_API_KEY='la-tua-chiave'; node scripts/setup-env.mjs`.
Nascono `.env.local` e `credenziali-mascoach.txt`: restano sul tuo computer, non vanno su GitHub e non vanno condivisi.

3. Prova in locale: `npm run dev` e apri http://localhost:3000 (in locale non c'è password).

## 3. Pubblica su Vercel

```bash
npx --yes vercel login
npx --yes vercel link --yes --project mascoach
node scripts/vercel-env.mjs
npx --yes vercel deploy --prod --yes
```

Prendi l'indirizzo di produzione che compare alla fine (`https://….vercel.app`) e completalo nelle credenziali:

```bash
node scripts/setup-env.mjs --url https://….vercel.app
node scripts/check-online.mjs https://….vercel.app
```

Tutti i controlli devono risultare `ok`.

## 4. Collega il coach a Claude

1. claude.ai → **Impostazioni → Connettori → Aggiungi connettore personalizzato**: nome `MasCoach`, URL quello di
   `credenziali-mascoach.txt`. Letture "Consenti sempre", scritture "Chiedi ogni volta".
2. `node scripts/prompt-pronto.mjs` (o `--nome TuoNome`): crea `prompt-coach/prompt-pronto.txt`.
3. claude.ai → **Progetti → Nuovo progetto** `MasCoach Coach` → incolla tutto `prompt-pronto.txt` nelle istruzioni.
4. Prima chat del Progetto: **"Fai la prima analisi"**. Il coach ti intervista e ti restituisce la Scheda atleta:
   salvala come file `Scheda_atleta.md` nel Progetto.
5. In MasCoach → **Coach → Imposta il Progetto**: incolla l'indirizzo del Progetto.

## 5. Sul telefono

Apri l'indirizzo in Chrome, entra con la password di `credenziali-mascoach.txt`, menu ⋮ → **Installa app**.

## 6. Facoltativo: le sedute dei rulli anche su Strava

Le sedute registrate dal player dei rulli possono andare anche su Strava (oltre che su Intervals). Serve l'abbonamento
Strava: dal giugno 2026 Strava lo chiede per creare un'app che usa la sua API (nessun costo in più).

1. Da computer apri https://www.strava.com/settings/api e crea l'applicazione: nome `MasCoach`, categoria Training, sito
   l'indirizzo del tuo MasCoach, **Authorization Callback Domain** = il dominio del sito (es. `tuonome.vercel.app`),
   un'icona qualsiasi (va bene `public/icons/icon-512.png`).
2. Copia «Client ID» e «Client Secret» e mettili su Vercel → Settings → Environment Variables come `STRAVA_CLIENT_ID` e
   `STRAVA_CLIENT_SECRET` (Production, il secret come Sensitive). Poi pubblica di nuovo il sito.
3. Sul sito: **Impostazioni → Strava → Collega Strava** e su Strava tocca «Autorizza». Basta una volta: vale anche per
   l'app sul telefono (che manda le sedute tramite il sito, con la password dell'app inserita in «Coach scritto»).

## Aggiornare

Dopo modifiche o un `git pull`: `npx --yes vercel deploy --prod --yes` (in Claude Code: `/aggiorna-mascoach`).
