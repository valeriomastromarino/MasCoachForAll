"use client";

// On a touch screen Recharts shows the tooltip under the finger and leaves it there when the finger lifts. That is right when
// the athlete taps a point to read it, but after scrolling a page of charts the tooltips stayed open all over them.
// So: a finger that scrolled the page closes every tooltip when it lifts, and a touch outside the charts closes them too.
import { useEffect } from "react";

/** Recharts hides the tooltip on the wrapper's mouseleave; React builds that event from a mouseout towards an element outside. */
function hideChartTooltips() {
  for (const w of document.querySelectorAll(".recharts-wrapper")) {
    w.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, relatedTarget: document.body }));
  }
}

export function useChartTouchDismiss() {
  useEffect(() => {
    let scrolled = false;
    const onStart = (e: TouchEvent) => {
      scrolled = false;
      if (!(e.target instanceof Element && e.target.closest(".recharts-wrapper"))) hideChartTooltips();
    };
    const onScroll = () => {
      scrolled = true;
    };
    const onEnd = () => {
      if (scrolled) hideChartTooltips();
    };
    // Capture: scroll events of the inner scrolling pages don't bubble up to the document.
    const opts = { capture: true, passive: true } as const;
    document.addEventListener("touchstart", onStart, opts);
    document.addEventListener("scroll", onScroll, opts);
    document.addEventListener("touchend", onEnd, opts);
    document.addEventListener("touchcancel", onEnd, opts);
    return () => {
      document.removeEventListener("touchstart", onStart, opts);
      document.removeEventListener("scroll", onScroll, opts);
      document.removeEventListener("touchend", onEnd, opts);
      document.removeEventListener("touchcancel", onEnd, opts);
    };
  }, []);
}
