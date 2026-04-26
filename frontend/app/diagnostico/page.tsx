"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { usePermisos } from "@/components/PermisosProvider";
import { SinAcceso } from "@/components/SinAcceso";

type Severidad = "critico" | "alerta" | "ok" | "info";

type CheckResult = {
  id: string;
  categoria: string;
  titulo: string;
  descripcion: string;
  valor: number;
  umbral_alerta: number;
  umbral_critico: number;
  severidad: Severidad;
  link?: string;
  link_label?: string;
};

function getSeveridad(valor: number, umbralAlerta: number, umbralCritico: number, invertido = false): Severidad {
  if (!invertido) {
    if (valor >= umbralCritico) return "critico";
    if (valor >= umbralAlerta) return "alerta";
    return "ok";
  } else {
    if (valor <= umbralCritico) return "critico";
    if (valor <= umbralAlerta) return "alerta";
    return "ok";
  }
}

const SEVERIDAD_CONFIG: Record<Severidad, { color: string; bg: string; border: string; label: string; icon: string }> = {
  critico: { color: "#dc2626", bg: "#fef2f2", border: "#fecaca", label: "Crítico", icon: "🔴" },
  alerta:  { color: "#d97706", bg: "#fffbeb", border: "#fde68a", label: "Alerta",  icon: "🟡" },
  ok:      { color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0", label: "OK",      icon: "🟢" },
  info:    { color: "#6366f1", bg: "#eef2ff", border: "#c7d2fe", label: "Info",    icon: "🔵" },
};

export default function DiagnosticoPage() {
  const { puede, cargando: cargandoPermisos } = usePermisos();
  const [checks, setChecks] = useState<CheckResult[]>([]);
  const [cargando, setCargando] = useState(true);
  const [ultimaActualizacion, setUltimaActualizacion] = useState<Date | null>(null);

  const ejecutarDiagnostico = useCallback(async () => {
    setCargando(true);

    const ahora = new Date();
    const hace7dias = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const hace30dias = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const hoyStr = ahora.toISOString().split("T")[0];
    const en7dias = new Date(Date.now() + 7 * 86_400_000).toISOString().split("T")[0];

    const [
      { count: sinTelefono },
      { count: sinAsignar },
      { count: nuevosSinTocar },
      { count: atascadosMes },
      { count: calientesSinSeguimiento },
      { count: sinProducto },
      { count: sinSector },
      { count: citasSinConfirmar },
      { count: renovacionesVencidas },
      { count: comercialesSinObjetivo },
      { count: clientesSinRenovacion },
      { count: leadsDuplicadosTel },
      { count: totalLeadsActivos },
      { count: totalComerciales },
    ] = await Promise.all([
      // Leads activos sin teléfono WhatsApp
      supabase.from("leads").select("id", { count: "exact", head: true })
        .not("estado", "in", "(cerrado_ganado,cerrado_perdido,descartado)")
        .is("telefono_whatsapp", null),
      // Leads activos sin comercial asignado
      supabase.from("leads").select("id", { count: "exact", head: true })
        .not("estado", "in", "(cerrado_ganado,cerrado_perdido,descartado)")
        .is("comercial_asignado", null),
      // Leads "nuevo" sin actividad en más de 7 días
      supabase.from("leads").select("id", { count: "exact", head: true })
        .eq("estado", "nuevo").lt("updated_at", hace7dias),
      // Leads activos sin cambio en más de 30 días
      supabase.from("leads").select("id", { count: "exact", head: true })
        .not("estado", "in", "(cerrado_ganado,cerrado_perdido,descartado,nuevo)")
        .lt("updated_at", hace30dias),
      // Leads calientes sin seguimiento en 7 días
      supabase.from("leads").select("id", { count: "exact", head: true })
        .eq("temperatura", "caliente")
        .not("estado", "in", "(cerrado_ganado,cerrado_perdido,descartado)")
        .lt("updated_at", hace7dias),
      // Leads sin producto de interés
      supabase.from("leads").select("id", { count: "exact", head: true })
        .not("estado", "in", "(cerrado_ganado,cerrado_perdido,descartado)")
        .is("producto_interes_principal", null),
      // Leads sin sector clasificado
      supabase.from("leads").select("id", { count: "exact", head: true })
        .not("estado", "in", "(cerrado_ganado,cerrado_perdido,descartado)")
        .is("sector", null),
      // Citas pendientes de confirmar en los próximos 2 días
      supabase.from("appointments").select("id", { count: "exact", head: true })
        .eq("estado", "pendiente")
        .gte("fecha_hora", ahora.toISOString())
        .lte("fecha_hora", new Date(Date.now() + 2 * 86_400_000).toISOString()),
      // Clientes con pólizas vencidas sin renovar
      supabase.from("clientes").select("id", { count: "exact", head: true })
        .eq("estado", "activo").lt("fecha_renovacion", hoyStr),
      // Comerciales sin objetivos mensuales configurados
      supabase.from("comerciales").select("id", { count: "exact", head: true })
        .eq("activo", true).not("rol", "eq", "admin")
        .or("objetivo_cierres_mes.is.null,objetivo_cierres_mes.eq.0"),
      // Clientes activos sin fecha de renovación
      supabase.from("clientes").select("id", { count: "exact", head: true })
        .eq("estado", "activo").is("fecha_renovacion", null),
      // Aproximación de leads duplicados (mismo teléfono) — count leads with any phone
      supabase.from("leads").select("id", { count: "exact", head: true })
        .not("telefono_whatsapp", "is", null)
        .not("estado", "in", "(cerrado_ganado,cerrado_perdido,descartado)"),
      // Total leads activos
      supabase.from("leads").select("id", { count: "exact", head: true })
        .not("estado", "in", "(cerrado_ganado,cerrado_perdido,descartado)"),
      // Total comerciales activos
      supabase.from("comerciales").select("id", { count: "exact", head: true })
        .eq("activo", true).not("rol", "eq", "admin"),
    ]);

    const total = totalLeadsActivos ?? 1;

    const results: CheckResult[] = [
      // ── Datos de leads ─────────────────────────────────────────────────
      {
        id: "sin_telefono",
        categoria: "Calidad de datos",
        titulo: "Leads sin teléfono WhatsApp",
        descripcion: `${sinTelefono ?? 0} leads activos sin número de WhatsApp — no se podrá contactar por este canal`,
        valor: sinTelefono ?? 0,
        umbral_alerta: Math.max(5, Math.round(total * 0.05)),
        umbral_critico: Math.max(20, Math.round(total * 0.15)),
        severidad: getSeveridad(sinTelefono ?? 0, Math.max(5, Math.round(total * 0.05)), Math.max(20, Math.round(total * 0.15))),
        link: "/leads",
        link_label: "Ver leads",
      },
      {
        id: "sin_producto",
        categoria: "Calidad de datos",
        titulo: "Leads sin producto asignado",
        descripcion: `${sinProducto ?? 0} leads activos sin producto de interés — el scoring y la segmentación serán menos precisos`,
        valor: sinProducto ?? 0,
        umbral_alerta: Math.max(10, Math.round(total * 0.1)),
        umbral_critico: Math.max(50, Math.round(total * 0.3)),
        severidad: getSeveridad(sinProducto ?? 0, Math.max(10, Math.round(total * 0.1)), Math.max(50, Math.round(total * 0.3))),
        link: "/leads",
        link_label: "Filtrar leads",
      },
      {
        id: "sin_sector",
        categoria: "Calidad de datos",
        titulo: "Leads sin sector clasificado",
        descripcion: `${sinSector ?? 0} leads activos sin sector de empresa — afecta al análisis por sector y los mensajes personalizados`,
        valor: sinSector ?? 0,
        umbral_alerta: Math.max(20, Math.round(total * 0.15)),
        umbral_critico: Math.max(100, Math.round(total * 0.4)),
        severidad: getSeveridad(sinSector ?? 0, Math.max(20, Math.round(total * 0.15)), Math.max(100, Math.round(total * 0.4))),
      },
      // ── Asignación ─────────────────────────────────────────────────────
      {
        id: "sin_asignar",
        categoria: "Asignación",
        titulo: "Leads sin comercial asignado",
        descripcion: `${sinAsignar ?? 0} leads activos sin responsable — ningún comercial los trabajará`,
        valor: sinAsignar ?? 0,
        umbral_alerta: 1,
        umbral_critico: 10,
        severidad: getSeveridad(sinAsignar ?? 0, 1, 10),
        link: "/leads?filtro=sin_asignar",
        link_label: "Asignar leads",
      },
      {
        id: "sin_objetivo",
        categoria: "Asignación",
        titulo: "Comerciales sin objetivos configurados",
        descripcion: `${comercialesSinObjetivo ?? 0} de ${totalComerciales ?? 0} comerciales activos sin objetivos de cierres o citas mensuales`,
        valor: comercialesSinObjetivo ?? 0,
        umbral_alerta: 1,
        umbral_critico: Math.ceil((totalComerciales ?? 1) * 0.5),
        severidad: getSeveridad(comercialesSinObjetivo ?? 0, 1, Math.ceil((totalComerciales ?? 1) * 0.5)),
        link: "/objetivos",
        link_label: "Configurar objetivos",
      },
      // ── Actividad ──────────────────────────────────────────────────────
      {
        id: "nuevos_sin_tocar",
        categoria: "Actividad",
        titulo: "Leads nuevos sin trabajar +7 días",
        descripcion: `${nuevosSinTocar ?? 0} leads en estado "Nuevo" sin actividad en más de 7 días — se están enfriando`,
        valor: nuevosSinTocar ?? 0,
        umbral_alerta: 10,
        umbral_critico: 50,
        severidad: getSeveridad(nuevosSinTocar ?? 0, 10, 50),
        link: "/leads?estado=nuevo",
        link_label: "Ver nuevos",
      },
      {
        id: "atascados",
        categoria: "Actividad",
        titulo: "Leads atascados +30 días",
        descripcion: `${atascadosMes ?? 0} leads activos sin ningún cambio de estado en más de 30 días`,
        valor: atascadosMes ?? 0,
        umbral_alerta: 20,
        umbral_critico: 100,
        severidad: getSeveridad(atascadosMes ?? 0, 20, 100),
        link: "/velocidad",
        link_label: "Analizar velocidad",
      },
      {
        id: "calientes_sin_seguimiento",
        categoria: "Actividad",
        titulo: "Leads calientes sin contacto +7d",
        descripcion: `${calientesSinSeguimiento ?? 0} leads de alta temperatura sin contacto en más de 7 días — riesgo de enfriamiento`,
        valor: calientesSinSeguimiento ?? 0,
        umbral_alerta: 3,
        umbral_critico: 10,
        severidad: getSeveridad(calientesSinSeguimiento ?? 0, 3, 10),
        link: "/coaching",
        link_label: "Ver coaching",
      },
      // ── Agenda ─────────────────────────────────────────────────────────
      {
        id: "citas_sin_confirmar",
        categoria: "Agenda",
        titulo: "Citas próximas sin confirmar",
        descripcion: `${citasSinConfirmar ?? 0} citas en las próximas 48h en estado "pendiente" sin confirmación del cliente`,
        valor: citasSinConfirmar ?? 0,
        umbral_alerta: 2,
        umbral_critico: 5,
        severidad: getSeveridad(citasSinConfirmar ?? 0, 2, 5),
        link: "/agenda",
        link_label: "Ver agenda",
      },
      // ── Clientes ───────────────────────────────────────────────────────
      {
        id: "polizas_vencidas",
        categoria: "Cartera",
        titulo: "Pólizas vencidas sin renovar",
        descripcion: `${renovacionesVencidas ?? 0} clientes activos con fecha de renovación pasada — riesgo de baja`,
        valor: renovacionesVencidas ?? 0,
        umbral_alerta: 1,
        umbral_critico: 5,
        severidad: getSeveridad(renovacionesVencidas ?? 0, 1, 5),
        link: "/renovaciones",
        link_label: "Gestionar renovaciones",
      },
      {
        id: "clientes_sin_fecha_renovacion",
        categoria: "Cartera",
        titulo: "Clientes sin fecha de renovación",
        descripcion: `${clientesSinRenovacion ?? 0} clientes activos sin fecha de renovación registrada — no aparecerán en alertas`,
        valor: clientesSinRenovacion ?? 0,
        umbral_alerta: 5,
        umbral_critico: 20,
        severidad: getSeveridad(clientesSinRenovacion ?? 0, 5, 20),
        link: "/clientes",
        link_label: "Ver clientes",
      },
    ];

    setChecks(results);
    setUltimaActualizacion(new Date());
    setCargando(false);
  }, []);

  useEffect(() => { if (!cargandoPermisos) ejecutarDiagnostico(); }, [ejecutarDiagnostico, cargandoPermisos]);

  if (!cargandoPermisos && !puede("gestionar_ajustes")) return <SinAcceso />;

  const criticos = checks.filter(c => c.severidad === "critico").length;
  const alertas = checks.filter(c => c.severidad === "alerta").length;
  const oks = checks.filter(c => c.severidad === "ok").length;

  const byCategoria: Record<string, CheckResult[]> = {};
  for (const c of checks) {
    if (!byCategoria[c.categoria]) byCategoria[c.categoria] = [];
    byCategoria[c.categoria].push(c);
  }

  const scoreTotal = checks.length > 0
    ? Math.round(((oks + alertas * 0.5) / checks.length) * 100)
    : 100;

  const scoreColor = scoreTotal >= 80 ? "#10b981" : scoreTotal >= 60 ? "#f59e0b" : "#ef4444";
  const scoreLabel = scoreTotal >= 80 ? "Buena salud" : scoreTotal >= 60 ? "Mejorable" : "Atención urgente";

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Diagnóstico del CRM</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Calidad de datos, actividad del equipo y alertas del sistema
          </p>
        </div>
        <button
          onClick={ejecutarDiagnostico}
          className="text-sm px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors flex items-center gap-1.5"
        >
          ↺ Actualizar
        </button>
      </div>

      {cargando ? (
        <div className="flex justify-center py-16">
          <div className="w-7 h-7 rounded-full border-2 animate-spin" style={{ borderColor: "#ea650d", borderTopColor: "transparent" }} />
        </div>
      ) : (
        <>
          {/* Score global */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 flex items-center gap-6">
            <div className="flex-shrink-0">
              <div className="w-20 h-20 rounded-full flex items-center justify-center border-4" style={{ borderColor: scoreColor }}>
                <span className="text-2xl font-bold" style={{ color: scoreColor }}>{scoreTotal}</span>
              </div>
            </div>
            <div className="flex-1">
              <p className="text-lg font-bold text-slate-800">{scoreLabel}</p>
              <p className="text-sm text-slate-500 mt-0.5">Índice de salud del CRM — basado en {checks.length} métricas</p>
              <div className="flex items-center gap-4 mt-3">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                  <span className="text-sm font-medium text-red-600">{criticos} críticos</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                  <span className="text-sm font-medium text-amber-600">{alertas} alertas</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <span className="text-sm font-medium text-emerald-600">{oks} OK</span>
                </div>
              </div>
            </div>
            {ultimaActualizacion && (
              <div className="text-xs text-slate-400 text-right shrink-0">
                Actualizado<br />
                {ultimaActualizacion.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
              </div>
            )}
          </div>

          {/* Checks agrupados por categoría */}
          {Object.entries(byCategoria).map(([categoria, items]) => {
            const categoriaScore = items.filter(i => i.severidad === "critico").length > 0 ? "critico"
              : items.filter(i => i.severidad === "alerta").length > 0 ? "alerta" : "ok";
            const cfg = SEVERIDAD_CONFIG[categoriaScore];
            return (
              <div key={categoria} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
                  <span>{cfg.icon}</span>
                  <h2 className="text-sm font-semibold text-slate-700">{categoria}</h2>
                  <span className="ml-auto text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
                    {items.filter(i => i.severidad !== "ok").length > 0 ? `${items.filter(i => i.severidad !== "ok").length} issue${items.filter(i => i.severidad !== "ok").length > 1 ? "s" : ""}` : "Todo OK"}
                  </span>
                </div>
                <div className="divide-y divide-slate-50">
                  {items.map(check => {
                    const c = SEVERIDAD_CONFIG[check.severidad];
                    return (
                      <div key={check.id} className={`flex items-start gap-4 px-5 py-4 ${check.severidad === "critico" ? "bg-red-50" : check.severidad === "alerta" ? "bg-amber-50" : ""}`}>
                        <span className="text-lg flex-shrink-0 mt-0.5">{c.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium text-slate-800">{check.titulo}</p>
                            <span className="text-xs font-bold px-1.5 py-0.5 rounded-full" style={{ background: c.bg, color: c.color, border: `1px solid ${c.border}` }}>
                              {check.severidad === "ok" ? "OK" : check.valor.toLocaleString()}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">{check.descripcion}</p>
                        </div>
                        {check.link && check.severidad !== "ok" && (
                          <Link href={check.link} className="text-xs font-medium px-3 py-1.5 rounded-lg transition-colors shrink-0 text-white"
                            style={{ background: "#ea650d" }}>
                            {check.link_label ?? "Ver →"}
                          </Link>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
