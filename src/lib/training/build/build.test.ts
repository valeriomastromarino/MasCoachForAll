import { describe, expect, it } from "vitest";
import { composeInsert, composeNew } from "./compose";
import { parseIntervalsText, toIntervalsText } from "./intervalsText";
import { estimateTss, totalSecs } from "./model";
import { parseSpec, prepare } from "./parse";

const TODAY = "2026-11-19"; // a Thursday
const ftp = 250;
const build = (text: string, extra: Parameters<typeof composeNew>[1] = { ftp }) => composeNew(parseSpec(text, TODAY), extra);

describe("reading the athlete's words", () => {
  it("writes minutes and seconds as words, keeping % and 30/30", () => {
    expect(prepare("3x12' Sweet Spot, rec 5' al 90%")).toBe("3x12min sweet spot rec 5min al 90%");
    expect(prepare("5×30\"/30\" un'ora e mezza")).toBe("5x30sec/30sec 90min");
  });

  it("finds repeats, intensity, recovery, day and place", () => {
    const s = parseSpec("domani sui rulli 3x12' sweet spot recupero 5'", TODAY);
    expect(s.date).toBe("2026-11-20");
    expect(s.place).toBe("indoor");
    expect(s.sets).toHaveLength(1);
    expect(s.sets[0]).toMatchObject({ reps: 3, workSecs: 720, work: { kind: "band", band: "sweetspot" }, recSecs: 300 });
  });

  it("reads percentages, watts, «volte», «ripetute da» and on/off", () => {
    expect(parseSpec("4x4' al 115% rec 4'", TODAY).sets[0]).toMatchObject({ reps: 4, workSecs: 240, work: { kind: "pct", lo: 1.15, hi: 1.15 }, recSecs: 240 });
    expect(parseSpec("5 volte 4 minuti a 300-310 w con 4 minuti di recupero", TODAY).sets[0]).toMatchObject({ reps: 5, workSecs: 240, work: { kind: "watts", lo: 300, hi: 310 }, recSecs: 240 });
    expect(parseSpec("6 ripetute da 3' in salita al 110%", TODAY).sets[0]).toMatchObject({ reps: 6, workSecs: 180 });
    expect(parseSpec("10x30/30 al 120%", TODAY).sets[0]).toMatchObject({ reps: 10, workSecs: 30, recSecs: 30, work: { kind: "pct", lo: 1.2 } });
    expect(parseSpec("40 on 20 off per 10 volte", TODAY).sets[0]).toMatchObject({ workSecs: 40, recSecs: 20 });
  });

  it("reads the ride around the work and where it goes", () => {
    const s = parseSpec("sabato 2 ore fuori con 5x30/30 a tutta a metà", TODAY);
    expect(s).toMatchObject({ date: "2026-11-21", place: "outdoor", totalMins: 120, where: "meta" });
    expect(parseSpec("90' z2 con 2x15' tempo nel finale", TODAY)).toMatchObject({ totalMins: 90, where: "fine", base: { kind: "band", band: "z2" } });
    expect(parseSpec("3x10 soglia, riscaldamento 20', senza defaticamento", TODAY)).toMatchObject({ warmupMins: 20, cooldownMins: 0 });
  });

  it("tells a session asked by type, and one with too little to build", () => {
    expect(parseSpec("dammi una soglia da 60'", TODAY).vague).toEqual({ cls: "soglia", mins: 60 });
    expect(parseSpec("giovedì ripetute in salita", TODAY).incomplete).toBe(true);
    expect(parseSpec("6 sprint", TODAY).sets[0]).toMatchObject({ reps: 6, workSecs: 10, spread: true });
  });
});

