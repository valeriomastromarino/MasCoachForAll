// Single-file build: the same pages as the Next.js app, picked by the hash router.
import { useEffect } from "react";
import AllenamentiPage from "@/app/allenamenti/page";
import ActivityPage from "@/app/attivita/[id]/page";
import ArchivePage from "@/app/attivita/page";
import CoachPage from "@/app/coach/page";
import CuorePage from "@/app/cuore/page";
import FormaPage from "@/app/forma/page";
import SettingsPage from "@/app/impostazioni/page";
import OggiPage from "@/app/page";
import PotenzaPage from "@/app/potenza/page";
import RecuperoPage from "@/app/recupero/page";
import PlayerPage from "@/app/rulli/[id]/page";
import RulliPage from "@/app/rulli/page";
import TestPage from "@/app/test/page";
import { TopBar } from "@/components/brand/TopBar";
import { AppNav } from "@/components/nav/AppNav";
import { DemoBanner, IntervalsKeyCard } from "./IntervalsKey";
import { usePath } from "./router";

const PAGES: Record<string, () => React.ReactNode> = {
  "/": OggiPage,
  "/forma": FormaPage,
  "/potenza": PotenzaPage,
  "/cuore": CuorePage,
  "/recupero": RecuperoPage,
  "/attivita": ArchivePage,
  "/test": TestPage,
  "/allenamenti": AllenamentiPage,
  "/coach": CoachPage,
  "/rulli": RulliPage,
};

function Page({ path }: { path: string }) {
  if (path.startsWith("/attivita/")) return <ActivityPage />;
  if (path.startsWith("/rulli/")) return <PlayerPage />;
  if (path === "/impostazioni")
    return (
      <>
        <SettingsPage />
        <div className="mx-auto w-full max-w-6xl px-4 pb-6">
          <IntervalsKeyCard />
        </div>
      </>
    );
  const P = PAGES[path] ?? OggiPage;
  return <P />;
}

export function App() {
  const path = usePath();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [path]);
  return (
    // Same frame as app/layout.tsx.
    <div className="mx-auto flex w-full max-w-[calc(72rem+5rem)] md:pl-4">
      <AppNav />
      <div className="flex min-h-full min-w-0 flex-1 flex-col pb-24 md:pb-0">
        <TopBar />
        <DemoBanner />
        <Page key={path} path={path} />
      </div>
    </div>
  );
}
