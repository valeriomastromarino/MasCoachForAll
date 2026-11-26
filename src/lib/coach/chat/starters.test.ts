// The empty chat's questions of the day (starters.ts): picked from the data, and every one is a phrase the chat answers
// with the right kind of reply. Demo data; on the calendar a Z2 at +1 day, a threshold at +2 and a long ride at +5.
import { describe, expect, it } from "vitest";
import type { CalendarWorkout } from "@/lib/calendar";
import { buildDashboard } from "@/lib/dashboard";
import { addDays } from "@/lib/dates";
import { demoData } from "@/lib/demo";
import { chat, type ChatContext, emptyState } from ".";
import { startPage } from "./starters";

function makeCtx(): ChatContext {
  const data = buildDashboard(demoData(120));
  const today = data.today;
  const ev = (id: string, d: number, name: string, mins: number, blocks: CalendarWorkout["blocks"], tss: number): CalendarWorkout => ({ id, date: addDays(today, d), name, type: "Ride", secs: mins * 60, tss, description: null, blocks, coach: null });
  const planned = [
    ev("ev-z2", 1, "Zone 2 Endurance 90", 90, [{ secs: 600, zone: 2, pct: 0.6 }, { secs: 4200, zone: 2, pct: 0.66 }, { secs: 600, zone: 1, pct: 0.5 }], 62),
    ev("ev-soglia", 2, "Soglia 3x10", 70, [{ secs: 900, zone: 2, pct: 0.62 }, { secs: 600, zone: 4, pct: 0.98 }, { secs: 300, zone: 1, pct: 0.55 }, { secs: 600, zone: 4, pct: 0.98 }, { secs: 300, zone: 1, pct: 0.55 }, { secs: 600, zone: 4, pct: 0.98 }, { secs: 300, zone: 1, pct: 0.55 }, { secs: 600, zone: 1, pct: 0.5 }], 80),
    ev("ev-lunga", 5, "Lunga Z2 3h", 180, [{ secs: 900, zone: 2, pct: 0.6 }, { secs: 9000, zone: 2, pct: 0.66 }, { secs: 900, zone: 1, pct: 0.5 }], 150),
  ];
  return { today, data, library: [], planned, profile: { giorni: [0, 1, 2, 3, 4, 5, 6], disciplina: "Strada", carboTollerati: "60" }, phenotype: null, setup: null, plan: null, life: [], overrides: { date: "" }, history: null };
}

const base = makeCtx();
const yellow = (ctx: ChatContext): ChatContext => ({ ...ctx, data: { ...ctx.data, status: { ...ctx.data.status, readiness: { ...ctx.data.status.readiness, level: "giallo", headline: "Riduci l'intensità", reasons: ["HRV 7 giorni sotto la norma."] } } } });
const answer = (ctx: ChatContext, m: string) => chat(m, ctx, emptyState());

describe("the questions of the day", () => {
  it("gives four questions with their reasons, and a greeting with the day's colour and the sessions to come", () => {
    const p = startPage(base);
    expect(p.questions).toHaveLength(4);
    for (const q of p.questions) expect(q.why.length).toBeGreaterThan(3);
    expect(p.hello).toContain(`Oggi sei ${base.data.status.readiness.level}`);
    expect(p.hello).toMatch(/dopodomani la soglia/);
    expect(p.more.length).toBeGreaterThan(0);
    expect(p.more.some((m) => p.questions.some((q) => q.ask === m))).toBe(false);
  });

  it("asks about the colour when it is not green, then the session of quality and the long ride", () => {
    const asks = startPage(yellow(base)).questions.map((q) => q.ask);
    expect(asks[0]).toBe("Perché sono giallo?");
    expect(asks).toContain("Sono recuperato per la soglia di dopodomani?");
    expect(asks.join(" ")).toMatch(/Quanti carboidrati per la lunga di \w+/);
  });

  it("puts «sto meglio» first while an illness is open", () => {
    const sick: ChatContext = { ...base, life: [{ id: "x", category: "SICK", from: addDays(base.today, -2), to: addDays(base.today, 3) }] };
    const p = startPage(sick);
    expect(p.questions[0].ask).toBe("Sto meglio");
    expect(p.hello).toContain("malattia");
  });

  it("works with an empty calendar", () => {
    const p = startPage({ ...base, planned: [] });
    expect(p.questions.length).toBeGreaterThanOrEqual(2);
    expect(p.questions.map((q) => q.ask)).toContain("Cosa faccio oggi?");
  });
});

describe("every question is understood", () => {
  const ctxs = [base, yellow(base), { ...base, life: [{ id: "x", category: "SICK" as const, from: addDays(base.today, -2), to: addDays(base.today, 3) }] }];
  it("never «Non ho capito» nor «Intendevi», never undefined or NaN", () => {
    for (const ctx of ctxs) {
      const p = startPage(ctx);
      for (const m of [...p.questions.map((q) => q.ask), ...p.more]) {
        const r = answer(ctx, m);
        const all = [r.reply.text, ...(r.reply.lines ?? [])].join(" ");
        expect(all, m).not.toMatch(/non ho capito|intendevi|undefined|NaN/i);
      }
    }
  });

  it("each question gets its own kind of answer", () => {
    const ctx = yellow(base);
    expect(answer(ctx, "Perché sono giallo?").state.focus?.intent).toBe("stato");
    expect(answer(ctx, "Com'è andata stanotte?").state.focus?.intent).toBe("notte");
    const ready = answer(ctx, "Sono recuperato per la soglia di dopodomani?");
    expect(ready.state.focus?.eventId).toBe("ev-soglia");
    expect(ready.reply.text).toMatch(/^(✅|⚠️)/);
    const long = startPage(ctx).questions.find((q) => q.tone === "food")!;
    const carbs = answer(ctx, long.ask);
    expect(carbs.state.focus?.eventId).toBe("ev-lunga");
    expect(carbs.reply.text).toMatch(/g\/h|carbo/i);
  });
});
