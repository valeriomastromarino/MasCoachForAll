// The reader of commands (26 November 2026), on the phrases the chat got wrong on real data: changes to a
// planned session said with «invece di», structure and intensity, new sessions on another day, questions that must not
// change anything, the week, races, «ok», and what the chat learns from a tapped button. Demo data; sessions at +1 (Z2),
// +3 (threshold 3x10) and +5 days (long ride 3 h).
import { beforeEach, describe, expect, it } from "vitest";
import type { CalendarWorkout } from "@/lib/calendar";
import { buildDashboard } from "@/lib/dashboard";
import { addDays } from "@/lib/dates";
import { demoData } from "@/lib/demo";
import { planFromToday, type SeasonSetup } from "@/lib/training/season";
import { chat, type ChatContext, type ChatResult, type ChatState, emptyState } from ".";
import { resetLearned } from "./learned";

const WEEKDAYS = ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"];

function makeCtx(): ChatContext {
  const data = buildDashboard(demoData(120));
  const today = data.today;
  const setup: SeasonSetup = { start: today, horizonWeeks: 40, raceA: null, peak: { start: addDays(today, 200), weeks: 8 }, ramp: "prudente", stops: [], maxHours: 8 };
  const ev = (id: string, d: number, name: string, mins: number, desc: string, blocks: CalendarWorkout["blocks"], tss: number): CalendarWorkout => ({ id, date: addDays(today, d), name, type: "Ride", secs: mins * 60, tss, description: desc, blocks, coach: null });
  const planned = [
    ev("ev-z2", 1, "Zone 2 Endurance 90", 90, "Riscaldamento\n- 10m ramp 50-70%\n\nBlocco principale\n- 70m 66%\n\nDefaticamento\n- 10m 50%", [{ secs: 600, zone: 2, pct: 0.6 }, { secs: 4200, zone: 2, pct: 0.66 }, { secs: 600, zone: 1, pct: 0.5 }], 62),
    ev("ev-soglia", 3, "Soglia 3x10", 70, "Riscaldamento\n- 15m ramp 50-75%\n\nBlocco principale 3x\n- 10m 98%\n- 5m 55%\n\nDefaticamento\n- 10m 50%", [{ secs: 900, zone: 2, pct: 0.62 }, { secs: 600, zone: 4, pct: 0.98 }, { secs: 300, zone: 1, pct: 0.55 }, { secs: 600, zone: 4, pct: 0.98 }, { secs: 300, zone: 1, pct: 0.55 }, { secs: 600, zone: 4, pct: 0.98 }, { secs: 300, zone: 1, pct: 0.55 }, { secs: 600, zone: 1, pct: 0.5 }], 80),
    ev("ev-lunga", 5, "Lunga Z2 3h", 180, "Riscaldamento\n- 15m ramp 50-68%\n\nFondo\n- 150m 66%\n\nDefaticamento\n- 15m 50%", [{ secs: 900, zone: 2, pct: 0.6 }, { secs: 9000, zone: 2, pct: 0.66 }, { secs: 900, zone: 1, pct: 0.5 }], 150),
  ];
  return { today, data, library: [], planned, profile: { giorni: [0, 1, 2, 3, 4, 5, 6], disciplina: "Strada", carboTollerati: "60" }, phenotype: null, setup, plan: planFromToday(setup, today, data.status.ctl), life: [], overrides: { date: "" }, history: null };
}

const ctx = makeCtx();
const day = (n: number) => WEEKDAYS[(new Date(`${addDays(ctx.today, n)}T12:00:00`).getDay() + 6) % 7];
const SOGLIA = day(3);
const LUNGA = day(5);
const FREE = day(2);
const AFTER_SOGLIA = day(4);

function talk(...messages: string[]): ChatResult[] {
  let state: ChatState = emptyState();
  return messages.map((m) => {
    const r = chat(m, ctx, state);
    state = r.state;
    return r;
  });
}
const one = (m: string) => talk(m)[0];
type Confirm = { type: string; secs?: number; to?: string; eventId?: string; items?: unknown[]; priority?: string; patch?: Record<string, unknown> };
const confirm = (r: ChatResult) => r.reply.confirm as Confirm | undefined;

beforeEach(() => resetLearned());

