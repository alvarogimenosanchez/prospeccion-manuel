"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { usePermisos } from "@/components/PermisosProvider";
import { SinAcceso } from "@/components/SinAcceso";
import { format, parseISO, differenceInDays } from "date-fns";
import { es } from "date-fns/locale";

// ─── Types ──────────────────────────────────────────────────────────────────

type KpiBloque = {
  etiqueta: string;
  valor: string | number;
  sub?: string;
  color?: string;
  link?: string;
  tendencia?: number;
};

type Alerta = {
  tipo: "critico" | "importante" | "info";
  emoji: string;
  titulo: string;
  sub: string;
  link: string;
};

type ComercialResumen = {
  id: string;
  nombre: string;
  apellidos: string | null;
  rol: string;
  leads_activos: number;
  ganados_mes: number;
  objetivo_cierres: number;
  calientes: number;
  sin_actividad_7d: number;
  ingresos_mes: number;
};

type EstadoPipeline = {
  estado: string;
  n: number;
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toLocaleString("es-ES", { maximumFractionDigits: 0 }) + " €";
}

function pct(v: number, obj: number): number {
  if (obj <= 0) return 0;
  return Math.min(150, Math.round((v / obj) * 100));
}

const ESTADO_ORDEN: Record<string, number> = {
  nuevo: 0, segmentado: 1, mensaje_generado: 2, mensaje_enviado: 3,
  respondio: 4, cita_agendada: 5, en_negociacion: 6,
  cerrado_ganado: 7, cerrado_perdido: 8,
};

const ESTADO_LABEL: Record<string, string> = {
  nuevo: "Nuevo", segmentado: "Segmentado", mensaje_enviado: "Contactado",
  respondio: "Respondió", cita_agendada: "Cita", en_negociacion: "Negociación",
  cerrado_ganado: "Ganado",
};

