"use client";

// Phone calendar, top: the map around the athlete with the chosen day's wind over it, and under it the days as tabs
// (weather, temperature, wind arrow). Tapping a day changes the map and the summary.
import { IconArrowUp, IconCloud, IconCloudFog, IconCloudRain, IconCloudSnow, IconCloudStorm, IconCurrentLocation, IconMapPin, IconSun, IconWind } from "@tabler/icons-react";
import dynamic from "next/dynamic";
import { useState } from "react";
import { arrowRotation, compass, type DayWeather, type WeatherKind } from "@/lib/weather";
import { type Place, type PlaceStatus } from "../data/weatherData";
import { dayLabel } from "./shared";

const WeatherMap = dynamic(() => import("./WeatherMap"), {
  ssr: false,
  loading: () => <div className="absolute inset-0" style={{ background: "var(--map-bg)" }} />,
});

const LOOK: Record<WeatherKind, { Icon: typeof IconSun; color: string }> = {
  sole: { Icon: IconSun, color: "var(--form-ink)" },
  variabile: { Icon: IconCloud, color: "var(--form-ink)" },
  nuvoloso: { Icon: IconCloud, color: "var(--muted)" },
  nebbia: { Icon: IconCloudFog, color: "var(--muted)" },
  pioggia: { Icon: IconCloudRain, color: "var(--fitness-ink)" },
  neve: { Icon: IconCloudSnow, color: "var(--fitness-ink)" },
  temporale: { Icon: IconCloudStorm, color: "var(--warning)" },
};

export function WeatherIcon({ kind, size = 18, color }: { kind: WeatherKind; size?: number; color?: string }) {
  const { Icon, color: c } = LOOK[kind];
  return <Icon size={size} style={{ color: color ?? c }} aria-hidden />;
}

/** An arrow pointing where the wind goes. */
export function WindArrow({ from, size = 14, color }: { from: number; size?: number; color?: string }) {
  return <IconArrowUp size={size} style={{ transform: `rotate(${arrowRotation(from)}deg)`, color: color ?? "var(--accent-ink)" }} aria-hidden />;
}

export function WeatherPanel({
  today,
  place,
  status,
  ask,
  days,
  error,
}: {
  today: string;
  place: Place | null;
  status: PlaceStatus;
  ask: () => void;
  days: DayWeather[];
  error: boolean;
}) {
  const [picked, setPicked] = useState<string | null>(null);

  if (!place) {
    return (
      <section className="card mt-3 flex items-center gap-3 px-4 py-3" aria-label="Meteo e vento">
        <IconMapPin size={22} style={{ color: "var(--accent-ink)" }} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">Meteo e vento intorno a te</div>
          <div className="text-xs text-muted">
            {status === "denied"
              ? "La posizione è bloccata: abilitala nelle impostazioni del telefono per vedere la mappa."
              : status === "unavailable"
                ? "Posizione non disponibile. Riprova all'aperto o con il GPS acceso."
                : "Serve la posizione del telefono. Resta solo su questo dispositivo."}
          </div>
        </div>
        <button
          type="button"
          onClick={ask}
          disabled={status === "asking"}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm font-medium"
          style={{ background: "var(--accent-bg)", color: "var(--accent-ink)" }}
        >
          <IconCurrentLocation size={16} aria-hidden /> {status === "asking" ? "Cerco…" : "Usa la posizione"}
        </button>
      </section>
    );
  }

  const shown = days.filter((d) => d.date >= today).slice(0, 7);
  const sel = shown.find((d) => d.date === picked) ?? shown[0] ?? null;

  return (
    <section className="mt-3" aria-label="Meteo e vento">
      <div className="relative isolate h-56 overflow-hidden rounded-[20px]" style={{ background: "var(--map-bg)" }}>
        {sel ? (
          <WeatherMap lat={place.lat} lon={place.lon} windFrom={sel.windFrom} windKmh={sel.windKmh} />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-xs text-muted">{error ? "Previsioni non disponibili" : "Carico le previsioni…"}</div>
        )}
        {sel && (
          <div className="absolute left-2.5 top-2.5 z-[500] flex max-w-[calc(100%-1.25rem)] flex-wrap gap-1.5">
            <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs" style={{ background: "color-mix(in srgb, var(--surface) 92%, transparent)" }}>
              <WeatherIcon kind={sel.kind} size={15} />
              <span className="num">
                {sel.tMax}° · {sel.label}
              </span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs" style={{ background: "color-mix(in srgb, var(--surface) 92%, transparent)" }}>
              <IconWind size={15} style={{ color: "var(--accent-ink)" }} aria-hidden />
              <span className="num">
                {compass(sel.windFrom)} {sel.windKmh} km/h · raff. {sel.gustKmh}
              </span>
            </span>
          </div>
        )}
      </div>

      {shown.length > 0 && (
        <div className="mt-2 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${shown.length}, minmax(0, 1fr))` }} role="tablist" aria-label="Giorno della previsione">
          {shown.map((d) => {
            const on = d.date === sel?.date;
            return (
              <button
                key={d.date}
                type="button"
                role="tab"
                aria-selected={on}
                aria-label={`${dayLabel(d.date)}: ${d.label}, ${d.tMax} gradi, vento ${compass(d.windFrom)} ${d.windKmh} chilometri orari`}
                onClick={() => setPicked(d.date)}
                className="rounded-2xl px-0 py-2 text-center"
                style={{ background: on ? "var(--brand)" : "var(--surface)", color: on ? "var(--on-brand)" : "var(--muted)" }}
              >
                <span className="block text-[10px]">{dayLabel(d.date, { weekday: "short" })}</span>
                <span className="num block text-sm font-medium" style={{ color: on ? "var(--on-brand)" : "var(--foreground)" }}>
                  {Number(d.date.slice(8))}
                </span>
                <span className="my-1 flex justify-center">
                  <WeatherIcon kind={d.kind} size={20} color={on ? "var(--on-brand)" : undefined} />
                </span>
                <span className="num block text-xs font-medium" style={{ color: on ? "var(--on-brand)" : "var(--foreground)" }}>
                  {d.tMax}°
                </span>
                <span className="mt-0.5 flex items-center justify-center gap-px text-[10px]" style={{ color: on ? "var(--on-brand)" : "var(--foreground)" }}>
                  <WindArrow from={d.windFrom} size={12} color={on ? "var(--on-brand)" : undefined} />
                  <span className="num">{d.windKmh}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
