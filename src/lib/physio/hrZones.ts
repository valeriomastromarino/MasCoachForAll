// Heart-rate zones anchored to lactate-threshold HR (Joe Friel, cycling).
import type { Zone } from "./power";

const FRIEL_CYCLING: { id: string; name: string; upper: number | null }[] = [
  { id: "Z1", name: "Recupero", upper: 0.81 },
  { id: "Z2", name: "Aerobico", upper: 0.89 },
  { id: "Z3", name: "Tempo", upper: 0.93 },
  { id: "Z4", name: "Sub-soglia", upper: 0.99 },
  { id: "Z5a", name: "Super-soglia", upper: 1.02 },
  { id: "Z5b", name: "Capacità aerobica", upper: 1.06 },
  { id: "Z5c", name: "Capacità anaerobica", upper: null },
];

export function hrZones(lthr: number): Zone[] {
  let lower = 0;
  return FRIEL_CYCLING.map((z) => {
    const min = Math.round(lower * lthr) + (lower === 0 ? 0 : 1);
    const max = z.upper === null ? null : Math.round(z.upper * lthr);
    lower = z.upper ?? lower;
    return { id: z.id, name: z.name, min, max };
  });
}
