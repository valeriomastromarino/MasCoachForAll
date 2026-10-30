// The app's sections: one icon each in the side rail (desktop) and the bottom bar (phone).
// Icon colours follow the metric colours of the charts (power blue, heart pink, recovery teal…).
import {
  IconBike,
  IconBolt,
  IconCalendarEvent,
  IconHeart,
  IconHome,
  IconMessageChatbot,
  IconMoon,
  IconSettings,
  IconStopwatch,
  IconTrendingUp,
  type Icon,
} from "@tabler/icons-react";

export type SectionId =
  | "oggi"
  | "forma"
  | "potenza"
  | "cuore"
  | "recupero"
  | "uscite"
  | "test"
  | "allenamenti"
  | "coach"
  | "impostazioni";

export type Section = {
  id: SectionId;
  href: string;
  label: string;
  description: string;
  icon: Icon;
  color: string;
  /** Shown in the phone's bottom bar; the others live under "Altro". */
  primary?: boolean;
  /** Planned for a later phase: visible but marked as coming. */
  soon?: boolean;
};

export const SECTIONS: Section[] = [
  { id: "oggi", href: "/", label: "Oggi", description: "Stato di oggi e calendario di allenamenti e uscite", icon: IconHome, color: "var(--muted)", primary: true },
  { id: "forma", href: "/forma", label: "Forma", description: "Fitness, fatica, forma e carico pianificato", icon: IconTrendingUp, color: "var(--form-ink)", primary: true },
  { id: "potenza", href: "/potenza", label: "Potenza", description: "FTP stimata, record, profilo, durability e zone", icon: IconBolt, color: "var(--fitness-ink)", primary: true },
  { id: "cuore", href: "/cuore", label: "Cuore", description: "Efficienza aerobica, Pw:HR e zone cardio", icon: IconHeart, color: "var(--rhr-ink)", primary: true },
  { id: "recupero", href: "/recupero", label: "Recupero", description: "HRV, FC a riposo, sonno e peso", icon: IconMoon, color: "var(--hrv-ink)", primary: true },
  { id: "uscite", href: "/attivita", label: "Uscite", description: "Archivio di tutte le attività", icon: IconBike, color: "var(--muted)" },
  { id: "test", href: "/test", label: "Test", description: "Test FTP e soglie", icon: IconStopwatch, color: "var(--fatigue-ink)" },
  { id: "coach", href: "/coach", label: "Coach", description: "Coach Claude: analisi e allenamenti", icon: IconMessageChatbot, color: "var(--accent-ink)" },
  { id: "allenamenti", href: "/allenamenti", label: "Allenamenti", description: "Creazione allenamenti", icon: IconCalendarEvent, color: "var(--muted)", soon: true },
];

export const SETTINGS: Section = {
  id: "impostazioni",
  href: "/impostazioni",
  label: "Impostazioni",
  description: "Tema e dati",
  icon: IconSettings,
  color: "var(--muted)",
};

export function sectionById(id: SectionId): Section {
  return id === "impostazioni" ? SETTINGS : SECTIONS.find((s) => s.id === id)!;
}

export function isActive(s: Section, pathname: string): boolean {
  return s.href === "/" ? pathname === "/" : pathname === s.href || pathname.startsWith(s.href + "/");
}
