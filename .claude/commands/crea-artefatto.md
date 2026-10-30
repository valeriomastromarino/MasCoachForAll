---
description: Pubblica (o aggiorna) l'artefatto MasCoach su claude.ai - prontezza, allenamenti da fare e chat col coach
---

Pubblica per l'utente l'artefatto MasCoach descritto in `artefatto/README.md`. Parla in italiano, con frasi semplici, e non scrivere mai segreti in chat.

1. **Requisiti**. Il connettore `MasCoach` deve essere già aggiunto su claude.ai (`/installa-mascoach`, passo 6): chiedi conferma con una sola domanda. Serve lo strumento Artifact di Claude Code (app desktop): se non c'è, spiega che va usata l'app desktop di Claude Code e fermati.
2. **Prompt**. Se manca `prompt-coach/prompt-pronto.txt`, chiedi come vuole che il coach lo chiami ed esegui `node scripts/prompt-pronto.mjs --nome <Nome>`. Se esiste ma `prompt-coach/MasCoach_prompt.txt` è più recente, rigeneralo con lo stesso nome.
3. **Pubblicazione**. Leggi `artefatto/MasCoach-artefatto.html` per intero e pubblicalo con lo strumento Artifact:
   - `files`: `{"coach-prompt.txt": "prompt-coach/prompt-pronto.txt"}`
   - `capabilities`: `{"mcp": {"servers": [{"server": "MasCoach", "tools": ["stato_di_oggi", "andamento", "calendario", "eventi", "uscite", "dettaglio_uscita", "profilo_potenza", "storico", "w_balance", "fueling_log", "libreria_allenamenti", "crea_allenamento", "modifica_allenamento", "cancella_allenamento", "registra_carboidrati", "salva_in_libreria", "cancella_prove"]}]}, "sample": {"images": true}, "db": {}, "user": {}}`
   - Se esiste `artefatto/indirizzo.txt`, ripubblica su quell'indirizzo (`url`), leggendo prima l'artefatto se lo strumento lo chiede; altrimenti crea un artefatto nuovo e salva il suo indirizzo in `artefatto/indirizzo.txt` (è escluso da git).
4. **Spiega all'utente** in poche righe:
   - Alla prima apertura claude.ai chiede il consenso per il connettore MasCoach e, al primo messaggio in chat, per usare Claude (consuma il suo utilizzo).
   - Se lo strumento Artifact avvisa che il connettore non ha alcuni strumenti, va ricollegato da claude.ai → Impostazioni → Connettori.
   - La Scheda atleta si incolla dal pulsante **Scheda** della chat, oppure la fa il coach con l'intervista.
   - L'artefatto è privato: lo vede solo lui finché non lo condivide.
