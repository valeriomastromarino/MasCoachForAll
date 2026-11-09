"use client";

// A slider for the colour of the app. The browser's range input jumps to wherever the finger lands, so scrolling the
// Settings page with a finger that started on it changed the colour. This one moves only with a tap (the value goes where
// the tap is) or a sideways drag; a finger going up or down scrolls the page and leaves the value alone.
import { useRef } from "react";

/** Movement (px) before deciding between a sideways drag and a scroll. */
const SLOP = 8;

export function ColorSlider({
  label,
  value,
  min,
  max,
  track,
  thumb,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  /** CSS background of the track (a gradient). */
  track: string;
  /** Colour of the thumb. */
  thumb: string;
  onChange: (v: number) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const press = useRef<{ x: number; y: number; id: number; drag: boolean } | null>(null);

  const valueAt = (clientX: number) => {
    const r = box.current!.getBoundingClientRect();
    const t = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    return Math.round(min + t * (max - min));
  };
  const set = (v: number) => {
    const c = Math.min(max, Math.max(min, v));
    if (c !== value) onChange(c);
  };

  return (
    <div
      ref={box}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      className="relative mt-1 h-7 cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ink)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]"
      // pan-y: the browser keeps vertical scrolling for itself and tells us with pointercancel.
      style={{ touchAction: "pan-y" }}
      onPointerDown={(e) => {
        press.current = { x: e.clientX, y: e.clientY, id: e.pointerId, drag: false };
        // A mouse means it: no scroll to tell apart.
        if (e.pointerType === "mouse") {
          press.current.drag = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          set(valueAt(e.clientX));
        }
      }}
      onPointerMove={(e) => {
        const p = press.current;
        if (!p || p.id !== e.pointerId) return;
        if (!p.drag) {
          const dx = Math.abs(e.clientX - p.x);
          const dy = Math.abs(e.clientY - p.y);
          if (dy > SLOP && dy > dx) {
            press.current = null;
            return;
          }
          if (dx <= SLOP) return;
          p.drag = true;
          e.currentTarget.setPointerCapture(e.pointerId);
        }
        set(valueAt(e.clientX));
      }}
      onPointerUp={(e) => {
        const p = press.current;
        press.current = null;
        if (p && p.id === e.pointerId && !p.drag) set(valueAt(e.clientX));
      }}
      onPointerCancel={() => {
        press.current = null;
      }}
      onKeyDown={(e) => {
        const step = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
        if (e.key === "Home") set(min);
        else if (e.key === "End") set(max);
        else if (step) set(value + step * (e.shiftKey ? 10 : 1));
        else return;
        e.preventDefault();
      }}
    >
      <div className="absolute inset-x-0 top-1/2 h-2.5 -translate-y-1/2 rounded-full" style={{ background: track }} aria-hidden />
      <div
        className="pointer-events-none absolute top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ left: `${((value - min) / (max - min)) * 100}%`, background: thumb, border: "3px solid #fff", boxShadow: "0 1px 4px rgba(0,0,0,0.35)" }}
        aria-hidden
      />
    </div>
  );
}
