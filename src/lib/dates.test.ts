import { afterEach, describe, expect, it, vi } from "vitest";
import { addDays, todayIso, weekStart } from "./dates";

describe("dates", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("adds days and finds the Monday of a week", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(weekStart("2026-11-12")).toBe("2026-11-09");
  });

  it("on the server, today is the athlete's day, not the UTC one", () => {
    // Half past midnight in Italy is still the day before in UTC (winter: one hour, summer: two).
    expect(todayIso(new Date("2026-11-12T23:30:00Z"))).toBe("2026-11-13");
    expect(todayIso(new Date("2026-07-01T22:30:00Z"))).toBe("2026-07-02");
    expect(todayIso(new Date("2026-11-12T12:00:00Z"))).toBe("2026-11-12");
  });

  it("follows APP_TIMEZONE when it is set", () => {
    vi.stubEnv("APP_TIMEZONE", "America/New_York");
    expect(todayIso(new Date("2026-11-12T23:30:00Z"))).toBe("2026-11-12");
  });
});
