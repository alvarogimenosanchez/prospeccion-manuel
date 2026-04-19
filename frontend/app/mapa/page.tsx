"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import dynamic from "next/dynamic";
import { supabase } from "@/lib/supabase";
import { usePermisos } from "@/components/PermisosProvider";
import { SinAcceso } from "@/components/SinAcceso";

// ── Coordenadas estáticas para ciudades españolas principales ──────────────
const COORDS_ESPANA: Record<string, [number, number]> = {
  "madrid": [40.4168, -3.7038],
  "barcelona": [41.3851, 2.1734],
  "valencia": [39.4699, -0.3763],
  "sevilla": [37.3891, -5.9845],
  "zaragoza": [41.6488, -0.8891],
  "málaga": [36.7213, -4.4213],
  "malaga": [36.7213, -4.4213],
  "murcia": [37.9922, -1.1307],
  "palma": [39.5696, 2.6502],
  "las palmas": [28.1235, -15.4366],
  "bilbao": [43.263, -2.935],
  "alicante": [38.3452, -0.481],
  "córdoba": [37.8882, -4.7794],
  "cordoba": [37.8882, -4.7794],
  "valladolid": [41.6523, -4.7245],
  "vigo": [42.2314, -8.7124],
  "gijón": [43.5322, -5.6611],
  "gijon": [43.5322, -5.6611],
  "hospitalet": [41.3597, 2.1],
  "l'hospitalet": [41.3597, 2.1],
  "coruña": [43.3623, -8.4115],
  "a coruña": [43.3623, -8.4115],
  "vitoria": [42.8467, -2.6728],
  "vitoria-gasteiz": [42.8467, -2.6728],
  "granada": [37.1773, -3.5986],
  "elche": [38.2672, -0.6981],
  "oviedo": [43.3619, -5.8494],
  "badalona": [41.4500, 2.2473],
  "terrassa": [41.5631, 2.0089],
  "jerez": [36.6864, -6.1375],
  "sabadell": [41.5432, 2.1091],
  "móstoles": [40.3218, -3.8647],
  "mostoles": [40.3218, -3.8647],
  "santa cruz de tenerife": [28.4636, -16.2518],
  "pamplona": [42.8169, -1.6432],
  "almería": [36.8402, -2.4637],
  "almeria": [36.8402, -2.4637],
  "alcalá de henares": [40.4822, -3.3636],
  "alcala de henares": [40.4822, -3.3636],
  "fuenlabrada": [40.2842, -3.7942],
  "donostia": [43.3183, -1.9812],
  "san sebastián": [43.3183, -1.9812],
  "san sebastian": [43.3183, -1.9812],
  "leganés": [40.3283, -3.7641],
  "leganes": [40.3283, -3.7641],
  "santander": [43.4623, -3.8099],
  "burgos": [42.3439, -3.6969],
  "albacete": [38.9943, -1.8585],
  "castellón": [39.9864, -0.0513],
  "castellon": [39.9864, -0.0513],
  "getafe": [40.3059, -3.7326],
  "alcorcón": [40.3489, -3.8237],
  "alcorcon": [40.3489, -3.8237],
  "logroño": [42.4650, -2.4456],
  "logrono": [42.4650, -2.4456],
  "badajoz": [38.8794, -6.9706],
  "salamanca": [40.9701, -5.6635],
  "huelva": [37.2614, -6.9447],
  "tarragona": [41.1189, 1.2445],
  "lleida": [41.6175, 0.6200],
  "marbella": [36.5101, -4.8825],
  "torrejón de ardoz": [40.4600, -3.4789],
  "girona": [41.9794, 2.8214],
};

function getCoordsFromCache(ciudad: string): [number, number] | null {
  const key = ciudad.toLowerCase().trim();
  return COORDS_ESPANA[key] ?? null;
}

type LeadMapa = {
  id: string;
  nombre: string;
  apellidos: string | null;
  empresa: string | null;
  ciudad: string | null;
  provincia: string | null;
  estado: string;
  sector: string | null;
  nivel_interes: number;
  comercial_asignado: string | null;
};

type CiudadStats = {
  ciudad: string;
  coords: [number, number];
  total: number;
  calientes: number;
  templados: number;
  frios: number;
  leads: LeadMapa[];
};

// ── Componente del mapa (cargado dinámicamente para evitar SSR) ────────────
const MapaLeads = dynamic(() => import("./MapaLeads"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-slate-400 text-sm">
      Cargando mapa...
    </div>
  ),
});

