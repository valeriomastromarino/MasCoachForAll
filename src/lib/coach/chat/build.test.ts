import { describe, expect, it } from "vitest";
import type { CalendarWorkout } from "@/lib/calendar";
import { buildDashboard } from "@/lib/dashboard";
import { addDays } from "@/lib/dates";
import { demoData } from "@/lib/demo";
import { planFromToday, type SeasonSetup } from "@/lib/training/season";
import { chat, type ChatContext, type ChatState, emptyState, rulesFirst } from ".";

function makeCtx(over: Partial<ChatContext> = {}): ChatContext {
  const data = buildDashboard(demoData(120));
  const today = data.today;
  const setup: SeasonSetup = { start: today, horizonWeeks: 40, raceA: null, peak: { start: addDays(today, 200), weeks: 8 }, ramp: "prudente", stops: [], maxHours: 8 };
  return { today, data, library: [], planned: [], profile: { giorni: [0, 1, 2, 3, 4, 5, 6], disciplina: "Strada" }, phenotype: null, setup, plan: planFromToday(setup, today, data.status.ctl), life: [], overrides: { date: "" }, history: null, ...over };
}

function talk(ctx: ChatContext, ...messages: string[]) {
  let state: ChatState = emptyState();
  return messages.map((m) => {
    const r = chat(m, ctx, state);
    state = r.state;
    return r;
  });
}

/** The Italian name of the weekday `days` after today («sabato»). */
const WEEKDAYS = ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"];
const weekdayIn = (ctx: ChatContext, days: number) => WEEKDAYS[(new Date(`${addDays(ctx.today, days)}T12:00:00`).getDay() + 6) % 7];

const tomorrowZ2 = (ctx: ChatContext): CalendarWorkout => ({
  id: "ev-1",
  date: addDays(ctx.today, 1),
  name: "Zone 2 Endurance 90",
  type: "Ride",
  secs: 5400,
  tss: 62,
  description: "Riscaldamento\n- 10m ramp 50-70%\n\nBlocco principale\n- 70m Z2\n\nDefaticamento\n- 10m Z1",
  blocks: [{ secs: 600, zone: 2, pct: 0.6 }, { secs: 4200, zone: 2, pct: 0.66 }, { secs: 600, zone: 1, pct: 0.5 }],
  coach: null,
});