describe("building the session", () => {
  it("adds warm-up and cool-down, names it and estimates the load", () => {
    const c = build("domani sui rulli 3x12' sweet spot recupero 5'");
    expect(c.name).toBe("Sweet spot 3×12'");
    expect(c.sections.map((s) => [s.title, s.reps])).toEqual([["Riscaldamento", 1], ["Sweet spot", 3], ["Defaticamento", 1]]);
    expect(Math.round(c.secs / 60)).toBe(12 + 51 + 8);
    expect(c.cls).toBe("sweetspot");
    expect(c.tss).toBeGreaterThan(55);
    expect(c.tss).toBeLessThan(80);
    expect(toIntervalsText(c.sections)).toBe("Riscaldamento\n- 12m ramp 50-75%\n\nSweet spot 3x\n- 12m 88-93%\n- 5m 55%\n\nDefaticamento\n- 8m ramp 60-45%");
  });

  it("opens the legs before hard work and fills a long ride around it", () => {
    const vo2 = build("4x4' al 115% rec 4'");
    expect(vo2.sections[0].steps.map((s) => s.secs)).toEqual([600, 180, 120]);
    expect(vo2.name).toBe("VO2max 4×4'");
    const long = build("sabato 2 ore fuori con 2x15' tempo");
    expect(Math.round(long.secs / 60)).toBe(120);
    expect(long.name).toBe("Z2 2h con 2×15' tempo");
    expect(long.cls).toBe("z2");
    expect(long.assumptions.some((a) => a.includes("metà"))).toBe(true);
  });

  it("chooses the dose for a session asked by type, within its minutes", () => {
    const c = build("dammi una soglia da 60'", { ftp, phase: "base_3", step: 0.5 });
    expect(c.cls).toBe("soglia");
    expect(Math.round(c.secs / 60)).toBeLessThanOrEqual(62);
    expect(c.dose).toMatch(/Base 3/);
    const late = build("dammi una soglia", { ftp, phase: "build_2", step: 1 });
    expect(totalSecs(late.sections)).toBeGreaterThan(totalSecs(c.sections));
  });

  it("spreads sprints in a Z2 ride, away from the warm-up and the end", () => {
    const c = build("6 sprint");
    const sprints = c.sections.flatMap((s) => s.steps).filter((s) => s.target.lo >= 2);
    expect(sprints).toHaveLength(6);
    expect(c.name).toMatch(/^Z2 \d+' con 6 sprint$/);
  });

  it("says what it assumed", () => {
    const c = build("5x3'");
    expect(c.assumptions.join(" ")).toMatch(/Intensità non indicata: vo2max/i);
    expect(c.assumptions.join(" ")).toMatch(/Recupero non indicato/);
  });
});

describe("changing a session already on the calendar", () => {
  const z2 = "Riscaldamento\n- 10m ramp 50-70%\n\nBlocco principale\n- 70m Z2\n\nDefaticamento\n- 10m Z1";

  it("reads the Intervals.icu text back, repeats included", () => {
    const s = parseIntervalsText("Warm\n- 10m ramp 50-75%\n\nMain 3x\n- 12m 88-92%\n- 5m 220w\n\n- 10m 50%", ftp)!;
    expect(s.map((x) => [x.title, x.reps, x.steps.length])).toEqual([["Warm", 1, 1], ["Main", 3, 2], ["", 1, 1]]);
    expect(s[1].steps[1].target.lo).toBeCloseTo(0.88);
    expect(parseIntervalsText("- 10m 75% LTHR", ftp)).toBeNull();
  });

  it("puts 6 sprints in the Z2 of tomorrow's ride, same length", () => {
    const base = parseIntervalsText(z2, ftp)!;
    const c = composeInsert(base, "Z2 90", parseSpec("inseriscimi 6 sprint nella z2 di domani", TODAY), { ftp })!;
    expect(c).not.toBeNull();
    expect(totalSecs(c.sections)).toBe(totalSecs(base));
    const flat = c.sections.flatMap((s) => s.steps);
    expect(flat.filter((s) => s.target.lo >= 2)).toHaveLength(6);
    // Not in the first 15' nor the last 10'.
    let t = 0;
    for (const st of flat) {
      if (st.target.lo >= 2) {
        expect(t).toBeGreaterThanOrEqual(15 * 60);
        expect(t).toBeLessThanOrEqual(80 * 60);
      }
      t += st.secs;
    }
    expect(c.name).toBe("Z2 90 + 6 sprint");
    expect(parseIntervalsText(toIntervalsText(c.sections), ftp)).toEqual(c.sections.map((s) => ({ ...s, title: s.title })));
  });

  it("puts a block of tempo in the middle in place of the same Z2", () => {
    const base = parseIntervalsText(z2, ftp)!;
    const c = composeInsert(base, "Z2 90", parseSpec("aggiungi 2x10' tempo rec 5'", TODAY), { ftp })!;
    expect(totalSecs(c.sections)).toBe(totalSecs(base));
    expect(c.sections.some((s) => s.reps === 2 && s.title === "Tempo")).toBe(true);
    expect(estimateTss(c.sections)).toBeGreaterThan(estimateTss(base));
  });
});
