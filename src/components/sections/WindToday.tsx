"use client";

// Home: today's wind and weather for the athlete's position (the same forecast as the calendar map), one short card.
import { IconCurrentLocation } from "@tabler/icons-react";
import { compass, windWord } from "@/lib/weather";
import { WeatherIcon, WindArrow } from "../calendar/WeatherPanel";
import { useForecast, usePlace } from "../data/weatherData";

export function WindToday({ today }: { today: string }) {
  const { place, status, ask } = usePlace();
  const { days, error } = useForecast(place);
  const d = days.find((x) => x.date === today);

  if (!place) {
    return (
      <section className="card flex items-center gap-3 px-4 py-3" aria-label="Vento di oggi">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">Vento di oggi</div>
          <div className="text-xs text-muted">{status === "denied" ? "Posizione bloccata nelle impostazioni del telefono." : "Serve la posizione, resta solo su questo dispositivo."}</div>
        </div>
        <button
          type="button"
          onClick={ask}
          disabled={status === "asking"}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium leading-none"
          style={{ background: "var(--accent-bg)", color: "var(--accent-ink)" }}
        >
          <IconCurrentLocation size={15} aria-hidden /> {status === "asking" ? "Cerco…" : "Usa la posizione"}
        </button>
      </section>
    );
  }
  if (!d) {
    return (
      <section className="card px-4 py-3 text-xs text-muted" aria-label="Vento di oggi">
        {error ? "Previsioni non disponibili." : "Carico il vento…"}
      </section>
    );
  }
  return (
    <section className="card flex items-center gap-3 px-4 py-3" aria-label="Vento di oggi">
      <WindArrow from={d.windFrom} size={30} />
      <div className="min-w-0 flex-1">
        <div className="num text-lg font-medium leading-tight">
          {compass(d.windFrom)} {d.windKmh} km/h
        </div>
        <div className="text-[11px] text-muted">
          Vento {windWord(d.windKmh)} · raffiche {d.gustKmh}
          {d.rainPct !== null && d.rainPct >= 30 ? ` · pioggia ${d.rainPct}%` : ""}
        </div>
      </div>
      <div className="flex items-center gap-1 text-sm">
        <WeatherIcon kind={d.kind} size={20} />
        <span className="num">{d.tMax}°</span>
      </div>
    </section>
  );
}