export default function MapaPage() {
  const { puede, cargando: cargandoPermisos } = usePermisos();
  const [leads, setLeads] = useState<LeadMapa[]>([]);
  const [loading, setLoading] = useState(true);
  const [geocoding, setGeocoding] = useState(false);
  const [ciudades, setCiudades] = useState<CiudadStats[]>([]);
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [filtroSector, setFiltroSector] = useState("todos");
  const [ciudadSeleccionada, setCiudadSeleccionada] = useState<CiudadStats | null>(null);
  const geocacheRef = useRef<Record<string, [number, number] | null>>({});

  useEffect(() => {
    async function cargar() {
      const { data } = await supabase
        .from("leads")
        .select("id, nombre, apellidos, empresa, ciudad, provincia, estado, sector, nivel_interes, comercial_asignado")
        .not("ciudad", "is", null);
      setLeads((data as LeadMapa[]) ?? []);
      setLoading(false);
    }
    cargar();
  }, []);

  // Geocodificar ciudades únicas
  useEffect(() => {
    if (leads.length === 0) return;

    async function geocodificar() {
      setGeocoding(true);

      // Aplicar filtros
      const leadsFiltrados = leads.filter(l => {
        if (filtroEstado !== "todos" && l.estado !== filtroEstado) return false;
        if (filtroSector !== "todos" && (l.sector ?? "").toLowerCase() !== filtroSector) return false;
        return true;
      });

      // Agrupar por ciudad
      const porCiudad: Record<string, LeadMapa[]> = {};
      for (const lead of leadsFiltrados) {
        const c = (lead.ciudad ?? "").trim();
        if (!c) continue;
        if (!porCiudad[c]) porCiudad[c] = [];
        porCiudad[c].push(lead);
      }

      const resultados: CiudadStats[] = [];
      for (const [ciudad, leadsC] of Object.entries(porCiudad)) {
        // Buscar coordenadas
        let coords: [number, number] | null = geocacheRef.current[ciudad] ?? null;
        if (coords === undefined) coords = null;

        if (!coords) {
          // Primero intento caché estático
          coords = getCoordsFromCache(ciudad);
          if (!coords) {
            // Nominatim como fallback (rate-limited: 1 req/s)
            try {
              await new Promise(r => setTimeout(r, 300));
              const url = `https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(ciudad)}&country=Spain&format=json&limit=1`;
              const res = await fetch(url, { headers: { "Accept-Language": "es" } });
              const json = await res.json();
              if (json[0]) {
                coords = [parseFloat(json[0].lat), parseFloat(json[0].lon)];
              }
            } catch {
              // silencioso
            }
          }
          geocacheRef.current[ciudad] = coords;
        }

        if (!coords) continue;

        const calientes = leadsC.filter(l => ["cita_agendada", "en_negociacion", "cerrado_ganado"].includes(l.estado)).length;
        const templados = leadsC.filter(l => l.estado === "respondio").length;
        const frios = leadsC.length - calientes - templados;

        resultados.push({ ciudad, coords, total: leadsC.length, calientes, templados, frios, leads: leadsC });
      }

      setCiudades(resultados.sort((a, b) => b.total - a.total));
      setGeocoding(false);
    }

    geocodificar();
  }, [leads, filtroEstado, filtroSector]);

  const sectores = useMemo(() => {
    const s = new Set(leads.map(l => (l.sector ?? "").toLowerCase().trim()).filter(Boolean));
    return Array.from(s).sort();
  }, [leads]);

  const totalLeads = leads.length;
  const leadsConCiudad = leads.filter(l => l.ciudad).length;
  const topCiudades = ciudades.slice(0, 10);
  if (!cargandoPermisos && !puede("usar_scraping")) return <SinAcceso />;

  return (
    <div className="h-[calc(100vh-56px)] flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-base font-bold text-slate-800">Mapa de prospección</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {loading ? "Cargando..." : `${leadsConCiudad} leads con ubicación · ${ciudades.length} ciudades`}
            {geocoding && " · geocodificando..."}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-600 focus:outline-none focus:border-orange-300">
            <option value="todos">Todos los estados</option>
            <option value="nuevo">Nuevo</option>
            <option value="mensaje_enviado">Mensaje enviado</option>
            <option value="respondio">Respondió</option>
            <option value="cita_agendada">Cita agendada</option>
            <option value="en_negociacion">En negociación</option>
            <option value="cerrado_ganado">Cerrado ganado</option>
            <option value="cerrado_perdido">Cerrado perdido</option>
          </select>
          {sectores.length > 0 && (
            <select value={filtroSector} onChange={e => setFiltroSector(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-600 focus:outline-none focus:border-orange-300">
              <option value="todos">Todos los sectores</option>
              {sectores.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Layout principal */}
      <div className="flex flex-1 overflow-hidden">

        {/* Panel lateral izquierdo */}
        <div className="w-72 flex-shrink-0 bg-white border-r border-slate-200 overflow-y-auto">
          {/* Stats globales */}
          <div className="p-4 border-b border-slate-100">
            <div className="grid grid-cols-3 gap-2">
              <div className="text-center">
                <p className="text-lg font-bold text-slate-800">{ciudades.reduce((s, c) => s + c.total, 0)}</p>
                <p className="text-xs text-slate-400">leads</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-red-600">{ciudades.reduce((s, c) => s + c.calientes, 0)}</p>
                <p className="text-xs text-slate-400">calientes</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-slate-600">{ciudades.length}</p>
                <p className="text-xs text-slate-400">ciudades</p>
              </div>
            </div>
          </div>

          {/* Ciudad seleccionada */}
          {ciudadSeleccionada ? (
            <div className="p-4 border-b border-slate-100">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-bold text-slate-800">{ciudadSeleccionada.ciudad}</h3>
                <button onClick={() => setCiudadSeleccionada(null)}
                  className="text-slate-400 hover:text-slate-600 text-lg leading-none">×</button>
              </div>
              <div className="flex gap-2 mb-3">
                <span className="text-xs bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded-full">{ciudadSeleccionada.calientes} cal.</span>
                <span className="text-xs bg-amber-50 text-amber-600 border border-amber-200 px-2 py-0.5 rounded-full">{ciudadSeleccionada.templados} temp.</span>
                <span className="text-xs bg-blue-50 text-blue-600 border border-blue-200 px-2 py-0.5 rounded-full">{ciudadSeleccionada.frios} fríos</span>
              </div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {ciudadSeleccionada.leads.map(l => (
                  <a key={l.id} href={`/leads/${l.id}`}
                    className="block text-xs p-2 rounded-lg border border-slate-100 hover:border-orange-200 hover:bg-orange-50 transition-colors">
                    <p className="font-medium text-slate-700 truncate">{[l.nombre, l.apellidos].filter(Boolean).join(" ")}</p>
                    {l.empresa && <p className="text-slate-400 truncate">{l.empresa}</p>}
                    <p className="text-slate-400">{l.estado.replace(/_/g, " ")}</p>
                  </a>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-4 border-b border-slate-100">
              <p className="text-xs text-slate-400">Haz clic en un círculo del mapa para ver los leads de esa ciudad</p>
            </div>
          )}

          {/* Ranking de ciudades */}
          <div className="p-4">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Top ciudades</h3>
            <div className="space-y-2">
              {topCiudades.map((c, idx) => (
                <button key={c.ciudad} onClick={() => setCiudadSeleccionada(c)}
                  className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${ciudadSeleccionada?.ciudad === c.ciudad ? "border-orange-300 bg-orange-50" : "border-slate-100 hover:border-slate-200 hover:bg-slate-50"}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400 w-4">{idx + 1}</span>
                      <span className="text-sm font-medium text-slate-700 truncate max-w-[120px]">{c.ciudad}</span>
                    </div>
                    <span className="text-sm font-bold text-slate-800">{c.total}</span>
                  </div>
                  {/* Mini barra de temperatura */}
                  <div className="flex mt-1.5 rounded-full overflow-hidden h-1.5 gap-px">
                    {c.calientes > 0 && <div className="bg-red-400" style={{ flex: c.calientes }} />}
                    {c.templados > 0 && <div className="bg-amber-400" style={{ flex: c.templados }} />}
                    {c.frios > 0 && <div className="bg-blue-300" style={{ flex: c.frios }} />}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Leyenda */}
          <div className="p-4 border-t border-slate-100">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Leyenda</h3>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500 opacity-70" />
                <span className="text-xs text-slate-600">Caliente (cita / negociación)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-amber-500 opacity-70" />
                <span className="text-xs text-slate-600">Templado (respondió)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-blue-500 opacity-70" />
                <span className="text-xs text-slate-600">Frío (nuevo / mensaje)</span>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs text-slate-400">Tamaño = nº de leads</span>
              </div>
            </div>
          </div>
        </div>

        {/* Mapa */}
        <div className="flex-1 relative">
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-sm">
              Cargando leads...
            </div>
          ) : ciudades.length === 0 && !geocoding ? (
            <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-sm">
              No hay leads con ciudad para mostrar
            </div>
          ) : (
            <MapaLeads
              ciudades={ciudades}
              ciudadSeleccionada={ciudadSeleccionada}
              onCiudadClick={(c) => setCiudadSeleccionada(c as CiudadStats)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
