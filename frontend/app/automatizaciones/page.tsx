"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { usePermisos } from "@/components/PermisosProvider";
import { SinAcceso } from "@/components/SinAcceso";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api/backend";

type AgentStatus = "idle" | "running" | "success" | "error";

type Agent = {
  id: string;
  nombre: string;
  descripcion: string;
  emoji: string;
  endpoint: string | null;
  stats_key: string;
  permiso: string;
};

const AGENTS: Agent[] = [
  {
    id: "scraping",
    nombre: "Prospección automática",
    descripcion: "Busca nuevos leads en Google Places por zona y categoría de negocio",
    emoji: "🔍",
    endpoint: "/scraping/lanzar",
    stats_key: "scraping",
    permiso: "usar_scraping",
  },
  {
    id: "mensajes",
    nombre: "Generador de mensajes IA",
    descripcion: "Genera mensajes de WhatsApp personalizados para leads sin contactar",
    emoji: "✍️",
    endpoint: "/mensajes/generar",
    stats_key: "mensajes",
    permiso: "asignar_leads",
  },
  {
    id: "seguimiento",
    nombre: "Seguimiento automático",
    descripcion: "Envía recordatorios a leads fríos que no han respondido en varios días",
    emoji: "🔄",
    endpoint: "/seguimiento/ejecutar",
    stats_key: "seguimiento",
    permiso: "asignar_leads",
  },
  {
    id: "renovaciones",
    nombre: "Alertas de renovación",
    descripcion: "Notifica a clientes cuyas pólizas vencen próximamente",
    emoji: "📅",
    endpoint: "/seguimiento/renovaciones",
    stats_key: "renovaciones",
    permiso: "gestionar_clientes",
  },
  {
    id: "linkedin",
    nombre: "Enriquecimiento LinkedIn",
    descripcion: "Busca cargo y empresa de leads usando LinkedIn",
    emoji: "🔗",
    endpoint: "/linkedin/enriquecer",
    stats_key: "linkedin",
    permiso: "usar_scraping",
  },
];

type StatsData = {
  leads_nuevos_hoy: number;
  mensajes_pendientes: number;
  leads_sin_mensaje: number;
  leads_frios: number;
  renovaciones_7d: number;
  leads_sin_cargo: number;
};

