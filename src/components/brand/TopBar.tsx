import Link from "next/link";
import { Logo } from "./Logo";
import { TOPBAR_ACTIONS_ID } from "./slots";

// The theme switch moved to Impostazioni (gear icon in the navigation).
export function TopBar() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 pt-5">
      <Link href="/" aria-label="MasCoach, torna a Oggi">
        <Logo />
      </Link>
      <div id={TOPBAR_ACTIONS_ID} className="flex flex-wrap items-center gap-2" />
    </div>
  );
}
