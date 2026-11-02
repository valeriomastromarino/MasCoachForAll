// Daily readiness: autonomic markers first (HRV and resting HR read together, Altini), then sleep and
// training-load context (TSB). The load metrics explain *why*, the body's response decides *what to do*.
// The rules follow the coach prompt (§5.5): the coach reads the level, it never recomputes it.
import type { AutonomicAssessment } from "./autonomic";
import type { HrvAnalysis } from "./hrv";
import { formZone } from "./pmc";

export type ReadinessLevel = "verde" | "giallo" | "rosso" | "grigio";

export type Readiness = {
  level: ReadinessLevel;
  headline: string;
  advice: string;
  reasons: string[];
  /** Only the signals that explain a yellow or red level: what the app shows under the headline (reasons also holds the HRV and form details). */
  alerts: string[];
};

/** Below this CTL the TSB/CTL ratio explodes, so "high risk" uses the absolute TSB instead. */
const LOW_CTL = 35;

/** "Alto rischio" for the readiness score: yesterday's form (CTL − ATL), as a share of CTL or, at low CTL, absolute. */
export function highRiskForm(ctlYesterday: number | null, tsbYesterday: number | null): boolean {
  if (ctlYesterday === null || tsbYesterday === null) return false;
  return ctlYesterday >= LOW_CTL ? tsbYesterday / ctlYesterday < -0.3 : tsbYesterday < -15;
}

export function assessReadiness(input: {
  hrv: HrvAnalysis["today"];
  autonomic: Pick<AutonomicAssessment, "pattern" | "explanation" | "severity" | "anomalyToday" | "anomalyStreak">;
  /** Form shown in the app (today's CTL − ATL), only for the explanation. */
  tsb: number | null;
  /** Yesterday's CTL and form (CTL − ATL): what the score judges "alto rischio" on. */
  ctlYesterday: number | null;
  tsbYesterday: number | null;
  /** Hours slept in the last three nights, newest last; null = no data. */
  sleepNights: (number | null)[];
}): Readiness {
  const { hrv, autonomic, tsb, ctlYesterday, tsbYesterday, sleepNights } = input;
  const reasons: string[] = [autonomic.explanation];
  const alerts: string[] = [];
  const warn = (text: string) => {
    reasons.push(text);
    alerts.push(text);
  };
  let score: number = autonomic.severity; // higher = more caution

  if (autonomic.anomalyStreak >= 2) {
    score += 2;
    warn(
      `${autonomic.anomalyStreak} notti di fila con HRV bassa e FC a riposo alta insieme: tipico di un malanno in arrivo o di stress accumulato.`,
    );
  } else if (autonomic.anomalyToday) {
    score += 1;
    warn("Stanotte HRV bassa e FC a riposo alta insieme: stress acuto (sonno, alcol, viaggio, malanno?).");
  } else if (hrv.acuteDrop) {
    score += 1;
    warn("L'HRV di stanotte è molto più bassa del solito.");
  }

  if (hrv.sd7 !== null && hrv.sd60 !== null && hrv.sd7 > hrv.sd60 * 1.5 && hrv.status === "sotto la norma") {
    score += 1;
    warn("HRV più instabile del solito (SD a 7 giorni oltre 1,5 volte quella a 60 giorni) e in calo: segnale di fatica che si accumula.");
  }

  const shortNights = sleepNights.filter((h) => h !== null && h < 6).length;
  if (shortNights >= 2) {
    score += 1;
    warn(`Sonno sotto le 6 h in ${shortNights} delle ultime 3 notti.`);
  }

  const highRisk = highRiskForm(ctlYesterday, tsbYesterday);
  // With a stress pattern low HRV and a negative form come from the same load: counting both would double it.
  if (highRisk && autonomic.pattern !== "stress") {
    score += 1;
    warn(`Forma di ieri (TSB ${tsbYesterday!.toFixed(0)}) in zona ad alto rischio: la fatica supera di molto la fitness.`);
  } else if (highRisk) {
    warn(`Forma di ieri (TSB ${tsbYesterday!.toFixed(0)}) in zona ad alto rischio, già legata allo stress: non aggiunge punti.`);
  } else if (tsb !== null) {
    reasons.push(`Forma (TSB ${tsb.toFixed(0)}): zona ${formZone(tsb)}.`);
  }

  // A calm pattern with a single acute signal never goes past yellow.
  if (score >= 3 && autonomic.pattern === "stabile" && autonomic.anomalyStreak < 2) {
    score = 2;
    warn("Pattern stabile con un solo segnale acuto: il livello massimo è giallo.");
  }

  if (autonomic.pattern === "dati_insufficienti" && score === 0) {
    return {
      level: "grigio",
      headline: "Dati insufficienti",
      advice: "Segui il piano e ascolta le sensazioni finché la baseline non è pronta.",
      reasons,
      alerts,
    };
  }
  if (score >= 3) {
    return { level: "rosso", headline: "Recupero", advice: "Oggi riposo o Z1 breve (≤ 45 min). Niente intensità.", reasons, alerts };
  }
  if (score >= 1) {
    return {
      level: "giallo",
      headline: "Riduci l'intensità",
      advice: "Va bene allenarsi, ma preferisci Z2. Se è previsto un lavoro duro, accorcialo o spostalo.",
      reasons,
      alerts,
    };
  }
  return { level: "verde", headline: "Pronto", advice: "Puoi svolgere l'allenamento previsto, anche se intenso.", reasons, alerts };
}
