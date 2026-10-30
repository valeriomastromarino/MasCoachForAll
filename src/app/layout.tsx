import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { TopBar } from "@/components/brand/TopBar";
import { AppNav } from "@/components/nav/AppNav";
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
const themeScript = `(function(){try{var t=localStorage.getItem("mascoach-theme");if(t!=="day"&&t!=="night"&&t!=="paper"){t=matchMedia("(prefers-color-scheme: dark)").matches?"night":"day"}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="day"}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="it" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full">
        {/* Injected in the server HTML only: a plain <script> re-rendered by React on the client triggers a warning. */}
        <Script id="mascoach-theme" strategy="beforeInteractive">
          {themeScript}
        </Script>
        {/* The side rail sits right next to the centred page (not at the window edge); phones get a bottom bar. */}
        <div className="mx-auto flex w-full max-w-[calc(72rem+5rem)] md:pl-4">
          <AppNav />
          <div className="flex min-h-full min-w-0 flex-1 flex-col pb-24 md:pb-0">
            <TopBar />
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
