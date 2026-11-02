import { createRoot } from "react-dom/client";
import { handleBack, isApp, paintSystemBars } from "@/lib/native";
import { App } from "./App";
import "./app.css";

createRoot(document.getElementById("root")!).render(<App />);

if (isApp()) {
  // Android's Back button: the screen on top first (the player asks before ending a ride), then the previous page, then exit.
  void import("@capacitor/app").then(({ App: CapApp }) => {
    void CapApp.addListener("backButton", ({ canGoBack }) => handleBack(canGoBack, () => void CapApp.exitApp()));
  });

  // System bars take the colour of the chosen theme.
  const paint = () =>
    requestAnimationFrame(() => {
      const bg = getComputedStyle(document.body).backgroundColor.match(/\d+/g);
      if (!bg) return;
      const [r, g, b] = bg.map(Number);
      const hex = `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
      paintSystemBars(hex, (r * 299 + g * 587 + b * 114) / 1000 < 128);
    });
  paint();
  new MutationObserver(paint).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
}