const ESTADO_COLOR: Record<string, string> = {
  nuevo: "#94a3b8", segmentado: "#38bdf8", mensaje_enviado: "#3b82f6",
  respondio: "#f59e0b", cita_agendada: "#f97316", en_negociacion: "#8b5cf6",
  cerrado_ganado: "#10b981",
};

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KpiCard({ etiqueta, valor, sub, color = "#ea650d", link, tendencia }: KpiBloque) {
  const card = (
    <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 hover:border-orange-200 transition-colors">
      <p className="text-xs text-slate-500 mb-1">{etiqueta}</p>
      <p className="text-2xl font-bold" style={{ color }}>{valor}</p>
      <div className="flex items-center gap-1 mt-0.5">
        {tendencia !== undefined && (
          <span className={`text-xs font-semibold ${tendencia >= 0 ? "text-green-600" : "text-red-500"}`}>
            {tendencia >= 0 ? "▲" : "▼"} {Math.abs(tendencia)}%
          </span>
        )}
        {sub && <p className="text-xs text-slate-400">{sub}</p>}
      </div>
    </div>
  );
  return link ? <Link href={link}>{card}</Link> : card;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MandoPage() {
  const { puede, cargando: cargandoPermisos } = usePermisos();
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState<KpiBloque[]>([]);
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [comerciales, setComerciales] = useState<ComercialResumen[]>([]);
  const [pipeline, setPipeline] = useState<EstadoPipeline[]>([]);
  const [ingresosMes, setIngresosMes] = useState(0);
  const [ingresosYear, setIngresosYear] = useState(0);
  const [actualizadoEn, setActualizadoEn] = useState<Date | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    const ahora = new Date();
    const inicioMes   = new Date(ahora.getFullYear(), ahora.getMonth(), 1).toISOString();
    const finMes      = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0, 23, 59, 59).toISOString();
    const inicioYear  = new Date(ahora.getFullYear(), 0, 1).toISOString();
    const hace7d      = new Date(Date.now() - 7 * 86400_000).toISOString();
    const hace2h      = new Date(Date.now() - 2 * 3600_000).toISOString();
    const en7d        = new Date(Date.now() + 7 * 86400_000).toISOString().split("T")[0];
    const en30d       = new Date(Date.now() + 30 * 86400_000).toISOString().split("T")[0];
    const hoyStr      = ahora.toISOString().split("T")[0];

    // ── parallel fetches ──
    const [
      { data: leadsActivos,  count: totalActivos   },
      { data: ganados,       count: ganadosMes     },
      { data: calientes,     count: nCalientes     },
      { data: nuevos24h,     count: nNuevos24h     },
      { count: nSinAsignar  },
      { data: comsData                              },
      { data: sinActividad7d                        },
      { count: nSlaBreaches },
      { data: renovaciones                          },
      { data: clientesYearData                      },
      { data: clientesMesData                       },
      { data: citas                                 },
      { data: negoc                                 },
    ] = await Promise.all([
      supabase.from("leads").select("id, estado, comercial_asignado, temperatura, updated_at", { count: "exact" })
        .not("estado", "in", "(cerrado_ganado,cerrado_perdido,descartado)"),
      supabase.from("leads").select("id, comercial_asignado", { count: "exact" })
        .eq("estado", "cerrado_ganado").gte("updated_at", inicioMes).lte("updated_at", finMes),
      supabase.from("leads").select("id, comercial_asignado", { count: "exact" })
        .eq("temperatura", "caliente").not("estado", "in", "(cerrado_ganado,cerrado_perdido,descartado)"),
      supabase.from("leads").select("id", { count: "exact" })
        .gte("created_at", hace7d),
      supabase.from("leads").select("id", { count: "exact" })
        .is("comercial_asignado", null)
        .not("estado", "in", "(cerrado_ganado,cerrado_perdido,descartado)"),
      supabase.from("comerciales").select("id, nombre, apellidos, rol, activo, objetivo_cierres_mes, max_leads_activos").eq("activo", true).order("nombre"),
      supabase.from("leads").select("id, comercial_asignado")
        .not("estado", "in", "(cerrado_ganado,cerrado_perdido,descartado)")
        .lt("updated_at", hace7d),
      supabase.from("leads").select("id", { count: "exact" })
        .in("estado", ["nuevo", "enriquecido", "segmentado"])
        .lt("created_at", hace2h),
      supabase.from("clientes").select("id, fecha_renovacion, valor_contrato, estado")
        .gte("fecha_renovacion", hoyStr).lte("fecha_renovacion", en30d).neq("estado", "cancelado"),
      supabase.from("clientes").select("valor_contrato").gte("created_at", inicioYear),
      supabase.from("clientes").select("valor_contrato").gte("created_at", inicioMes).lte("created_at", finMes),
      supabase.from("appointments").select("id, fecha_hora, estado")
        .gte("fecha_hora", ahora.toISOString()).lte("fecha_hora", finMes)
        .not("estado", "in", "(cancelada,no_asistio)"),
      supabase.from("leads").select("id, comercial_asignado")
        .eq("estado", "en_negociacion"),
    ]);

    // ── Revenue ──
    const iYear = (clientesYearData ?? []).reduce((s, c) => s + (c.valor_contrato ?? 0), 0);
    const iMes  = (clientesMesData  ?? []).reduce((s, c) => s + (c.valor_contrato ?? 0), 0);
    setIngresosMes(iMes);
    setIngresosYear(iYear);

    // ── Pipeline distribution ──
    const estadoCount: Record<string, number> = {};
    for (const l of leadsActivos ?? []) {
      estadoCount[l.estado] = (estadoCount[l.estado] ?? 0) + 1;
    }
    const pipelineArr: EstadoPipeline[] = Object.entries(estadoCount)
      .map(([estado, n]) => ({ estado, n }))
      .filter(e => ESTADO_LABEL[e.estado])
      .sort((a, b) => (ESTADO_ORDEN[a.estado] ?? 99) - (ESTADO_ORDEN[b.estado] ?? 99));
    setPipeline(pipelineArr);

    // ── Per-comercial stats ──
    const comSinActividad = new Map<string, number>();
    for (const l of sinActividad7d ?? []) {
      if (l.comercial_asignado) {
        comSinActividad.set(l.comercial_asignado, (comSinActividad.get(l.comercial_asignado) ?? 0) + 1);
      }
    }
    const comGanados = new Map<string, number>();
    for (const l of ganados ?? []) {
      if (l.comercial_asignado) comGanados.set(l.comercial_asignado, (comGanados.get(l.comercial_asignado) ?? 0) + 1);
    }
    const comCalientes = new Map<string, number>();
    for (const l of calientes ?? []) {
      if (l.comercial_asignado) comCalientes.set(l.comercial_asignado, (comCalientes.get(l.comercial_asignado) ?? 0) + 1);
    }
    const comActivos = new Map<string, number>();
    for (const l of leadsActivos ?? []) {
      if (l.comercial_asignado) comActivos.set(l.comercial_asignado, (comActivos.get(l.comercial_asignado) ?? 0) + 1);
    }
    const comNegoc = new Map<string, number>();
    for (const l of negoc ?? []) {
      if (l.comercial_asignado) comNegoc.set(l.comercial_asignado, (comNegoc.get(l.comercial_asignado) ?? 0) + 1);
    }

    const comResumen: ComercialResumen[] = (comsData ?? [])
      .filter(c => c.rol !== "admin")
      .map(c => ({
        id: c.id,
        nombre: c.nombre,
        apellidos: c.apellidos,
        rol: c.rol,
        leads_activos: comActivos.get(c.id) ?? 0,
        ganados_mes: comGanados.get(c.id) ?? 0,
        objetivo_cierres: c.objetivo_cierres_mes ?? 0,
        calientes: comCalientes.get(c.id) ?? 0,
        sin_actividad_7d: comSinActividad.get(c.id) ?? 0,
        ingresos_mes: 0,
      }))
      .sort((a, b) => b.ganados_mes - a.ganados_mes || b.leads_activos - a.leads_activos);
    setComerciales(comResumen);

    // ── Alerts ──
    const as: Alerta[] = [];
    if ((nSinAsignar ?? 0) > 0) {
      as.push({
        tipo: "critico", emoji: "🚨",
        titulo: `${nSinAsignar} leads sin asignar`,
        sub: "Leads activos sin comercial responsable",
        link: "/leads?sin_asignar=1",
      });
    }
    if ((nSlaBreaches ?? 0) > 0) {
      as.push({
        tipo: "critico", emoji: "⏰",
        titulo: `${nSlaBreaches} leads sin primer contacto (>2h)`,
        sub: "Nuevos leads que no han recibido mensaje de bienvenida",
        link: "/sla",
      });
    }
    const renovVencer7d = (renovaciones ?? []).filter(r => {
      const dias = differenceInDays(parseISO(r.fecha_renovacion), ahora);
      return dias >= 0 && dias <= 7;
    });
    if (renovVencer7d.length > 0) {
      const valor = renovVencer7d.reduce((s, r) => s + (r.valor_contrato ?? 0), 0);
      as.push({
        tipo: "critico", emoji: "📋",
        titulo: `${renovVencer7d.length} renovaciones esta semana`,
        sub: `${fmt(valor)} en riesgo de no renovar`,
        link: "/renovaciones",
      });
    }
    // Comercials with many stale leads
    const masAtascado = comResumen.filter(c => c.sin_actividad_7d > 5);
    if (masAtascado.length > 0) {
      as.push({
        tipo: "importante", emoji: "😴",
        titulo: `${masAtascado.length} comercial${masAtascado.length > 1 ? "es" : ""} con leads inactivos (+7d)`,
        sub: `${masAtascado.map(c => c.nombre).slice(0, 2).join(", ")}${masAtascado.length > 2 ? "..." : ""}`,
        link: "/coaching",
      });
    }
    if ((nNuevos24h ?? 0) > 10) {
      as.push({
        tipo: "info", emoji: "📈",
        titulo: `${nNuevos24h} leads nuevos esta semana`,
        sub: "Buen volumen de captación reciente",
        link: "/leads",
      });
    }
    if ((citas ?? []).length > 0) {
      as.push({
        tipo: "info", emoji: "📅",
        titulo: `${(citas ?? []).length} citas programadas este mes`,
        sub: "Reuniones con leads confirmadas",
        link: "/agenda",
      });
    }
    setAlertas(as);

    // ── KPIs ──
    setKpis([
      { etiqueta: "Ingresos este mes", valor: fmt(iMes), color: "#10b981", link: "/ingresos" },
      { etiqueta: "Ingresos este año", valor: fmt(iYear), sub: "clientes captados", color: "#10b981", link: "/ingresos" },
      { etiqueta: "Cierres este mes", valor: ganadosMes ?? 0, sub: "leads ganados", color: "#ea650d", link: "/metricas" },
      { etiqueta: "Pipeline activo", valor: totalActivos ?? 0, sub: "leads en proceso", link: "/pipeline" },
      { etiqueta: "Leads calientes", valor: nCalientes ?? 0, sub: "temperatura caliente", color: "#ef4444", link: "/leads?temperatura=caliente" },
      { etiqueta: "En negociación", valor: (negoc ?? []).length, sub: "deals abiertos", color: "#8b5cf6", link: "/negociaciones" },
      { etiqueta: "Renovaciones 30d", valor: (renovaciones ?? []).length, sub: "pólizas a vencer", color: "#f59e0b", link: "/renovaciones" },
      { etiqueta: "Citas este mes", valor: (citas ?? []).length, sub: "reuniones programadas", link: "/agenda" },
    ]);

    setActualizadoEn(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!cargandoPermisos && puede("ver_metricas")) cargar();
  }, [cargar, cargandoPermisos, puede]);

  if (!cargandoPermisos && !puede("ver_metricas")) return <SinAcceso />;

  const maxActivos = Math.max(...comerciales.map(c => c.leads_activos), 1);
  const maxPipelineN = Math.max(...pipeline.map(e => e.n), 1);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Centro de mando</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Vista ejecutiva — {actualizadoEn ? `actualizado ${format(actualizadoEn, "HH:mm", { locale: es })}` : "cargando..."}
          </p>
        </div>
        <button onClick={cargar} disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 12a9 9 0 019-9 9.75 9.75 0 016.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
            <path d="M21 12a9 9 0 01-9 9 9.75 9.75 0 01-6.74-2.74L3 16" />
          </svg>
          Actualizar
        </button>
      </div>

      {/* Alerts */}
      {!loading && alertas.length > 0 && (
        <div className="space-y-2">
          {alertas.map((a, i) => (
            <Link key={i} href={a.link}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm transition-colors hover:opacity-80 ${
                a.tipo === "critico"    ? "bg-red-50 border-red-200" :
                a.tipo === "importante"? "bg-amber-50 border-amber-200" :
                                         "bg-blue-50 border-blue-200"
              }`}>
              <span className="text-lg">{a.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className={`font-semibold text-sm ${a.tipo === "critico" ? "text-red-800" : a.tipo === "importante" ? "text-amber-800" : "text-blue-800"}`}>
                  {a.titulo}
                </p>
                <p className={`text-xs mt-0.5 ${a.tipo === "critico" ? "text-red-600" : a.tipo === "importante" ? "text-amber-600" : "text-blue-600"}`}>
                  {a.sub}
                </p>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 opacity-60">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </Link>
          ))}
        </div>
      )}

      {/* KPI Grid */}
      {loading ? (
        <div className="py-16 text-center text-sm text-slate-400">Cargando datos ejecutivos...</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {kpis.map((k, i) => <KpiCard key={i} {...k} />)}
          </div>

          {/* Revenue progress bars */}
          <div className="bg-white rounded-xl border border-slate-200 px-5 py-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-4">Ingresos del año</h2>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-500">Este mes</span>
                  <span className="font-semibold text-slate-800">{fmt(ingresosMes)}</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-orange-400"
                    style={{ width: `${Math.min(100, ingresosYear > 0 ? (ingresosMes / ingresosYear) * 100 * 12 : 0)}%` }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-500">Acumulado año</span>
                  <span className="font-semibold text-slate-800">{fmt(ingresosYear)}</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-green-500" style={{ width: "100%" }} />
                </div>
              </div>
            </div>
          </div>

          {/* Pipeline visualization */}
          <div className="bg-white rounded-xl border border-slate-200 px-5 py-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-slate-700">Estado del pipeline</h2>
              <Link href="/pipeline" className="text-xs text-orange-600 hover:underline">Ver kanban →</Link>
            </div>
            <div className="space-y-2">
              {pipeline.filter(e => e.estado !== "cerrado_ganado").map(e => (
                <div key={e.estado} className="flex items-center gap-3">
                  <span className="text-xs text-slate-500 w-24 shrink-0 truncate">{ESTADO_LABEL[e.estado] ?? e.estado}</span>
                  <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all"
                      style={{ width: `${Math.round((e.n / maxPipelineN) * 100)}%`, background: ESTADO_COLOR[e.estado] ?? "#94a3b8" }} />
                  </div>
                  <span className="text-xs font-semibold text-slate-700 w-6 text-right">{e.n}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Team performance table */}
          {comerciales.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-700">Rendimiento del equipo</h2>
                  <Link href="/coaching" className="text-xs text-orange-600 hover:underline">Ver detalle →</Link>
                </div>
              </div>
              <div className="divide-y divide-slate-50">
                {comerciales.map((c, i) => {
                  const cumplimiento = pct(c.ganados_mes, c.objetivo_cierres);
                  const cumplColor = cumplimiento >= 80 ? "#10b981" : cumplimiento >= 50 ? "#f59e0b" : "#ef4444";
                  return (
                    <div key={c.id} className="px-5 py-3 grid grid-cols-12 gap-2 items-center hover:bg-slate-50 transition-colors">
                      <div className="col-span-1 text-xs text-slate-400 font-mono">{i + 1}</div>
                      <div className="col-span-4">
                        <p className="text-sm font-medium text-slate-800">{c.nombre} {c.apellidos}</p>
                        <p className="text-xs text-slate-400 capitalize">{c.rol}</p>
                      </div>
                      <div className="col-span-3">
                        <div className="flex items-center gap-1.5">
                          <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${cumplimiento}%`, background: cumplColor }} />
                          </div>
                          <span className="text-xs font-semibold" style={{ color: cumplColor }}>
                            {c.ganados_mes}/{c.objetivo_cierres}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">cierres</p>
                      </div>
                      <div className="col-span-2 text-right hidden md:block">
                        <p className="text-sm font-semibold text-red-600">{c.calientes}</p>
                        <p className="text-xs text-slate-400">calientes</p>
                      </div>
                      <div className="col-span-2 text-right hidden lg:block">
                        {c.sin_actividad_7d > 5 ? (
                          <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
                            {c.sin_actividad_7d} inactivos
                          </span>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quick links */}
          <div className="bg-white rounded-xl border border-slate-200 px-5 py-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-3">Accesos rápidos dirección</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {[
                { href: "/objetivos",   icon: "🎯", label: "Objetivos",   sub: "Metas del equipo" },
                { href: "/forecast",    icon: "📈", label: "Forecast",    sub: "Proyección ventas" },
                { href: "/comisiones",  icon: "💰", label: "Comisiones",  sub: "Retribución" },
                { href: "/coaching",    icon: "🧑‍💼", label: "Coaching",   sub: "Desempeño individual" },
                { href: "/reportes",    icon: "📋", label: "Reportes",    sub: "Informes periódicos" },
                { href: "/presupuestos",icon: "📄", label: "Presupuestos",sub: "Propuestas enviadas" },
                { href: "/tendencias",  icon: "📊", label: "Tendencias",  sub: "Evolución KPIs" },
                { href: "/equipos",     icon: "👥", label: "Equipos",     sub: "Estructura y roles" },
              ].map(q => (
                <Link key={q.href} href={q.href}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-slate-100 hover:border-orange-200 hover:bg-orange-50 transition-colors">
                  <span className="text-xl">{q.icon}</span>
                  <div>
                    <p className="text-xs font-semibold text-slate-700">{q.label}</p>
                    <p className="text-xs text-slate-400">{q.sub}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
