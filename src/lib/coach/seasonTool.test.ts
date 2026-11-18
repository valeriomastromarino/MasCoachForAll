import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleApi, type LibraryData } from "../api/handlers";
import type { LibraryWorkout } from "../calendar";
import type { DashboardData } from "../dashboard";
import { addDays, weekStart } from "../dates";
import type { CloudPayload } from "../profile/cloud";
import { zoneOfFraction } from "../workout";
import { seasonPlanView } from "./seasonTool";
import { libraryView } from "./tools";

beforeEach(() => {
  vi.stubEnv("INTERVALS_API_KEY", "");
});

let id = 0;
/** Blocks as [minutes, fraction of FTP]. */
function wp(name: string, blocks: [number, number][], tss: number): LibraryWorkout {
  return { id: ++id, name, type: "Ride", secs: Math.round(blocks.reduce((s, b) => s + b[0] * 60, 0)), tss, description: `- testo di ${name}`, blocks: blocks.map(([m, pct]) => ({ secs: Math.round(m * 60), zone: zoneOfFraction(pct), pct })) };
}
const rep = (n: number, work: [number, number], rest: [number, number]) => Array.from({ length: n }, () => [work, rest]).flat() as [number, number][];
const LIB: LibraryData = {
  folders: [
    {
      id: 1,
      name: "Workouts",
      workouts: [
        wp("Recovery 45", [[45, 0.5]], 18),
        wp("Zone 2 Endurance 90", [[10, 0.55], [70, 0.68], [10, 0.5]], 63),
        wp("Zone 2 Endurance 120", [[15, 0.55], [95, 0.68], [10, 0.5]], 85),
        wp("VO2 5x3 Indoor", [[15, 0.6], ...rep(5, [3, 1.15], [3, 0.5]), [10, 0.5]], 62),
        wp("Sweet Spot 2x20 Indoor", [[10, 0.6], ...rep(2, [20, 0.9], [5, 0.5]), [5, 0.5]], 64),
        wp("Threshold 2x15 Indoor", [[12, 0.6], ...rep(2, [15, 0.98], [5, 0.5]), [8, 0.5]], 66),
      ],
    },
    { id: 2, name: "MasCoach Coach", workouts: [wp("Lunga Z2 3h", [[15, 0.55], [150, 0.68], [15, 0.5]], 130)] },
  ],
};

describe("libreria_allenamenti", () => {
  it("without filters lists every workout on one line, without the text", () => {
    const v = libraryView(LIB, {}) as { totale: number; cartelle: { cartella: string; allenamenti: string[] }[] };
    expect(v.totale).toBe(7);
    expect(v.cartelle[1]).toEqual({ cartella: "MasCoach Coach", allenamenti: ["Lunga Z2 3h · 180' · TSS 130 · fondo Z2 · fuori"] });
    expect(JSON.stringify(v)).not.toContain("testo di");
  });

  it("filters by type, duration, place, name and folder, with the text and the library id", () => {
    const by = (args: Record<string, unknown>) => (libraryView(LIB, args) as { allenamenti: { nome: string; id_libreria: number; testo: string | null }[] }).allenamenti.map((w) => w.nome);
    expect(by({ tipo: "z2" })).toEqual(["Zone 2 Endurance 90", "Zone 2 Endurance 120", "Lunga Z2 3h"]);
    expect(by({ tipo: "z2", minuti_min: 150 })).toEqual(["Lunga Z2 3h"]);
    expect(by({ minuti_max: 50 })).toEqual(["Recovery 45"]);
    expect(by({ minuti_max: 60 })).toEqual(["Recovery 45", "VO2 5x3 Indoor", "Threshold 2x15 Indoor"]);
    expect(by({ luogo: "rulli" })).toEqual(["VO2 5x3 Indoor", "Threshold 2x15 Indoor", "Sweet Spot 2x20 Indoor"]);
    expect(by({ nome_contiene: "threshold" })).toEqual(["Threshold 2x15 Indoor"]);
    expect(by({ cartella: "mascoach" })).toEqual(["Lunga Z2 3h"]);
    // The type can also be given as the app says it.
    expect(by({ tipo: "soglia" })).toEqual(["Threshold 2x15 Indoor"]);
    const one = (libraryView(LIB, { nome_contiene: "lunga" }) as { allenamenti: { id_libreria: number; testo: string }[] }).allenamenti[0];
    expect(one.testo).toBe("- testo di Lunga Z2 3h");
    expect(one.id_libreria).toBeGreaterThan(0);
    expect(() => libraryView(LIB, { tipo: "nuoto" })).toThrow(/tipo/);
    expect(() => libraryView(LIB, { luogo: "garage" })).toThrow(/luogo/);
  });

  it("past the limit shows a spread over the durations", () => {
    const v = libraryView(LIB, { minuti_min: 0, massimo: 3 }) as { trovati: number; mostrati: number; allenamenti: { durata_min: number }[] };
    expect(v).toMatchObject({ trovati: 7, mostrati: 3 });
    expect(v.allenamenti.at(-1)!.durata_min).toBeGreaterThan(v.allenamenti[0].durata_min);
  });
});

