import { createRoot } from "react-dom/client";
import { coachPassword, coachServer } from "@/lib/coach/server";
import { handleBack, isApp, paintSystemBars, takeLaunchRoute, widgetSetup } from "@/lib/native";
import { App } from "./App";
import "./app.css";
import { navigate } from "./router";

createRoot(document.getElementById("root")!).render(<App />);

if (isApp()) {
  // Home-screen widget: it asks the server by itself, so it needs the address and the password; a tap on it opens a page.
  widgetSetup(coachServer(), coachPassword());
  void takeLaunchRoute().then((route) => route && navigate(route));
  // Capacitor's triggerWindowJSEvent copies the JSON fields onto the event itself (not into `detail`).
  window.addEventListener("mascoach-route", (e) => {
    const route = (e as Event & { route?: string }).route;
    if (typeof route === "string" && route.startsWith("/")) navigate(route);
  });
  // Android's Back button: the screen on top first (the player asks before ending a ride), then the previous page, then exit.
  void import("@capacitor/app").then(({ App: CapApp }) => {
    void CapApp.addListener("backButton", ({ canGoBack }) => handleBack(canGoBack, () => void CapApp.exitApp()));
  });

  // System bars take the colour of the chosen theme. The page fades to the new background in 0.2 s, so the colour is read from a
  // probe without the fade: reading the page one frame after the switch gave the old colour, and Night kept light bars.
  const probe = document.createElement("div");
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText = "position:fixed;width:0;height:0;pointer-events:none;background:var(--background);transition:none";
  document.body.appendChild(probe);
  const paint = () =>
    requestAnimationFrame(() => {
      const bg = getComputedStyle(probe).backgroundColor.match(/\d+/g);
      if (!bg) return;
      const [r, g, b] = bg.map(Number);
      const hex = `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
      paintSystemBars(hex, (r * 299 + g * 587 + b * 114) / 1000 < 128);
    });
  paint();
  new MutationObserver(paint).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
}
