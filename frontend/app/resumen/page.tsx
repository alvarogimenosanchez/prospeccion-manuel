"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { usePermisos } from "@/components/PermisosProvider";
import { SinAcceso } from "@/components/SinAcceso";

type Periodo = "semana" | "mes" | "mes_anterior";

type KPI = { label: string; valor: number | string; sub: string; color?: string; href?: string };

type TopComercial = {
  nombre: string;
  cierres: number;
  citas: number;
  objetivo_cierres: number;
};

type DealGanado = {
  nombre: string;
  empresa: string | null;
  producto: string | null;
  comercial: string;
};

type Resumen = {
  periodo_label: string;
  kpis: KPI[];
  top_comerciales: TopComercial[];
  deals_ganados: DealGanado[];
  alertas: string[];
  snapshot_pipeline: { etapa: string; count: number }[];
};

const ETAPA_LABEL: Record<string, string> = {
  nuevo: "Nuevos", enriquecido: "Enriquecidos", segmentado: "Segmentados",
  mensaje_enviado: "Contactados", respondio: "Respondieron",
  cita_agendada: "Citas", en_negociacion: "Negociación",
};

export default function ResumenPage() {
  const { puede, cargando: cargandoPermisos } = usePermisos();
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [cargando, setCargando] = useState(true);
  const [copiado, setCopiado] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);

    const ahora = new Date();
    let desde: Date, hasta: Date, periodoLabel: string;

    if (periodo === "semana") {
      const diasDesde = ahora.getDay() === 0 ? 6 : ahora.getDay() - 1;
      desde = new Date(ahora); desde.setDate(ahora.getDate() - diasDesde); desde.setHours(0, 0, 0, 0);
      hasta = new Date();
      periodoLabel = `Semana del ${desde.toLocaleDateString("es-ES", { day: "numeric", month: "long" })}`;
    } else if (periodo === "mes") {
      desde = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
      hasta = new Date();
      periodoLabel = ahora.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
      periodoLabel = periodoLabel.charAt(0).toUpperCase() + periodoLabel.slice(1);
    } else {
      desde = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1);
      hasta = new Date(ahora.getFullYear(), ahora.getMonth(), 0, 23, 59, 59);
      periodoLabel = desde.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
      periodoLabel = periodoLabel.charAt(0).toUpperCase() + periodoLabel.slice(1);
    }

    const desdeISO = desde.toISOString();
    const hastaISO = hasta.toISOString();
    const hoyStr = ahora.toISOString().split("T")[0];
    const en7dias = new Date(Date.now() + 7 * 86400_000).toISOString().split("T")[0];

    const [
      { data: cierresData },
      { data: citasData },
      { data: leadsNuevosRes },
      { data: respondioRes },
      { count: renovCount },
      { count: mensajesCount },
      { data: pipelineData },
      { data: comercialesData },
    ] = await Promise.all([
      supabase.from("leads").select("comercial_asignado, nombre, apellidos, empresa, producto_interes_principal, comerciales(nombre, apellidos)")
        .eq("estado", "cerrado_ganado").gte("updated_at", desdeISO).lte("updated_at", hastaISO),
      supabase.from("appointments").select("comercial_id")
        .gte("fecha_hora", desdeISO).lte("fecha_hora", hastaISO)
        .not("estado", "in", "(cancelada,no_asistio)"),
      supabase.from("leads").select("id", { count: "exact", head: false })
        .gte("fecha_captacion", desdeISO).lte("fecha_captacion", hastaISO),
      supabase.from("leads").select("id", { count: "exact", head: false })
        .in("estado", ["respondio", "cita_agendada", "en_negociacion", "cerrado_ganado"])
        .gte("updated_at", desdeISO).lte("updated_at", hastaISO),
      supabase.from("clientes").select("id", { count: "exact", head: true })
        .eq("estado", "activo").lte("fecha_renovacion", en7dias).gte("fecha_renovacion", hoyStr),
      supabase.from("mensajes_pendientes").select("id", { count: "exact", head: true }).eq("estado", "pendiente"),
      supabase.from("leads").select("estado").not("estado", "in", "(cerrado_ganado,cerrado_perdido,descartado)"),
      supabase.from("comerciales").select("id, nombre, apellidos, objetivo_cierres_mes, objetivo_citas_mes").eq("activo", true).not("rol", "eq", "admin"),
    ]);

    const totalCierres = (cierresData ?? []).length;
    const totalCitas = (citasData ?? []).length;
    const totalNuevos = (leadsNuevosRes ?? []).length;
    const totalRespondio = (respondioRes ?? []).length;

    // Deals ganados list
    const dealsGanados: DealGanado[] = (cierresData ?? []).slice(0, 10).map((l: any) => ({
      nombre: [l.nombre, l.apellidos].filter(Boolean).join(" ") || "Sin nombre",
      empresa: l.empresa ?? null,
      producto: l.producto_interes_principal ?? null,
      comercial: l.comerciales ? `${l.comerciales.nombre ?? ""}${l.comerciales.apellidos ? " " + l.comerciales.apellidos : ""}` : "—",
    }));

    // Top comerciales
    const comCierresMap: Record<string, number> = {};
    const comCitasMap: Record<string, number> = {};
    for (const l of cierresData ?? []) {
      if (l.comercial_asignado) comCierresMap[l.comercial_asignado] = (comCierresMap[l.comercial_asignado] ?? 0) + 1;
    }
    for (const c of citasData ?? []) {
      if (c.comercial_id) comCitasMap[c.comercial_id] = (comCitasMap[c.comercial_id] ?? 0) + 1;
    }

    const topComerciales: TopComercial[] = (comercialesData ?? [])
      .map((c: any) => ({
        nombre: [c.nombre, c.apellidos].filter(Boolean).join(" "),
        cierres: comCierresMap[c.id] ?? 0,
        citas: comCitasMap[c.id] ?? 0,
        objetivo_cierres: c.objetivo_cierres_mes ?? 5,
      }))
      .filter(c => c.cierres > 0 || c.citas > 0)
      .sort((a, b) => b.cierres - a.cierres);

    // Pipeline snapshot
    const estadoCount: Record<string, number> = {};
    for (const l of pipelineData ?? []) {
      estadoCount[l.estado] = (estadoCount[l.estado] ?? 0) + 1;
    }
    const snapshotPipeline = Object.entries(estadoCount)
      .filter(([etapa]) => ETAPA_LABEL[etapa])
      .map(([etapa, count]) => ({ etapa, count }))
      .sort((a, b) => Object.keys(ETAPA_LABEL).indexOf(a.etapa) - Object.keys(ETAPA_LABEL).indexOf(b.etapa));

    // Alertas
    const alertas: string[] = [];
    if ((renovCount ?? 0) > 0) alertas.push(`${renovCount} póliza${renovCount! > 1 ? "s" : ""} vencen en los próximos 7 días`);
    if ((mensajesCount ?? 0) > 0) alertas.push(`${mensajesCount} mensajes IA pendientes de revisión`);
    if (totalCierres === 0) alertas.push("Sin cierres registrados en el período — revisar pipeline activo");

    const tasa = totalNuevos > 0 ? Math.round((totalCierres / totalNuevos) * 100) : 0;

    const kpis: KPI[] = [
      { label: "Cierres", valor: totalCierres, sub: "leads ganados", color: totalCierres > 0 ? "#10b981" : undefined, href: "/leads?estado=cerrado_ganado" },
      { label: "Citas", valor: totalCitas, sub: "reuniones realizadas", href: "/agenda" },
      { label: "Leads nuevos", valor: totalNuevos, sub: "captados en período", href: "/leads" },
      { label: "Respondieron", valor: totalRespondio, sub: "leads activos respondidos", href: "/pipeline" },
      { label: "Conversión", valor: `${tasa}%`, sub: "nuevos → ganados", color: tasa > 10 ? "#10b981" : tasa > 5 ? "#f59e0b" : "#ef4444" },
      { label: "Pipeline activo", valor: (pipelineData ?? []).length, sub: "leads en proceso", href: "/pipeline" },
    ];

    setResumen({ periodo_label: periodoLabel, kpis, top_comerciales: topComerciales, deals_ganados: dealsGanados, alertas, snapshot_pipeline: snapshotPipeline });
    setCargando(false);
  }, [periodo]);

  useEffect(() => { if (!cargandoPermisos) cargar(); }, [cargar, cargandoPermisos]);

  function copiarTexto() {
    if (!resumen) return;
    const lineas = [
      `📊 RESUMEN EJECUTIVO — ${resumen.periodo_label.toUpperCase()}`,
      "",
      "═══ KPIs PRINCIPALES ═══",
      ...resumen.kpis.map(k => `• ${k.label}: ${k.valor} (${k.sub})`),
      "",
      resumen.top_comerciales.length > 0 ? "═══ TOP COMERCIALES ═══" : "",
      ...resumen.top_comerciales.map(c => `• ${c.nombre}: ${c.cierres} cierres, ${c.citas} citas`),
      "",
      resumen.deals_ganados.length > 0 ? "═══ DEALS GANADOS ═══" : "",
      ...resumen.deals_ganados.map(d => `✅ ${d.nombre}${d.empresa ? ` (${d.empresa})` : ""}${d.producto ? ` — ${d.producto}` : ""} [${d.comercial}]`),
      "",
      resumen.alertas.length > 0 ? "═══ ALERTAS ═══" : "",
      ...resumen.alertas.map(a => `⚠️ ${a}`),
      "",
      `Generado: ${new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`,
    ].filter(l => l !== "" || true).join("\n");

    navigator.clipboard.writeText(lineas).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    });
  }

  if (!cargandoPermisos && !puede("ver_metricas")) return <SinAcceso />;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Resumen ejecutivo</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Vista consolidada para reuniones de equipo y reportes
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {(["semana", "mes", "mes_anterior"] as const).map(p => (
            <button
              key={p}
              onClick={() => setPeriodo(p)}
              className={`text-sm px-3 py-2 rounded-lg border font-medium transition-colors ${periodo === p ? "text-white border-transparent" : "bg-white border-slate-200 text-slate-600"}`}
              style={periodo === p ? { background: "#ea650d", borderColor: "#ea650d" } : undefined}
            >
              {p === "semana" ? "Esta semana" : p === "mes" ? "Este mes" : "Mes anterior"}
            </button>
          ))}
          <button
            onClick={copiarTexto}
            className="text-sm px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors flex items-center gap-1.5"
          >
            {copiado ? "✓ Copiado" : "📋 Copiar"}
          </button>
          <button
            onClick={() => window.print()}
            className="text-sm px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
          >
            🖨️ Imprimir
          </button>
        </div>
      </div>

      {cargando ? (
        <div className="flex justify-center py-16">
          <div className="w-7 h-7 rounded-full border-2 animate-spin" style={{ borderColor: "#ea650d", borderTopColor: "transparent" }} />
        </div>
      ) : resumen ? (
        <>
          {/* Período */}
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-sm font-semibold text-slate-600 px-3 py-1 bg-white border border-slate-200 rounded-full">
              {resumen.periodo_label}
            </span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {resumen.kpis.map(k => (
              <div key={k.label} className="bg-white rounded-xl border border-slate-200 p-4">
                {k.href ? (
                  <Link href={k.href} className="block">
                    <p className="text-2xl font-bold" style={k.color ? { color: k.color } : { color: "#0f172a" }}>{k.valor}</p>
                    <p className="text-sm font-semibold text-slate-700 mt-1">{k.label}</p>
                    <p className="text-xs text-slate-400">{k.sub}</p>
                  </Link>
                ) : (
                  <>
                    <p className="text-2xl font-bold" style={k.color ? { color: k.color } : { color: "#0f172a" }}>{k.valor}</p>
                    <p className="text-sm font-semibold text-slate-700 mt-1">{k.label}</p>
                    <p className="text-xs text-slate-400">{k.sub}</p>
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Alertas */}
          {resumen.alertas.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
              <p className="text-sm font-semibold text-amber-800 mb-2">⚠️ Alertas del período</p>
              <ul className="space-y-1">
                {resumen.alertas.map((a, i) => (
                  <li key={i} className="text-sm text-amber-700">• {a}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top comerciales */}
            {resumen.top_comerciales.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-700">🏆 Rendimiento del equipo</h2>
                  <Link href="/clasificacion" className="text-xs hover:underline" style={{ color: "#ea650d" }}>Ver clasificación →</Link>
                </div>
                <div className="divide-y divide-slate-50">
                  {resumen.top_comerciales.map((c, i) => (
                    <div key={c.nombre} className="flex items-center gap-3 px-5 py-3">
                      <span className="text-lg w-6 text-center">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{c.nombre}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <div className="h-1.5 rounded-full bg-slate-100 flex-1 overflow-hidden">
                            <div className="h-full rounded-full bg-emerald-400"
                              style={{ width: `${c.objetivo_cierres > 0 ? Math.min(100, Math.round((c.cierres / c.objetivo_cierres) * 100)) : 0}%` }} />
                          </div>
                          <span className="text-xs text-slate-400 shrink-0">{c.objetivo_cierres > 0 ? Math.round((c.cierres / c.objetivo_cierres) * 100) : 0}%</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-slate-800">{c.cierres}</p>
                        <p className="text-[10px] text-slate-400">cierres</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-slate-600">{c.citas}</p>
                        <p className="text-[10px] text-slate-400">citas</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pipeline snapshot */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-700">📊 Estado del pipeline</h2>
                <Link href="/pipeline" className="text-xs hover:underline" style={{ color: "#ea650d" }}>Ver kanban →</Link>
              </div>
              <div className="p-5">
                {resumen.snapshot_pipeline.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-4">Pipeline vacío</p>
                ) : (
                  (() => {
                    const maxCount = Math.max(1, ...resumen.snapshot_pipeline.map(s => s.count));
                    return (
                      <div className="space-y-2.5">
                        {resumen.snapshot_pipeline.map(s => (
                          <div key={s.etapa} className="flex items-center gap-3">
                            <span className="text-xs text-slate-600 w-28 shrink-0 text-right">{ETAPA_LABEL[s.etapa] ?? s.etapa}</span>
                            <div className="flex-1 h-5 bg-slate-50 rounded overflow-hidden relative">
                              <div className="h-full rounded" style={{ width: `${Math.round((s.count / maxCount) * 100)}%`, background: "#ea650d", opacity: 0.65 }} />
                              <div className="absolute inset-0 flex items-center px-2">
                                <span className="text-xs font-medium text-slate-700">{s.count}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()
                )}
              </div>
            </div>
          </div>

          {/* Deals ganados */}
          {resumen.deals_ganados.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-700">✅ Deals cerrados en el período</h2>
                <span className="text-xs text-slate-400">{resumen.deals_ganados.length} cierre{resumen.deals_ganados.length > 1 ? "s" : ""}</span>
              </div>
              <div className="divide-y divide-slate-50">
                {resumen.deals_ganados.map((d, i) => (
                  <div key={i} className="flex items-center gap-3 px-5 py-3">
                    <span className="text-base shrink-0">✅</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{d.nombre}</p>
                      {d.empresa && <p className="text-xs text-slate-400 truncate">{d.empresa}</p>}
                    </div>
                    {d.producto && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 shrink-0">
                        {d.producto.replace(/_/g, " ")}
                      </span>
                    )}
                    <span className="text-xs text-slate-400 shrink-0">{d.comercial}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {resumen.deals_ganados.length === 0 && resumen.top_comerciales.length === 0 && (
            <div className="bg-white rounded-xl border border-slate-200 py-14 text-center">
              <p className="text-3xl mb-2">📈</p>
              <p className="text-sm font-semibold text-slate-700">Sin actividad registrada en este período</p>
              <p className="text-xs text-slate-400 mt-1">Prueba con otro rango de fechas o verifica que los estados estén actualizados</p>
            </div>
          )}

          {/* Links a más detalles */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { href: "/coaching", label: "Panel coaching", icon: "🎯" },
              { href: "/funnel", label: "Análisis funnel", icon: "📉" },
              { href: "/analisis-perdidas", label: "Análisis pérdidas", icon: "❌" },
              { href: "/forecast", label: "Forecast", icon: "💰" },
            ].map(l => (
              <Link key={l.href} href={l.href}
                className="bg-white border border-slate-200 rounded-xl p-4 hover:border-orange-300 hover:shadow-sm transition-all flex items-center gap-2">
                <span className="text-lg">{l.icon}</span>
                <span className="text-sm font-medium text-slate-700">{l.label}</span>
              </Link>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
