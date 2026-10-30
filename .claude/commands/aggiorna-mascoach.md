---
description: Pubblica su Vercel la versione attuale di MasCoach (dopo modifiche o aggiornamenti)
---

Pubblica la versione attuale di MasCoach sul Vercel dell'utente. Parla in italiano e non scrivere mai segreti in chat.

1. Se la cartella è un repository git con un remoto, chiedi se vuole prima scaricare gli aggiornamenti (`git pull`). Se `git pull` dà conflitti, spiega e fermati.
2. `npm install`, poi `npm run check`: se qualcosa fallisce, non pubblicare e spiega cosa non va.
3. Se manca `.vercel/` (progetto non collegato su questo computer), esegui `npx --yes vercel login` in background mostrando il link all'utente, poi `npx --yes vercel link --yes --project <nome del progetto su Vercel>`.
4. Se in `.env.local` sono cambiate delle variabili, `node scripts/vercel-env.mjs`.
5. `npx --yes vercel deploy --prod --yes`.
6. `node scripts/check-online.mjs` (usa `MASCOACH_URL` di `.env.local`): tutte le righe `ok`.
7. Riepilogo in 2-3 righe: cosa è stato pubblicato e l'esito dei controlli. Se sono cambiati gli attrezzi del connettore, ricorda di ricollegare il connettore su claude.ai; se è cambiato `prompt-coach/MasCoach_prompt.txt`, di rigenerare il prompt con `node scripts/prompt-pronto.mjs` e sostituirlo nel Progetto.
