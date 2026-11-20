// Moving and removing planned sessions from the calendar (on the phone by holding a session down, design A chosen on
// 20 November 2026). What a drop does on Intervals.icu, how to undo it, and what the season plan learns from it: a day the
// athlete empties becomes rest, so Oggi and Stagione don't propose another session there.
import { isBikeSession, type CalendarWorkout } from "./calendar";
import { weekStart } from "./dates";
import type { DayChoice, SeasonSetup } from "./training/season";
import { setChoice } from "./training/weeks";

/** One session going from one day to another on Intervals.icu. */
export type Move = { id: string; name: string; from: string; to: string; bike: boolean };

/** `w` going to the day `to`. */
export const moveOf = (w: Pick<CalendarWorkout, "id" | "name" | "date" | "type">, to: string): Move => ({ id: w.id, name: w.name, from: w.date, to, bike: isBikeSession(w) });

/**
 * What dropping `w` on the day `to` does: nothing (its own day, or a day gone), a move, or a swap with the one ride already
 * there. `onTarget` = the sessions planned on `to` and not done yet. Weights and Pilates never swap: they stay where they
 * are next to a ride. A missed session moved forward is recovered, never swapped into the past.
 */
export function dropMoves(w: CalendarWorkout, to: string, onTarget: CalendarWorkout[], today: string): Move[] {
  if (to === w.date || to < today) return [];
  const rides = onTarget.filter((x) => x.id !== w.id && isBikeSession(x));
  if (isBikeSession(w) && rides.length === 1 && w.date >= today) return [moveOf(w, to), moveOf(rides[0], w.date)];
  return [moveOf(w, to)];
}

/** The moves that put everything back. */
export const undoMoves = (moves: Move[]): Move[] => moves.map((m) => ({ ...m, from: m.to, to: m.from })).reverse();

/**
 * The days a change leaves without a ride (`emptied`: rides moved away or removed, and no other ride there afterwards)
 * and the days that receive one (`filled`). `planned` = the sessions on the calendar before the change.
 */
export function changedDays(planned: CalendarWorkout[], moves: Move[], removed: CalendarWorkout | null = null): { emptied: string[]; filled: string[] } {
  const after = new Map(planned.map((p) => [p.id, p.date]));
  for (const m of moves) after.set(m.id, m.to);
  if (removed) after.delete(removed.id);
  const bike = new Set(planned.filter(isBikeSession).map((p) => p.id));
  for (const m of moves) if (m.bike) bike.add(m.id);
  const rideOn = (date: string) => [...after].some(([id, d]) => d === date && bike.has(id));
  const left = [...moves.filter((m) => m.bike).map((m) => m.from), ...(removed && isBikeSession(removed) ? [removed.date] : [])];
  return {
    emptied: [...new Set(left)].filter((d) => !rideOn(d)).sort(),
    filled: [...new Set(moves.filter((m) => m.bike).map((m) => m.to))].sort(),
  };
}

/**
 * The season plan after the calendar changed: from today on, an emptied day becomes rest chosen by the athlete, and a day
 * that receives a ride drops what the Stagione page had fixed there (the calendar wins). Days gone stay as they were.
 */
export function seasonAfter(setup: SeasonSetup, days: { emptied: string[]; filled: string[] }, today: string): SeasonSetup {
  const plans: Record<string, DayChoice[]> = { ...(setup.weekPlans ?? {}) };
  const edit = (date: string, change: (c: DayChoice[]) => DayChoice[]) => {
    const monday = weekStart(date);
    const next = change(plans[monday] ?? []);
    if (next.length) plans[monday] = next;
    else delete plans[monday];
  };
  for (const d of days.filled) if (d >= today) edit(d, (c) => c.filter((x) => x.date !== d));
  for (const d of days.emptied) if (d >= today) edit(d, (c) => setChoice(c, d, null));
  return { ...setup, weekPlans: plans };
}
