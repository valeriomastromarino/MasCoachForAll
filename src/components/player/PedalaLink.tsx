// The "PEDALA" button: opens a planned workout in the trainer player.
import Link from "next/link";
import { IconTrainer } from "../brand/TrainerIcon";

/** Opens the trainer player on this workout. `onBrand` is for a terracotta card: white button, terracotta text. */
export function PedalaLink({ id, className = "", tone = "accent" }: { id: string; className?: string; tone?: "accent" | "onBrand" }) {
  return (
    <Link
      href={`/rulli/${encodeURIComponent(id)}`}
      className={`inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full px-4 text-xs font-medium leading-none ${className}`}
      style={tone === "onBrand" ? { background: "var(--on-brand)", color: "var(--brand)" } : { background: "var(--accent-bg)", color: "var(--accent-ink)" }}
    >
      <IconTrainer size={16} /> PEDALA
    </Link>
  );
}
