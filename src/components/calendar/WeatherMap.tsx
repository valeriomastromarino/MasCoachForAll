"use client";

// The map around the athlete (OpenStreetMap, toned to the theme) with the day's wind drawn over it as a few soft flow lines.
import "leaflet/dist/leaflet.css";
import { CircleMarker, MapContainer, TileLayer } from "react-leaflet";
import { arrowRotation } from "@/lib/weather";

/** Offsets (px from the centre) of the flow lines, perpendicular to the wind. */
const LANES = [-230, -165, -105, -50, 0, 50, 105, 165, 230];

/** Flow lines pointing downwind: stronger wind = thicker and darker lines. All colours come from the theme. */
function WindFlow({ from, kmh }: { from: number; kmh: number }) {
  const strength = Math.min(1, kmh / 40);
  const width = 1.4 + kmh / 14;
  const ink = `color-mix(in srgb, var(--brand) ${Math.round(60 + strength * 40)}%, var(--surface))`;
  return (
    <svg
      viewBox="-170 -120 340 240"
      preserveAspectRatio="xMidYMid slice"
      className="pointer-events-none absolute inset-0 h-full w-full"
      style={{ zIndex: 450 }}
      aria-hidden
    >
      {/* The group is drawn flowing to the east; turning it by (direction − 90°) points it where the wind goes. */}
      <g transform={`rotate(${arrowRotation(from) - 90})`} fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: ink }}>
        {LANES.map((y, k) => {
          const amp = 7 + (k % 3) * 3;
          const x0 = -260 + (k % 2) * 30;
          return (
            <g key={y}>
              {/* A pale halo under each line keeps it readable over roads and labels. */}
              <path d={`M${x0} ${y} q130 ${-amp} 260 0 t260 0`} strokeWidth={width * 2.6} opacity={0.35} style={{ stroke: "var(--surface)" }} />
              <path
                d={`M${x0} ${y} q130 ${-amp} 260 0 t260 0`}
                strokeWidth={width * (k % 2 ? 0.8 : 1.1)}
                opacity={k % 2 ? 0.65 : 0.9}
              />
              {k % 2 === 0 && <path d={`M${60 + k * 18} ${y - 6} l10 6 l-10 6`} strokeWidth={width * 1.2} opacity={0.95} />}
            </g>
          );
        })}
      </g>
    </svg>
  );
}

export default function WeatherMap({ lat, lon, windFrom, windKmh }: { lat: number; lon: number; windFrom: number; windKmh: number }) {
  return (
    <div className="absolute inset-0 isolate">
      <MapContainer
        center={[lat, lon]}
        zoom={11}
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
