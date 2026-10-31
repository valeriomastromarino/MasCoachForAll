// The "PEDALA" button: opens a planned workout in the trainer player.
import Link from "next/link";
import { IconTrainer } from "../brand/TrainerIcon";

/** Opens the trainer player on this workout. */
export function PedalaLink({ id, className = "" }: { id: string; className?: string }) {
  return (
    <Link
      href={`/rulli/${encodeURIComponent(id)}`}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium ${className}`}
      style={{ background: "var(--accent-bg)", color: "var(--accent-ink)" }}
    >
      <IconTrainer size={16} /> PEDALA
    </Link>
  );
}
