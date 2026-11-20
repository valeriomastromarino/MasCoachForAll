"use client";

// Holding a session down to move it (phone week list, design A chosen on 20 November 2026). Half a second with the finger
// still: the phone buzzes, the session comes off the list and follows the finger; the day under the finger lights up, the
// list scrolls by itself near its edges, and the bottom bar becomes «Settimana prima · Annulla · Elimina · Settimana dopo»
// (holding the session on a week button changes the week). A tap still opens the session; a finger that moves before the
// half second is a scroll, as before.
import { IconChevronLeft, IconChevronRight, IconTrash, IconX } from "@tabler/icons-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type DropTarget = { kind: "day"; date: string } | { kind: "prev" | "next" | "cancel" | "delete" };

/** The session in the hand: where the finger is and where it holds the card. */
export type Held<T> = { item: T; x: number; y: number; dx: number; dy: number; width: number };

const HOLD_MS = 450;
/** How far the finger may wander during the hold before it counts as a scroll. */
const SLOP = 10;
/** Near the top and bottom of the list (px) it scrolls by itself, faster closer to the edge. */
const EDGE = 72;
const MAX_SPEED = 14;
/** On a week button: how long before the week changes, and again while the finger stays. */
const DWELL_MS = 700;
const AGAIN_MS = 1400;

function readTarget(x: number, y: number): DropTarget | null {
  const v = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-drop]")?.dataset.drop;
  if (!v) return null;
  if (v.startsWith("day:")) return { kind: "day", date: v.slice(4) };
  return v === "prev" || v === "next" || v === "cancel" || v === "delete" ? { kind: v } : null;
}

const sameTarget = (a: DropTarget | null, b: DropTarget | null) => a?.kind === b?.kind && (a?.kind !== "day" || a.date === (b as { date: string }).date);

/** The box that scrolls the list: the page of the pager on the phone app, the window elsewhere. */
function scrollerOf(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const s = getComputedStyle(p).overflowY;
    if ((s === "auto" || s === "scroll") && p.scrollHeight > p.clientHeight) return p;
  }
  return document.scrollingElement as HTMLElement | null;
}

type Live<T> = {
  item: T;
  el: HTMLElement;
  /** Where the finger first touched: touch events keep going there even if the page takes that element away. */
  touched: EventTarget | null;
  id: number;
  x0: number;
  y0: number;
  x: number;
  y: number;
  active: boolean;
  timer: number;
  raf: number;
  scroller: HTMLElement | null;
  /** Size of the card: over the bottom bar it floats above the finger, so the buttons stay in sight, and it never leaves the screen. */
  w: number;
  h: number;
  dwellOn: "" | "prev" | "next";
  dwellAt: number;
  last: DropTarget | null;
};

type Setters<T> = {
  setHeld: (h: Held<T> | null) => void;
  setTarget: (t: DropTarget | null) => void;
  floatRef: React.RefObject<HTMLDivElement | null>;
  ended: React.RefObject<number>;
  handlers: React.RefObject<{ onDrop: (item: T, target: DropTarget | null) => void; onWeek: (dir: -1 | 1) => void }>;
};

