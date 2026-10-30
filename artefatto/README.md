# Artefatto MasCoach (claude.ai)

Una pagina privata su claude.ai, da aprire anche dall'app Claude sul telefono, per vedere al volo come stai e operare
con gli allenamenti. I dati arrivano dal vivo dal tuo connettore MasCoach: nel file non ci sono chiavi né dati personali.

- **Prontezza di oggi** e **allenamento da fare oggi**, con "Chiedi al coach se va bene".
- **Riquadri** HRV (media 7 gg vs range normale, metodo Altini), FC a riposo, sonno, forma (TSB).
- **Allenamenti da fare** (`calendario`): passi, "Adatta con il coach"; per quelli creati dal coach anche Sposta
  (`modifica_allenamento`) e Cancella (`cancella_allenamento`, doppia conferma); "Cancella le prove" (`cancella_prove`).
- **Ultimi 3 allenamenti fatti** (`uscite`) a riquadri, con "Analizza".
- **Chat col coach**: risponde Claude con il tuo account, con il prompt del coach (`prompt-coach/prompt-pronto.txt`) e
  tutti i 17 strumenti del connettore. Ogni scrittura su Intervals chiede conferma nella chat.
  Scheda atleta e chat salvate restano private nel tuo account; domande a pulsanti, immagini, scelta del modello.
- Temi Day / Night / Paper come l'app; aperta fuori da claude.ai mostra dati di esempio.

## Pubblicarla

In Claude Code (app desktop), nella cartella del progetto: **`/crea-artefatto`**.

Serve prima il connettore MasCoach su claude.ai (`/installa-mascoach`, passo 6) e il prompt con il tuo nome
(`node scripts/prompt-pronto.mjs --nome <Nome>`).

A mano, con lo strumento Artifact di Claude Code: pubblicare `artefatto/MasCoach-artefatto.html` con

- `files`: `{"coach-prompt.txt": "prompt-coach/prompt-pronto.txt"}` (la pagina lo legge con `fetch`)
- `capabilities`: `mcp` con server `MasCoach` e i 17 strumenti (stato_di_oggi, andamento, calendario, eventi, uscite,
  dettaglio_uscita, profilo_potenza, storico, w_balance, fueling_log, libreria_allenamenti, crea_allenamento,
  modifica_allenamento, cancella_allenamento, registra_carboidrati, salva_in_libreria, cancella_prove),
  `sample: {images: true}`, `db: {}`, `user: {}`

Per aggiornarla (nuova versione della pagina o prompt cambiato) si ripubblica sullo stesso indirizzo, salvato in
`artefatto/indirizzo.txt` (non va su GitHub). Se in claude.ai mancano alcuni strumenti del connettore, ricollegare il
connettore MasCoach da Impostazioni → Connettori per aggiornarne l'elenco.
