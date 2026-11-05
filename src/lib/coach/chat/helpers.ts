// Small pieces shared by the chat's answers: numbers in Italian, the workout of a day, how a change moves the plan.
import { addDays, weekStart } from "@/lib/dates";
import { type LifeEvent } from "@/lib/training/life";
import { planFromToday, type SeasonSetup } from "@/lib/training/season";
import { CLASS_SAY, planWeek, type Proposal, suggestWorkout, type Suggestion } from "@/lib/training/suggest";
import { type ChatContext, type ChatState, type Reply, suggestInput } from "./context";
import { sayDate } from "./text";

export const n0 = (x: number | null | undefined) => (x == null || Number.isNaN(x) ? "–" : String(Math.round(x)));
export const n1 = (x: number | null | undefined) => (x == null || Number.isNaN(x) ? "–" : x.toFixed(1).replace(".", ","));
export const signed1 = (x: number) => `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x).toFixed(1).replace(".", ",")}`;
export const hoursText = (secs: number) => {
  const h = Math.floor(secs / 3600);
  const m = Math.round((secs % 3600) / 60);
  return h > 0 ? `${h} h ${String(m).padStart(2, "0")}` : `${m} min`;
};
export const minsText = (mins: number) => (mins >= 90 ? `${Math.floor(mins / 60)} h ${String(mins % 60).padStart(2, "0")}` : `${mins} min`);

const DAY_SHORT = ["lun", "mar", "mer", "gio", "ven", "sab", "dom"];
export const dayShort = (iso: string) => `${DAY_SHORT[(new Date(`${iso}T12:00:00`).getDay() + 6) % 7]} ${Number(iso.slice(8))}`;

export function dayLabel(ctx: ChatContext, date: string): string {
  if (date === ctx.today) return "Oggi";
  if (date === addDays(ctx.today, 1)) return "Domani";
  return sayDate(date).replace(/^./, (c) => c.toUpperCase());
}

/** The engine's pick for `date`. For another day than today the readiness is taken as green and today's wishes don't apply. */
export function suggestFor(ctx: ChatContext, date: string, extra: Parameters<typeof suggestInput>[1] = {}): Suggestion {
  const other = date !== ctx.today;
  return suggestWorkout(suggestInput(ctx, other ? { date, readiness: "verde", tsbYesterday: null, feeling: null, override: undefined, place: "any", ...extra } : { date, ...extra }));
}

/** The next seven days from today, with what is already on the calendar kept. */
export function weekFrom(ctx: ChatContext) {
  return planWeek(
    suggestInput(ctx),
    ctx.planned.map((w) => ({ date: w.date, workout: { ...w, id: 0 } })),
  );
}

/** How a workout is described in a line. */
export const workoutLine = (p: Proposal) => `${p.label}: ${p.workout.name}, ${minsText(p.mins)}, TSS ${p.tss}`;

/** The thread after offering workouts: what "programma", "cambia" and "perché" refer to next. */
export function withOptions(state: ChatState, options: Proposal[], date: string): ChatState {
  const known = new Set(state.shown);
  options.forEach((o) => known.add(o.workout.id));
  return { ...state, options, index: 0, optionsDate: date, shown: [...known], pending: null, awaiting: null };
}

export const WORKOUT_CHIPS = ["Programma", "Cambia", "Più facile", "Perché?"];

/** Reply text for a suggestion, with the reasons under it. */
export function suggestionReply(ctx: ChatContext, s: Suggestion, date: string, lead?: string): Reply {
  const head = dayLabel(ctx, date);
  if (s.kind === "rest") {
    const why = /riposo/i.test(s.reason) ? s.reason : `riposo. ${s.reason}`;
    return { text: `${lead ? `${lead} ` : ""}${head}: ${why}`, chips: ["Come sto?", "Cosa faccio domani?", "Un recupero leggero?"] };
  }
  const p = s.main;
  const other = date !== ctx.today;
  const day = (l: string) => (other ? l.replace(new RegExp("(^|[^a-z])oggi(?![a-z])", "g"), "$1quel giorno") : l);
  const lines = [...p.reasons.filter((r) => !r.startsWith(p.workout.name)).map(day), `Carboidrati: ${p.carbs}.`];
  const o = ctx.overrides;
  if (!other && o.date === ctx.today) {
    const wishes = [o.easier ? "più facile" : "", o.maxMins ? `massimo ${minsText(o.maxMins)}` : "", o.wantClass ? CLASS_SAY[o.wantClass] : "", o.place === "indoor" ? "sui rulli" : o.place === "outdoor" ? "fuori" : "", o.feeling?.drop ? o.feeling.note : ""].filter(Boolean);
    if (wishes.length) lines.push(`Valgono per oggi le tue richieste: ${wishes.join(", ")}. Scrivi «azzera» per toglierle.`);
  }
  if (p.ftpNote) lines.push(`${p.ftpNote}.`);
  for (const w of p.warnings) lines.push(`Attenzione: ${w}`);
  const already = ctx.planned.find((w) => w.date === date);
  if (already) lines.push(`Su Intervals hai già in programma: ${already.name}.`);
  return {
    text: `${lead ? `${lead} ` : ""}${head}: ${CLASS_SAY[p.cls]}, ${p.workout.name} — ${minsText(p.mins)}, TSS ${p.tss}.`,
    lines,
    proposal: p,
    chips: WORKOUT_CHIPS,
  };
}

/** The season plan with and without a change, to say what it does to the peak. */
export function planImpact(ctx: ChatContext, change: { setup?: Partial<SeasonSetup>; life?: LifeEvent[] }): string[] {
  if (!ctx.setup) return [];
  const before = planFromToday(ctx.setup, ctx.today, ctx.data.status.ctl, ctx.life);
  const after = planFromToday({ ...ctx.setup, ...change.setup }, ctx.today, ctx.data.status.ctl, [...ctx.life, ...(change.life ?? [])]);
  const lines: string[] = [];
  if (before.ctlPeak !== null && after.ctlPeak !== null) {
    const d = after.ctlPeak - before.ctlPeak;
    lines.push(
      Math.abs(d) < 0.5
        ? `Il CTL a fine picco resta circa ${n0(after.ctlPeak)}.`
        : `Il CTL a fine picco passa da ${n0(before.ctlPeak)} a ${n0(after.ctlPeak)} (${d > 0 ? "+" : "−"}${n0(Math.abs(d))}).`,
    );
  }
  const week = (p: typeof before) => p.weeks.find((w) => w.start >= weekStart(ctx.today));
  const bw = week(before);
  const aw = week(after);
  if (bw && aw && bw.tssTarget !== aw.tssTarget) lines.push(`La settimana in corso passa da ${bw.tssTarget} a ${aw.tssTarget} TSS di riferimento.`);
  for (const w of after.warnings) if (!before.warnings.includes(w)) lines.push(w);
  return lines;
}