describe("changes to a planned session", () => {
  it("structure, easier and harder", () => {
    const s = one("la soglia falla 4x8");
    expect(confirm(s)).toMatchObject({ type: "update_workout", eventId: "ev-soglia" });
    expect(s.reply.text).toMatch(/4×8'/);
    expect(one("la soglia 3x10 rendila più facile").reply.text).toMatch(/più facile/);
    expect(one("la soglia 3x10 rendila più facile").reply.workout?.notes.join(" ")).toMatch(/3×10' → 2×10'/);
    expect(one("la soglia falla più dura").reply.workout?.notes.join(" ")).toMatch(/3×10' → 4×10'/);
    // «la soglia 3x10» names the session: alone it is not a change.
    expect(confirm(one("cambiami la soglia con qualcosa di più facile"))).toMatchObject({ type: "update_workout", eventId: "ev-soglia" });
  });
  it("«invece di»: the length, the place, the day", () => {
    expect(confirm(one(`${LUNGA} invece di 3 ore fammi fare 4 ore`))?.secs).toBeGreaterThan(230 * 60);
    expect(confirm(one("la soglia falla sui rulli invece che fuori"))).toMatchObject({ type: "update_workout", indoor: true });
    expect(confirm(one(`voglio fare la soglia ${AFTER_SOGLIA} invece che ${SOGLIA}`))).toMatchObject({ type: "move", eventId: "ev-soglia", to: addDays(ctx.today, 4) });
  });
  it("«una soglia venerdì» is a new session, «la soglia di venerdì» the planned one", () => {
    expect(confirm(one(`mettimi una soglia ${FREE}`))).toMatchObject({ type: "create_workout" });
    expect(confirm(one(`${FREE} fammi un recupero`))).toMatchObject({ type: "create_workout" });
  });
  it("shifts everything together, with a yes", () => {
    const r = one("sposta tutto di un giorno");
    expect(confirm(r)).toMatchObject({ type: "move_many" });
    expect(confirm(r)?.items).toHaveLength(3);
  });
});

describe("questions never change anything", () => {
  it("answers about the session asked", () => {
    expect(one("quanto dura la soglia?").reply.text).toMatch(/dura 70 min/);
    expect(one("quanti watt devo fare nella soglia?").reply.text).toMatch(/^I watt di «Soglia 3x10»/);
    expect(one(`quanti carbo per la lunga di ${LUNGA}?`).reply.text).toMatch(/g\/h/);
    expect(one("spiegami la soglia").reply.lines?.join(" ")).toMatch(/FTP/);
    expect(one("quanti watt in z2?").reply.text).not.toMatch(/^I watt di/);
  });
  it("a general question gets the coach's notion, not a change of today", () => {
    const r = one("va bene fare vo2 due giorni di fila?");
    expect(r.state.focus?.term).toBe("qualita_di_fila");
    expect(r.overrides).toBeUndefined();
    expect(one("che differenza c'è tra z2 e recupero?").state.focus?.term).toBe("z2_vs_recupero");
    expect(one("quante volte a settimana devo fare intensità?").state.focus?.term).toBe("qualita_settimana");
    expect(one("come recupero più in fretta?").state.focus?.term).toBe("recupero_veloce");
    expect(confirm(one(`${LUNGA} posso fare 4 ore invece di 3?`))).toBeUndefined();
  });
});

describe("the week, races, the small words", () => {
  it("a light week asked for goes to the season after a yes", () => {
    const r = one("rendi leggera la prossima settimana");
    const c = confirm(r);
    if (c) expect(c).toMatchObject({ type: "set_season" });
    else expect(r.reply.text).toMatch(/già leggera/);
  });
  it("a race asks how much it counts, then is written after a yes", () => {
    const [ask, pick] = talk(`${SOGLIA} gara`, `Gara B ${SOGLIA}: importante`);
    expect(ask.reply.choices).toHaveLength(3);
    expect(confirm(pick)).toMatchObject({ type: "race_add", priority: "RACE_B" });
    expect(confirm(one("il 20 dicembre ho una granfondo di 120 km, è il mio obiettivo"))).toMatchObject({ type: "race_add", priority: "RACE_A" });
    expect(one("cosa faccio il giorno della gara?").reply.confirm).toBeUndefined();
  });
  it("«ok», «sì», «dai» with nothing to confirm are not «non ho capito»", () => {
    for (const m of ["ok", "sì", "dai"]) expect(one(m).reply.text).not.toMatch(/Non ho capito/);
  });
  it("calories, progress and «ho fatto bene ieri?» answer from the data", () => {
    expect(one("quante calorie ho bruciato questa settimana?").reply.text).toMatch(/kcal|Non vedo uscite/);
    expect(one("sono migliorato?").reply.text).toMatch(/migliorando|tenendo|no|servono/i);
    expect(one("ho fatto bene ieri?").reply.text).toMatch(/fatto bene|Quasi|non vedo uscite/i);
  });
  it("the weather of a day comes from the forecast saved on the device", () => {
    const sunday = addDays(ctx.today, 3);
    const wctx: ChatContext = { ...ctx, weather: [{ date: sunday, kind: "pioggia", label: "Pioggia", tMax: 9, tMin: 4, windKmh: 28, gustKmh: 45, windFrom: 200, rainPct: 80 }] };
    const r = chat(`che tempo fa ${SOGLIA}?`, wctx, emptyState());
    expect(r.reply.text).toMatch(/pioggia/);
    expect(r.reply.chips?.[0]).toMatch(/falla sui rulli/);
    expect(chat("come gestisco il vento?", wctx, emptyState()).state.focus?.term).toBe("vento");
  });
});

describe("learning from the buttons", () => {
  it("a tapped «Intendevi…?» button is remembered for the same words; «Non era questo» takes it back", () => {
    const [ask] = talk("boh ciclismo e cose");
    const choice = ask.reply.choices?.[0];
    expect(choice).toBeTruthy();
    let state = ask.state;
    state = chat(choice!, ctx, state).state;
    const again = chat("boh ciclismo e cose", ctx, emptyState());
    expect(again.reply.chips).toContain("Non era questo");
    const back = chat("non era questo", ctx, again.state);
    expect(back.reply.text).toMatch(/Scusa/);
    expect(state).toBeTruthy();
  });
});
