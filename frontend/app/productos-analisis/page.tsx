"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { usePermisos } from "@/components/PermisosProvider";
import { SinAcceso } from "@/components/SinAcceso";

const PRODUCTOS_CONFIG: Record<string, { label: string; color: string; emoji: string }> = {
  contigo_autonomo: { label: "Contigo Autónomo", color: "#ea650d", emoji: "🧑‍💼" },
  contigo_pyme:     { label: "Contigo Pyme",     color: "#3b82f6", emoji: "🏢" },
  contigo_familia:  { label: "Contigo Familia",  color: "#a78bfa", emoji: "👨‍👩‍👧" },
  contigo_futuro:   { label: "Contigo Futuro",   color: "#f59e0b", emoji: "💰" },
  liderplus:        { label: "LiderPlus",         color: "#6366f1", emoji: "🏆" },
  sanitas_salud:    { label: "Sanitas Salud",     color: "#10b981", emoji: "🏥" },
  hipotecas:        { label: "Hipotecas",         color: "#0ea5e9", emoji: "🏠" },
  mihogar:          { label: "MiHogar",           color: "#84cc16", emoji: "🏡" },
};

type ProductoStats = {
  key: string;
  label: string;
  color: string;
  emoji: string;
  leads_total: number;
  leads_mes: number;
  leads_mes_anterior: number;
  cerrados: number;
  cerrados_mes: number;
  tasa_conversion: number;
  en_pipeline: number;
};

type SectorStats = {
  sector: string;
  total: number;
  calientes: number;
  cerrados: number;
};

