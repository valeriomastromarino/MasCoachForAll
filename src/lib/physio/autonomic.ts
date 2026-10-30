// HRV + resting HR read together, as Marco Altini recommends: the two markers come from the same
// overnight recording and each disambiguates the other.
//
// Trend (7-day baselines vs 60-day normal ranges):
//   HRV ↓ + RHR ↑  → stress response (training, illness, sleep, alcohol, life stress): back off.
//   HRV ↓ + RHR =  → mild stress: keep it easy and recheck.
//   HRV = + RHR ↑  → often heat, dehydration, alcohol or an incoming cold: watch it.
//   HRV ↓ + RHR ↓  → in endurance athletes under heavy load can be parasympathetic saturation:
//                    not necessarily bad, judge with load and how you feel.
//   HRV ↑/= + RHR ↓ → coping well, positive adaptation.
//   HRV ↑ + RHR ↑  → markers disagree: likely a noisy measurement, draw no conclusion.
//
// Acute (single night): a day is an anomaly when both markers deviate together in the stress direction.
// Two or more anomalous nights in a row are the typical signature of illness or accumulated stress.
import { band, type BaselinePoint, rollingBaseline } from "./baseline";
import { isNum } from "./stats";

export type AutonomicPattern =
  | "stabile"
  | "adattamento"
  | "hrv_alto"
  | "stress"
  | "hrv_basso"
  | "fc_alta"
  | "saturazione"
  | "discordante"
  | "dati_insufficienti";

export type AutonomicAssessment = {
  pattern: AutonomicPattern;
  title: string;
  explanation: string;
  /** 0 = nothing to act on, 1 = keep an eye on it, 2 = back off. */
  severity: 0 | 1 | 2;
  /** Last night was an anomaly (both markers deviating towards stress). */
  anomalyToday: boolean;
  /** Consecutive anomalous nights ending today. */
  anomalyStreak: number;
  /** Dates of anomalous nights in the analysed period. */
  anomalyDates: string[];
};

/** Combined acute deviation (−z HRV + z RHR) above which a night is flagged, with both markers agreeing. */
export const ANOMALY_SCORE = 3;
const AGREE_Z = 1;

const TEXT: Record<AutonomicPattern, { title: string; explanation: string; severity: 0 | 1 | 2 }> = {
  stabile: {
    title: "Equilibrio",
    explanation: "HRV e FC a riposo sono nei tuoi range normali: il sistema nervoso autonomo sta gestendo bene il carico.",
    severity: 0,
  },
  adattamento: {
    title: "Adattamento positivo",
    explanation: "FC a riposo più bassa del solito con HRV stabile o alta: stai assorbendo bene l'allenamento.",
    severity: 0,
  },
  hrv_alto: {
    title: "HRV alta",
    explanation:
      "HRV sopra la norma con FC a riposo normale: di solito buon segno. Se sei in un blocco di carico pesante, verifica le sensazioni.",
    severity: 0,
  },
  stress: {
    title: "Risposta da stress",
    explanation:
      "HRV sotto e FC a riposo sopra la norma: è il segnale di stress più chiaro (allenamento, malanno in arrivo, sonno, alcol, lavoro). Riduci l'intensità finché non rientrano.",
    severity: 2,
  },
  hrv_basso: {
    title: "HRV in calo",
    explanation: "Solo l'HRV è sotto la norma: stress moderato. Preferisci lavori facili e ricontrolla domani.",
    severity: 1,
  },
  fc_alta: {
    title: "FC a riposo alta",
    explanation:
      "Solo la FC a riposo è sopra la norma: spesso caldo, disidratazione, alcol o inizio di malanno. Tienila d'occhio.",
    severity: 1,
  },
  saturazione: {
    title: "Possibile saturazione",
    explanation:
      "HRV e FC a riposo entrambe basse: negli atleti di endurance con carichi alti può essere saturazione parasimpatica, non per forza negativa. Valuta con carico e sensazioni.",
    severity: 1,
  },
  discordante: {
    title: "Segnali discordanti",
    explanation: "HRV e FC a riposo sono entrambe alte: spesso è una misura disturbata. Non trarre conclusioni da questi giorni.",
    severity: 0,
  },
  dati_insufficienti: {
    title: "Baseline in costruzione",
    explanation: "Servono almeno 3 settimane di misure notturne di HRV e FC a riposo per definire i tuoi range normali.",
    severity: 0,
  },
};

function classify(hrv: BaselinePoint | undefined, rhr: BaselinePoint | undefined): AutonomicPattern {
  const h = band(hrv);
  const r = band(rhr);
  if (h === null || r === null) return "dati_insufficienti";
  if (h === "sotto" && r === "sopra") return "stress";
  if (h === "sotto" && r === "sotto") return "saturazione";
  if (h === "sotto") return "hrv_basso";
  if (h === "sopra" && r === "sopra") return "discordante";
  if (r === "sopra") return "fc_alta";
  if (r === "sotto") return "adattamento";
  if (h === "sopra") return "hrv_alto";
  return "stabile";
}

export function isAnomaly(hrv: BaselinePoint | undefined, rhr: BaselinePoint | undefined): boolean {
  if (!hrv || !rhr || !isNum(hrv.z) || !isNum(rhr.z)) return false;
  return hrv.z <= -AGREE_Z && rhr.z >= AGREE_Z && -hrv.z + rhr.z >= ANOMALY_SCORE;
}

/**
 * `dates`, `lnRmssd` and `restingHr` are aligned, one entry per consecutive day.
 * HRV must already be ln-transformed.
 */
export function assessAutonomic(
  dates: string[],
  lnRmssd: (number | null)[],
  restingHr: (number | null)[],
): AutonomicAssessment & { rhr: BaselinePoint[]; hrv: BaselinePoint[] } {
  const hrv = rollingBaseline(lnRmssd);
  const rhr = rollingBaseline(restingHr);
  const last = dates.length - 1;
  const anomalies = dates.map((_, i) => isAnomaly(hrv[i], rhr[i]));
  let streak = 0;
  for (let i = last; i >= 0 && anomalies[i]; i--) streak++;
  const pattern = classify(hrv[last], rhr[last]);
  const t = TEXT[pattern];
  return {
    pattern,
    ...t,
    anomalyToday: anomalies[last] ?? false,
    anomalyStreak: streak,
    anomalyDates: dates.filter((_, i) => anomalies[i]),
    hrv,
    rhr,
  };
}