describe("the chat builds sessions", () => {
  it("shows the session, then writes it after «sì»", () => {
    const ctx = makeCtx();
    const [a, b] = talk(ctx, "domani sui rulli 3x12' sweet spot recupero 5'", "sì");
    const w = a.reply.workout!;
    expect(w.name).toBe("Sweet spot 3×12' Indoor");
    expect(w.when).toBe("domani");
    expect(w.meta).toMatch(/^71 min · TSS \d+ · sui rulli/);
    expect(w.steps[1]).toMatch(/^Sweet spot: 3 × 12' /);
    expect(a.reply.chips?.[0]).toBe("Sì");
    expect(b.run).toMatchObject({ type: "create_workout", date: addDays(ctx.today, 1), name: "Sweet spot 3×12' Indoor", indoor: true });
    expect(b.run && "text" in b.run ? b.run.text : "").toContain("Sweet spot 3x\n- 12m 88-93%\n- 5m 55%");
    expect(b.state.draft).toBeNull();
    expect(b.state.lastBuilt?.name).toBe("Sweet spot 3×12' Indoor");
  });

  // The day named in these two tests is always three days ahead: with «sabato» they failed on Fridays, when Saturday is
  // «domani» (found on 20 November 2026).
  it("takes changes with words and keeps the day", () => {
    const ctx = makeCtx();
    const day = weekdayIn(ctx, 3);
    const [, b, c, d] = talk(ctx, "domani 3x12' sweet spot", "fai 4 ripetute e recupero 4'", `sposta a ${day}`, "sui rulli");
    expect(b.reply.text).toBe("Fatto: 4 ripetute, recupero 4'.");
    expect(b.reply.workout!.steps.join(" ")).toMatch(/4 × 12' .* · 4' /);
    expect(c.reply.workout!.when).toMatch(new RegExp(`^${day}`));
    expect(d.reply.workout!.name).toMatch(/Indoor$/);
    expect(d.state.pending).toMatchObject({ type: "create_workout" });
  });

  it("starts over on a whole new request", () => {
    const ctx = makeCtx();
    const day = weekdayIn(ctx, 3);
    const [, b] = talk(ctx, "domani sui rulli 3x12' sweet spot", `${day} 4x8' soglia`);
    expect(b.reply.workout!.name).toBe("Soglia 4×8'");
    expect(b.reply.workout!.when).toMatch(new RegExp(`^${day}`));
  });

  it("lets the engine choose the dose when asked by type", () => {
    const ctx = makeCtx();
    const [a] = talk(ctx, "dammi una soglia da 60'");
    expect(a.reply.workout!.name).toMatch(/^Soglia \d×\d+'/);
    expect(a.reply.workout!.notes[0]).toMatch(/^Dose scelta dal motore/);
    const [z2] = talk(ctx, "giovedì 26 novembre 60' z2 sui rulli");
    expect(z2.reply.workout!.name).toMatch(/^Z2 60' Indoor$|^Z2 1h Indoor$/);
    expect(z2.reply.workout!.meta).toMatch(/^60 min/);
    expect(rulesFirst("posso fare 60' z2 giovedì?", emptyState(), ctx.today)).toBe(false);
    // «voglio fare sweet spot» still picks from the library, as before.
    expect(rulesFirst("voglio fare sweet spot", emptyState(), ctx.today)).toBe(false);
  });

  it("asks what is missing, and builds when told to decide", () => {
    const ctx = makeCtx();
    const [a, b] = talk(ctx, "giovedì ripetute in salita", "Decidi tu");
    expect(a.reply.workout).toBeUndefined();
    expect(a.reply.chips).toContain("Decidi tu");
    expect(b.reply.workout).toBeDefined();
  });

  it("puts 6 sprints in tomorrow's Z2 and gives the old one back with «annulla»", () => {
    const ctx = makeCtx();
    ctx.planned = [tomorrowZ2(ctx)];
    const [a, b] = talk(ctx, "inseriscimi 6 sprint nella z2 di domani", "sì");
    expect(a.reply.workout!.name).toBe("Zone 2 Endurance 90 + 6 sprint");
    expect(a.reply.workout!.tag).toBe("modificata");
    expect(a.reply.workout!.meta).toMatch(/^90 min/);
    expect(b.run).toMatchObject({ type: "update_workout", eventId: "ev-1", prev: { name: "Zone 2 Endurance 90" } });
    const text = b.run && b.run.type === "update_workout" ? b.run.text : "";
    expect(text.match(/- 10s 200%/g)).toHaveLength(6);
  });

  it("puts the sprints in tomorrow's ride even while another session is being built", () => {
    const ctx = makeCtx();
    ctx.planned = [tomorrowZ2(ctx)];
    const [, b] = talk(ctx, "sabato sui rulli 3x12' sweet spot", "inseriscimi 6 sprint nella z2 di domani");
    expect(b.reply.workout!.name).toBe("Zone 2 Endurance 90 + 6 sprint");
    expect(b.state.pending).toMatchObject({ type: "update_workout", eventId: "ev-1" });
  });

  it("offers a new session when there is nothing to put it in", () => {
    const ctx = makeCtx();
    const [a, b] = talk(ctx, "inseriscimi 6 sprint nella z2 di domani", "Sì, una nuova");
    expect(a.reply.chips).toContain("Sì, una nuova");
    expect(b.reply.workout!.name).toMatch(/con 6 sprint/);
  });

  it("does not write a hard session on a red day, and says when it would fit", () => {
    const ctx = makeCtx();
    ctx.data = { ...ctx.data, status: { ...ctx.data.status, readiness: { ...ctx.data.status.readiness, level: "rosso" } } };
    const [a] = talk(ctx, "oggi 5x4' vo2 al 115%");
    expect(a.reply.workout!.warning).toBeTruthy();
    expect(a.state.pending).toBeNull();
  });

  it("replaces the bike workout already planned that day, unless told to keep both", () => {
    const ctx = makeCtx();
    ctx.planned = [tomorrowZ2(ctx)];
    const [a, b] = talk(ctx, "domani 4x8' soglia", "tienile tutte e due");
    expect(a.reply.workout!.notes.join(" ")).toMatch(/Prende il posto di «Zone 2 Endurance 90»/);
    expect(a.state.pending).toMatchObject({ replace: ["ev-1"] });
    expect(b.state.pending).toMatchObject({ replace: [] });
  });

  it("saves the last one in the library after «sì»", () => {
    const ctx = makeCtx();
    const r = talk(ctx, "domani 3x12' sweet spot", "sì", "Salva in libreria", "sì");
    expect(r[2].reply.confirm).toMatchObject({ type: "save_library", name: "Sweet spot 3×12'" });
    expect(r[3].run).toMatchObject({ type: "save_library" });
  });

  it("leaves the rest of the chat alone", () => {
    const ctx = makeCtx();
    const [a, b] = talk(ctx, "domani 3x12' sweet spot", "come sto?");
    expect(a.state.draft).toBeTruthy();
    expect(b.state.draft).toBeNull();
    expect(rulesFirst("ho fatto 3x12 ieri", emptyState(), ctx.today)).toBe(false);
    expect(rulesFirst("com'è andata l'uscita di ieri?", emptyState(), ctx.today)).toBe(false);
  });
});
