// Diesel / all-rounder / glycolytic reading of the power profile, for the first-launch screen.
// The thresholds for FTP/MAP and W′ come from the athlete's coaching library (diesel: FTP/MAP > 78 % and W′ < 15 kJ;
// glycolytic: FTP/MAP < 75 % and W′ > 20 kJ). The sprint and 1′/20′ ratios are rules of thumb. None of it is validated:
// it is one reading on a continuum, never a label, and it says how far to trust it.

export type PhenotypeInput = {
  weightKg: number | null;
  /** Outdoor FTP, W. */
  ftp: number | null;
  /** W′ set on Intervals.icu, J. */
  wPrimeSetJ: number | null;
  /** W′ of our own 3–20′ model, J, with its reliability flag. */
  modelWPrimeJ: number | null;
  modelReliable: boolean | null;
  /** Best powers of the last two seasons, W (null = no data). */
  best: { s5: number | null; m1: number | null; m5: number | null; m20: number | null };
  /** Mean-maximal power of the last 84 days at 20′, to spot a season that is not at its best. */
  recent20: number | null;
};

export type Lean = "diesel" | "neutro" | "glicolitico";

export type Criterion = {
  id: "ftp_map" | "sprint" | "uno_venti" | "w_prime";
  label: string;
  /** Short value shown next to the label. */
  detail: string;
  lean: Lean;
  /** −1 (diesel) … +1 (glycolytic). */
  score: number;
};

export type Phenotype = {
  criteria: Criterion[];
  /** −1 … +1, mean of the criteria; null when nothing can be judged. */
  score: number | null;
  /** 0 … 100 on the diesel → glycolytic axis (50 = all-rounder). */
  position: number | null;
  verdict: "diesel" | "all_rounder" | "glicolitico" | null;
  moderate: boolean;
  headline: string;
  reliability: { level: "alta" | "media" | "bassa"; reasons: string[] };
};

const clamp = (x: number) => Math.max(-1, Math.min(1, x));
const r1 = (x: number) => Math.round(x * 10) / 10;
const pct = (x: number) => `${Math.round(x * 100)}%`;
const fmt = (x: number, d = 1) => x.toFixed(d).replace(".", ",");

function leanOf(score: number): Lean {
  return score <= -0.35 ? "diesel" : score >= 0.35 ? "glicolitico" : "neutro";
}

export function assessPhenotype(i: PhenotypeInput): Phenotype {
  const criteria: Criterion[] = [];
  const { ftp, weightKg, best } = i;

  // 5′ power as the proxy for MAP: the library asks for FTP/MAP, and a ramp is not always available.
  if (ftp && best.m5) {
    const r = ftp / best.m5;
    const score = clamp((0.765 - r) / 0.05); // 0.78+ → diesel, 0.75− → glycolytic, 0.765 neutral
    criteria.push({ id: "ftp_map", label: "FTP / potenza a 5′", detail: `${ftp} su ${best.m5} W = ${pct(r)}`, lean: leanOf(-score), score: -score });
  }
  if (ftp && best.s5) {
    const r = best.s5 / ftp;
    const score = clamp((r - 2.8) / 0.4);
    const wkg = weightKg ? ` (${fmt(best.s5 / weightKg)} W/kg)` : "";
    criteria.push({ id: "sprint", label: "Potenza di picco (5″)", detail: `${best.s5} W${wkg}, ${fmt(r)}× la FTP`, lean: leanOf(score), score });
  }
  if (best.m1 && best.m20) {
    const r = best.m1 / best.m20;
    const score = clamp((r - 1.6) / 0.15);
    criteria.push({ id: "uno_venti", label: "Rapporto 1′ / 20′", detail: `${best.m1} su ${best.m20} W = ${fmt(r, 2)}`, lean: leanOf(score), score });
  }
  if (i.wPrimeSetJ) {
    const kj = i.wPrimeSetJ / 1000;
    const score = clamp((kj - 17.5) / 3);
    const model = i.modelWPrimeJ ? `, ${fmt(i.modelWPrimeJ / 1000, 0)} kJ nel modello` : "";
    criteria.push({ id: "w_prime", label: "W′ (riserva sopra la soglia)", detail: `${fmt(kj)} kJ impostato${model}`, lean: leanOf(score), score });
  }

  const reasons: string[] = [];
  if (best.m20 && i.recent20 !== null && i.recent20 < best.m20 * 0.9) {
    reasons.push(`I 20′ degli ultimi 84 giorni (${i.recent20} W) sono sotto i massimi delle ultime due stagioni (${best.m20} W): periodo scarico.`);
  }
  if (i.modelReliable === false) reasons.push("Il W′ del modello non è affidabile: mancano sforzi massimali lunghi.");
  if (criteria.length < 3) reasons.push("Pochi dati: il profilo si completa con più sforzi massimali.");
  const level = reasons.length === 0 ? "alta" : reasons.length <= 2 ? "media" : "bassa";

  if (criteria.length === 0) {
    return { criteria, score: null, position: null, verdict: null, moderate: false, headline: "Dati insufficienti", reliability: { level: "bassa", reasons } };
  }
  const score = criteria.reduce((s, c) => s + c.score, 0) / criteria.length;
  const verdict = score <= -0.25 ? "diesel" : score >= 0.25 ? "glicolitico" : "all_rounder";
  const moderate = Math.abs(score) < 0.7;
  const headline =
    verdict === "all_rounder"
      ? "All-rounder"
      : `${moderate ? "Tendenza " : ""}${verdict === "diesel" ? (moderate ? "diesel moderata" : "Diesel") : moderate ? "glicolitica moderata" : "Glicolitico"}`;
  return { criteria, score: r1(score * 100) / 100, position: Math.round(((score + 1) / 2) * 100), verdict, moderate, headline, reliability: { level, reasons } };
}
