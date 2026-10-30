// Daily readiness: autonomic markers first (HRV and resting HR read together, Altini), then sleep and
// training-load context (TSB). The load metrics explain *why*, the body's response decides *what to do*.
import type { AutonomicAssessment } from "./autonomic";
import type { HrvAnalysis } from "./hrv";
import { formZone } from "./pmc";

export type ReadinessLevel = "verde" | "giallo" | "rosso" | "grigio";

export type Readiness = {
  level: ReadinessLevel;
  headline: string;
  advice: string;
  reasons: string[];
};

export function assessReadiness(input: {
  hrv: HrvAnalysis["today"];
  autonomic: Pick<AutonomicAssessment, "pattern" | "explanation" | "severity" | "anomalyToday" | "anomalyStreak">;
  ctl: number | null;
  tsb: number | null;
  sleepHours: number | null;
}): Readiness {
  const { hrv, autonomic, ctl, tsb, sleepHours } = input;
  const reasons: string[] = [autonomic.explanation];
  let score: number = autonomic.severity; // higher = more caution

  if (autonomic.anomalyStreak >= 2) {
    score += 2;
    reasons.push(
      `${autonomic.anomalyStreak} notti di fila con HRV bassa e FC a riposo alta insieme: tipico di un malanno in arrivo o di stress accumulato.`,
    );
  } else if (autonomic.anomalyToday) {
    score += 1;
    reasons.push("Stanotte HRV bassa e FC a riposo alta insieme: stress acuto (sonno, alcol, viaggio, malanno?).");
  } else if (hrv.acuteDrop) {
    score += 1;
    reasons.push("L'HRV di stanotte è molto più bassa del solito.");
  }

  if (hrv.cv7 !== null && hrv.cv7Prev !== null && hrv.cv7 > hrv.cv7Prev * 1.5 && hrv.status === "sotto la norma") {
    score += 1;
    reasons.push("HRV più instabile della settimana scorsa e in calo: tipico segnale di fatica che si accumula.");
  }

  if (sleepHours !== null && sleepHours < 6) {
    score += 1;
    reasons.push(`Sonno breve stanotte (${sleepHours.toFixed(1)} h).`);
  }

  if (tsb !== null && ctl !== null) {
    const zone = formZone(tsb, ctl);
    if (zone === "alto rischio") {
      score += 1;
      reasons.push(`Forma (TSB ${tsb.toFixed(0)}) in zona ad alto rischio: la fatica supera di molto la fitness.`);
    } else {
      reasons.push(`Forma (TSB ${tsb.toFixed(0)}): zona ${zone}.`);
    }
  }

  if (autonomic.pattern === "dati_insufficienti" && score === 0) {
    return {
      level: "grigio",
      headline: "Dati insufficienti",
      advice: "Segui il piano e ascolta le sensazioni finché la baseline non è pronta.",
      reasons,
    };
  }
  if (score >= 3) {
    return { level: "rosso", headline: "Recupero", advice: "Oggi riposo o Z1 breve (≤ 45 min). Niente intensità.", reasons };
  }
  if (score >= 1) {
    return {
      level: "giallo",
      headline: "Riduci l'intensità",
      advice: "Va bene allenarsi, ma preferisci Z2. Se è previsto un lavoro duro, accorcialo o spostalo.",
      reasons,
    };
  }
  return { level: "verde", headline: "Pronto", advice: "Puoi svolgere l'allenamento previsto, anche se intenso.", reasons };
}
