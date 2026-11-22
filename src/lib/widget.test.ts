import { describe, expect, it } from "vitest";
import type { CalendarWorkout, LibraryWorkout } from "./calendar";
import { buildDashboard, type DashboardData } from "./dashboard";
import { demoData } from "./demo";
import { buildWidget, dayText, minsText, signed, type WidgetInput } from "./widget";

let n = 0;
/** Blocks are [minutes, zone] pairs. */
function wk(name: string, blocks: [number, number][], tss: number): LibraryWorkout {
  return { id: ++n, name, type: "Ride", secs: blocks.reduce((s, b) => s + b[0] * 60, 0), tss, description: null, blocks: blocks.map(([m, zone]) => ({ secs: m * 60, zone })) };
}
const rep = (k: number, work: [number, number], rest: [number, number]) => Array.from({ length: k }, () => [work, rest]).flat() as [number, number][];
const LIB: LibraryWorkout[] = [
  wk("Active Recovery Spin 45", [[5, 1], [35, 1], [5, 1]], 14),
  wk("Zone 2 Endurance 90", [[10, 2], [70, 2], [10, 1]], 62),
  wk("Zone 2 Endurance 60 Indoor", [[10, 2], [45, 2], [5, 1]], 38),
  wk("Threshold 3x10 Indoor", [[15, 2], ...rep(3, [10, 4], [5, 1]), [10, 1]], 75),
  wk("VO2 Max 5x4", [[15, 2], ...rep(5, [4, 5], [4, 1]), [10, 1]], 88),
];

const demo = demoData(120);
const dash0 = buildDashboard(demo, 90);
const today = dash0.today;
/** The demo day without rides today (a ride done replaces the plan) and with the verdict asked for. */
function day(level: DashboardData["status"]["readiness"]["level"] = "verde"): DashboardData {
  const headline = { verde: "Pronto", giallo: "Riduci l'intensità", rosso: "Recupero", grigio: "Dati insufficienti" }[level];
  return {
    ...dash0,
    activities: dash0.activities.filter((a) => a.date.slice(0, 10) !== today),
    status: { ...dash0.status, tsbYesterday: -5, readiness: { ...dash0.status.readiness, level, headline } },
  };
}
const planned = (name: string, over: Partial<CalendarWorkout> = {}): CalendarWorkout => {
  const w = LIB.find((x) => x.name === name)!;
  return { ...w, id: "e1", date: today, coach: null, ...over };
};
const input = (over: Partial<WidgetInput> = {}): WidgetInput => ({
  dash: day(),
  library: LIB,
  planned: [],
  setup: null,
  profile: null,
  phenotype: null,
  life: [],
  from: "app",
  now: new Date(`${today}T07:00:00Z`),
  ...over,
});

