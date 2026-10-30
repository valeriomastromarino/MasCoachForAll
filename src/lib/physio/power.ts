// Power-based metrics following Coggan & Allen ("Training and Racing with a Power Meter").

export type Zone = { id: string; name: string; min: number; max: number | null };

/** Coggan's 7 power levels, expressed as fraction of FTP (upper bounds). */
export const COGGAN_POWER_ZONES: { id: string; name: string; upper: number | null }[] = [
  { id: "Z1", name: "Recupero attivo", upper: 0.55 },
  { id: "Z2", name: "Endurance", upper: 0.75 },
  { id: "Z3", name: "Tempo", upper: 0.9 },
  { id: "Z4", name: "Soglia (lattato)", upper: 1.05 },
  { id: "Z5", name: "VO2max", upper: 1.2 },
  { id: "Z6", name: "Capacità anaerobica", upper: 1.5 },
  { id: "Z7", name: "Neuromuscolare", upper: null },
];

/** Sweet spot (Coggan): ~88–94% FTP. */
export const SWEET_SPOT = { min: 0.88, max: 0.94 };

export function powerZones(ftp: number): Zone[] {
  let lower = 0;
  return COGGAN_POWER_ZONES.map((z) => {
    const min = Math.round(lower * ftp) + (lower === 0 ? 0 : 1);
    const max = z.upper === null ? null : Math.round(z.upper * ftp);
    lower = z.upper ?? lower;
    return { id: z.id, name: z.name, min, max };
  });
}

/**
 * Normalized Power: 30 s rolling average, raised to the 4th power, averaged, 4th root.
 * `watts` must be sampled at 1 Hz.
 */
export function normalizedPower(watts: number[]): number {
  if (watts.length < 30) return NaN;
  const rolled: number[] = [];
  let sum = 0;
  for (let i = 0; i < watts.length; i++) {
    sum += watts[i];
    if (i >= 30) sum -= watts[i - 30];
    if (i >= 29) rolled.push(sum / 30);
  }
  const m4 = rolled.reduce((a, p) => a + p ** 4, 0) / rolled.length;
  return m4 ** 0.25;
}

export function intensityFactor(np: number, ftp: number): number {
  return np / ftp;
}

/** TSS = (s · NP · IF) / (FTP · 3600) · 100 — one hour at FTP = 100. */
export function tss(durationSecs: number, np: number, ftp: number): number {
  const IF = intensityFactor(np, ftp);
  return ((durationSecs * np * IF) / (ftp * 3600)) * 100;
}

export function variabilityIndex(np: number, avgPower: number): number {
  return np / avgPower;
}
