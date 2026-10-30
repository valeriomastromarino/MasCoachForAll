// Training-intensity distribution in Seiler's 3-zone model, mapped from Coggan power zones:
//   bassa  = Coggan Z1–Z2 (below LT1/VT1)
//   media  = Coggan Z3 (between thresholds, "grey zone")
//   alta   = Coggan Z4 and above (at/above LT2/VT2)
// Most well-trained endurance athletes spend ~75–80% of time low (polarised or pyramidal patterns).
// Intervals.icu also reports "SS" (sweet spot), which overlaps Z3/Z4, so it is ignored here.

export type ZoneSecs = { id: string; secs: number };
export type Distribution = { low: number; mid: number; high: number; totalSecs: number };

const LOW = new Set(["Z1", "Z2"]);
const MID = new Set(["Z3"]);

export function seilerDistribution(zoneTimes: ZoneSecs[][]): Distribution {
  let low = 0;
  let mid = 0;
  let high = 0;
  for (const activity of zoneTimes) {
    for (const z of activity) {
      if (LOW.has(z.id)) low += z.secs;
      else if (MID.has(z.id)) mid += z.secs;
      else if (/^Z\d/.test(z.id)) high += z.secs;
    }
  }
  const total = low + mid + high;
  if (total === 0) return { low: 0, mid: 0, high: 0, totalSecs: 0 };
  return { low: low / total, mid: mid / total, high: high / total, totalSecs: total };
}

export type DistributionPattern = "polarizzata" | "piramidale" | "soglia" | "solo bassa intensità" | "n/d";

export function classifyDistribution(d: Distribution): DistributionPattern {
  if (d.totalSecs === 0) return "n/d";
  if (d.high < 0.03 && d.mid < 0.05) return "solo bassa intensità";
  if (d.low < 0.65) return "soglia";
  return d.high > d.mid ? "polarizzata" : "piramidale";
}
