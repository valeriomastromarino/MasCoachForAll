"use client";

import { useSyncExternalStore } from "react";

export type Theme = "day" | "night" | "paper";

const THEMES: { id: Theme; label: string; icon: string }[] = [
  { id: "day", label: "Day", icon: "☀" },
  { id: "night", label: "Night", icon: "☾" },
  { id: "paper", label: "Paper", icon: "▤" },
];

export const THEME_KEY = "mascoach-theme";

// The theme lives on <html data-theme>, set before first paint by the script in the root layout.
function subscribe(onChange: () => void) {
  const obs = new MutationObserver(onChange);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => obs.disconnect();
}
const current = () => (document.documentElement.dataset.theme as Theme) || "day";

function applyTheme(t: Theme) {
  document.documentElement.dataset.theme = t;
  try {
    localStorage.setItem(THEME_KEY, t);
  } catch {
    // Private mode or blocked storage: the choice just won't be remembered.
  }
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, current, () => "day" as Theme);
  return (
    <div className="inline-flex gap-0.5 rounded-full p-[3px]" style={{ background: "var(--neutral-bg)" }} role="radiogroup" aria-label="Theme">
      {THEMES.map((t) => {
        const on = theme === t.id;
        return (
          <button
            key={t.id}
            role="radio"
            aria-checked={on}
            onClick={() => applyTheme(t.id)}
            className="rounded-full px-3 py-1 text-xs transition-colors"
            style={{
              background: on ? "var(--surface)" : "transparent",
              color: on ? "var(--foreground)" : "var(--muted)",
              boxShadow: on ? "0 1px 3px rgba(0,0,0,.12)" : undefined,
              fontWeight: on ? 500 : 400,
            }}
          >
            <span aria-hidden className="mr-1">
              {t.icon}
            </span>
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
