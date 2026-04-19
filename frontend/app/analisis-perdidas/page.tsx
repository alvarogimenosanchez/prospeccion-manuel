"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { usePermisos } from "@/components/PermisosProvider";
import { SinAcceso } from "@/components/SinAcceso";

const MOTIVOS_CONFIG: Record<string, { label: string; color: string; bg: string; emoji: string }> = {
  precio:        { label: "Precio",          color: "#ef4444", bg: "#fef2f2", emoji: "💰" },
  competencia:   { label: "Competencia",      color: "#8b5cf6", bg: "#f5f3ff", emoji: "🏆" },
  no_interesado: { label: "Sin interés",      color: "#94a3b8", bg: "#f8fafc", emoji: "😐" },
  timing:        { label: "Timing",           color: "#f59e0b", bg: "#fffbeb", emoji: "⏳" },
  sin_contacto:  { label: "Sin contacto",     color: "#6366f1", bg: "#eef2ff", emoji: "📵" },
  otro:          { label: "Otro",             color: "#64748b", bg: "#f1f5f9", emoji: "❓" },
};

const PRODUCTOS_LABEL: Record<string, string> = {
  contigo_autonomo: "C. Autónomo",
  contigo_pyme: "C. Pyme",
  contigo_familia: "C. Familia",
  contigo_futuro: "C. Futuro",
  contigo_senior: "C. Senior",
  liderplus: "LiderPlus",
  sanitas_salud: "Sanitas Salud",
  mihogar: "MiHogar",
  hipotecas: "Hipoteca",
};

type LeadPerdido = {
  id: string;
  nombre: string;
  apellidos: string | null;
  empresa: string | null;
  sector: string | null;
  producto_interes_principal: string | null;
  motivo_perdida: string | null;
  motivo_perdida_nota: string | null;
  estado: string;
  nivel_interes: number;
  updated_at: string;
  comercial_asignado: string | null;
  comerciales?: { nombre: string; apellidos: string | null } | null;
};

type MotivoStat = {
  motivo: string;
  total: number;
  pct: number;
};

type ProductoStat = {
  producto: string;
  perdidos: number;
  tasa_perdida: number;
};

type ComercialStat = {
  nombre: string;
  perdidos: number;
  tasa_perdida: number;
};

type EtapaStat = {
  etapa: string;
  perdidos: number;
};

const ETAPA_LABEL: Record<string, string> = {
  nuevo: "Nuevo",
  enriquecido: "Enriquecido",
  segmentado: "Segmentado",
  mensaje_generado: "Msg. generado",
  mensaje_enviado: "Contactado",
  respondio: "Respondió",
  cita_agendada: "Cita",
  en_negociacion: "Negociación",
};

