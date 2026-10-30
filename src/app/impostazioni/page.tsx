import { ThemeToggle } from "@/components/brand/ThemeToggle";
import { SectionHeading } from "@/components/sections/SectionPage";

export default function Page() {
  return (
    <main className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6">
      <SectionHeading id="impostazioni" />
      <section className="card max-w-xl p-5">
        <h2 className="text-sm font-medium">Tema</h2>
        <p className="mt-0.5 text-xs text-muted">La scelta resta salvata su questo dispositivo.</p>
        <div className="mt-4">
          <ThemeToggle />
        </div>
      </section>
      <section className="card max-w-xl p-5">
        <h2 className="text-sm font-medium">Dati</h2>
        <p className="mt-2 text-xs text-muted">
          Tutti i dati arrivano da Intervals.icu, che li riceve dal Garmin. FTP, FC di soglia e peso si cambiano su
          Intervals.icu: l&apos;app li legge da lì.
        </p>
      </section>
    </main>
  );
}
