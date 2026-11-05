import { describe, expect, it } from "vitest";
import type { LibraryWorkout } from "@/lib/calendar";
import { buildDashboard } from "@/lib/dashboard";
import { addDays } from "@/lib/dates";
import { demoData } from "@/lib/demo";
import { planFromToday, type SeasonSetup } from "@/lib/training/season";
import { chat, type ChatContext, type ChatState, emptyState, suggestPhrases } from ".";
import { detectIntent } from "./intents";

let id = 0;
function wk(name: string, blocks: [number, number][], tss: number): LibraryWorkout {
  return { id: ++id, name, type: "Ride", secs: blocks.reduce((s, b) => s + b[0] * 60, 0), tss, description: null, blocks: blocks.map(([m, zone]) => ({ secs: m * 60, zone })) };
}
const rep = (n: number, work: [number, number], rest: [number, number]) => Array.from({ length: n }, () => [work, rest]).flat() as [number, number][];

const LIBRARY: LibraryWorkout[] = [
  wk("Active Recovery Spin 45", [[5, 1], [35, 1], [5, 1]], 14),
  wk("Zone 2 Endurance 60", [[10, 2], [45, 2], [5, 1]], 42),
  wk("Zone 2 Endurance 90", [[10, 2], [70, 2], [10, 1]], 62),
  wk("Zone 2 Endurance 150", [[10, 2], [130, 2], [10, 1]], 100),
  wk("Sweet Spot 3x12", [[10, 2], ...rep(3, [12, 3], [5, 1]), [5, 1]], 78),
  wk("Threshold 4x8", [[15, 2], ...rep(4, [8, 4], [4, 1]), [10, 1]], 85),
  wk("Threshold 3x10 Indoor", [[15, 2], ...rep(3, [10, 4], [5, 1]), [10, 1]], 75),
  wk("VO2 Max 5x4", [[15, 2], ...rep(5, [4, 5], [4, 1]), [10, 1]], 88),
  wk("Anaerobic 10x45sec", [[15, 2], ...rep(10, [0.75, 6], [2.5, 1]), [10, 1]], 52),
];

function makeCtx(over: Partial<ChatContext> = {}): ChatContext {
  const data = buildDashboard(demoData(120));
  const today = data.today;
  const setup: SeasonSetup = { start: today, horizonWeeks: 40, raceA: null, peak: { start: addDays(today, 200), weeks: 8 }, ramp: "prudente", stops: [], maxHours: 8 };
  return {
    today,
    data,
    library: LIBRARY,
    planned: [],
    profile: { giorni: [0, 1, 2, 3, 4, 5, 6], disciplina: "Strada" },
    phenotype: "glicolitico",
    setup,
    plan: planFromToday(setup, today, data.status.ctl),
    life: [],
    overrides: { date: "" },
    history: null,
    ...over,
  };
}

/** A conversation: each message with the state the previous one left. */
function talk(ctx: ChatContext, ...messages: string[]) {
  let state: ChatState = emptyState();
  const results = messages.map((m) => {
    const r = chat(m, ctx, state);
    state = r.state;
    return r;
  });
  return results;
}

