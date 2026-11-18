import { describe, expect, it } from "vitest";
import { buildDashboard } from "./dashboard";
import { demoData } from "./demo";
import { buildCalendar } from "./calendar";
import { addDays, toIsoDate } from "./dates";
import { buildWidget } from "./widget";

describe("widget summary", () => {
  it("summarises today from the dashboard and the calendar", () => {
    const demo = demoData(120);
    const today = demo.today;
    const dash = buildDashboard(demo, 90);
    const cal = buildCalendar(demo.activities, demo.events, today, today, null);
    const w = buildWidget(dash, cal, today, new Date(`${today}T06:00:00Z`));
    expect(w.v).toBe(1);
    expect(["verde", "giallo", "rosso", "grigio"]).toContain(w.level);
    expect(w.week).toHaveLength(7);
    expect(w.week.filter((d) => d.today)).toHaveLength(1);
    expect(JSON.stringify(w).length).toBeLessThan(2000);
    expect(toIsoDate(new Date(w.at))).toBe(today);
  });

  it("shows what was ridden yesterday (the rows carry the start time, not only the day)", () => {
    const demo = demoData(120);
    const today = demo.today;
    const dash = buildDashboard(demo, 90);
    const ride = { ...dash.activities[0], date: `${addDays(today, -1)}T17:30:00`, name: "VO2 5x3 Indoor", movingTime: 2700, tss: 45 };
    const w = buildWidget({ ...dash, activities: [ride] }, buildCalendar(demo.activities, demo.events, today, today, null), today);
    expect(w.yesterday).toEqual({ name: "VO2 5x3 Indoor", secs: 2700, tss: 45 });
  });
});
