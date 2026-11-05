import { beforeEach, describe, expect, it } from "vitest";
import { clearProfile, isSkipped, loadDraft, loadProfile, saveDraft, saveProfile, sheetText, skipFirstRun, type SheetAthlete } from "./profile";

const memory = new Map<string, string>();
beforeEach(() => {
  memory.clear();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => memory.get(k) ?? null,
    setItem: (k: string, v: string) => void memory.set(k, v),
    removeItem: (k: string) => void memory.delete(k),
  };
});

const athlete: SheetAthlete = { name: "Test", weight: 70, ftp: 250, indoorFtp: 240, lthr: 160, maxHr: 180, wPrime: 20000, cpValid: false, cp: 240 };

describe("profile storage", () => {
  it("keeps the sheet and clears the draft once saved", () => {
    saveDraft({ step: 5, profile: { disciplina: "Strada" } });
    expect(loadDraft()?.step).toBe(5);
    saveProfile({ disciplina: "Strada", giorni: [1, 3] }, "# Scheda", "glicolitico", new Date("2026-11-05T10:00:00Z"));
    expect(loadProfile()).toEqual({ savedAt: "2026-11-05", profile: { disciplina: "Strada", giorni: [1, 3] }, sheet: "# Scheda", phenotype: "glicolitico" });
    expect(loadDraft()).toBeNull();
  });
  it("remembers a skipped first launch until the sheet is saved or cleared", () => {
    skipFirstRun();
    expect(isSkipped()).toBe(true);
    saveProfile({}, "");
    expect(isSkipped()).toBe(false);
    clearProfile();
    expect(loadProfile()).toBeNull();
  });
  it("survives corrupted storage", () => {
    memory.set("mascoach-profile", "{not json");
    expect(loadProfile()).toBeNull();
  });
});

describe("sheetText", () => {
  it("fills the coach sheet with the answers and the numbers read from Intervals", () => {
    const text = sheetText(
      { disciplina: "Strada", disciplina2: "MTB", giorni: [1, 3, 5], oreSettimana: "8-12", forte: ["Scatti e ripartenze"], mangia: "Gel e barrette", carboTollerati: "60-90" },
      athlete,
      null,
      "2026-11-05",
    );
    expect(text).toContain("# Scheda atleta — Test");
    expect(text).toContain("Aggiornata al: 2026-11-05");
    expect(text).toContain("Disciplina attiva: Strada | secondaria: MTB");
    expect(text).toContain("Giorni disponibili: Mar, Gio, Sab");
    expect(text).toContain("FTP impostata: 250 W (outdoor), 240 W (rulli)");
    expect(text).toContain("serve il test CP classico");
    expect(text).toContain("Carboidrati tollerati: 60-90 g/h");
  });
  it("writes a dash for what was left empty instead of breaking", () => {
    const text = sheetText({}, { ...athlete, weight: null, wPrime: null, cp: null, cpValid: null }, null, "2026-11-05");
    expect(text).toContain("Peso: – kg");
    expect(text).toContain("Gara A: –");
    expect(text).not.toContain("undefined");
  });
});