describe("detectIntent", () => {
  const i = (t: string, pending = false) => detectIntent(t, { pending: pending ? ({ type: "set_profile", patch: {}, label: "" } as never) : null, awaiting: null }).type;
  it("reads the strong signals before the general questions", () => {
    expect(i("ho la febbre da ieri")).toBe("vita_malattia");
    expect(i("mi sono fatto male al ginocchio")).toBe("vita_infortunio");
    expect(i("infortunio al ginocchio")).toBe("vita_infortunio");
    expect(i("sto meglio")).toBe("vita_guarito");
    expect(i("ferie dal 10 al 20 dicembre")).toBe("vita_ferie");
    expect(i("ho male al ginocchio")).toBe("dolore");
    expect(i("oggi non mi alleno")).toBe("riposo_oggi");
  });
  it("tells questions, changes and preferences apart", () => {
    expect(i("come sto?")).toBe("stato");
    expect(i("cosa faccio oggi?")).toBe("oggi");
    expect(i("perché soglia?")).toBe("perche");
    expect(i("cambia")).toBe("cambia");
    expect(i("più facile")).toBe("cambia");
    expect(i("voglio fare sweet spot")).toBe("cambia");
    expect(i("ho solo 45 minuti")).toBe("pref_minuti");
    expect(i("il martedì non posso")).toBe("pref_giorno");
    expect(i("questa settimana solo 5 ore")).toBe("pref_ore");
    expect(i("più prudente col carico")).toBe("pref_ramp");
    expect(i("picco dal 14 giugno per 8 settimane")).toBe("pref_picco");
    expect(i("e se salto la prossima settimana?")).toBe("what_if");
    expect(i("posso fare un vo2 domani?")).toBe("posso");
    expect(i("cos'è il TSB?")).toBe("glossario");
    expect(i("tsb")).toBe("glossario");
    expect(i("gambe pesanti")).toBe("sensazione");
    expect(i("com'è andata l'uscita di ieri?")).toBe("ultima_uscita");
    expect(i("devo cambiare l'FTP?")).toBe("ftp");
    expect(i("programma")).toBe("programma");
    expect(i("programma la settimana")).toBe("programma_settimana");
  });
  it("takes yes and no only when something waits for them", () => {
    expect(i("sì", true)).toBe("si");
    expect(i("no", true)).toBe("no");
    expect(i("sì", false)).toBe("unknown");
  });
});

describe("chat: reading", () => {
  it("answers the status with the readiness and the numbers", () => {
    const [r] = talk(makeCtx(), "come sto?");
    expect(r.reply.text).toMatch(/Prontezza/);
    expect(r.reply.lines?.join(" ")).toMatch(/HRV/);
    expect(r.reply.lines?.join(" ")).toMatch(/CTL/);
  });
  it("proposes today's workout and explains it", () => {
    const [oggi, perche] = talk(makeCtx(), "cosa faccio oggi?", "perché?");
    expect(oggi.reply.proposal ?? oggi.reply.text).toBeTruthy();
    expect(oggi.reply.chips).toContain("Programma");
    expect(perche.reply.lines?.join(" ")).toContain("I numeri che contano");
  });
  it("explains terms with the athlete's own numbers", () => {
    const [r] = talk(makeCtx(), "cos'è il TSB?");
    expect(r.reply.text).toContain("TSB (forma)");
    expect(r.reply.text).toMatch(/Il tuo oggi è/);
  });
  it("tells the week, the plan, and what happens if a week is skipped", () => {
    const ctx = makeCtx();
    const [week, plan, what] = talk(ctx, "i prossimi giorni", "a che punto sono col piano?", "e se salto la prossima settimana?");
    expect(week.reply.lines?.length).toBe(7);
    expect(plan.reply.lines?.join(" ")).toMatch(/Fase/);
    expect(what.reply.lines?.join(" ")).toMatch(/CTL/);
  });
  it("says when there is no plan, instead of guessing", () => {
    const ctx = makeCtx({ setup: null, plan: null });
    const [r] = talk(ctx, "a che punto sono col piano?");
    expect(r.reply.text).toMatch(/Stagione/);
  });
  it("answers the analysis questions without failing", () => {
    const ctx = makeCtx();
    for (const q of ["com'è andata l'uscita di ieri?", "i miei record", "devo cambiare l'FTP?", "le mie zone", "zone cardio", "che atleta sono?", "quanti allenamenti hai?", "un sweet spot da 60 minuti", "quanti carbo?", "com'è andata la settimana?", "polarizzato o piramidale?", "test cp quando?", "fammi il punto", "dammi un consiglio", "rispetto a un anno fa?", "hrv"]) {
      const [r] = talk(ctx, q);
      expect(r.reply.text.length, q).toBeGreaterThan(5);
    }
  });
  it("suggests phrases when it doesn't understand, never an error", () => {
    const [r] = talk(makeCtx(), "xyzzy qwerty");
    expect(r.reply.chips?.length).toBeGreaterThan(0);
    expect(suggestPhrases("allenamento di oggi")).not.toHaveLength(0);
    const near = talk(makeCtx(), "settimana")[0];
    expect(near.reply.text.length).toBeGreaterThan(5);
  });
});

