// The local chat, read the way an athlete writes (25 November 2026): typos and shorthand, follow-ups, sessions named by
// kind or day, changes to the calendar, direct answers from the data and the coach's notions. Demo data; three sessions
// on the calendar at +1 (Z2), +3 (threshold) and +5 days (long ride), so the phrases name them by day of the week.
import { describe, expect, it } from "vitest";
import type { CalendarWorkout } from "@/lib/calendar";
import { buildDashboard } from "@/lib/dashboard";
import { addDays } from "@/lib/dates";
import { demoData } from "@/lib/demo";
import { planFromToday, type SeasonSetup } from "@/lib/training/season";
import { chat, type ChatContext, type ChatResult, type ChatState, emptyState } from ".";
import { clean, editDistance } from "./lexicon";
import { NOTIONS } from "./knowledge";
import { parseMinutes } from "./text";

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
const Z2 = day(1);
const SOGLIA = day(3);
const LUNGA = day(5);
const FREE = day(2);

function talk(...messages: string[]): ChatResult[] {
  let state: ChatState = emptyState();
  return messages.map((m) => {
    const r = chat(m, ctx, state);
    state = r.state;
    return r;
  });
}
const one = (m: string) => talk(m)[0];
const all = (r: ChatResult) => [r.reply.text, ...(r.reply.lines ?? [])].join(" ");
const notion = (m: string) => (one(m).state.focus?.intent === "notion" ? one(m).state.focus?.term : null);

describe("reading the words", () => {
  it("fixes shorthand and repeated letters, keeps numbers and the builder's marks", () => {
    expect(clean("ke allenamnto faccio dmn?")).toBe("che allenamento faccio domani?");
    expect(clean("xke nn posso?")).toBe("perche non posso?");
    expect(clean("siiii")).toBe("si");
    expect(clean("3x12' al 88% 30/30")).toBe("3x12' al 88% 30/30");
    expect(clean("2 cm")).toBe("2 cm");
    expect(clean("accorciala")).toBe("accorciala");
    expect(editDistance("allenamnto", "allenamento")).toBe(1);
  });
  it("reads an oretta and a mezz'ora", () => {
    expect(parseMinutes("stasera ho un'oretta")).toBe(60);
    expect(parseMinutes("solo mezz'ora")).toBe(30);
    expect(parseMinutes("un'ora e mezza")).toBe(90);
  });
  it("understands typos and chat shorthand", () => {
    expect(one("cm sto?").reply.text).toMatch(/Prontezza/);
    expect(one("dmn ke faccio?").reply.text).toMatch(/Domani/);
    expect(one("ke allenamnto faccio oggi?").reply.text).toMatch(/Oggi/);
    expect(notion("cm faccio a nn piantarmi nel finale?")).toBe("resistenza");
  });
  it("does not «correct» a real word into another one", () => {
    expect(one("salva in libreria").reply.text).toMatch(/salvare|libreria/i);
  });
});

describe("direct answers from the data", () => {
  it("the night, the week of HRV, the resting HR, the sleep", () => {
    expect(one("com'è andata stanotte?").reply.text).toMatch(/Stanotte/);
    expect(one("come ho dormito?").reply.text).toMatch(/Stanotte/);
    expect(all(one("come va l'HRV questa settimana?"))).toMatch(/7 notti/);
    expect(one("la fc a riposo è alta?").reply.text).toMatch(/bpm/);
    expect(one("come sto dormendo?").reply.text).toMatch(/Dormi|dormi/);
  });
  it("why the colour of today", () => {
    expect(one("perché sono giallo?").reply.text).toMatch(/verde|giallo|rosso/);
  });
  it("what is on a day, and whether it fits", () => {
    const r = one(`cosa ho ${SOGLIA}?`);
    expect(r.reply.text).toContain("Soglia 3x10");
    expect(r.state.focus?.eventId).toBe("ev-soglia");
    expect(one(`sono recuperato per la soglia di ${SOGLIA}?`).reply.text).toMatch(/^(✅|⚠️)/);
    expect(one(`${LUNGA} posso fare 4 ore invece di 3?`).reply.text).toMatch(/Sì|riserva/);
  });
  it("another sport, the will, the volume", () => {
    expect(all(one("oggi ho fatto 2 ore di MTB, cambio qualcosa?"))).toMatch(/TSS/);
    expect(all(one("ho fatto calcetto ieri sera"))).toMatch(/calcetto/);
    expect(one("boh non ho voglia").reply.text).toMatch(/giornata no/);
    expect(one("sono a pezzi").overrides?.feeling?.drop).toBe(true);
    expect(one("sono un po' cotto").overrides?.feeling?.drop).toBe(true);
  });
  it("watts of a zone are the zones, not the records", () => {
    expect(one("quanti watt ho in z2?").reply.text).toMatch(/Zone/);
  });
  it("a question about the rest of today is not a rest day", () => {
    expect(one("xke oggi riposo?").overrides?.restToday).toBeUndefined();
  });
});

