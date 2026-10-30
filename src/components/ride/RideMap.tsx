"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useMemo } from "react";
import { CircleMarker, MapContainer, Polyline, TileLayer, useMap } from "react-leaflet";
import type { LatLngTuple } from "leaflet";
import type { RidePoint } from "@/lib/ride";

// Same pastel zone palette as the CSS tokens (Leaflet draws on canvas/SVG attributes, so plain hex).
const ZONE_HEX = ["#c9d1db", "#9cc8f2", "#a6e0bb", "#f6dc8f", "#f5b98f", "#f2a1a1", "#c9b0ec"];
const ROUTE_FALLBACK = "#6fa6ee";

type Segment = { color: string; positions: LatLngTuple[] };

/** Splits the route into runs of the same power zone, so each run is drawn in its zone colour. */
function zoneSegments(points: RidePoint[]): Segment[] {
  const out: Segment[] = [];
  let cur: Segment | null = null;
  let prev: LatLngTuple | null = null;
  for (const p of points) {
    if (p.lat === null || p.lng === null) continue;
    const pos: LatLngTuple = [p.lat, p.lng];
    const color = p.zone === null ? ROUTE_FALLBACK : ZONE_HEX[p.zone];
    if (!cur || cur.color !== color) {
      cur = { color, positions: prev ? [prev] : [] };
      out.push(cur);
    }
    cur.positions.push(pos);
    prev = pos;
  }
  return out;
}

function FitRoute({ route, expanded }: { route: LatLngTuple[]; expanded: boolean }) {
  const map = useMap();
  useEffect(() => {
    // The container changes size when expanded: Leaflet must re-measure before fitting.
    map.invalidateSize();
    if (route.length) map.fitBounds(route, { padding: [16, 16] });
  }, [map, route, expanded]);
  return null;
}

export default function RideMap({
  points,
  hoverIndex,
  expanded,
}: {
  points: RidePoint[];
  hoverIndex: number | null;
  expanded: boolean;
}) {
  const route = useMemo(
    () => points.filter((p) => p.lat !== null && p.lng !== null).map((p) => [p.lat!, p.lng!] as LatLngTuple),
    [points],
  );
  const segments = useMemo(() => zoneSegments(points), [points]);
  const hover = hoverIndex !== null ? points[hoverIndex] : null;
  if (!route.length) return null;

  return (
    <MapContainer
      center={route[0]}
      zoom={11}
      scrollWheelZoom={expanded}
      zoomControl={expanded}
      attributionControl
      style={{ height: "100%", width: "100%", borderRadius: 12, background: "var(--map-bg)" }}
    >
      {/* OpenStreetMap tiles need no API key; the "pastel-tiles" class desaturates them to fit style A. */}
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
        className="pastel-tiles"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      />
      <FitRoute route={route} expanded={expanded} />
      <Polyline positions={route} pathOptions={{ color: "#ffffff", weight: 9, opacity: 0.9 }} />
      {segments.map((s, i) => (
        <Polyline key={i} positions={s.positions} pathOptions={{ color: s.color, weight: 5, opacity: 1, lineCap: "round" }} />
      ))}
      <CircleMarker center={route[0]} radius={7} pathOptions={{ color: "#fff", weight: 2, fillColor: "#2f8f5b", fillOpacity: 1 }} />
      <CircleMarker
        center={route[route.length - 1]}
        radius={5}
        pathOptions={{ color: "#fff", weight: 2, fillColor: "#c0504d", fillOpacity: 1 }}
      />
      {hover && hover.lat !== null && hover.lng !== null && (
        <CircleMarker
          center={[hover.lat, hover.lng]}
          radius={8}
          pathOptions={{ color: "#fff", weight: 3, fillColor: "#3f78c6", fillOpacity: 1 }}
        />
      )}
    </MapContainer>
  );
}
