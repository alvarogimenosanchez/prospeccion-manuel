"use client";

import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";

type CiudadStats = {
  ciudad: string;
  coords: [number, number];
  total: number;
  calientes: number;
  templados: number;
  frios: number;
  leads: unknown[];
};

function FlyToCity({ ciudad }: { ciudad: CiudadStats | null }) {
  const map = useMap();
  const prevRef = useRef<string | null>(null);
  useEffect(() => {
    if (ciudad && ciudad.ciudad !== prevRef.current) {
      prevRef.current = ciudad.ciudad;
      map.flyTo(ciudad.coords, 11, { duration: 0.8 });
    }
  }, [ciudad, map]);
  return null;
}

function getColor(c: CiudadStats): string {
  const ratioCaliente = c.total > 0 ? c.calientes / c.total : 0;
  const ratioTemplado = c.total > 0 ? c.templados / c.total : 0;
  if (ratioCaliente >= 0.3) return "#ef4444";   // rojo
  if (ratioCaliente + ratioTemplado >= 0.4) return "#f59e0b"; // naranja
  if (ratioTemplado >= 0.2) return "#f59e0b";
  return "#3b82f6"; // azul
}

function getRadius(total: number): number {
  if (total <= 2) return 8;
  if (total <= 5) return 12;
  if (total <= 10) return 18;
  if (total <= 20) return 24;
  if (total <= 50) return 32;
  return 42;
}

type Props = {
  ciudades: CiudadStats[];
  ciudadSeleccionada: CiudadStats | null;
  onCiudadClick: (c: CiudadStats) => void;
};

export default function MapaLeads({ ciudades, ciudadSeleccionada, onCiudadClick }: Props) {
  const center: [number, number] = [40.4, -3.7];

  return (
    <MapContainer
      center={center}
      zoom={6}
      style={{ height: "100%", width: "100%" }}
      zoomControl={true}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      />

      <FlyToCity ciudad={ciudadSeleccionada} />

      {ciudades.map(c => {
        const isSelected = ciudadSeleccionada?.ciudad === c.ciudad;
        const color = getColor(c);
        const radius = getRadius(c.total);

        return (
          <CircleMarker
            key={c.ciudad}
            center={c.coords}
            radius={radius}
            pathOptions={{
              fillColor: color,
              fillOpacity: isSelected ? 0.85 : 0.55,
              color: isSelected ? "#1e293b" : color,
              weight: isSelected ? 2.5 : 1,
            }}
            eventHandlers={{
              click: () => onCiudadClick(c),
            }}
          >
            <Tooltip direction="top" offset={[0, -radius]} opacity={0.95}>
              <div className="text-xs">
                <p className="font-bold text-slate-800 mb-0.5">{c.ciudad}</p>
                <p className="text-slate-600">{c.total} leads</p>
                {c.calientes > 0 && <p className="text-red-600">🔴 {c.calientes} calientes</p>}
                {c.templados > 0 && <p className="text-amber-600">🟡 {c.templados} templados</p>}
                {c.frios > 0 && <p className="text-blue-600">🔵 {c.frios} fríos</p>}
              </div>
            </Tooltip>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
