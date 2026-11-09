import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { FirstRunGate } from "@/components/firstrun/FirstRun";
import { InlineScript } from "@/components/InlineScript";
import { AppNav } from "@/components/nav/AppNav";
import { AppShell } from "@/components/nav/AppShell";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MasCoach",
  description: "Analisi, pianificazione e allenamento indoor per il ciclismo",
  appleWebApp: { capable: true, title: "MasCoach", statusBarStyle: "black-translucent" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#1d2027",
};

// Applies the saved theme before first paint (no flash): saved choice, else Night if the device is dark.
const themeScript = `(function(){try{var t=localStorage.getItem("mascoach-theme");if(t!=="day"&&t!=="night"&&t!=="paper"){t=matchMedia("(prefers-color-scheme: dark)").matches?"night":"day"}document.documentElement.dataset.theme=t;var a=JSON.parse(localStorage.getItem("mascoach-accent"));if(a&&isFinite(a.h)&&isFinite(a.s)){var d=document.documentElement;d.dataset.accent="1";d.style.setProperty("--accent-h",a.h);d.style.setProperty("--accent-s",a.s)}}catch(e){document.documentElement.dataset.theme="day"}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="it" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        {/* A plain inline script in <head> runs while the HTML is parsed, before the first paint (Next guide "Preventing flash
            before hydration"). With next/script "beforeInteractive" it ran only after the JavaScript loaded: every page
            opened in the light theme and turned dark a moment later. The root layout is rendered once, so React never re-creates it. */}
        <InlineScript html={themeScript} />
      </head>
      <body className="min-h-full">
        {/* The side rail sits right next to the centred page (not at the window edge); phones, also in landscape, get a bottom bar. */}
        <FirstRunGate>
          <div className="mx-auto flex w-full max-w-[calc(72rem+5rem)] rail:pl-4">
            <AppNav />
            <div className="flex min-h-full min-w-0 flex-1 flex-col pb-[calc(6rem+env(safe-area-inset-bottom))] rail:pb-0">
              <AppShell>{children}</AppShell>
            </div>
          </div>
        </FirstRunGate>
      </body>
    </html>
  );
}