describe("following the conversation", () => {
  it("«e ieri?» repeats the question for another day, «cosa vuol dire?» explains the word", () => {
    const [night, before, what] = talk("com'è andata stanotte?", "e ieri?", "cosa vuol dire?");
    expect(night.reply.text).toMatch(/Stanotte/);
    expect(before.reply.text).toMatch(/notte prima/);
    expect(what.reply.text).toMatch(/^HRV/);
  });
  it("«perché?» and «e <day>?» about the session being discussed", () => {
    const [, why, next] = talk(`cosa ho ${SOGLIA}?`, "perché?", `e ${LUNGA}?`);
    expect(why.reply.text).toContain("Soglia 3x10");
    expect(next.reply.text).toContain("Lunga Z2 3h");
  });
  it("«spostala» moves the session the conversation is about", () => {
    const [, move] = talk(`cosa ho ${SOGLIA}?`, `spostala a ${FREE}`);
    expect(move.reply.confirm).toMatchObject({ type: "move", eventId: "ev-soglia", to: addDays(ctx.today, 2) });
  });
  it("asks the day with buttons, and a button answers it", () => {
    const [ask, pick] = talk("sposta la lunga", `A ${FREE}`);
    expect(ask.reply.choices?.length).toBeGreaterThan(0);
    expect(pick.reply.confirm).toMatchObject({ type: "move", eventId: "ev-lunga", to: addDays(ctx.today, 2) });
  });
  it("«la seconda» picks the second button", () => {
    const [ask, pick] = talk("spostala", "la seconda");
    expect(ask.reply.choices?.length).toBeGreaterThanOrEqual(2);
    expect(pick.reply.text).toMatch(/giorno|Sposto/);
  });
});

describe("changes to the sessions on the calendar", () => {
  it("names a session by its kind, and shifts by days", () => {
    expect(one("rimanda di un giorno la soglia").reply.confirm).toMatchObject({ type: "move", eventId: "ev-soglia", to: addDays(ctx.today, 4) });
    expect(one(`mettimi la z2 di domani a ${FREE}`).reply.confirm).toMatchObject({ type: "move" });
  });
  it("swaps when the day is taken, and on request", () => {
    expect(one("anticipa la lunga di 2 giorni").reply.confirm).toMatchObject({ type: "swap" });
    expect(one(`scambia ${Z2} e ${SOGLIA}`).reply.confirm).toMatchObject({ type: "swap" });
  });
  it("deletes one or many, after a yes", () => {
    const [ask, no] = talk("cancella la soglia", "no");
    expect(ask.reply.confirm).toMatchObject({ type: "remove", eventId: "ev-soglia" });
    expect(no.run).toBeUndefined();
  });
  it("shortens, lengthens, changes the repetitions and the place", () => {
    const short = one("accorcia quella di domani a 45 minuti").reply.confirm as { type: string; secs: number };
    expect(short).toMatchObject({ type: "update_workout" });
    expect(Math.abs(short.secs - 45 * 60)).toBeLessThanOrEqual(5 * 60);
    expect((one("allunga la lunga a 4 ore").reply.confirm as { secs: number }).secs).toBeGreaterThan(200 * 60);
    expect(one("la soglia falla con 2 ripetute").reply.text).toMatch(/2 ripetute/);
    expect(one("domani fallo sui rulli").reply.confirm).toMatchObject({ type: "update_workout", indoor: true });
    expect(one(`e se piove ${SOGLIA}?`).reply.confirm).toMatchObject({ type: "update_workout", indoor: true });
  });
});

