"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { usePermisos } from "@/components/PermisosProvider";
import { SinAcceso } from "@/components/SinAcceso";

// ─── Types ─────────────────────────────────────────────────────────────────────

type ZonaStat = {
  zona: string;
  total: number;
  activos: number;
  ganados: number;
  perdidos: number;
  tasaConversion: number;
  ingresos: number;
  calientes: number;
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toLocaleString("es-ES") + " €";
}

function pct(n: number): string {
  return n.toFixed(1) + "%";
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function GeograficoPage() {
  const { puede, cargando: cargandoPermisos } = usePermisos();
  const [ciudades, setCiudades] = useState<ZonaStat[]>([]);
  const [provincias, setProvincias] = useState<ZonaStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [vista, setVista] = useState<"ciudades" | "provincias">("ciudades");
  const [ordenPor, setOrdenPor] = useState<"total" | "conversion" | "calientes" | "ingresos">("total");
  const [periodo, setPeriodo] = useState<"3m" | "6m" | "12m" | "todo">("12m");

  const cargar = useCallback(async () => {
    setLoading(true);

    const ahora = new Date();
    let desde: Date | null = null;
    if (periodo === "3m") { desde = new Date(ahora); desde.setMonth(ahora.getMonth() - 3); }
    else if (periodo === "6m") { desde = new Date(ahora); desde.setMonth(ahora.getMonth() - 6); }
    else if (periodo === "12m") { desde = new Date(ahora); desde.setFullYear(ahora.getFullYear() - 1); }

    let q = supabase.from("leads").select("id, ciudad, provincia, estado, temperatura").limit(5000);
    if (desde) q = q.gte("created_at", desde.toISOString());
    const { data: leads } = await q;

    // Get revenue from clientes grouped by ciudad (via leads)
    const leadIds = (leads ?? []).filter(l => l.estado === "cerrado_ganado").map(l => l.id);
    const { data: clientes } = leadIds.length > 0
      ? await supabase.from("clientes").select("id, valor_contrato, leads(ciudad, provincia)").in("lead_id", leadIds.slice(0, 500))
      : { data: [] };

    const ingresoCiudad = new Map<string, number>();
    const ingresoProvncia = new Map<string, number>();
    for (const c of clientes ?? []) {
      const ld = c.leads as unknown as { ciudad: string | null; provincia: string | null } | null;
      const city = ld?.ciudad?.trim() || "Sin ciudad";
      const prov = ld?.provincia?.trim() || "Sin provincia";
      const val = c.valor_contrato ?? 0;
      ingresoCiudad.set(city, (ingresoCiudad.get(city) ?? 0) + val);
      ingresoProvncia.set(prov, (ingresoProvncia.get(prov) ?? 0) + val);
    }

    function agregar(getZona: (l: { ciudad: string | null; provincia: string | null }) => string): Map<string, ZonaStat> {
      const map = new Map<string, ZonaStat>();
      for (const l of leads ?? []) {
        const z = getZona({ ciudad: l.ciudad, provincia: l.provincia }) || "Sin dato";
        if (!map.has(z)) map.set(z, { zona: z, total: 0, activos: 0, ganados: 0, perdidos: 0, tasaConversion: 0, ingresos: 0, calientes: 0 });
        const e = map.get(z)!;
        e.total++;
        if (l.estado === "cerrado_ganado") e.ganados++;
        else if (l.estado === "cerrado_perdido" || l.estado === "descartado") e.perdidos++;
        else e.activos++;
        if (l.temperatura === "caliente") e.calientes++;
      }
      for (const [z, e] of map) {
        e.tasaConversion = e.total > 0 ? (e.ganados / e.total) * 100 : 0;
      }
      return map;
    }

    const ciudadMap = agregar(l => l.ciudad?.trim() ?? "");
    const provMap = agregar(l => l.provincia?.trim() ?? "");

    for (const [z, v] of ingresoCiudad) {
      if (ciudadMap.has(z)) ciudadMap.get(z)!.ingresos = v;
    }
    for (const [z, v] of ingresoProvncia) {
      if (provMap.has(z)) provMap.get(z)!.ingresos = v;
    }

    function sort(arr: ZonaStat[]): ZonaStat[] {
      return arr
        .filter(z => z.zona && z.zona !== "Sin dato")
        .sort((a, b) => {
          if (ordenPor === "total") return b.total - a.total;
          if (ordenPor === "conversion") return b.tasaConversion - a.tasaConversion;
          if (ordenPor === "calientes") return b.calientes - a.calientes;
          return b.ingresos - a.ingresos;
        })
        .slice(0, 20);
    }

    setCiudades(sort([...ciudadMap.values()]));
    setProvincias(sort([...provMap.values()]));
    setLoading(false);
  }, [periodo, ordenPor]);

  useEffect(() => {
    if (!cargandoPermisos && puede("ver_metricas")) cargar();
  }, [cargar, cargandoPermisos, puede]);

  if (!cargandoPermisos && !puede("ver_metricas")) return <SinAcceso />;

  const datos = vista === "ciudades" ? ciudades : provincias;
  const maxTotal = Math.max(...datos.map(z => z.total), 1);
  const totalLeads = datos.reduce((s, z) => s + z.total, 0);
  const totalGanados = datos.reduce((s, z) => s + z.ganados, 0);
  const mejorZona = datos.reduce((best, z) => z.tasaConversion > (best?.tasaConversion ?? 0) && z.total >= 3 ? z : best, datos[0]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Análisis geográfico</h1>
          <p className="text-sm text-slate-500 mt-0.5">¿Dónde están los mejores leads?</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={periodo} onChange={e => setPeriodo(e.target.value as typeof periodo)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:border-orange-300">
            <option value="3m">Últimos 3 meses</option>
            <option value="6m">Últimos 6 meses</option>
            <option value="12m">Último año</option>
            <option value="todo">Todo el tiempo</option>
          </select>
        </div>
      </div>

      {/* KPIs */}
      {!loading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
            <p className="text-xs text-slate-500 mb-1">Zonas analizadas</p>
            <p className="text-2xl font-bold text-slate-900">{datos.length}</p>
            <p className="text-xs text-slate-400">{vista}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
            <p className="text-xs text-slate-500 mb-1">Total leads</p>
            <p className="text-2xl font-bold text-slate-900">{totalLeads.toLocaleString("es-ES")}</p>
            <p className="text-xs text-slate-400">{totalGanados} ganados</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
            <p className="text-xs text-slate-500 mb-1">Mejor zona (conversión)</p>
            {mejorZona ? (
              <>
                <p className="text-lg font-bold text-slate-900 truncate">📍 {mejorZona.zona}</p>
                <p className="text-xs text-slate-400">{pct(mejorZona.tasaConversion)} conversión</p>
              </>
            ) : <p className="text-sm text-slate-400">—</p>}
          </div>
          <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
            <p className="text-xs text-slate-500 mb-1">Leads calientes top zona</p>
            {datos[0] && (
              <>
                <p className="text-lg font-bold text-red-600">{Math.max(...datos.map(z => z.calientes))}</p>
                <p className="text-xs text-slate-400">{datos.find(z => z.calientes === Math.max(...datos.map(d => d.calientes)))?.zona ?? ""}</p>
              </>
            )}
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
          {(["ciudades", "provincias"] as const).map(v => (
            <button key={v} onClick={() => setVista(v)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md capitalize transition-colors ${vista === v ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
              Por {v === "ciudades" ? "ciudad" : "provincia"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
          {(["total", "conversion", "calientes", "ingresos"] as const).map(o => (
            <button key={o} onClick={() => setOrdenPor(o)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${ordenPor === o ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
              {{ total: "Volumen", conversion: "Conversión", calientes: "Calientes", ingresos: "Ingresos" }[o]}
            </button>
          ))}
        </div>
      </div>

      {/* Data table */}
      {loading ? (
        <div className="py-24 text-center text-sm text-slate-400">Analizando datos geográficos...</div>
      ) : datos.length === 0 ? (
        <div className="py-24 text-center text-sm text-slate-400">Sin datos geográficos disponibles.</div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200 grid grid-cols-12 gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wide">
            <span className="col-span-4">Zona</span>
            <span className="col-span-2 text-right">Leads</span>
            <span className="col-span-2 text-right hidden md:block">Calientes</span>
            <span className="col-span-2 text-right">Conversión</span>
            <span className="col-span-2 text-right hidden lg:block">Ingresos</span>
          </div>
          <div className="divide-y divide-slate-50">
            {datos.map((z, i) => {
              const barPct = Math.round((z.total / maxTotal) * 100);
              const convColor = z.tasaConversion >= 10 ? "text-green-700" : z.tasaConversion >= 5 ? "text-amber-700" : "text-slate-600";
              return (
                <div key={z.zona} className="px-5 py-3 grid grid-cols-12 gap-2 items-center hover:bg-slate-50 transition-colors">
                  <div className="col-span-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400 font-mono w-5">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">📍 {z.zona}</p>
                        <div className="mt-1 h-1 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-orange-400" style={{ width: `${barPct}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="col-span-2 text-right">
                    <p className="text-sm font-semibold text-slate-800">{z.total}</p>
                    <p className="text-xs text-slate-400">{z.activos} activos</p>
                  </div>
                  <div className="col-span-2 text-right hidden md:block">
                    <p className="text-sm font-semibold text-red-600">{z.calientes}</p>
                    <p className="text-xs text-slate-400">calientes</p>
                  </div>
                  <div className="col-span-2 text-right">
                    <p className={`text-sm font-semibold ${convColor}`}>{pct(z.tasaConversion)}</p>
                    <p className="text-xs text-slate-400">{z.ganados} ganados</p>
                  </div>
                  <div className="col-span-2 text-right hidden lg:block">
                    <p className="text-sm font-semibold text-orange-700">{z.ingresos > 0 ? fmt(z.ingresos) : "—"}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Strategic recommendations */}
      {!loading && datos.length > 0 && mejorZona && (
        <div className="bg-white rounded-xl border border-slate-200 px-5 py-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Recomendaciones</h2>
          <div className="space-y-3">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-green-50 border border-green-200">
              <span className="text-lg">🎯</span>
              <div>
                <p className="text-sm font-semibold text-green-800">Enfoca prospección en {mejorZona.zona}</p>
                <p className="text-xs text-green-700 mt-0.5">
                  Con {pct(mejorZona.tasaConversion)} de conversión es la zona más rentable. Aumenta el volumen de leads aquí.
                </p>
              </div>
            </div>
            {datos.filter(z => z.calientes > 5 && z.tasaConversion < 3).slice(0, 1).map(z => (
              <div key={z.zona} className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
                <span className="text-lg">🔥</span>
                <div>
                  <p className="text-sm font-semibold text-amber-800">Alta temperatura, baja conversión en {z.zona}</p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    {z.calientes} leads calientes en {z.zona} pero solo {pct(z.tasaConversion)} de conversión. Revisar el approach comercial en esta zona.
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
