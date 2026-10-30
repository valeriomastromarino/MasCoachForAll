# MasCoach

App personale per analizzare, pianificare ed eseguire allenamenti di ciclismo, con un coach Claude collegato.
I dati arrivano da **Intervals.icu**, che li riceve da Garmin, Wahoo, Strava…

- **Dashboard** online e privata (password), installabile come app sul telefono: stato di oggi con HRV secondo Altini,
  forma, potenza, cuore, recupero, archivio uscite, analisi dei test, calendario con scrittura su Intervals.
- **Coach Claude**: connettore MCP con 17 attrezzi (lettura dei dati, storico di 4 anni, gare e impegni, W′bal, carboidrati,
  creazione di allenamenti su Intervals → dispositivo, libreria) e un prompt pronto per un Progetto Claude.

## Installazione con Claude Code (consigliata)

```bash
git clone https://github.com/valeriomastromarino/MasCoachForAll.git
cd MasCoachForAll
claude
```

Poi in Claude Code scrivi **`/installa-mascoach`**: ti guida dall'inizio alla fine (chiave Intervals, prova in locale,
pubblicazione su Vercel, connettore e Progetto su Claude). Tu devi solo fare i login e i passaggi sui siti web.

Servono: Node.js 20.9 o più recente, Git, un account Intervals.icu con i tuoi dati, un account Vercel gratuito e un
abbonamento Claude che permetta i connettori personalizzati. Per farlo a mano: [INSTALLAZIONE.md](INSTALLAZIONE.md).

Per pubblicare modifiche o aggiornamenti: **`/aggiorna-mascoach`**.

In più, con **`/crea-artefatto`** (Claude Code desktop) nasce una pagina privata su claude.ai con prontezza di oggi,
allenamenti da fare e ultime uscite, più una chat col coach che può anche scrivere su Intervals: vedi
[artefatto/README.md](artefatto/README.md).

## Solo in locale

```bash
npm install
npm run dev
```

Apri http://localhost:3000. Senza chiave l'app mostra **dati demo**; con `INTERVALS_API_KEY` in `.env.local` mostra i tuoi.
La chiave resta sul server e non arriva mai al browser. `.env.local` è escluso da git.

## Metodologia

| Area | Riferimento | File |
|---|---|---|
| Zone di potenza, NP, IF, TSS | Coggan & Allen | `src/lib/physio/power.ts` |
| Fitness / fatica / forma (CTL, ATL, TSB) | Banister, Coggan (PMC) | `src/lib/physio/pmc.ts` |
| HRV: ln rMSSD, media 7 gg vs range normale 60 gg | Altini, Plews/Buchheit | `src/lib/physio/hrv.ts` |
| Potenza critica e W′ (3–20 min) | Monod, Skiba | `src/lib/physio/criticalPower.ts` |
| Distribuzione intensità a 3 zone | Seiler | `src/lib/physio/distribution.ts` |
| Zone cardio da FC di soglia | Friel | `src/lib/physio/hrZones.ts` |
| HRV × FC a riposo: pattern combinati e notti anomale | Altini | `src/lib/physio/autonomic.ts`, `src/lib/physio/baseline.ts` |
| Test: rampa (frazione del MAP personale + flesso FC corretto per il ritardo), 95% 20', 90% 8', flessione FC (Dmax), soglie DFA α1 | Coggan, Carmichael, Conconi/Kara, Rogers & Gronwald | `src/lib/physio/fitnessTest.ts` |
| Stato di oggi (HRV + FC riposo + sonno + TSB) | sintesi delle precedenti | `src/lib/physio/readiness.ts` |

Test: `npx vitest run`.

## Roadmap

1. ✅ Dashboard di analisi, archivio uscite con filtri e test, dettaglio uscita (mappa OpenStreetMap, grafici, DFA α1, sforzi)
2. Creazione allenamenti (editor) e invio a Intervals.icu / dispositivo
3. Player per rulli: ERG via Bluetooth FTMS, fascia cardio con RR e DFA alpha 1
4. ✅ Coach Claude via connettore MCP (abbonamento Claude, senza chiave API); chat dentro l'app più avanti
