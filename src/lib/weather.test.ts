import { describe, expect, it } from "vitest";
import { arrowRotation, compass, forecastUrl, kindOf, parseForecast, windWord } from "./weather";

describe("weather", () => {
  it("builds a daily forecast request for the position", () => {
    const u = new URL(forecastUrl(40.8512, 17.1234));
    expect(u.hostname).toBe("api.open-meteo.com");
    expect(u.searchParams.get("latitude")).toBe("40.851");
    expect(u.searchParams.get("longitude")).toBe("17.123");
    expect(u.searchParams.get("daily")).toContain("wind_direction_10m_dominant");
    expect(u.searchParams.get("wind_speed_unit")).toBe("kmh");
    expect(u.searchParams.get("forecast_days")).toBe("10");
  });

  it("groups WMO codes into the looks the app draws", () => {
    expect(kindOf(0)).toBe("sole");
    expect(kindOf(2)).toBe("variabile");
    expect(kindOf(3)).toBe("nuvoloso");
    expect(kindOf(45)).toBe("nebbia");
    expect(kindOf(61)).toBe("pioggia");
    expect(kindOf(81)).toBe("pioggia");
    expect(kindOf(73)).toBe("neve");
    expect(kindOf(95)).toBe("temporale");
  });

  it("reads the daily answer and skips days with missing values", () => {
    const days = parseForecast({
      daily: {
        time: ["2026-11-05", "2026-11-06", "2026-11-07"],
        weather_code: [0, 61, null],
        temperature_2m_max: [14.4, 11.6, 10],
        temperature_2m_min: [7.2, 6, 5],
        wind_speed_10m_max: [17.6, 22, 9],
        wind_gusts_10m_max: [31, 38, 15],
        wind_direction_10m_dominant: [225, 360, 90],
        precipitation_probability_max: [5, 80, 10],
      },
    });
    expect(days).toHaveLength(2);
    expect(days[0]).toMatchObject({ date: "2026-11-05", kind: "sole", label: "sereno", tMax: 14, tMin: 7, windKmh: 18, gustKmh: 31, windFrom: 225, rainPct: 5 });
    expect(days[1]).toMatchObject({ kind: "pioggia", windFrom: 0, rainPct: 80 });
    expect(parseForecast(null)).toEqual([]);
    expect(parseForecast({ daily: {} })).toEqual([]);
  });

  it("names the wind and points the arrow downwind", () => {
    expect(compass(225)).toBe("SO");
    expect(compass(0)).toBe("N");
    expect(compass(350)).toBe("N");
    expect(compass(90)).toBe("E");
    // From the south-west the wind goes north-east: an "up" arrow turned 45° clockwise.
    expect(arrowRotation(225)).toBe(45);
    expect(arrowRotation(0)).toBe(180);
    expect(windWord(8)).toBe("debole");
    expect(windWord(35)).toBe("forte");
  });
});
