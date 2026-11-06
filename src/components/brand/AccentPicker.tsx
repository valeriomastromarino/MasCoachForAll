"use client";

// Impostazioni → Aspetto: the main colour of the app, six ready ones and two sliders (hue, saturation).
import { useSyncExternalStore } from "react";
import { ACCENT_KEY, ACCENT_PRESETS, type Accent, loadAccent, saveAccent, swatch } from "@/lib/accent";

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
      <label className="mt-4 block text-xs text-muted">
        Tinta
        <div
          className="mt-1.5 h-2.5 rounded-full"
          style={{ background: "linear-gradient(90deg,hsl(0 60% 50%),hsl(60 60% 50%),hsl(120 60% 45%),hsl(180 60% 45%),hsl(240 60% 55%),hsl(300 60% 50%),hsl(360 60% 50%))" }}
          aria-hidden
        />
        <input type="range" min={0} max={360} value={h} onChange={(e) => saveAccent({ h: Number(e.target.value), s })} className="mt-1 w-full" style={{ accentColor: "var(--brand)" }} />
      </label>
      <label className="mt-2 block text-xs text-muted">
        Intensità <span className="num">{s}%</span>
        <input type="range" min={0} max={80} value={s} onChange={(e) => saveAccent({ h, s: Number(e.target.value) })} className="mt-1 w-full" style={{ accentColor: "var(--brand)" }} />
      </label>
      {accent && (
        <button type="button" onClick={() => saveAccent(null)} className="mt-2 text-xs underline" style={{ color: "var(--accent-ink)" }}>
          Torna a terracotta
        </button>
      )}
    </div>
  );
}
