import type { SectionId } from "../nav/sections";
import { SectionHeading } from "./SectionPage";

/** Sections planned for a later phase of the roadmap. */
export function Placeholder({ id, text }: { id: SectionId; text: string }) {
  return (
    <main className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6">
      <SectionHeading id={id} />
      <div className="card max-w-xl p-5">
        <div className="text-xs font-medium" style={{ color: "var(--accent-ink)" }}>
          In arrivo
        </div>
        <p className="mt-1 text-sm">{text}</p>
      </div>
    </main>
  );
}
