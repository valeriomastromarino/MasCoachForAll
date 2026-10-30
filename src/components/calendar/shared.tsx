"use client";

// Pieces shared by the calendar grid and its pop-ups.
import { IconX } from "@tabler/icons-react";
import { useEffect } from "react";
import type { ActivityCategory } from "@/lib/activities";
import type { CoachMark } from "@/lib/coach/marks";
import type { WorkoutBlock } from "@/lib/workout";
import { capitalize, fmtDuration } from "../format";
import { apiFetch } from "../data/transport";

/** Colour of an activity by kind: road like power (blue), indoor lavender, off-road green, other sports grey. */
export const CATEGORY_STYLE: Record<ActivityCategory, { color: string; ink: string; label: string }> = {
  strada: { color: "var(--fitness)", ink: "var(--fitness-ink)", label: "Strada" },
  rulli: { color: "var(--fatigue)", ink: "var(--fatigue-ink)", label: "Rulli" },
  offroad: { color: "var(--good)", ink: "var(--good)", label: "MTB e gravel" },
  altro: { color: "var(--faint)", ink: "var(--muted)", label: "Altro sport" },
  nascosta: { color: "var(--faint)", ink: "var(--muted)", label: "Da Strava" },
};

export const tint = (color: string, pct: number) => `color-mix(in srgb, ${color} ${pct}%, var(--surface))`;

export function dayLabel(iso: string, opts: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long" }) {
  return capitalize(new Date(iso + "T12:00:00").toLocaleDateString("it-IT", opts));
}

/** Pop-up over the page: centred card on computers, full-height sheet from the bottom on phones. */
export function Modal({ title, subtitle, onClose, children }: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6"
      style={{ background: "rgba(0,0,0,.45)" }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="card max-h-[92vh] w-full overflow-y-auto rounded-b-none p-5 sm:max-w-xl sm:rounded-b-2xl"
        style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            {subtitle && <div className="text-xs text-muted">{subtitle}</div>}
            <div className="text-base font-medium">{title}</div>
          </div>
          <button className="rounded-lg p-1.5 text-muted hover:bg-[var(--neutral-bg)]" onClick={onClose} aria-label="Chiudi">
            <IconX size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 mt-5 text-xs font-medium">{children}</h3>;
}

/** Workout profile as zone-coloured blocks: width = time, height = intensity. */
export function WorkoutProfile({ blocks, height = 64, axis = true }: { blocks: WorkoutBlock[]; height?: number; axis?: boolean }) {
  const total = blocks.reduce((a, b) => a + b.secs, 0);
  if (!total) return null;
  return (
    <div>
      <div className="flex items-end gap-px" style={{ height }} aria-hidden>
        {blocks.map((b, i) => (
          <div
            key={i}
            title={`Z${b.zone} · ${fmtDuration(b.secs)}`}
            className="rounded-t-[3px]"
            style={{ width: `${(b.secs / total) * 100}%`, height: `${18 + (b.zone - 1) * 13.5}%`, background: `var(--z${b.zone})` }}
          />
        ))}
      </div>
      {axis && (
        <div className="mt-1 flex justify-between text-[11px] text-faint">
          <span>0</span>
          <span>{fmtDuration(total)}</span>
        </div>
      )}
    </div>
  );
}

/** Workout text as written on Intervals.icu, line breaks kept. */
export function Description({ text }: { text: string }) {
  return (
    <div className="whitespace-pre-line rounded-xl px-3.5 py-3 text-sm leading-relaxed" style={{ background: "var(--background)" }}>
      {text}
    </div>
  );
}

export async function send(url: string, method: "POST" | "PATCH" | "DELETE", body?: unknown): Promise<string | null> {
  try {
    const res = await apiFetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.ok) return null;
    const json = await res.json().catch(() => ({}));
    return json.error ?? res.statusText;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/** Small label on workouts written by MasCoach Coach ("Prova" while the coach is being tried out). */
export function CoachBadge({ mark }: { mark: CoachMark | null }) {
  if (!mark) return null;
  return (
    <span
      className="inline-block rounded px-1 text-[10px] font-medium leading-4"
      style={{ background: "var(--accent-bg)", color: "var(--accent-ink)", opacity: mark === "prova" ? 0.75 : 1 }}
    >
      {mark === "prova" ? "Coach · prova" : "Coach"}
    </span>
  );
}
