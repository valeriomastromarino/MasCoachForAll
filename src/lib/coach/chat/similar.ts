// How close a message is to the phrases the chat knows (25 November 2026). No model: words cut to their root (the first
// six letters without the last vowel, so «allenarmi», «allenamento» and «allenare» meet), weighted by how rare they are
// (TF-IDF), plus letter triplets for typos and joined words. The nearest example decides, and the score says how sure.
import { normalize } from "./text";

const STOP = new Set(
  "a ad al allo ai agli alla alle anche c che chi ci con da dal dai dalla dalle dei del della delle dello di e ed gli ha hai ho i il in io la le li lo ma mi ne nel nella nelle o per piu se si su sul sulla ti tra tu un una uno e sono sei mio mia miei mie tuo tua questo questa quello quella cosa".split(" "),
);

/** The root of a word: without the last vowel, at most six letters. */
export function root(w: string): string {
  const s = w.length > 4 ? w.replace(/[aeiou]$/, "") : w;
  return s.slice(0, 6);
}

function features(text: string): Map<string, number> {
  const t = normalize(text);
  const f = new Map<string, number>();
  const add = (k: string, v: number) => f.set(k, (f.get(k) ?? 0) + v);
  const words = t.split(" ").filter((w) => w && !STOP.has(w));
  for (const w of words) add(`w:${root(w)}`, 1);
  // Two words together say more than each one («mal di schiena», «zona grigia»).
  for (let i = 1; i < words.length; i++) add(`b:${root(words[i - 1])}_${root(words[i])}`, 0.6);
  const s = ` ${words.join(" ")} `;
  for (let i = 0; i + 3 <= s.length; i++) add(`c:${s.slice(i, i + 3)}`, 0.25);
  return f;
}

export type Doc = { label: string; text: string };
type Vec = { v: Map<string, number>; norm: number };

export class Index {
  private idf = new Map<string, number>();
  private docs: { label: string; text: string; vec: Vec }[] = [];

  constructor(docs: Doc[]) {
    const raw = docs.map((d) => ({ ...d, f: features(d.text) }));
    const df = new Map<string, number>();
    for (const d of raw) for (const k of d.f.keys()) df.set(k, (df.get(k) ?? 0) + 1);
    const n = raw.length;
    for (const [k, c] of df) this.idf.set(k, Math.log(1 + n / c));
    this.docs = raw.map((d) => ({ label: d.label, text: d.text, vec: this.weigh(d.f) }));
  }

  private weigh(f: Map<string, number>): Vec {
    const v = new Map<string, number>();
    let sq = 0;
    for (const [k, x] of f) {
      const w = x * (this.idf.get(k) ?? 0);
      if (!w) continue;
      v.set(k, w);
      sq += w * w;
    }
    return { v, norm: Math.sqrt(sq) };
  }

  /** The best example of each label, nearest first. `only` keeps the labels that pass. */
  nearest(text: string, k = 5, only?: (label: string) => boolean): { label: string; text: string; score: number }[] {
    const q = this.weigh(features(text));
    if (!q.norm) return [];
    const best = new Map<string, { label: string; text: string; score: number }>();
    for (const d of this.docs) {
      if (only && !only(d.label)) continue;
      let dot = 0;
      const [small, big] = q.v.size < d.vec.v.size ? [q.v, d.vec.v] : [d.vec.v, q.v];
      for (const [key, x] of small) {
        const y = big.get(key);
        if (y) dot += x * y;
      }
      const score = d.vec.norm ? dot / (q.norm * d.vec.norm) : 0;
      const cur = best.get(d.label);
      if (!cur || score > cur.score) best.set(d.label, { label: d.label, text: d.text, score });
    }
    return [...best.values()].sort((a, b) => b.score - a.score).slice(0, k);
  }

  /** How close the message is to one label (its best example). */
  score(text: string, label: string): number {
    return this.nearest(text, 1, (l) => l === label)[0]?.score ?? 0;
  }
}