export default function AnalisisPerdidasPage() {
  const { puede, cargando: cargandoPermisos } = usePermisos();
  const [periodo, setPeriodo] = useState<"30" | "90" | "180" | "todo">("90");
  const [leads, setLeads] = useState<LeadPerdido[]>([]);
  const [motivoStats, setMotivoStats] = useState<MotivoStat[]>([]);
  const [productoStats, setProductoStats] = useState<ProductoStat[]>([]);
  const [comercialStats, setComercialStats] = useState<ComercialStat[]>([]);
  const [etapaStats, setEtapaStats] = useState<EtapaStat[]>([]);
  const [totalPerdidos, setTotalPerdidos] = useState(0);
  const [totalLeads, setTotalLeads] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [vistaDetalle, setVistaDetalle] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);

    const desde = periodo !== "todo"
      ? new Date(Date.now() - parseInt(periodo) * 86_400_000).toISOString()
      : null;

    let qPerdidos = supabase
      .from("leads")
      .select("id, nombre, apellidos, empresa, sector, producto_interes_principal, motivo_perdida, motivo_perdida_nota, estado, nivel_interes, updated_at, comercial_asignado, comerciales(nombre, apellidos)")
      .in("estado", ["cerrado_perdido", "descartado"]);
    if (desde) qPerdidos = qPerdidos.gte("updated_at", desde);

    let qTodos = supabase.from("leads").select("id", { count: "exact", head: true });
    if (desde) qTodos = qTodos.gte("created_at", desde);

    const [{ data: perdidosData }, { count: totalCount }] = await Promise.all([
      qPerdidos.order("updated_at", { ascending: false }).limit(200),
      qTodos,
    ]);

    const perdidos = (perdidosData as unknown as LeadPerdido[]) ?? [];
    setLeads(perdidos);
    setTotalPerdidos(perdidos.length);
    setTotalLeads(totalCount ?? 0);

    // Motivo stats
    const motivoMap: Record<string, number> = {};
    for (const l of perdidos) {
      const m = l.motivo_perdida ?? "sin_registrar";
      motivoMap[m] = (motivoMap[m] ?? 0) + 1;
    }
    const motivoArr = Object.entries(motivoMap)
      .map(([motivo, total]) => ({ motivo, total, pct: perdidos.length > 0 ? Math.round((total / perdidos.length) * 100) : 0 }))
      .sort((a, b) => b.total - a.total);
    setMotivoStats(motivoArr);

    // Producto stats — need all leads per product to calc rate
    let qAllByProduct = supabase.from("leads").select("estado, producto_interes_principal");
    if (desde) qAllByProduct = qAllByProduct.gte("created_at", desde);
    const { data: allLeads } = await qAllByProduct.not("producto_interes_principal", "is", null);

    const prodTotal: Record<string, number> = {};
    const prodPerdidos: Record<string, number> = {};
    for (const l of allLeads ?? []) {
      const p = l.producto_interes_principal!;
      prodTotal[p] = (prodTotal[p] ?? 0) + 1;
      if (l.estado === "cerrado_perdido" || l.estado === "descartado") {
        prodPerdidos[p] = (prodPerdidos[p] ?? 0) + 1;
      }
    }
    const prodArr: ProductoStat[] = Object.entries(prodTotal)
      .filter(([, t]) => t >= 3)
      .map(([producto, total]) => ({
        producto,
        perdidos: prodPerdidos[producto] ?? 0,
        tasa_perdida: total > 0 ? Math.round(((prodPerdidos[producto] ?? 0) / total) * 100) : 0,
      }))
      .sort((a, b) => b.tasa_perdida - a.tasa_perdida)
      .slice(0, 8);
    setProductoStats(prodArr);

    // Comercial stats
    const comMap: Record<string, { nombre: string; perdidos: number; total: number }> = {};
    for (const l of perdidos) {
      const com = l.comerciales;
      if (!com || !l.comercial_asignado) continue;
      const nombre = [com.nombre, com.apellidos].filter(Boolean).join(" ");
      if (!comMap[l.comercial_asignado]) comMap[l.comercial_asignado] = { nombre, perdidos: 0, total: 0 };
      comMap[l.comercial_asignado].perdidos++;
    }

    // Get total leads per comercial for the period
    let qComerciales = supabase.from("leads").select("comercial_asignado");
    if (desde) qComerciales = qComerciales.gte("created_at", desde);
    const { data: todosLeads } = await qComerciales.not("comercial_asignado", "is", null);
    for (const l of todosLeads ?? []) {
      if (l.comercial_asignado && comMap[l.comercial_asignado]) {
        comMap[l.comercial_asignado].total++;
      }
    }

    const comArr: ComercialStat[] = Object.values(comMap)
      .map(c => ({ nombre: c.nombre, perdidos: c.perdidos, tasa_perdida: c.total > 0 ? Math.round((c.perdidos / c.total) * 100) : 0 }))
      .filter(c => c.perdidos >= 2)
      .sort((a, b) => b.tasa_perdida - a.tasa_perdida);
    setComercialStats(comArr);

    // Etapa at which leads were lost (from lead_state_history — approximate via nivel_interes range)
    const etapaMap: Record<string, number> = {};
    for (const l of perdidos) {
      const nivelToEtapa = l.nivel_interes >= 8 ? "en_negociacion"
        : l.nivel_interes >= 6 ? "cita_agendada"
        : l.nivel_interes >= 4 ? "respondio"
        : l.nivel_interes >= 2 ? "mensaje_enviado"
        : "nuevo";
      etapaMap[nivelToEtapa] = (etapaMap[nivelToEtapa] ?? 0) + 1;
    }
    const etapaArr: EtapaStat[] = Object.entries(etapaMap)
      .map(([etapa, perdidos]) => ({ etapa, perdidos }))
      .sort((a, b) => b.perdidos - a.perdidos);
    setEtapaStats(etapaArr);

    setCargando(false);
  }, [periodo]);

  useEffect(() => { if (!cargandoPermisos) cargar(); }, [cargar, cargandoPermisos]);

  if (!cargandoPermisos && !puede("ver_metricas")) return <SinAcceso />;

  const tasaPerdida = totalLeads > 0 ? Math.round((totalPerdidos / totalLeads) * 100) : 0;
  const sinRegistrar = motivoStats.find(m => m.motivo === "sin_registrar")?.total ?? 0;
  const maxMotivo = Math.max(1, ...motivoStats.filter(m => m.motivo !== "sin_registrar").map(m => m.total));

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Análisis de pérdidas</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Por qué se pierden los leads — detecta patrones para mejorar la conversión
          </p>
        </div>
        <div className="flex gap-2">
          {(["30", "90", "180", "todo"] as const).map(p => (
            <button
              key={p}
              onClick={() => setPeriodo(p)}
              className={`text-sm px-3 py-2 rounded-lg border font-medium transition-colors ${periodo === p ? "text-white border-transparent" : "bg-white border-slate-200 text-slate-600"}`}
              style={periodo === p ? { background: "#ea650d", borderColor: "#ea650d" } : undefined}
            >
              {p === "todo" ? "Todo" : p === "30" ? "30 días" : p === "90" ? "3 meses" : "6 meses"}
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
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Leads perdidos</p>
              <p className="text-2xl font-bold text-red-600 mt-1">{totalPerdidos}</p>
              <p className="text-xs text-slate-400 mt-0.5">en el período</p>
            </div>
            <div className={`rounded-xl border p-4 ${tasaPerdida > 40 ? "bg-red-50 border-red-200" : tasaPerdida > 20 ? "bg-amber-50 border-amber-200" : "bg-white border-slate-200"}`}>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Tasa de pérdida</p>
              <p className={`text-2xl font-bold mt-1 ${tasaPerdida > 40 ? "text-red-600" : tasaPerdida > 20 ? "text-amber-600" : "text-emerald-600"}`}>{tasaPerdida}%</p>
              <p className="text-xs text-slate-400 mt-0.5">del total de leads</p>
            </div>
            <div className={`rounded-xl border p-4 ${sinRegistrar > 0 ? "bg-amber-50 border-amber-200" : "bg-white border-slate-200"}`}>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Sin motivo registrado</p>
              <p className={`text-2xl font-bold mt-1 ${sinRegistrar > 0 ? "text-amber-600" : "text-emerald-600"}`}>{sinRegistrar}</p>
              <p className="text-xs text-slate-400 mt-0.5">{sinRegistrar > 0 ? "datos incompletos" : "todos registrados"}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Motivo principal</p>
              <p className="text-lg font-bold text-slate-800 mt-1 truncate">
                {motivoStats.filter(m => m.motivo !== "sin_registrar")[0]
                  ? (MOTIVOS_CONFIG[motivoStats.filter(m => m.motivo !== "sin_registrar")[0].motivo]?.emoji ?? "❓") + " " +
                    (MOTIVOS_CONFIG[motivoStats.filter(m => m.motivo !== "sin_registrar")[0].motivo]?.label ?? motivoStats[0].motivo)
                  : "—"}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                {motivoStats.filter(m => m.motivo !== "sin_registrar")[0]?.pct ?? 0}% de los casos
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Motivos breakdown */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <h2 className="text-sm font-semibold text-slate-700">Razones de pérdida</h2>
                <p className="text-xs text-slate-400 mt-0.5">Distribución por motivo registrado</p>
              </div>
              <div className="p-5 space-y-3">
                {motivoStats.filter(m => m.motivo !== "sin_registrar").length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-8">Sin datos de motivos registrados</p>
                ) : (
                  motivoStats.filter(m => m.motivo !== "sin_registrar").map(m => {
                    const cfg = MOTIVOS_CONFIG[m.motivo] ?? { label: m.motivo, color: "#94a3b8", bg: "#f1f5f9", emoji: "❓" };
                    return (
                      <div key={m.motivo}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-slate-700">{cfg.emoji} {cfg.label}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-slate-800">{m.total}</span>
                            <span className="text-xs px-1.5 py-0.5 rounded-full font-semibold" style={{ background: cfg.bg, color: cfg.color }}>{m.pct}%</span>
                          </div>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${Math.round((m.total / maxMotivo) * 100)}%`, background: cfg.color }} />
                        </div>
                      </div>
                    );
                  })
                )}
                {sinRegistrar > 0 && (
                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-amber-600">
                    <span>⚠️ {sinRegistrar} lead{sinRegistrar > 1 ? "s" : ""} sin motivo registrado</span>
                    <span className="text-slate-400">{Math.round((sinRegistrar / totalPerdidos) * 100)}%</span>
                  </div>
                )}
              </div>
            </div>

            {/* Etapa en que se pierde */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <h2 className="text-sm font-semibold text-slate-700">¿En qué etapa se pierde el lead?</h2>
                <p className="text-xs text-slate-400 mt-0.5">Basado en nivel de interés al momento del cierre</p>
              </div>
              <div className="p-5 space-y-3">
                {etapaStats.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-8">Sin datos suficientes</p>
                ) : (
                  (() => {
                    const maxEtapa = Math.max(1, ...etapaStats.map(e => e.perdidos));
                    return etapaStats.map(e => (
                      <div key={e.etapa}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-slate-700">{ETAPA_LABEL[e.etapa] ?? e.etapa}</span>
                          <span className="text-sm font-bold text-slate-800">{e.perdidos}</span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-red-400" style={{ width: `${Math.round((e.perdidos / maxEtapa) * 100)}%` }} />
                        </div>
                      </div>
                    ));
                  })()
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Producto con más pérdidas */}
            {productoStats.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100">
                  <h2 className="text-sm font-semibold text-slate-700">Tasa de pérdida por producto</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Productos con más de 3 leads en el período</p>
                </div>
                <div className="divide-y divide-slate-50">
                  {productoStats.map(p => (
                    <div key={p.producto} className="flex items-center justify-between px-5 py-3">
                      <span className="text-sm text-slate-700">{PRODUCTOS_LABEL[p.producto] ?? p.producto}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-400">{p.perdidos} perdidos</span>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${p.tasa_perdida > 50 ? "bg-red-100 text-red-700" : p.tasa_perdida > 30 ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"}`}>
                          {p.tasa_perdida}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Comercial con más pérdidas */}
            {comercialStats.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100">
                  <h2 className="text-sm font-semibold text-slate-700">Tasa de pérdida por comercial</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Comerciales con más de 2 leads perdidos</p>
                </div>
                <div className="divide-y divide-slate-50">
                  {comercialStats.map(c => (
                    <div key={c.nombre} className="flex items-center justify-between px-5 py-3">
                      <span className="text-sm text-slate-700">{c.nombre}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-400">{c.perdidos} perdidos</span>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${c.tasa_perdida > 50 ? "bg-red-100 text-red-700" : c.tasa_perdida > 30 ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"}`}>
                          {c.tasa_perdida}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Insight box */}
          {motivoStats.filter(m => m.motivo !== "sin_registrar").length > 0 && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-5 py-4">
              <p className="text-sm font-semibold text-blue-800 mb-2">💡 Insights y acciones recomendadas</p>
              <ul className="space-y-1.5">
                {motivoStats.filter(m => m.motivo !== "sin_registrar" && m.pct >= 20).map(m => {
                  const insights: Record<string, string> = {
                    precio: "Considera ofrecer comparativas de valor o planes de pago más flexibles antes del cierre.",
                    competencia: "Analiza qué ventajas ofrece la competencia y refuerza la propuesta de valor diferencial.",
                    no_interesado: "Revisa si el proceso de segmentación está filtrando bien los leads antes de asignarlos.",
                    timing: "Implementa secuencias de nurturing automático para volver a contactar en 3-6 meses.",
                    sin_contacto: "Aumenta los intentos de contacto (3 toques mínimo) antes de marcar como perdido.",
                  };
                  const cfg = MOTIVOS_CONFIG[m.motivo];
                  return (
                    <li key={m.motivo} className="text-xs text-blue-700 flex items-start gap-2">
                      <span className="shrink-0">{cfg?.emoji ?? "•"}</span>
                      <span><strong>{cfg?.label ?? m.motivo} ({m.pct}%):</strong> {insights[m.motivo] ?? "Analiza los casos individuales para detectar patrones."}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Detalle de leads */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-700">Lista de leads perdidos</h2>
                <p className="text-xs text-slate-400 mt-0.5">{leads.length} leads — ordenados por fecha</p>
              </div>
              <button
                onClick={() => setVistaDetalle(v => !v)}
                className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
              >
                {vistaDetalle ? "Ocultar lista" : "Ver lista completa"}
              </button>
            </div>
            {vistaDetalle && (
              <div className="divide-y divide-slate-50">
                {leads.slice(0, 50).map(l => {
                  const cfg = l.motivo_perdida ? (MOTIVOS_CONFIG[l.motivo_perdida] ?? { label: l.motivo_perdida, color: "#94a3b8", bg: "#f1f5f9", emoji: "❓" }) : null;
                  const nombre = [l.nombre, l.apellidos].filter(Boolean).join(" ");
                  const diasDesde = Math.round((Date.now() - new Date(l.updated_at).getTime()) / 86_400_000);
                  return (
                    <div key={l.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 transition-colors">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link href={`/leads/${l.id}`} className="text-sm font-medium text-slate-800 hover:text-orange-600 transition-colors truncate">
                            {nombre || "Sin nombre"}
                          </Link>
                          {l.empresa && <span className="text-xs text-slate-400 truncate">{l.empresa}</span>}
                          {l.producto_interes_principal && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 shrink-0">
                              {PRODUCTOS_LABEL[l.producto_interes_principal] ?? l.producto_interes_principal}
                            </span>
                          )}
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${l.estado === "cerrado_perdido" ? "bg-red-50 text-red-600" : "bg-slate-100 text-slate-500"}`}>
                            {l.estado === "cerrado_perdido" ? "Perdido" : "Descartado"}
                          </span>
                        </div>
                        {l.motivo_perdida_nota && (
                          <p className="text-xs text-slate-400 mt-0.5 truncate">"{l.motivo_perdida_nota}"</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {cfg ? (
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: cfg.bg, color: cfg.color }}>
                            {cfg.emoji} {cfg.label}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-300">Sin motivo</span>
                        )}
                        <span className="text-xs text-slate-300">Hace {diasDesde}d</span>
                      </div>
                    </div>
                  );
                })}
                {leads.length > 50 && (
                  <div className="px-5 py-3 bg-slate-50 text-center text-xs text-slate-400">
                    Mostrando 50 de {leads.length} leads. Usa <Link href="/recuperar" className="text-orange-500 hover:underline">Recuperar leads</Link> para gestionar todos.
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