describe("the coach's notions", () => {
  const cases: [string, string][] = [
    ["come miglioro in salita?", "salita"],
    ["vorrei andare più forte in salita, cosa mi consigli?", "salita"],
    ["posso fare pesi il giorno prima della lunga?", "palestra"],
    ["è meglio fare palestra prima o dopo la bici?", "palestra"],
    ["quanto mangio in una lunga?", "mangiare_uscita"],
    ["ho il raffreddore, posso allenarmi?", "malato_allenarsi"],
    ["come gestisco il vento?", "vento"],
    ["perché devo fare così tanta z2?", "z2_perche"],
    ["mi formicolano le mani", "mani_piedi"],
    ["come dormo meglio?", "sonno_quanto"],
    ["che differenza c'è tra rulli e strada?", "rulli_fuori"],
    ["perché sui rulli la ftp è più bassa?", "rulli_fuori"],
    ["quante proteine devo mangiare?", "proteine"],
    ["come faccio lo scarico prima della gara?", "tapering"],
    ["come si fanno le curve in discesa?", "discesa"],
    ["quanto devo bere col caldo?", "caldo"],
    ["come alzo la mia ftp?", "soglia_migliorare"],
    ["non miglioro più", "ftp_stallo"],
    ["quanta caffeina prima della gara?", "caffeina"],
    ["sono sempre stanco da giorni", "sovrallenamento"],
    ["mi sento senza energie da una settimana", "sovrallenamento"],
    ["mi viene sempre il crampo al polpaccio", "crampi"],
    ["a che pressione gonfio le gomme?", "gomme"],
    ["alla mia età recupero più lentamente?", "eta"],
    ["domani gara, consigli?", "gara_giorno"],
    ["devo dimagrire 3 chili", "peso"],
    ["cosa mangio a colazione prima della lunga?", "colazione"],
    ["cosa faccio dopo una caduta?", "caduta"],
    ["mi piacerebbe fare una granfondo a giugno", "granfondo"],
    ["devo fare stretching?", "stretching"],
    ["quante ore devo allenarmi?", "quante_ore"],
    ["come miglioro lo sprint?", "sprint_migliorare"],
    ["serve il core per la bici?", "core"],
    ["come regolo l'altezza della sella?", "sella_altezza"],
    ["ho sempre l'hrv bassa, cosa faccio?", "hrv_bassa"],
    ["come riparto dopo le ferie?", "rientro"],
    ["che cadenza devo tenere?", "cadenza"],
    ["come gestisco una crono?", "crono"],
    ["come si sta a ruota?", "gruppo"],
    ["con la pioggia esco?", "pioggia"],
    ["come mi vesto col freddo?", "freddo"],
    ["quali integratori servono?", "integratori"],
    ["mi viene mal di pancia quando mangio in bici", "train_gut"],
  ];
  it.each(cases)("«%s» → %s", (phrase, id) => {
    expect(notion(phrase)).toBe(id);
  });
  it("every notion answers its own examples and has the athlete's numbers where it says so", () => {
    for (const n of NOTIONS) {
      const r = n.say(ctx);
      expect(r.text.length, n.id).toBeGreaterThan(10);
      expect(r.lines.length, n.id).toBeGreaterThan(0);
      expect(all({ reply: { text: r.text, lines: r.lines }, state: emptyState() }), n.id).not.toMatch(/undefined|NaN|\bnull\b/);
    }
    expect(all(one("come miglioro in salita?"))).toMatch(/W\/kg/);
  });
  it("a pain gets today's change and the coach's notes on that part", () => {
    const r = one("mi fa un po' male il ginocchio");
    expect(r.overrides?.feeling?.drop).toBe(true);
    expect(all(r)).toMatch(/sella|rotula/);
  });
  it("a fever with dates is still recorded, not explained", () => {
    expect(one("ho la febbre da ieri").reply.confirm).toMatchObject({ type: "life_add" });
  });
});

describe("when it is not sure", () => {
  it("asks with the closest phrases instead of guessing", () => {
    const r = one("boh ciclismo e cose");
    expect(r.reply.choices?.length ?? r.reply.chips?.length).toBeGreaterThan(0);
  });
});
