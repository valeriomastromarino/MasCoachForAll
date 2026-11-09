"use client";

// Impostazioni → Aspetto: the main colour of the app, six ready ones and two sliders (hue, saturation).
import { useSyncExternalStore } from "react";
import { ACCENT_KEY, ACCENT_PRESETS, type Accent, loadAccent, saveAccent, swatch } from "@/lib/accent";
import { ColorSlider } from "./ColorSlider";

const subscribe = (cb: () => void) => {
  window.addEventListener("mascoach-accent", cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener("mascoach-accent", cb);
    window.removeEventListener("storage", cb);
  };
};
// A string snapshot: useSyncExternalStore needs a value that compares equal while nothing changed.
const snapshot = () => {
  try {
    return localStorage.getItem(ACCENT_KEY) ?? "";
  } catch {
    return "";
  }
};

/** The whole hue circle, as the track of the "Tinta" slider. */
const HUES = "linear-gradient(90deg,hsl(0 60% 50%),hsl(60 60% 50%),hsl(120 60% 45%),hsl(180 60% 45%),hsl(240 60% 55%),hsl(300 60% 50%),hsl(360 60% 50%))";

export function AccentPicker() {
  const raw = useSyncExternalStore(subscribe, snapshot, () => "");
  const accent: Accent | null = raw ? loadAccent() : null;
  const h = accent?.h ?? 18;
  const s = accent?.s ?? 42;
  return (
    <div>
      <div className="flex flex-wrap gap-2.5" role="radiogroup" aria-label="Colori pronti">
        {ACCENT_PRESETS.map((p) => {
          const on = p.accent === null ? accent === null : accent?.h === p.accent.h && accent.s === p.accent.s;
          return (
            <button
              key={p.name}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={p.name}
              title={p.name}
              onClick={() => saveAccent(p.accent)}
              className="h-9 w-9 rounded-full"
              style={{ background: swatch(p.accent), boxShadow: on ? "0 0 0 2px var(--surface), 0 0 0 4px var(--foreground)" : undefined }}
            />
          );
        })}
      </div>
      <div className="mt-4 text-xs text-muted">Tinta</div>
      <ColorSlider label="Tinta" value={h} min={0} max={360} track={HUES} thumb={`hsl(${h} 60% 48%)`} onChange={(v) => saveAccent({ h: v, s })} />
      <div className="mt-2 text-xs text-muted">
        Intensità <span className="num">{s}%</span>
      </div>
      <ColorSlider
        label="Intensità"
        value={s}
        min={0}
        max={80}
        track={`linear-gradient(90deg, hsl(${h} 0% 55%), hsl(${h} 80% 45%))`}
        thumb={`hsl(${h} ${s}% 44%)`}
        onChange={(v) => saveAccent({ h, s: v })}
      />
      {accent && (
        <button type="button" onClick={() => saveAccent(null)} className="mt-2 text-xs underline" style={{ color: "var(--accent-ink)" }}>
          Torna a terracotta
        </button>
      )}
    </div>
  );
}