/** The gesture itself, outside React: it lives from the press to the release and only tells the page what changed. */
function createGesture<T>({ setHeld, setTarget, floatRef, ended, handlers }: Setters<T>) {
  let live: Live<T> | null = null;
  let grip = { dx: 0, dy: 0 };

  const place = (s: Live<T>) => {
    const onBar = !!s.last && s.last.kind !== "day";
    const x = Math.max(8, Math.min(window.innerWidth - s.w - 8, s.x - grip.dx));
    if (floatRef.current) floatRef.current.style.transform = `translate(${x}px, ${s.y - (onBar ? s.h + 28 : grip.dy)}px)`;
  };

  const tick = () => {
    const s = live;
    if (!s?.active) return;
    const sc = s.scroller;
    if (sc) {
      const top = sc === document.scrollingElement ? 0 : sc.getBoundingClientRect().top;
      const bottom = document.querySelector("[data-dropbar]")?.getBoundingClientRect().top ?? window.innerHeight;
      let v = 0;
      if (s.y < top + EDGE) v = -Math.ceil(((top + EDGE - s.y) / EDGE) * MAX_SPEED);
      else if (s.y > bottom - EDGE && s.y < bottom) v = Math.ceil(((s.y - bottom + EDGE) / EDGE) * MAX_SPEED);
      if (v) sc.scrollBy(0, v);
    }
    const t = readTarget(s.x, s.y);
    if (!sameTarget(t, s.last)) {
      s.last = t;
      setTarget(t);
      place(s);
    }
    const on = t?.kind === "prev" || t?.kind === "next" ? t.kind : "";
    const now = performance.now();
    if (on !== s.dwellOn) {
      s.dwellOn = on;
      s.dwellAt = now + DWELL_MS;
    } else if (on && now >= s.dwellAt) {
      s.dwellAt = now + AGAIN_MS;
      handlers.current.onWeek(on === "prev" ? -1 : 1);
    }
    s.raf = requestAnimationFrame(tick);
  };

  const finish = () => {
    const s = live;
    if (!s) return;
    clearTimeout(s.timer);
    cancelAnimationFrame(s.raf);
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", cancel);
    window.removeEventListener("touchmove", block);
    s.touched?.removeEventListener("touchmove", block as EventListener);
    window.removeEventListener("contextmenu", noMenu);
    live = null;
    if (s.active) {
      ended.current = performance.now();
      document.documentElement.removeAttribute("data-dragging");
      setHeld(null);
      setTarget(null);
    }
  };

  const activate = () => {
    const s = live;
    if (!s) return;
    s.active = true;
    const r = s.el.getBoundingClientRect();
    grip = { dx: s.x0 - r.left, dy: s.y0 - r.top };
    s.w = r.width;
    s.h = r.height;
    s.scroller = scrollerOf(s.el);
    try {
      navigator.vibrate?.(18);
    } catch {
      // no vibration on this device
    }
    document.documentElement.setAttribute("data-dragging", "");
    s.last = readTarget(s.x, s.y);
    setTarget(s.last);
    setHeld({ item: s.item, x: s.x, y: s.y, dx: grip.dx, dy: grip.dy, width: r.width });
    s.raf = requestAnimationFrame(tick);
  };

  function move(e: PointerEvent) {
    const s = live;
    if (!s || e.pointerId !== s.id) return;
    s.x = e.clientX;
    s.y = e.clientY;
    if (!s.active) {
      if (Math.hypot(s.x - s.x0, s.y - s.y0) > SLOP) finish();
      return;
    }
    place(s);
  }

  function up(e: PointerEvent) {
    const s = live;
    if (!s || e.pointerId !== s.id) return;
    // Released before the half second: a tap, and the click opens the session as before.
    if (!s.active) return finish();
    const t = readTarget(e.clientX, e.clientY);
    finish();
    handlers.current.onDrop(s.item, t);
  }

  function cancel(e: PointerEvent) {
    if (live && e.pointerId === live.id) finish();
  }

  // Once the session is in the hand the finger moves it, not the page: no scrolling, no sliding to the next page.
  function block(e: TouchEvent) {
    if (live?.active && e.cancelable) e.preventDefault();
  }

  function noMenu(e: Event) {
    e.preventDefault();
  }

  const start = (item: T, e: React.PointerEvent<HTMLElement>) => {
    if (live || !e.isPrimary || (e.pointerType === "mouse" && e.button !== 0)) return;
    live = {
      item,
      el: e.currentTarget,
      touched: e.target,
      id: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      x: e.clientX,
      y: e.clientY,
      active: false,
      timer: window.setTimeout(activate, HOLD_MS),
      raf: 0,
      scroller: null,
      w: 0,
      h: 0,
      dwellOn: "",
      dwellAt: 0,
      last: null,
    };
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("touchmove", block, { passive: false });
    // Also on the element itself: if the week changes under the finger the card leaves the page, and the touch events that
    // keep arriving to it would no longer reach the window, so the page would start scrolling and drop the session.
    e.target.addEventListener("touchmove", block as EventListener, { passive: false });
    window.addEventListener("contextmenu", noMenu);
  };

  return { start, finish };
}

