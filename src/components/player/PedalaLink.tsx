// The "PEDALA" button: opens a planned workout in the trainer player.
import Link from "next/link";
import { IconTrainer } from "../brand/TrainerIcon";

/**
 * Opens the trainer player on this workout. `onBrand` is for a terracotta card: white button, terracotta text. `label` = the
 * workout's name, read after «Pedala» by screen readers (a list of rows otherwise says only «PEDALA, PEDALA…»).
 * `text` replaces «PEDALA» where the button says something else (the trainer check on the empty Pedala page).
 * 44 px tall, like every target of the app (rules of A, 19 November 2026; before 36 px).
 */
export function PedalaLink({ id, label, text, className = "", tone = "accent" }: { id: string; label?: string; text?: string; className?: string; tone?: "accent" | "onBrand" }) {
  return (
    <Link
      href={`/rulli/${encodeURIComponent(id)}`}
      aria-label={label ? `Pedala: ${label}` : undefined}
      className={`inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-full px-4 text-sm font-medium leading-none ${className}`}
      style={tone === "onBrand" ? { background: "var(--on-brand)", color: "var(--brand)" } : { background: "var(--accent-bg)", color: "var(--accent-ink)" }}
    >
      <IconTrainer size={16} aria-hidden /> {text ?? "PEDALA"}
    </Link>
  );
}
