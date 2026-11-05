import { describe, expect, it } from "vitest";
import { normalize, parseDates, parseHours, parseMinutes, parseRpe, sayDate, sayRange, weekdayFrom } from "./text";

// Thursday 5 November 2026.
const T = "2026-11-05";

describe("normalize", () => {
  it("lowers, strips accents and punctuation", () => {
    expect(normalize("Così, un'ora e mezza!")).toBe("cosi un ora e mezza");
    expect(normalize("  Perché  SOGLIA?? ")).toBe("perche soglia");
  });
});

describe("parseDates", () => {
  it("reads ranges with a month, with slashes and with two months", () => {
    expect(parseDates("ferie dal 10 al 20 dicembre", T)).toEqual({ from: "2026-12-10", to: "2026-12-20" });
    expect(parseDates("sono via dal 10/12 al 20/12", T)).toEqual({ from: "2026-12-10", to: "2026-12-20" });
    expect(parseDates("dal 28 novembre al 3 dicembre", T)).toEqual({ from: "2026-11-28", to: "2026-12-03" });
    expect(parseDates("Trasferta il 14 e 15 novembre", T)).toEqual({ from: "2026-11-14", to: "2026-11-15" });
  });
  it("reads one day: words, weekdays, day and month", () => {
    expect(parseDates("domani", T)).toEqual({ from: "2026-11-06", to: "2026-11-06" });
    expect(parseDates("dopodomani", T)).toEqual({ from: "2026-11-07", to: "2026-11-07" });
    expect(parseDates("ieri", T)).toEqual({ from: "2026-11-04", to: "2026-11-04" });
    expect(parseDates("martedì", T)).toEqual({ from: "2026-11-10", to: "2026-11-10" });
    expect(parseDates("il 14 novembre", T)).toEqual({ from: "2026-11-14", to: "2026-11-14" });
    expect(parseDates("il 3/1", T)).toEqual({ from: "2027-01-03", to: "2027-01-03" });
  });
  it("reads 'da', 'fino a' and 'per N giorni'", () => {
    expect(parseDates("sono malato da ieri", T, { past: true })).toEqual({ from: "2026-11-04", to: "2026-11-05" });
    expect(parseDates("ho la febbre da martedì", T, { past: true })).toEqual({ from: "2026-11-03", to: "2026-11-05" });
    expect(parseDates("fino a domenica", T)).toEqual({ from: T, to: "2026-11-08" });
    expect(parseDates("da lunedì a venerdì", T)).toEqual({ from: "2026-11-09", to: "2026-11-13" });
    expect(parseDates("per 3 giorni", T)).toEqual({ from: T, to: "2026-11-07" });
    expect(parseDates("da domani per due settimane", T)).toEqual({ from: "2026-11-06", to: "2026-11-19" });
  });
  it("reads weeks and the weekend", () => {
    expect(parseDates("questa settimana", T)).toEqual({ from: "2026-11-02", to: "2026-11-08" });
    expect(parseDates("la settimana prossima", T)).toEqual({ from: "2026-11-09", to: "2026-11-15" });
    expect(parseDates("nel weekend", T)).toEqual({ from: "2026-11-07", to: "2026-11-08" });
  });
  it("finds nothing in a phrase without dates, and refuses an impossible day", () => {
    expect(parseDates("come sto", T)).toBeNull();
    expect(parseDates("il 31 febbraio", T)).toBeNull();
  });
});

describe("parseMinutes, parseHours, parseRpe, weekdayFrom", () => {
  it("reads durations", () => {
    expect(parseMinutes("ho 45 minuti")).toBe(45);
    expect(parseMinutes("un'ora e mezza")).toBe(90);
    expect(parseMinutes("mezz'ora")).toBe(30);
    expect(parseMinutes("2 ore")).toBe(120);
    expect(parseMinutes("due ore")).toBe(120);
    expect(parseMinutes("1h30")).toBe(90);
    expect(parseMinutes("1:15")).toBe(75);
    expect(parseMinutes("niente di tutto questo")).toBeNull();
  });
  it("reads hours per week, the RPE and the weekday", () => {
    expect(parseHours("solo 5 ore")).toBe(5);
    expect(parseHours("massimo dieci ore")).toBe(10);
    expect(parseRpe("RPE 8")).toBe(8);
    expect(parseRpe("è stato un 7 su 10")).toBe(7);
    expect(parseRpe("rpe 14")).toBeNull();
    expect(weekdayFrom("il martedì non posso")).toBe(1);
    expect(weekdayFrom("la domenica lunga")).toBe(6);
  });
});

describe("saying dates", () => {
  it("writes them the Italian way", () => {
    expect(sayDate("2026-11-05")).toBe("giovedì 5 novembre");
    expect(sayRange("2026-12-10", "2026-12-20")).toBe("dal 10 al 20 dicembre");
    expect(sayRange("2026-11-14", "2026-11-14")).toBe("il 14 novembre");
    expect(sayRange("2026-11-28", "2026-12-03")).toBe("dal 28 novembre al 3 dicembre");
    expect(sayRange("2027-06-14", "2027-08-08")).toBe("dal 14 giugno all'8 agosto");
    expect(sayRange("2027-08-08", "2027-08-08")).toBe("l'8 agosto");
    expect(sayRange("2027-03-10", "2027-03-11")).toBe("dal 10 all'11 marzo");
  });
});