export default function AutomatizacionesPage() {
  const { puede, cargando: cargandoPermisos } = usePermisos();
  const [stats, setStats] = useState<StatsData | null>(null);
  const [agentStatus, setAgentStatus] = useState<Record<string, AgentStatus>>({});
  const [agentResult, setAgentResult] = useState<Record<string, string>>({});
  const [cargando, setCargando] = useState(true);

  const cargarStats = useCallback(async () => {
    setCargando(true);
    const hoy = new Date();
    const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).toISOString();
    const en7dias = new Date(Date.now() + 7 * 86400_000).toISOString().split("T")[0];

    const [
      { count: leadsNuevos },
      { count: mensajesPendientes },
      { count: leadsSinMensaje },
      { count: leadsFrios },
      { count: renovaciones7d },
      { count: leadsSinCargo },
    ] = await Promise.all([
      supabase.from("leads").select("id", { count: "exact", head: true })
        .gte("fecha_captacion", inicioHoy),
      supabase.from("mensajes_pendientes").select("id", { count: "exact", head: true })
        .eq("estado", "pendiente"),
      supabase.from("leads").select("id", { count: "exact", head: true })
        .eq("estado", "nuevo").not("telefono_whatsapp", "is", null),
      supabase.from("leads").select("id", { count: "exact", head: true })
        .eq("temperatura", "frio")
        .not("estado", "in", "(cerrado_ganado,cerrado_perdido,descartado)")
        .not("telefono_whatsapp", "is", null),
      supabase.from("clientes").select("id", { count: "exact", head: true })
        .eq("estado", "activo")
        .gte("fecha_renovacion", new Date().toISOString().split("T")[0])
        .lte("fecha_renovacion", en7dias),
      supabase.from("leads").select("id", { count: "exact", head: true })
        .is("cargo", null)
        .not("nombre", "is", null)
        .not("empresa", "is", null)
        .not("estado", "in", "(cerrado_ganado,cerrado_perdido,descartado)"),
    ]);

    setStats({
      leads_nuevos_hoy: leadsNuevos ?? 0,
      mensajes_pendientes: mensajesPendientes ?? 0,
      leads_sin_mensaje: leadsSinMensaje ?? 0,
      leads_frios: leadsFrios ?? 0,
      renovaciones_7d: renovaciones7d ?? 0,
      leads_sin_cargo: leadsSinCargo ?? 0,
    });
    setCargando(false);
  }, []);

  useEffect(() => { cargarStats(); }, [cargarStats]);

  async function ejecutarAgente(agent: Agent) {
    if (!agent.endpoint) return;
    setAgentStatus(prev => ({ ...prev, [agent.id]: "running" }));
    setAgentResult(prev => ({ ...prev, [agent.id]: "" }));

    try {
      const res = await fetch(`${API_BASE}${agent.endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limite: 20 }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      const msg = data.generados != null
        ? `${data.generados} mensajes generados (${data.errores ?? 0} errores)`
        : data.procesados != null
        ? `${data.procesados} leads procesados`
        : data.enviados != null
        ? `${data.enviados} mensajes enviados`
        : data.message ?? "Completado";

      setAgentStatus(prev => ({ ...prev, [agent.id]: "success" }));
      setAgentResult(prev => ({ ...prev, [agent.id]: msg }));
      await cargarStats();
    } catch (e: unknown) {
      setAgentStatus(prev => ({ ...prev, [agent.id]: "error" }));
      setAgentResult(prev => ({ ...prev, [agent.id]: e instanceof Error ? e.message : "Error desconocido" }));
    }
  }

  function getStatsForAgent(id: string): { label: string; value: number; color: string } | null {
    if (!stats) return null;
    switch (id) {
      case "scraping":
        return { label: "leads captados hoy", value: stats.leads_nuevos_hoy, color: "#3b82f6" };
      case "mensajes":
        return { label: "leads sin mensaje", value: stats.leads_sin_mensaje, color: stats.leads_sin_mensaje > 0 ? "#ea650d" : "#10b981" };
      case "seguimiento":
        return { label: "leads fríos sin respuesta", value: stats.leads_frios, color: stats.leads_frios > 10 ? "#f59e0b" : "#10b981" };
      case "renovaciones":
        return { label: "pólizas vencen en 7d", value: stats.renovaciones_7d, color: stats.renovaciones_7d > 0 ? "#ef4444" : "#10b981" };
      case "linkedin":
        return { label: "leads sin cargo detectado", value: stats.leads_sin_cargo, color: "#8b5cf6" };
      default:
        return null;
    }
  }

  if (!cargandoPermisos && !puede("gestionar_ajustes")) return <SinAcceso />;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Automatizaciones IA</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Panel de control para los agentes de inteligencia artificial del CRM
        </p>
      </div>

      {/* Overview */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className={`rounded-xl border p-4 ${stats.mensajes_pendientes > 0 ? "bg-orange-50 border-orange-200" : "bg-white border-slate-200"}`}>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Mensajes por revisar</p>
            <p className="text-2xl font-bold mt-1" style={stats.mensajes_pendientes > 0 ? { color: "#ea650d" } : undefined}>
              {stats.mensajes_pendientes}
            </p>
            <a href="/mensajes" className="text-xs hover:underline" style={{ color: "#ea650d" }}>Revisar →</a>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Leads sin contactar</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{stats.leads_sin_mensaje}</p>
            <p className="text-xs text-slate-400">con teléfono disponible</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Leads fríos</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{stats.leads_frios}</p>
            <p className="text-xs text-slate-400">candidatos a seguimiento</p>
          </div>
        </div>
      )}

      {/* Agents */}
      <div className="space-y-4">
        {AGENTS.filter(a => !a.permiso || puede(a.permiso)).map(agent => {
          const status = agentStatus[agent.id] ?? "idle";
          const result = agentResult[agent.id];
          const statInfo = getStatsForAgent(agent.id);

          return (
            <div key={agent.id} className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <span className="text-2xl shrink-0 mt-0.5">{agent.emoji}</span>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{agent.nombre}</p>
                    <p className="text-xs text-slate-500 mt-0.5 max-w-lg">{agent.descripcion}</p>

                    {statInfo && !cargando && (
                      <div className="mt-2 flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full" style={{ background: statInfo.color }} />
                        <span className="text-xs font-semibold" style={{ color: statInfo.color }}>
                          {statInfo.value}
                        </span>
                        <span className="text-xs text-slate-400">{statInfo.label}</span>
                      </div>
                    )}

                    {result && (
                      <div className={`mt-2 text-xs px-2 py-1 rounded-lg inline-block ${status === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
                        {status === "success" ? "✓" : "✕"} {result}
                      </div>
                    )}
                  </div>
                </div>

                {agent.endpoint && (
                  <button
                    onClick={() => ejecutarAgente(agent)}
                    disabled={status === "running"}
                    className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-50"
                    style={{
                      background: status === "running" ? "#f1f5f9" : status === "success" ? "#f0fdf4" : status === "error" ? "#fef2f2" : "#fff5f0",
                      color: status === "running" ? "#94a3b8" : status === "success" ? "#15803d" : status === "error" ? "#dc2626" : "#ea650d",
                      border: `1px solid ${status === "running" ? "#e2e8f0" : status === "success" ? "#bbf7d0" : status === "error" ? "#fecaca" : "#fed7aa"}`,
                    }}
                  >
                    {status === "running" ? (
                      <>
                        <div className="w-3.5 h-3.5 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "#94a3b8", borderTopColor: "transparent" }} />
                        Ejecutando...
                      </>
                    ) : status === "success" ? "✓ Completado" : status === "error" ? "✕ Reintentar" : "▶ Ejecutar"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
        <span className="font-semibold">Nota:</span> Los agentes se ejecutan automáticamente en el servidor según su programación. Este panel permite ejecuciones manuales adicionales o de prueba. Los resultados pueden tardar unos segundos.
      </div>
    </div>
  );
}
