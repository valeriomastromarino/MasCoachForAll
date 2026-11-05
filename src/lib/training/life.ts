// What life puts on the calendar: holidays and trips, illness, injury. They come from the Intervals.icu calendar (or the
// chat writes them there) and change what the engine may prescribe. The athlete's rules: "malattia" means fever, and an
// injury is written only when it is serious, so after a fever and during an injury it is Z1–Z2 only (prompt §9.1, §9.7).
import { addDays } from "@/lib/dates";

export type LifeCategory = "HOLIDAY" | "SICK" | "INJURED";

export type LifeEvent = { id: string; category: LifeCategory; from: string; to: string; name?: string };

export type Restriction = { kind: "rest" | "easy"; reason: string; maxMins?: number } | null;

/** Days of Z1–Z2 only after a fever is over (prompt §9.7: at least a week without intense work). */
export const AFTER_SICK_DAYS = 7;
export const AFTER_INJURY_DAYS = 3;
/** Share of a normal day's load that an easy day counts in the plan. */
export const EASY_DAY_LOAD = 0.35;

export const LIFE_LABEL: Record<LifeCategory, string> = { HOLIDAY: "Ferie o trasferta", SICK: "Malattia", INJURED: "Infortunio" };

const covers = (e: LifeEvent, date: string) => date >= e.from && date <= e.to;

/** The most restrictive rule that applies to `date`, or null when the day is free. */
export function restrictionOn(date: string, events: LifeEvent[]): Restriction {
  let best: Restriction = null;
  const take = (r: NonNullable<Restriction>) => {
    if (!best || (r.kind === "rest" && best.kind === "easy") || (r.kind === best.kind && (r.maxMins ?? 999) < (best.maxMins ?? 999))) best = r;
  };
  for (const e of events) {
    if (e.category === "HOLIDAY" && covers(e, date)) take({ kind: "rest", reason: "Sei in ferie o in trasferta: riposo." });
    else if (e.category === "SICK") {
      if (covers(e, date)) take({ kind: "rest", reason: "Malattia con febbre: riposo, e sentire il medico se dura o peggiora." });
      else if (date > e.to && date <= addDays(e.to, AFTER_SICK_DAYS)) {
        take({ kind: "easy", maxMins: 45, reason: `Dopo la febbre (finita il ${e.to.slice(8)}/${e.to.slice(5, 7)}): solo Z1-Z2 breve per ${AFTER_SICK_DAYS} giorni, poi si risale.` });
      }
    } else if (e.category === "INJURED") {
      if (covers(e, date)) take({ kind: "easy", maxMins: 60, reason: "Infortunio: solo Z1-Z2, facile, e se il dolore aumenta ti fermi." });
      else if (date > e.to && date <= addDays(e.to, AFTER_INJURY_DAYS)) take({ kind: "easy", maxMins: 60, reason: "Appena dopo l'infortunio: ancora Z1-Z2 per qualche giorno." });
    }
  }
  return best;
}

/** 1 = a normal day, 0 = rest, EASY_DAY_LOAD for a Z1–Z2 day. */
export function loadFactor(date: string, events: LifeEvent[]): number {
  const r = restrictionOn(date, events);
  return !r ? 1 : r.kind === "rest" ? 0 : EASY_DAY_LOAD;
}

/** Events that touch [from, to], for lists. */
export function lifeBetween(events: LifeEvent[], from: string, to: string): LifeEvent[] {
  return events.filter((e) => e.from <= to && e.to >= from).sort((a, b) => a.from.localeCompare(b.from));
}

/** The illness or injury open on `date` (the one "sto meglio" closes). */
export function openLife(events: LifeEvent[], date: string, category?: LifeCategory): LifeEvent | null {
  return events.find((e) => e.category !== "HOLIDAY" && (!category || e.category === category) && e.from <= date && e.to >= date) ?? null;
}