export default function ProductosAnalisisPage() {
  const { puede, cargando: cargandoPermisos } = usePermisos();
  const [stats, setStats] = useState<ProductoStats[]>([]);
  const [sectores, setSectores] = useState<SectorStats[]>([]);
  const [cargando, setCargando] = useState(true);
  const [periodo, setPeriodo] = useState<"mes" | "trimestre" | "total">("mes");

  const cargar = useCallback(async () => {
    setCargando(true);

    const ahora = new Date();
    const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1).toISOString();
    const inicioMesAnterior = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1).toISOString();
    const finMesAnterior = new Date(ahora.getFullYear(), ahora.getMonth(), 0, 23, 59, 59).toISOString();
    const inicioTrimestre = new Date(ahora.getFullYear(), Math.floor(ahora.getMonth() / 3) * 3, 1).toISOString();

    const desde = periodo === "mes" ? inicioMes : periodo === "trimestre" ? inicioTrimestre : null;

    // All leads with product info
    let q = supabase.from("leads").select("estado, temperatura, producto_interes_principal, productos_recomendados, sector, fecha_captacion");
    if (desde) q = q.gte("fecha_captacion", desde);

    const [{ data: leads }, { data: leadsEsteMes }, { data: leadsMesAnt }, { data: clientesData }] = await Promise.all([
      supabase.from("leads").select("estado, temperatura, producto_interes_principal, productos_recomendados, sector, fecha_captacion"),
      supabase.from("leads").select("producto_interes_principal, productos_recomendados").gte("fecha_captacion", inicioMes),
      supabase.from("leads").select("producto_interes_principal, productos_recomendados").gte("fecha_captacion", inicioMesAnterior).lte("fecha_captacion", finMesAnterior),
      supabase.from("clientes").select("producto, estado, fecha_inicio"),
    ]);

    // Product stats from leads
    const map: Record<string, {
      total: number; mes: number; mes_ant: number; cerrados: number;
      cerrados_mes: number; en_pipeline: number;
    }> = {};

    function addProd(key: string, ...fields: Partial<typeof map[string]>) {
      if (!map[key]) map[key] = { total: 0, mes: 0, mes_ant: 0, cerrados: 0, cerrados_mes: 0, en_pipeline: 0 };
      for (const [k, v] of Object.entries(fields[0] ?? {})) {
        (map[key] as Record<string, number>)[k] = ((map[key] as Record<string, number>)[k] ?? 0) + (v as number);
      }
    }

    const ESTADOS_CERRADO = ["cerrado_ganado", "cerrado_perdido", "descartado"];
    const ESTADOS_PIPELINE_ACTIVO = ["enriquecido", "segmentado", "mensaje_generado", "mensaje_enviado", "respondio", "cita_agendada", "en_negociacion"];

    for (const l of leads ?? []) {
      const prods = [l.producto_interes_principal, ...(l.productos_recomendados ?? [])].filter(Boolean);
      const uniqueProds = [...new Set(prods.map(p => p?.toLowerCase().replace(/\s+/g, "_")))].filter(Boolean) as string[];
      for (const p of uniqueProds) {
        addProd(p, { total: 1 });
        if (l.estado === "cerrado_ganado") addProd(p, { cerrados: 1 });
        if (ESTADOS_PIPELINE_ACTIVO.includes(l.estado)) addProd(p, { en_pipeline: 1 });
      }
    }

    for (const l of leadsEsteMes ?? []) {
      const prods = [l.producto_interes_principal, ...(l.productos_recomendados ?? [])].filter(Boolean);
      for (const p of [...new Set(prods.map(pp => pp?.toLowerCase().replace(/\s+/g, "_")))].filter(Boolean) as string[]) {
        addProd(p, { mes: 1 });
      }
    }

    for (const l of leadsMesAnt ?? []) {
      const prods = [l.producto_interes_principal, ...(l.productos_recomendados ?? [])].filter(Boolean);
      for (const p of [...new Set(prods.map(pp => pp?.toLowerCase().replace(/\s+/g, "_")))].filter(Boolean) as string[]) {
        addProd(p, { mes_ant: 1 });
      }
    }

    // Cerrados este mes from clients
    for (const c of clientesData ?? []) {
      if (!c.producto) continue;
      const key = c.producto.toLowerCase().replace(/\s+/g, "_");
      if (c.fecha_inicio && c.fecha_inicio >= inicioMes.split("T")[0]) {
        addProd(key, { cerrados_mes: 1 });
      }
    }

    const resultado: ProductoStats[] = Object.entries(map)
      .map(([key, data]) => {
        const cfg = PRODUCTOS_CONFIG[key] ?? { label: key, color: "#94a3b8", emoji: "📋" };
        return {
          key,
          label: cfg.label,
          color: cfg.color,
          emoji: cfg.emoji,
          leads_total: data.total,
          leads_mes: data.mes,
          leads_mes_anterior: data.mes_ant,
          cerrados: data.cerrados,
          cerrados_mes: data.cerrados_mes,
          tasa_conversion: data.total > 0 ? (data.cerrados / data.total) * 100 : 0,
          en_pipeline: data.en_pipeline,
        };
      })
      .filter(p => p.leads_total > 0)
      .sort((a, b) => b.leads_total - a.leads_total);

    setStats(resultado);

    // Sector stats
    const sectorMap: Record<string, { total: number; calientes: number; cerrados: number }> = {};
    for (const l of leads ?? []) {
      if (!l.sector) continue;
      if (!sectorMap[l.sector]) sectorMap[l.sector] = { total: 0, calientes: 0, cerrados: 0 };
      sectorMap[l.sector].total++;
      if (l.temperatura === "caliente") sectorMap[l.sector].calientes++;
      if (l.estado === "cerrado_ganado") sectorMap[l.sector].cerrados++;
    }
    const sectorArr: SectorStats[] = Object.entries(sectorMap)
      .map(([sector, data]) => ({ sector, ...data }))
      .filter(s => s.total >= 2)
      .sort((a, b) => b.total - a.total)
      .slice(0, 12);
    setSectores(sectorArr);

    setCargando(false);
  }, [periodo]);

  useEffect(() => { cargar(); }, [cargar]);

  const maxLeads = Math.max(1, ...stats.map(s => s.leads_total));

  if (!cargandoPermisos && !puede("ver_metricas")) return <SinAcceso />;

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Análisis por producto</h1>
          <p className="text-sm text-slate-500 mt-0.5">Demanda, conversión y pipeline por producto de seguros</p>
        </div>
        <div className="flex gap-2">
          {(["mes", "trimestre", "total"] as const).map(p => (
            <button
              key={p}
              onClick={() => setPeriodo(p)}
              className={`text-sm px-3 py-2 rounded-lg border font-medium transition-colors ${periodo === p ? "text-white border-transparent" : "bg-white border-slate-200 text-slate-600"}`}
              style={periodo === p ? { background: "#ea650d", borderColor: "#ea650d" } : undefined}
            >
              {p === "mes" ? "Este mes" : p === "trimestre" ? "Trimestre" : "Todo"}
            </button>
          ))}
        </div>
      </div>

      {cargando ? (
        <div className="flex justify-center py-16">
          <div className="w-7 h-7 rounded-full border-2 animate-spin" style={{ borderColor: "#ea650d", borderTopColor: "transparent" }} />
        </div>
      ) : (
        <>
          {/* Product cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {stats.map(s => {
              const tendencia = s.leads_mes_anterior > 0
                ? ((s.leads_mes - s.leads_mes_anterior) / s.leads_mes_anterior) * 100
                : null;
              return (
                <div key={s.key} className="bg-white rounded-xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{s.emoji}</span>
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{s.label}</p>
                        <p className="text-xs text-slate-400">{s.leads_total} leads totales</p>
                      </div>
                    </div>
                    {tendencia !== null && (
                      <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${tendencia > 0 ? "bg-green-100 text-green-700" : tendencia < 0 ? "bg-red-100 text-red-600" : "bg-slate-100 text-slate-500"}`}>
                        {tendencia > 0 ? "+" : ""}{Math.round(tendencia)}%
                      </span>
                    )}
                  </div>

                  {/* Mini bar */}
                  <div className="mt-3 mb-2">
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${Math.round((s.leads_total / maxLeads) * 100)}%`, background: s.color }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mt-3">
                    <div className="text-center">
                      <p className="text-lg font-bold text-slate-800">{s.leads_mes}</p>
                      <p className="text-[10px] text-slate-400">este mes</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-slate-800">{s.en_pipeline}</p>
                      <p className="text-[10px] text-slate-400">en pipeline</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold" style={{ color: s.tasa_conversion > 10 ? "#10b981" : s.tasa_conversion > 5 ? "#f59e0b" : "#94a3b8" }}>
                        {s.tasa_conversion.toFixed(1)}%
                      </p>
                      <p className="text-[10px] text-slate-400">conversión</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Sector breakdown */}
          {sectores.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <h2 className="text-sm font-semibold text-slate-700">Leads por sector</h2>
                <p className="text-xs text-slate-400 mt-0.5">Sectores con más de 2 leads</p>
              </div>
              <div className="p-4">
                <div className="space-y-2">
                  {sectores.map(s => {
                    const maxSector = Math.max(1, ...sectores.map(x => x.total));
                    return (
                      <div key={s.sector} className="flex items-center gap-3">
                        <div className="w-28 shrink-0 text-right">
                          <span className="text-xs font-medium text-slate-600 truncate">{s.sector}</span>
                        </div>
                        <div className="flex-1 h-5 bg-slate-50 rounded overflow-hidden relative">
                          <div
                            className="h-full rounded"
                            style={{ width: `${Math.round((s.total / maxSector) * 100)}%`, background: "#ea650d", opacity: 0.7 }}
                          />
                          <div className="absolute inset-0 flex items-center px-2">
                            <span className="text-xs font-medium text-slate-700">{s.total}</span>
                          </div>
                        </div>
                        <div className="w-24 shrink-0 flex gap-2 text-xs text-slate-500">
                          {s.calientes > 0 && (
                            <span className="text-orange-500 font-medium">🔥 {s.calientes}</span>
                          )}
                          {s.cerrados > 0 && (
                            <span className="text-green-600 font-medium">✓ {s.cerrados}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {stats.length === 0 && (
            <div className="bg-white rounded-xl border border-slate-200 py-14 text-center">
              <p className="text-3xl mb-2">📊</p>
              <p className="text-sm font-semibold text-slate-700">Sin datos para mostrar</p>
              <p className="text-xs text-slate-400 mt-1">Los leads deben tener producto asignado para aparecer aquí</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