describe("widget summary", () => {
  it("has the verdict, the bar and the numbers of the night, with the 7-day HRV the app shows", () => {
    const w = buildWidget(input({ dash: day("giallo") }));
    expect(w.v).toBe(2);
    expect(w).toMatchObject({ date: today, day: dayText(today), level: "giallo", word: "Riduci", headline: "Riduci l'intensità", short: "Meglio Z2 oggi", seg: 1 });
    const hrv7 = Math.round(Math.exp(dash0.status.hrv.baseline7!));
    expect(w.hrv?.value).toBe(hrv7);
    expect(w.nums.startsWith(`HRV ${hrv7}`)).toBe(true);
    expect(w.hrv?.nights).toHaveLength(7);
    expect(w.hrv?.n14).toHaveLength(14);
    expect(w.form?.days).toHaveLength(14);
    expect(w.why.length).toBeGreaterThan(10);
    // Small: it travels to the phone and sits in its preferences.
    expect(JSON.stringify(w).length).toBeLessThan(6000);
  });

  it("tells why in a line: an anomalous night says what HRV and resting HR did", () => {
    const d = day("giallo");
    const dash: DashboardData = {
      ...d,
      sleep: d.sleep.map((x) => ({ ...x, hours: 7.5 })),
      status: { ...d.status, autonomic: { ...d.status.autonomic, pattern: "fc_alta", anomalyToday: true, anomalyStreak: 1 } },
    };
    expect(buildWidget(input({ dash })).why).toBe("Stanotte HRV bassa e FC a riposo alta");
    const calm = { ...dash, status: { ...dash.status, hrv: { ...dash.status.hrv, acuteDrop: false }, autonomic: { ...dash.status.autonomic, pattern: "stabile" as const, anomalyToday: false, anomalyStreak: 0 } } };
    expect(buildWidget(input({ dash: calm })).why).toBe("HRV e FC a riposo nella tua norma");
  });

  it("an outdoor ride that suits the day opens Oggi with «Dettagli», never the player", () => {
    const w = buildWidget(input({ planned: [planned("Zone 2 Endurance 90")] }));
    expect(w.session).toMatchObject({ kind: "planned", label: "Oggi · fuori", title: "Zone 2 Endurance 90", warn: null, action: { label: "Dettagli", icon: "right", route: "/" } });
    expect(w.session.blocks.length).toBe(3);
  });

  it("a session on the trainer that suits the day: «Pedala» opens it in the player", () => {
    const w = buildWidget(input({ planned: [planned("Zone 2 Endurance 60 Indoor", { id: "e7", indoor: true })] }));
    expect(w.session).toMatchObject({ kind: "planned", label: "Oggi · sui rulli", action: { label: "Pedala", icon: "play", route: "/rulli/e7" } });
  });

  it("a hard session on a yellow day: a warning, what to do instead, and no «Pedala»", () => {
    const w = buildWidget(input({ dash: day("giallo"), planned: [planned("VO2 Max 5x4", { id: "e9", indoor: true })] }));
    expect(w.session.kind).toBe("planned");
    expect(w.session.warn).toBe("Non adatta a oggi");
    expect(w.session.why).toMatch(/Prontezza gialla/);
    expect(w.session.better).toMatch(/^Meglio /);
    expect(w.session.action).toEqual({ label: "Vedi cosa fare", icon: "right", route: "/" });
  });

  it("an empty day shows the engine's proposal, the one of the Oggi card", () => {
    const w = buildWidget(input({ overrides: { date: today, wantClass: "z2" } }));
    expect(w.session).toMatchObject({ kind: "proposal", label: "Proposta di MasCoach", action: { label: "Vedi proposta", route: "/" } });
    expect(w.session.title).toMatch(/Zone 2 Endurance/);
    expect(w.session.metaLong).toMatch(/non è su Intervals$/);
  });

  it("weights on the calendar are not a ride", () => {
    const w = buildWidget(input({ planned: [{ ...planned("Zone 2 Endurance 90"), type: "WeightTraining", name: "Pesi" }] }));
    expect(w.session.kind).not.toBe("planned");
    expect(w.session.title).not.toBe("Pesi");
  });

  it("a ride done today replaces the plan and opens the ride", () => {
    const ride = { ...dash0.activities[0], id: "i123", date: `${today}T09:10:00`, name: "Giro del lago", category: "strada" as const, movingTime: 7380, tss: 95, distanceKm: 61.4 };
    const w = buildWidget(input({ dash: { ...day(), activities: [ride] }, planned: [planned("Zone 2 Endurance 90")] }));
    expect(w.session).toMatchObject({ kind: "done", label: "Fatto oggi", title: "Giro del lago", meta: "2 h 03", metaLong: "2 h 03 · TSS 95 · 61,4 km", route: "/attivita/i123" });
  });

  it("rest asked in the chat for today: riposo, and the plan opens", () => {
    const w = buildWidget(input({ overrides: { date: today, restToday: true } }));
    expect(w.session).toMatchObject({ kind: "rest", title: "Riposo", action: { icon: "calendar", route: "/calendario" } });
  });

  it("without the library it does not say «riposo»: the app's card knows more", () => {
    const w = buildWidget(input({ library: [], from: "sito" }));
    expect(w.session).toMatchObject({ kind: "rest", title: "Niente in programma", route: "/" });
    expect(w.from).toBe("sito");
  });

  it("writes times and numbers as the app does", () => {
    expect(minsText(120)).toBe("2 h 00");
    expect(minsText(65)).toBe("1 h 05");
    expect(minsText(55)).toBe("55′");
    expect(signed(-14)).toBe("−14");
    expect(signed(3)).toBe("+3");
    expect(dayText("2026-11-22")).toBe("dom 22 nov");
  });
});