describe("chat: today's wishes (nothing is written)", () => {
  it("makes it easier, shorter, indoor, or the type asked, and says so", () => {
    const ctx = makeCtx();
    const easy = chat("più facile", ctx, emptyState());
    expect(easy.overrides?.easier).toBe(true);
    expect(easy.reply.proposal?.cls ?? "").not.toMatch(/soglia|vo2|anaerobico/);
    const short = chat("ho solo 45 minuti", ctx, emptyState());
    expect(short.overrides?.maxMins).toBe(45);
    expect((short.reply.proposal?.mins ?? 0) <= 55).toBe(true);
    const asked = chat("voglio fare un vo2", ctx, emptyState());
    expect(asked.overrides?.wantClass).toBe("vo2");
    expect(chat("sui rulli", ctx, emptyState()).overrides?.place).toBe("indoor");
  });
  it("lowers the readiness when the athlete is tired, and rests when asked", () => {
    const ctx = makeCtx();
    const tired = chat("gambe pesanti", ctx, emptyState());
    expect(tired.overrides?.feeling).toMatchObject({ drop: true, note: "hai le gambe pesanti" });
    expect(tired.reply.text).toContain("Abbasso la prontezza");
    expect(chat("oggi non mi alleno", ctx, emptyState()).overrides?.restToday).toBe(true);
    const pain = chat("ho male al ginocchio", ctx, emptyState());
    expect(pain.overrides?.feeling?.drop).toBe(true);
    expect(pain.reply.chips?.join(" ")).toContain("Infortunio al ginocchio");
  });
  it("never repeats the workout it just offered when asked for another", () => {
    const ctx = makeCtx();
    const first = chat("cosa faccio oggi?", ctx, emptyState());
    const second = chat("un altro", ctx, first.state);
    if (first.reply.proposal && second.reply.proposal) expect(second.reply.proposal.workout.id).not.toBe(first.reply.proposal.workout.id);
  });
});

