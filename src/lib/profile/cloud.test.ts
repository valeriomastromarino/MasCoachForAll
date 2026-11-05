import { describe, expect, it } from "vitest";
import { CLOUD_NOTE, CLOUD_TEST, type CloudPayload, decodeCloud, encodeCloud, isCloudPayload, mergeWithCloud } from "./cloud";

const payload: CloudPayload = {
  version: 1,
  savedAt: "2026-11-05T10:00:00.000Z",
  profile: { disciplina: "Strada", giorni: [1, 3, 5], forte: ["Scatti e ripartenze"] },
  phenotype: "glicolitico",
  sheet: "# Scheda atleta — Test\n- Età: 40\n\nTesto con il segno --- e righe.",
  season: { start: "2026-11-05", horizonWeeks: 40, raceA: null, peak: { start: "2027-06-14", weeks: 8 }, ramp: "prudente", stops: [{ from: "2026-11-14", to: "2026-11-15", label: "Viaggio" }], maxHours: 8 },
};

describe("cloud copy", () => {
  it("round-trips the sheet and the season through the note text", () => {
    const text = encodeCloud(payload);
    expect(text).toContain("# Scheda atleta — Test");
    expect(decodeCloud(text)).toEqual(payload);
  });
  it("keeps the readable sheet first and the JSON last", () => {
    const text = encodeCloud(payload);
    expect(text.indexOf("# Scheda atleta")).toBeLessThan(text.indexOf("---MASCOACH-JSON---"));
  });
  it("writes a placeholder when there is no sheet yet, and reads a season-only copy", () => {
    const only: CloudPayload = { ...payload, profile: null, sheet: null, phenotype: null };
    const text = encodeCloud(only);
    expect(text).toContain("non ancora compilata");
    expect(decodeCloud(text)?.season?.peak?.weeks).toBe(8);
  });
  it("does not read what is not ours, or damaged", () => {
    expect(decodeCloud(null)).toBeNull();
    expect(decodeCloud("una nota qualsiasi")).toBeNull();
    expect(decodeCloud("---MASCOACH-JSON---\n{rotto")).toBeNull();
    expect(decodeCloud('---MASCOACH-JSON---\n{"version":2}')).toBeNull();
  });
  it("validates what the API accepts", () => {
    expect(isCloudPayload(payload)).toBe(true);
    expect(isCloudPayload({ ...payload, version: 2 })).toBe(false);
    expect(isCloudPayload(null)).toBe(false);
    expect(isCloudPayload({ version: 1, savedAt: 3 })).toBe(false);
  });
  it("keeps the test note apart from the real one", () => {
    expect(CLOUD_TEST.externalId).not.toBe(CLOUD_NOTE.externalId);
    expect(CLOUD_TEST.date).not.toBe(CLOUD_NOTE.date);
  });
});

describe("mergeWithCloud", () => {
  const empty: CloudPayload = { version: 1, savedAt: "2026-12-01T10:00:00.000Z", profile: null, phenotype: null, sheet: null, season: null };
  it("keeps the saved sheet when a fresh install saves only a season", () => {
    const local = { ...empty, season: payload.season };
    const m = mergeWithCloud(local, payload);
    expect(m.profile).toEqual(payload.profile);
    expect(m.sheet).toBe(payload.sheet);
    expect(m.phenotype).toBe("glicolitico");
    expect(m.season).toEqual(payload.season);
  });
  it("keeps the saved season when only the sheet is saved", () => {
    const local = { ...empty, profile: { disciplina: "MTB XC" }, sheet: "# nuova", phenotype: "diesel" as const };
    const m = mergeWithCloud(local, payload);
    expect(m.profile).toEqual({ disciplina: "MTB XC" });
    expect(m.sheet).toBe("# nuova");
    expect(m.season).toEqual(payload.season);
  });
  it("lets a cleared plan really clear it, and writes as is when there is no copy yet", () => {
    expect(mergeWithCloud(empty, payload, { seasonCleared: true }).season).toBeNull();
    expect(mergeWithCloud(empty, payload).season).toEqual(payload.season);
    expect(mergeWithCloud(empty, null)).toEqual(empty);
  });
});
