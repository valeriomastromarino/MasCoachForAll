// The app's main colour, chosen in Impostazioni: a hue and a saturation kept on this device.
// No choice = the terracotta of the themes. The tokens are computed in globals.css from --accent-h / --accent-s on <html>
// (the same two values are set before first paint by the script in the root layout and in standalone/index.html).
export type Accent = { h: number; s: number };

export const ACCENT_KEY = "mascoach-accent";

export const ACCENT_PRESETS: { name: string; accent: Accent | null }[] = [
  { name: "Terracotta", accent: null },
  { name: "Blu", accent: { h: 214, s: 48 } },
  { name: "Verde", accent: { h: 150, s: 38 } },
  { name: "Viola", accent: { h: 268, s: 38 } },
  { name: "Rosa", accent: { h: 342, s: 46 } },
  { name: "Grafite", accent: { h: 215, s: 8 } },
];

/** Colour of a swatch, as the Day theme paints the main colour. */
export const swatch = (a: Accent | null): string => (a ? `hsl(${a.h} ${a.s}% 44%)` : "#9f5f45");

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(n)));

export function isAccent(x: unknown): x is Accent {
  const a = x as Accent | null;
  return !!a && typeof a.h === "number" && typeof a.s === "number" && Number.isFinite(a.h) && Number.isFinite(a.s);
}

export function loadAccent(): Accent | null {
  try {
    const raw = localStorage.getItem(ACCENT_KEY);
    const a = raw ? (JSON.parse(raw) as unknown) : null;
    return isAccent(a) ? { h: clamp(a.h, 0, 360), s: clamp(a.s, 0, 80) } : null;
  } catch {
    return null;
  }
}

/** Paints the colour on the page and keeps it (null = back to terracotta). */
export function saveAccent(a: Accent | null): void {
  const root = document.documentElement;
  if (a) {
    root.dataset.accent = "1";
    root.style.setProperty("--accent-h", String(clamp(a.h, 0, 360)));
    root.style.setProperty("--accent-s", String(clamp(a.s, 0, 80)));
  } else {
    delete root.dataset.accent;
    root.style.removeProperty("--accent-h");
    root.style.removeProperty("--accent-s");
  }
  try {
    if (a) localStorage.setItem(ACCENT_KEY, JSON.stringify({ h: clamp(a.h, 0, 360), s: clamp(a.s, 0, 80) }));
    else localStorage.removeItem(ACCENT_KEY);
  } catch {
    // Storage blocked: the colour just won't be remembered.
  }
  window.dispatchEvent(new Event("mascoach-accent"));
}