describe("chat: writes wait for a yes", () => {
  it("schedules the proposed workout only after 'sì', and drops it on 'no'", () => {
    const ctx = makeCtx();
    const [oggi, prog, yes] = talk(ctx, "cosa faccio oggi?", "programma", "sì");
    if (!oggi.reply.proposal) return;
    expect(prog.reply.confirm?.type).toBe("schedule");
    expect(prog.reply.chips).toEqual(["Sì", "No"]);
    expect(yes.run?.type).toBe("schedule");
    const [, , no] = talk(ctx, "cosa faccio oggi?", "programma", "no");
    expect(no.run).toBeUndefined();
    expect(no.state.pending).toBeNull();
  });
  it("writes a fever as a sick event: rest, then a week of Z1-Z2, with what it does to the plan", () => {
    const ctx = makeCtx();
    const [r, yes] = talk(ctx, "ho la febbre da ieri", "sì");
    expect(r.reply.confirm).toMatchObject({ type: "life_add", category: "SICK" });
    const lines = r.reply.lines?.join(" ") ?? "";
    expect(lines).toContain("Z1-Z2");
    expect(lines).toContain("7 giorni");
    expect(lines).toMatch(/medico/);
    expect(yes.run?.type).toBe("life_add");
  });
  it("writes an injury with the body part, and an open question about holidays is completed by the dates", () => {
    const ctx = makeCtx();
    const [inj] = talk(ctx, "infortunio al ginocchio");
    expect(inj.reply.confirm).toMatchObject({ type: "life_add", category: "INJURED", name: "Infortunio: ginocchio" });
    const [ask, done] = talk(ctx, "ferie", "dal 10 al 20 dicembre");
    expect(ask.state.awaiting?.intent).toBe("vita_ferie");
    expect(ask.reply.confirm).toBeUndefined();
    expect(done.reply.confirm).toMatchObject({ type: "life_add", category: "HOLIDAY" });
    const c = done.reply.confirm as { from: string; to: string };
    expect(c.from.slice(5)).toBe("12-10");
    expect(c.to.slice(5)).toBe("12-20");
  });
  it("closes an open illness on 'sto meglio', and says there is none when there isn't", () => {
    const base = makeCtx();
    const ctx = makeCtx({ life: [{ id: "77", category: "SICK", from: addDays(base.today, -3), to: addDays(base.today, 3) }] });
    const [r] = talk(ctx, "sto meglio");
    expect(r.reply.confirm).toMatchObject({ type: "life_close", id: "77", to: addDays(base.today, -1) });
    expect(r.reply.lines?.join(" ")).toContain("7 giorni");
    expect(talk(base, "sto meglio")[0].reply.confirm).toBeUndefined();
  });
  it("changes the sheet and the season: days, hours, ramp, peak", () => {
    const ctx = makeCtx();
    const [giorno] = talk(ctx, "il martedì non posso");
    expect(giorno.reply.confirm).toMatchObject({ type: "set_profile" });
    expect((giorno.reply.confirm as { patch: { giorni: number[] } }).patch.giorni).not.toContain(1);
    const [oneOff] = talk(ctx, "questa settimana solo 5 ore");
    expect(oneOff.reply.confirm).toMatchObject({ type: "set_season" });
    expect((oneOff.reply.confirm as { patch: { weekCaps: { hours: number }[] } }).patch.weekCaps[0].hours).toBe(5);
    const [perm] = talk(ctx, "massimo 10 ore a settimana");
    expect((perm.reply.confirm as { patch: { maxHours: number } }).patch.maxHours).toBe(10);
    const balanced = makeCtx({ setup: { ...makeCtx().setup!, ramp: "bilanciato" } });
    const [ramp] = talk(balanced, "più prudente col carico");
    expect((ramp.reply.confirm as { patch: { ramp: string } }).patch.ramp).toBe("prudente");
    const [peak] = talk(ctx, "picco dal 14 giugno per 8 settimane");
    const p = (peak.reply.confirm as { patch: { peak: { start: string; weeks: number } } }).patch.peak;
    expect(p.start.slice(5)).toBe("06-14");
    expect(p.weeks).toBe(8);
    const [long] = talk(ctx, "picco dal 14 giugno per 12 settimane");
    expect((long.reply.confirm as { patch: { peak: { weeks: number } } }).patch.peak.weeks).toBe(8);
    expect(long.reply.lines?.join(" ")).toContain("al massimo 8");
  });
  it("undoes the last write, or says there is nothing to undo", () => {
    const ctx = makeCtx();
    expect(chat("annulla", ctx, emptyState()).reply.text).toContain("nulla da annullare");
    const withUndo: ChatState = { ...emptyState(), undo: { kind: "remove_event", ids: ["1"], label: "l'allenamento di oggi" } };
    const r = chat("annulla", ctx, withUndo);
    expect(r.undo).toMatchObject({ kind: "remove_event" });
  });
  it("answers a lonely yes or no without doing anything", () => {
    expect(chat("sì", makeCtx(), emptyState()).run).toBeUndefined();
    expect(chat("no", makeCtx(), { ...emptyState(), pending: { type: "set_profile", patch: {}, label: "x" } }).run).toBeUndefined();
  });
});
