import type { MetadataRoute } from "next";

// Makes MasCoach installable from Chrome on Android ("Installa app"): own icon, full screen, no browser bar.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MasCoach",
    short_name: "MasCoach",
    description: "Analisi, pianificazione e allenamento indoor per il ciclismo",
    lang: "it",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#1d2027",
    theme_color: "#1d2027",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
