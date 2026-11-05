// Weather and wind per day for the calendar: Open-Meteo's daily forecast (free, no key) for the athlete's position.
// Pure functions only: the request and the position live in components/data/weatherData.ts.

export type WeatherKind = "sole" | "variabile" | "nuvoloso" | "nebbia" | "pioggia" | "neve" | "temporale";

export type DayWeather = {
  date: string;
  kind: WeatherKind;
  /** Italian words for the kind: "sereno", "pioggia"… */
  label: string;
  tMax: number;
  tMin: number;
  /** Mean-to-strong wind of the day, km/h. */
  windKmh: number;
  gustKmh: number;
  /** Compass degrees the wind blows FROM (0 = north, 90 = east). */
  windFrom: number;
  /** Rain probability, %, when known. */
  rainPct: number | null;
};

export const FORECAST_DAYS = 10;

export function forecastUrl(lat: number, lon: number): string {
  const q = new URLSearchParams({
    latitude: lat.toFixed(3),
    longitude: lon.toFixed(3),
    daily: [
      "weather_code",
      "temperature_2m_max",
      "temperature_2m_min",
      "wind_speed_10m_max",
      "wind_gusts_10m_max",
      "wind_direction_10m_dominant",
      "precipitation_probability_max",
    ].join(","),
    wind_speed_unit: "kmh",
    timezone: "auto",
    forecast_days: String(FORECAST_DAYS),
  });
  return `https://api.open-meteo.com/v1/forecast?${q.toString()}`;
}

/** WMO weather code → the few looks the app draws. */
export function kindOf(code: number): WeatherKind {
  if (code <= 1) return "sole";
  if (code === 2) return "variabile";
  if (code === 3) return "nuvoloso";
  if (code === 45 || code === 48) return "nebbia";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "pioggia";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "neve";
  if (code >= 95) return "temporale";
  return "nuvoloso";
}

const LABEL: Record<WeatherKind, string> = {
  sole: "sereno",
  variabile: "variabile",
  nuvoloso: "nuvoloso",
  nebbia: "nebbia",
  pioggia: "pioggia",
  neve: "neve",
  temporale: "temporale",
};

type Daily = {
  time?: string[];
  weather_code?: (number | null)[];
  temperature_2m_max?: (number | null)[];
  temperature_2m_min?: (number | null)[];
  wind_speed_10m_max?: (number | null)[];
  wind_gusts_10m_max?: (number | null)[];
  wind_direction_10m_dominant?: (number | null)[];
  precipitation_probability_max?: (number | null)[];
};

const num = (x: number | null | undefined): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);

/** Reads Open-Meteo's answer; days with missing data are left out. */
export function parseForecast(json: unknown): DayWeather[] {
  const d = (json as { daily?: Daily } | null)?.daily;
  if (!d?.time) return [];
  const out: DayWeather[] = [];
  d.time.forEach((date, i) => {
    const code = num(d.weather_code?.[i]);
    const tMax = num(d.temperature_2m_max?.[i]);
    const tMin = num(d.temperature_2m_min?.[i]);
    const wind = num(d.wind_speed_10m_max?.[i]);
    const from = num(d.wind_direction_10m_dominant?.[i]);
    if (code === null || tMax === null || tMin === null || wind === null || from === null) return;
    const kind = kindOf(code);
    out.push({
      date,
      kind,
      label: LABEL[kind],
      tMax: Math.round(tMax),
      tMin: Math.round(tMin),
      windKmh: Math.round(wind),
      gustKmh: Math.round(num(d.wind_gusts_10m_max?.[i]) ?? wind),
      windFrom: ((from % 360) + 360) % 360,
      rainPct: num(d.precipitation_probability_max?.[i]),
    });
  });
  return out;
}

const COMPASS = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];

/** "SO" for a wind from 225°. */
export function compass(from: number): string {
  return COMPASS[Math.round((((from % 360) + 360) % 360) / 45) % 8];
}

/** Degrees to turn an "up" arrow so it points where the wind is going (it blows from `from`, towards from + 180). */
export function arrowRotation(from: number): number {
  return (from + 180) % 360;
}

/** Beaufort-ish word for the speed, for screen readers and the summary. */
export function windWord(kmh: number): string {
  if (kmh < 12) return "debole";
  if (kmh < 20) return "moderato";
  if (kmh < 30) return "sostenuto";
  return "forte";
}
