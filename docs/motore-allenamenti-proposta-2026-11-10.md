# Motore degli allenamenti: il metodo e la ricerca

10 novembre 2026. È il metodo che segue il motore dell'app (`lib/training/season.ts`, `suggest.ts`, `classify.ts`): come costruisce la stagione, la settimana e la scelta del giorno, e su quali studi si basa.

---

## 1. Cosa dice la ricerca (2016-2025)

### Distribuzione dell'intensità: piramidale per un amatore
- **Meta-analisi 2024** (*Sports Medicine*): la polarizzata dà un piccolo vantaggio sul VO2max, soprattutto negli interventi brevi e negli atleti di livello nazionale.
- **Meta-analisi sui dati individuali, Rosenblat e colleghi, 2025** (*Sports Medicine*): nessuna differenza tra polarizzata e piramidale per VO2max e cronometro; nei sottogruppi gli agonisti sembrano rispondere meglio alla polarizzata, gli **amatori alla piramidale**.
- **Amatori in bici, Magalhães e colleghi, 2024** (*Sports*): 16 settimane con 60% del tempo sotto la prima soglia, 30% tra le due soglie e 10% sopra; la potenza a 4 mmol è salita molto, e il guadagno era legato al tempo passato tra le due soglie (tempo e sweet spot).
- **Professionisti**: quasi tutti i corridori WorldTour studiati si allenano in modo piramidale; nei ciclisti allenati l'alta intensità c'è in tutte le fasi e cresce avvicinandosi alle gare.
- Gli studi che favoriscono la polarizzata nei ciclisti (come Neal e colleghi, 2013) sono piccoli e su atleti già allenati.

### Con poche ore, l'intensità conta di più
- **«Much Ado About Zone 2»** (Storoschuk, Moran-MacDonald, Gibala, Gurd, *Sports Medicine* 2025): le prove non mostrano che la Zona 2 sia l'intensità migliore per i mitocondri o per bruciare grassi; con volumi bassi rendono di più le intensità sopra la Z2.
- La Z2 resta utile per il volume, per la lunga e per la durability, ma con 6-8 ore a settimana non può essere quasi tutto.

### Il VO2max si mantiene con l'intensità
- Gli studi di Hickson e le revisioni sul detraining concordano: si può togliere da un terzo a due terzi della frequenza o della durata senza perdere VO2max se resta l'intensità; togliendo l'intensità il VO2max cala.
- Una revisione del 2023 (*Frontiers in Physiology*) conclude che per mantenerlo basta un minimo di lavoro facile più almeno una seduta a settimana di intensità media o alta.

### L'ordine dei lavori conta poco, il carico e la costanza molto
- **Sylta e colleghi, 2016**: 63 ciclisti allenati per 12 settimane con intervalli dal più lungo al più corto, al contrario o mescolati; a parità di carico tutti migliorati del 5-10%, senza differenze tra i gruppi.

### Che intervalli
- **Intervalli brevi** (Rønnestad e colleghi, 2020): in ciclisti d'élite 3 serie da 13 × 30"/15" hanno migliorato la potenza sui 20' del 4,7%, i 4 × 5' sono scesi dell'1,4%.
- **Blocchi** (Rønnestad, Hansen ed Ellefsen, 2012): una settimana con 5 sedute intense seguita da 3 settimane con 1 ha dato più del metodo tradizionale.
- **Blocchi di intervalli medi** (Rønnestad e colleghi, 2025): una settimana con 6 sedute di intervalli lunghi a circa 3 mmol ha migliorato la potenza a 4 mmol del 4,5% e la potenza sui 15' del 4,9%, in ciclisti giovani e molto allenati.
- **Soglia «norvegese»** (Casado e colleghi, 2023): efficace negli élite della corsa, prove osservazionali; il motore ne prende l'idea della seduta sub-soglia.

### Durability
- **Jones, 2024** («la quarta dimensione»): dopo 2 h di bici impegnativa la potenza critica cala in media del 10%, con differenze enormi tra atleti. A pesare è soprattutto l'intensità del lavoro già fatto; 60 g/h di carboidrati la proteggono; la forza pesante potrebbe aiutare (Jones, 2025).

### Adattare con l'HRV
- **Javaloyes e colleghi, 2019** e le meta-analisi del 2020-2021: l'allenamento guidato dall'HRV dà benefici piccoli ma positivi. È la base della prontezza dell'app (metodo Altini).

---

## 2. Il metodo

