import { AccentPicker } from "@/components/brand/AccentPicker";
import { ThemeToggle } from "@/components/brand/ThemeToggle";
import { ProfileCard } from "@/components/firstrun/ProfileCard";
import { DataCard } from "@/components/sections/DataCard";
import { SectionHeading } from "@/components/sections/SectionPage";

// Two blocks: how the app looks, and what it connects to (the single-file app adds the Intervals key and the coach password below).
export default function Page() {
  return (
    <main className="mx-auto w-full max-w-6xl space-y-4 px-4 py-4 sm:py-6">
      <SectionHeading id="impostazioni" />
      <h2 className="pt-1 text-xs font-medium uppercase tracking-wide text-muted">Aspetto</h2>
      <section className="card max-w-xl p-5">
        <h3 className="text-sm font-medium">Tema</h3>
        <p className="mt-0.5 text-xs text-muted">La scelta resta salvata su questo dispositivo.</p>
        <div className="mt-4">
          <ThemeToggle />
        </div>
      </section>
      <section className="card max-w-xl p-5">
        <h3 className="text-sm font-medium">Colore dell&apos;app</h3>
        <p className="mt-0.5 text-xs text-muted">Scheda di stato, pulsanti e voce attiva. Logo, zone e colori dei dati non cambiano.</p>
        <div className="mt-4">
          <AccentPicker />
        </div>
      </section>
      <h2 className="pt-3 text-xs font-medium uppercase tracking-wide text-muted">Collegamenti</h2>
      <DataCard />
      <ProfileCard />
    </main>
  );
}