export function useHoldDrag<T>({ onDrop, onWeek }: { onDrop: (item: T, target: DropTarget | null) => void; onWeek: (dir: -1 | 1) => void }) {
  const [held, setHeld] = useState<Held<T> | null>(null);
  const [target, setTarget] = useState<DropTarget | null>(null);
  const ended = useRef(-1e9);
  /** The floating card: moved by writing its transform, without rendering the calendar at every step of the finger. */
  const floatRef = useRef<HTMLDivElement | null>(null);
  const handlers = useRef({ onDrop, onWeek });
  const gesture = useRef<ReturnType<typeof createGesture<T>> | null>(null);
  useEffect(() => {
    handlers.current = { onDrop, onWeek };
  });
  useEffect(() => {
    const g = createGesture<T>({ setHeld, setTarget, floatRef, ended, handlers });
    gesture.current = g;
    // Leaving the page in the middle of a hold.
    return () => {
      g.finish();
      gesture.current = null;
    };
  }, []);

  /** Props for a card that can be held: the long press, and no system menu or text selection on it. */
  const bind = useCallback(
    (item: T) => ({
      onPointerDown: (e: React.PointerEvent<HTMLElement>) => gesture.current?.start(item, e),
      onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
      style: { WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none" } as React.CSSProperties,
    }),
    [],
  );
  /** The click that follows a drop on the card's own spot must not open it. */
  const justDropped = useCallback(() => performance.now() - ended.current < 500, []);

  return { held, target, bind, justDropped, floatRef };
}

const BAR: { drop: "prev" | "cancel" | "delete" | "next"; label: string; Icon: typeof IconX }[] = [
  { drop: "prev", label: "Sett. prima", Icon: IconChevronLeft },
  { drop: "cancel", label: "Annulla", Icon: IconX },
  { drop: "delete", label: "Elimina", Icon: IconTrash },
  { drop: "next", label: "Sett. dopo", Icon: IconChevronRight },
];

/**
 * What shows while a session is in the hand: the card under the finger with a word on what letting go does, and the bar
 * that takes the place of the bottom bar.
 */
export function DragLayer<T>({ held, target, floatRef, label, children }: { held: Held<T>; target: DropTarget | null; floatRef: React.RefObject<HTMLDivElement | null>; label: string | null; children: React.ReactNode }) {
  return createPortal(
    <>
      <div
        ref={floatRef}
        aria-hidden
        className="pointer-events-none fixed left-0 top-0 z-[70]"
        style={{ width: held.width, transform: `translate(${held.x - held.dx}px, ${held.y - held.dy}px)` }}
      >
        {label && (
          <span
            className="absolute -top-10 right-0 inline-flex h-8 max-w-full items-center truncate rounded-full px-3 text-[13px] font-semibold"
            style={{ background: target?.kind === "delete" ? "var(--critical-ink)" : "var(--brand)", color: target?.kind === "delete" ? "var(--surface)" : "var(--on-brand)", boxShadow: "0 4px 12px rgba(0,0,0,.3)" }}
          >
            {label}
          </span>
        )}
        <div className="rounded-[16px]" style={{ transform: "rotate(-2deg) scale(1.03)", background: "var(--surface)", outline: "1.5px solid var(--brand)", boxShadow: "0 16px 32px rgba(0,0,0,.35)" }}>
          {children}
        </div>
      </div>
      <div
        data-dropbar
        aria-hidden
        className="fixed inset-x-0 bottom-0 z-[65] flex gap-1.5 px-2.5 pt-2"
        style={{ height: "var(--nav-h)", background: "var(--surface)", borderTop: "1px solid var(--border)", paddingBottom: "calc(0.6rem + env(safe-area-inset-bottom))" }}
      >
        {BAR.map(({ drop, label: text, Icon }) => {
          const on = target?.kind === drop;
          const danger = drop === "delete";
          const ink = danger ? "var(--critical-ink)" : drop === "cancel" ? "var(--foreground)" : "var(--muted)";
          return (
            <div
              key={drop}
              data-drop={drop}
              className="flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl text-[13px] font-semibold"
              style={{
                color: on && !danger ? "var(--accent-ink)" : ink,
                background: on ? (danger ? "var(--critical-bg)" : "var(--accent-bg)") : undefined,
                border: `1.5px ${on ? "solid" : "dashed"} ${on ? (danger ? "var(--critical-ink)" : "var(--brand)") : "var(--border)"}`,
              }}
            >
              <Icon size={20} aria-hidden />
              <span className="max-w-full truncate px-1">{text}</span>
            </div>
          );
        })}
      </div>
    </>,
    document.body,
  );
}