1. **Piramidale tutto l'anno.** Due sedute di qualità in ogni settimana di carico di ogni fase. Qualità = qualsiasi seduta con lavoro sopra la Z2 (tempo, sweet spot, soglia, VO2max, anaerobico). Mai due giorni di fila. La lunga può avere tempo o salite nel finale senza contare come qualità.
2. **Il VO2max non sparisce mai**: almeno una seduta di VO2 ogni 7-10 giorni, anche in inverno.
3. **Fasi** (dal periodo di picco e dalla gara A, all'indietro; ancorate al giorno in cui la stagione è stata impostata):
   - Base: VO2max a ripetute brevi (30"/15", 40"/20", 30"/30") a dose bassa e sub-soglia o sweet spot lunghi; lunga in Z2.
   - Build: VO2max e soglia (95-105%); la lunga cresce e ha lavoro nell'ultima ora.
   - Picco: lunghe come la gara con il lavoro nel finale, sforzi brevi di 1-3', soglia di mantenimento.
   - Tapering: volume giù, stessa intensità; il giorno della gara nessun allenamento, il giorno dopo solo recupero.
4. **Settimana leggera** dopo 3 di carico (non subito prima del tapering): una sola seduta di qualità corta. **Settimana di blocco** solo su richiesta: tre sedute di qualità, stesso carico.
5. **Prima la settimana, poi il giorno**: lunga nel giorno della scheda, giorni di qualità distanziati, giorni facili con il TSS che resta; poi la seduta dalla libreria con la dose che cresce dentro la fase, varietà e coerenza di TSS. Qualità sui rulli o fuori come dice la scheda.
6. **La prontezza decide per ultima**: rosso = recupero entro 45'; giallo = Z2 senza tratti sopra la Z2; grigio o forma di ieri sotto −30 = qualità sotto la soglia. Una qualità saltata slitta al primo giorno libero non attaccato a un'altra.

La libreria può avere una cartella «MasCoach Coach» con le sedute che servono a questo metodo (30"/15", VO2 per i rulli, lunghe con il finale, aperture pre-gara): il coach le crea con `salva_in_libreria`.

---

## 3. Fonti
- [Polarizzata contro le altre distribuzioni, meta-analisi, Sports Medicine 2024](https://link.springer.com/article/10.1007/s40279-024-02034-z)
- [Rosenblat e colleghi 2025, meta-analisi dei dati individuali (PubMed)](https://pubmed.ncbi.nlm.nih.gov/39888556/)
- [Magalhães e colleghi 2024, 16 settimane piramidali in ciclisti amatori](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10820066/)
- [Revisione sistematica su periodizzazione e distribuzione nei ciclisti allenati](https://www.researchgate.net/publication/367128907_Training_Periodization_Intensity_Distribution_and_Volume_in_Trained_Cyclists_A_Systematic_Review)
- [Corridori WorldTour prima della fase agonistica](https://pmc.ncbi.nlm.nih.gov/articles/PMC13217385/)
- [Storoschuk e colleghi 2025, «Much Ado About Zone 2»](https://link.springer.com/article/10.1007/s40279-025-02261-y)
- [Detraining e allenamento ridotto, revisione 1989 (PubMed)](https://pubmed.ncbi.nlm.nih.gov/2692122/)
- [Conseguenze del detraining negli atleti di endurance, Frontiers in Physiology 2023](https://www.frontiersin.org/journals/physiology/articles/10.3389/fphys.2023.1334766/full)
- [Sylta e colleghi 2016, modelli di periodizzazione degli intervalli](https://ntnuopen.ntnu.no/ntnu-xmlui/handle/11250/2444540)
- [Rønnestad e colleghi 2020, intervalli brevi contro lunghi in ciclisti d'élite](https://doi.org/10.1111/sms.13627)
- [Rønnestad, Hansen ed Ellefsen 2012, periodizzazione a blocchi](https://www.researchgate.net/publication/225080014_Block_periodization_of_high-intensity_aerobic_intervals_provides_superior_training_effects_in_trained_cyclists)
- [Rønnestad e colleghi 2025, blocchi di intervalli medi o alti](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12575440/)
- [Casado e colleghi 2023, soglia guidata dal lattato](https://www.mdpi.com/1660-4601/20/5/3782)
- [Jones 2024, «The fourth dimension»](https://www.fisiologiadelejercicio.com/wp-content/uploads/2024/09/The_fourth_dimension_physiological_resilience_as_a-1-1.pdf)
- [Jones 2025, come allenare la resilienza](https://onlinelibrary.wiley.com/doi/10.1111/sms.70032)
- [Durability nei ciclisti, revisione sistematica 2025](https://link.springer.com/article/10.1007/s00421-025-05885-0)
- [Javaloyes e colleghi 2019, allenamento guidato dall'HRV nel ciclismo](https://www.researchgate.net/publication/325434300_Training_Prescription_Guided_by_Heart-Rate_Variability_in_Cycling)
- [Meta-analisi 2020 sull'allenamento guidato dall'HRV e il VO2max](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7663087/)
- [Neal e colleghi 2013, polarizzata contro soglia in ciclisti allenati](https://journals.physiology.org/doi/full/10.1152/japplphysiol.00652.2012)