describe("piano_stagione", () => {
  const dashboard = async () => (await handleApi("GET", "/api/dashboard")).json as DashboardData;

  it("says so when the app has no season", async () => {
    const dash = await dashboard();
    const payload: CloudPayload = { version: 1, savedAt: "2026-11-12T10:00:00Z", profile: null, phenotype: null, sheet: null, season: null };
    expect(seasonPlanView({ payload, dash, library: LIB, calendar: [], life: [], weeks: 12 })).toMatchObject({ disponibile: false });
  });

  it("gives the levers, the weeks, the fixed days and the app's next seven days", async () => {
    const dash = await dashboard();
    const today = dash.today;
    const monday = weekStart(today);
    const nextMonday = addDays(monday, 7);
    const payload: CloudPayload = {
      version: 1,
      savedAt: "2026-11-12T10:00:00Z",
      profile: { giorni: [1, 2, 3, 5, 6], lunga: "Domenica", intervalliDove: "Rulli", z2Dove: "Fuori", ruliMax: "1 h", durataFeriali: "2 h", durataWeekend: "5 h" },
      phenotype: null,
      sheet: null,
      season: {
        start: monday,
        horizonWeeks: 20,
        raceA: { date: addDays(monday, 7 * 18 + 5), name: "Granfondo" },
        peak: null,
        ramp: "prudente",
        stops: [],
        maxHours: 10,
        lightWeeks: [addDays(monday, 21)],
        blockWeeks: [addDays(monday, 35)],
        weekPlans: { [nextMonday]: [{ date: addDays(nextMonday, 1), id: LIB.folders[0].workouts[3].id, mine: true }] },
      },
    };
    const v = seasonPlanView({ payload, dash, library: LIB, calendar: [], life: [], weeks: 8 }) as Record<string, unknown> & {
      leve: { settimane_leggere_chieste: string[]; settimane_di_blocco_chieste: string[] };
      settimane: { da: string; fase: string; tipo: string; qualita_max: number; duri_max: number; blocco?: boolean; fissata_dall_atleta?: boolean }[];
      giorni_fissati: { settimana_dal: string; giorni: { allenamento: string; scelto_dall_atleta: boolean }[] }[];
      prossimi_7_giorni: { data: string; stato: string }[];
    };
    expect(v.disponibile).toBe(true);
    expect(v.leve.settimane_leggere_chieste).toEqual([addDays(monday, 21)]);
    expect(v.leve.settimane_di_blocco_chieste).toEqual([addDays(monday, 35)]);
    expect(v.settimane).toHaveLength(8);
    expect(v.settimane[0]).toMatchObject({ da: monday, fase: "Base 1" });
    expect(v.settimane.find((w) => w.da === addDays(monday, 21))?.tipo).toBe("leggera");
    expect(v.settimane.find((w) => w.da === addDays(monday, 35))).toMatchObject({ blocco: true, qualita_max: 3 });
    expect(v.settimane.find((w) => w.da === nextMonday)?.fissata_dall_atleta).toBe(true);
    expect(v.giorni_fissati).toEqual([{ settimana_dal: nextMonday, giorni: [{ data: addDays(nextMonday, 1), allenamento: "VO2 5x3 Indoor", scelto_dall_atleta: true }] }]);
    expect(v.prossimi_7_giorni.map((d) => d.data)).toEqual(Array.from({ length: 7 }, (_, i) => addDays(today, i)));
    for (const d of v.prossimi_7_giorni) expect(d.stato).toBeTruthy();
  });
});
