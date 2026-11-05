"use client";

// The map around the athlete (OpenStreetMap, toned to the theme) with the day's wind drawn over it as a grid of arrows.
import "leaflet/dist/leaflet.css";
import { CircleMarker, MapContainer, TileLayer } from "react-leaflet";
import { arrowRotation } from "@/lib/weather";

/** Tidy grid of arrows: 3 rows x 5 columns, the middle row shifted by half a step. */
const COL = 60;
const ROW = 70;
const GRID = [-1, 0, 1].flatMap((r) =>
  [-2, -1, 0, 1, 2].map((c) => ({ x: c * COL + (r === 0 ? COL / 2 : 0), y: r * ROW })),
).filter((p) => Math.hypot(p.x, p.y) > 40); // nothing over the position marker

/** One equal arrow per grid point, pointing where the wind goes: stronger wind = longer, thicker and darker. Colours come from the theme. */
function WindFlow({ from, kmh }: { from: number; kmh: number }) {
  const strength = Math.min(1, kmh / 40);
  const len = 13 + 0.55 * kmh;
  const width = 1.8 + kmh / 16;
  const head = Math.min(9, 4 + len / 5);
  const ink = `color-mix(in srgb, var(--brand) ${Math.round(60 + strength * 40)}%, var(--surface))`;
  const half = len / 2;
  const d = `M${-half} 0 L${half} 0 M${half - head} ${-head * 0.75} L${half} 0 L${half - head} ${head * 0.75}`;
  const rot = arrowRotation(from) - 90;
  return (
    <svg
      viewBox="-170 -120 340 240"
      preserveAspectRatio="xMidYMid slice"
      className="pointer-events-none absolute inset-0 h-full w-full"
      style={{ zIndex: 450 }}
      aria-hidden
    >
      {GRID.map((p) => (
        <g key={`${p.x}_${p.y}`} transform={`translate(${p.x} ${p.y}) rotate(${rot})`} fill="none" strokeLinecap="round" strokeLinejoin="round">
          {/* A white border keeps each arrow readable over roads and labels. */}
          <path d={d} strokeWidth={width + 3} style={{ stroke: "var(--surface)" }} opacity={0.9} />
          <path d={d} strokeWidth={width} style={{ stroke: ink }} />
        </g>
      ))}
    </svg>
  );
}

export default function WeatherMap({ lat, lon, windFrom, windKmh }: { lat: number; lon: number; windFrom: number; windKmh: number }) {
  return (
    <div className="absolute inset-0 isolate">
      <MapContainer
        center={[lat, lon]}
        zoom={10}
        dragging={false}
        touchZoom={false}
        doubleClickZoom={false}
        scrollWheelZoom={false}
        boxZoom={false}
        keyboard={false}
        zoomControl={false}
        attributionControl
        style={{ height: "100%", width: "100%", background: "var(--map-bg)" }}
      >
        {/* OpenStreetMap tiles need no key and show the names of the towns around; the class tones them to the theme. */}
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
          className="pastel-tiles"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />
        <CircleMarker center={[lat, lon]} radius={16} pathOptions={{ color: "#9f5f45", weight: 1.5, opacity: 0.45, fillOpacity: 0 }} />
        <CircleMarker center={[lat, lon]} radius={7} pathOptions={{ color: "#ffffff", weight: 2, fillColor: "#9f5f45", fillOpacity: 1 }} />
      </MapContainer>
      <WindFlow from={windFrom} kmh={windKmh} />
    </div>
  );
}
