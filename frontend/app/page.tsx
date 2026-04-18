"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { LeadDashboard } from "@/lib/supabase";
import { LeadRow } from "@/components/LeadRow";

type Stats = {
  // Leads
  leads_total: number;
  leads_nuevos_hoy: number;
  leads_calientes: number;
  leads_templados: number;
  leads_frios: number;
  sin_atencion: number;
  // Pipeline
  por_estado: Record<string, number>;
  // Mensajes
  mensajes_pendientes: number;
  // Agenda
  citas_hoy: number;
  citas_proximas: number;
  // Clientes
  clientes_activos: number;
  renovaciones_30d: number;
  // Acciones vencidas
  acciones_vencidas: number;
};

type CitaHoy = {
  id: string;
  tipo: string;
  fecha_hora: string;
  lead_nombre: string | null;
};

const ESTADO_LABEL: Record<string, string> = {
  nuevo: "Nuevo",
  enriquecido: "Enriquecido",
  segmentado: "Segmentado",
  mensaje_enviado: "Contactado",
  respondio: "Respondió",
  cita_agendada: "Cita",
  en_negociacion: "Negociación",
  cerrado_ganado: "Ganado",
  cerrado_perdido: "Perdido",
  descartado: "Descartado",
};

const PIPELINE_ACTIVO = ["nuevo", "enriquecido", "segmentado", "mensaje_enviado", "respondio", "cita_agendada", "en_negociacion"];

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [leadsUrgentes, setLeadsUrgentes] = useState<LeadDashboard[]>([]);
  const [accionesVencidas, setAccionesVencidas] = useState<LeadDashboard[]>([]);
  const [citasHoy, setCitasHoy] = useState<CitaHoy[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function cargar() {
      const hoy = new Date();
      const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).toISOString();
      const finHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 1).toISOString();
      const en30dias = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 30).toISOString();

      const [
        leadsRes,
        leadsHoyRes,
        urgentesRes,
        vencidasRes,
        mensajesRes,
        citasHoyRes,
        citasProxRes,
        clientesRes,
        renovRes,
      ] = await Promise.all([
        supabase.from("leads").select("estado, temperatura").neq("estado", "descartado"),
        supabase.from("leads").select("id", { count: "exact", head: true }).gte("fecha_captacion", inicioHoy),
        supabase.from("leads_dashboard").select("*").eq("temperatura", "caliente").gt("horas_sin_atencion", 2).order("horas_sin_atencion", { ascending: false }).limit(5),
        supabase.from("leads_dashboard").select("*").not("proxima_accion", "is", null).neq("proxima_accion", "ninguna").lt("proxima_accion_fecha", hoy.toISOString()).order("proxima_accion_fecha", { ascending: true }).limit(5),
        supabase.from("interactions").select("id", { count: "exact", head: true }).eq("tipo", "mensaje_pendiente"),
        supabase.from("appointments").select("id, tipo, fecha_hora, lead_id").gte("fecha_hora", inicioHoy).lt("fecha_hora", finHoy).in("estado", ["pendiente", "confirmada"]).order("fecha_hora"),
        supabase.from("appointments").select("id", { count: "exact", head: true }).gt("fecha_hora", finHoy).in("estado", ["pendiente", "confirmada"]),
        supabase.from("clientes").select("id", { count: "exact", head: true }).eq("estado", "activo"),
        supabase.from("clientes").select("id", { count: "exact", head: true }).eq("estado", "activo").lte("fecha_renovacion", en30dias).gte("fecha_renovacion", inicioHoy),
      ]);

      const leads = (leadsRes.data ?? []) as { estado: string; temperatura: string }[];
      const porEstado: Record<string, number> = {};
      let calientes = 0, templados = 0, frios = 0, sinAtencion = 0;
      for (const l of leads) {
        porEstado[l.estado] = (porEstado[l.estado] ?? 0) + 1;
        if (l.temperatura === "caliente") calientes++;
        else if (l.temperatura === "templado") templados++;
        else frios++;
      }

      // Enrich citas con nombre del lead
      const citasRaw = (citasHoyRes.data ?? []) as { id: string; tipo: string; fecha_hora: string; lead_id: string }[];
      const leadIds = citasRaw.map(c => c.lead_id);
      let leadNombres: Record<string, string> = {};
      if (leadIds.length > 0) {
        const { data: lns } = await supabase.from("leads").select("id, nombre, apellidos").in("id", leadIds);
        for (const l of (lns ?? [])) {
          leadNombres[l.id] = [l.nombre, l.apellidos].filter(Boolean).join(" ");
        }
      }

      urgentesRes.data && setLeadsUrgentes(urgentesRes.data as LeadDashboard[]);
      vencidasRes.data && setAccionesVencidas(vencidasRes.data as LeadDashboard[]);
      setCitasHoy(citasRaw.map(c => ({ ...c, lead_nombre: leadNombres[c.lead_id] ?? null })));

      sinAtencion = (urgentesRes.data ?? []).length;

      setStats({
        leads_total: leads.length,
        leads_nuevos_hoy: leadsHoyRes.count ?? 0,
        leads_calientes: calientes,
        leads_templados: templados,
        leads_frios: frios,
        sin_atencion: sinAtencion,
        por_estado: porEstado,
        mensajes_pendientes: mensajesRes.count ?? 0,
        citas_hoy: citasRaw.length,
        citas_proximas: citasProxRes.count ?? 0,
        clientes_activos: clientesRes.count ?? 0,
        renovaciones_30d: renovRes.count ?? 0,
        acciones_vencidas: (vencidasRes.data ?? []).length,
      });

      setLoading(false);
    }
    cargar();
  }, []);

  const fecha = new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
  const fechaCap = fecha.charAt(0).toUpperCase() + fecha.slice(1);

  if (loading) return <div className="py-24 text-center text-sm" style={{ color: "#a09890" }}>Cargando dashboard...</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-0.5">{fechaCap}</p>
        </div>
      </div>

      {/* ── Alertas urgentes ── */}
      {(leadsUrgentes.length > 0 || accionesVencidas.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {leadsUrgentes.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-base">🔴</span>
                  <span className="text-sm font-semibold text-red-700">Sin atender</span>
                  <span className="text-xs bg-red-100 text-red-600 border border-red-200 px-1.5 py-0.5 rounded-full font-medium">{leadsUrgentes.length}</span>
                </div>
                <Link href="/leads?temperatura=caliente" className="text-xs text-red-600 hover:underline">Ver todos</Link>
              </div>
              <div className="space-y-1">
                {leadsUrgentes.map(l => (
                  <Link key={l.id} href={`/leads/${l.id}`} className="flex items-center justify-between text-sm px-3 py-2 bg-white rounded-lg border border-red-100 hover:border-red-300 transition-colors">
                    <span className="font-medium text-slate-800 truncate">{[l.nombre, l.apellidos].filter(Boolean).join(" ")}</span>
                    <span className="text-xs text-red-500 shrink-0 ml-2">{Math.round(l.horas_sin_atencion!)}h</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
          {accionesVencidas.length > 0 && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-base">⚠️</span>
                  <span className="text-sm font-semibold text-orange-700">Acciones vencidas</span>
                  <span className="text-xs bg-orange-100 text-orange-600 border border-orange-200 px-1.5 py-0.5 rounded-full font-medium">{accionesVencidas.length}</span>
                </div>
                <Link href="/leads" className="text-xs text-orange-600 hover:underline">Ver todos</Link>
              </div>
              <div className="space-y-1">
                {accionesVencidas.map(l => (
                  <Link key={l.id} href={`/leads/${l.id}`} className="flex items-center justify-between text-sm px-3 py-2 bg-white rounded-lg border border-orange-100 hover:border-orange-300 transition-colors">
                    <span className="font-medium text-slate-800 truncate">{[l.nombre, l.apellidos].filter(Boolean).join(" ")}</span>
                    <span className="text-xs text-orange-600 shrink-0 ml-2 capitalize">{l.proxima_accion?.replace("_", " ")}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Resumen leads ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-700">Leads</h2>
          <Link href="/leads" className="text-xs hover:underline" style={{ color: "#ea650d" }}>Ver todos →</Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatBox label="Total activos" valor={stats!.leads_total} sub="en el sistema" href="/leads" />
          <StatBox label="Nuevos hoy" valor={stats!.leads_nuevos_hoy} sub="captados hoy" href="/leads" color="orange" />
          <StatBox label="Calientes" valor={stats!.leads_calientes} sub="alta intención" href="/leads?temperatura=caliente" color="red" />
          <StatBox label="Sin atender" valor={stats!.sin_atencion} sub="+2h sin respuesta" href="/leads?temperatura=caliente" color={stats!.sin_atencion > 0 ? "red" : undefined} />
        </div>
      </div>

      {/* ── Pipeline ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-700">Pipeline</h2>
          <Link href="/pipeline" className="text-xs hover:underline" style={{ color: "#ea650d" }}>Ver kanban →</Link>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="grid grid-cols-4 sm:grid-cols-7 divide-x divide-slate-100">
            {PIPELINE_ACTIVO.map(estado => (
              <Link key={estado} href={`/pipeline`} className="flex flex-col items-center py-3 px-2 hover:bg-slate-50 transition-colors">
                <span className="text-lg font-bold text-slate-800">{stats!.por_estado[estado] ?? 0}</span>
                <span className="text-xs text-slate-400 text-center leading-tight mt-0.5">{ESTADO_LABEL[estado]}</span>
              </Link>
            ))}
          </div>
          <div className="px-4 py-2 border-t border-slate-100 bg-slate-50 flex gap-4 text-xs text-slate-500">
            <span>✅ Ganados: <strong className="text-emerald-700">{stats!.por_estado["cerrado_ganado"] ?? 0}</strong></span>
            <span>❌ Perdidos: <strong className="text-red-600">{stats!.por_estado["cerrado_perdido"] ?? 0}</strong></span>
            <span>🗑 Descartados: <strong className="text-slate-500">{stats!.por_estado["descartado"] ?? 0}</strong></span>
          </div>
        </div>
      </div>

      {/* ── Agenda hoy ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-700">Agenda hoy</h2>
          <Link href="/agenda" className="text-xs hover:underline" style={{ color: "#ea650d" }}>Ver agenda →</Link>
        </div>
        {citasHoy.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl px-4 py-6 text-center text-sm text-slate-400">
            No hay citas programadas para hoy.
            <Link href="/agenda" className="block text-xs text-orange-500 hover:underline mt-1">
              {stats!.citas_proximas > 0 ? `${stats!.citas_proximas} cita${stats!.citas_proximas > 1 ? "s" : ""} próximas` : "Ir a la agenda"}
            </Link>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
            {citasHoy.map(c => (
              <Link key={c.id} href="/agenda" className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50 transition-colors">
                <div className="w-14 text-center shrink-0">
                  <p className="text-sm font-bold text-slate-800">
                    {new Date(c.fecha_hora).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{c.lead_nombre ?? "Lead"}</p>
                  <p className="text-xs text-slate-400 capitalize">{c.tipo.replace("_", " ")}</p>
                </div>
                <span className="text-xs text-orange-500 shrink-0">Ver →</span>
              </Link>
            ))}
            {stats!.citas_proximas > 0 && (
              <div className="px-4 py-2 bg-slate-50 text-xs text-slate-400 text-center">
                + {stats!.citas_proximas} cita{stats!.citas_proximas > 1 ? "s" : ""} próximas
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Mensajes + Clientes ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Mensajes */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-700">Mensajes</h2>
            <Link href="/mensajes" className="text-xs hover:underline" style={{ color: "#ea650d" }}>Ver todos →</Link>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">Pendientes IA</span>
              <span className={`text-sm font-bold ${stats!.mensajes_pendientes > 0 ? "" : "text-slate-400"}`} style={stats!.mensajes_pendientes > 0 ? { color: "#ea650d" } : undefined}>
                {stats!.mensajes_pendientes}
              </span>
            </div>
            <Link href="/mensajes" className="block w-full text-center text-xs rounded-lg py-2 transition-colors" style={{ color: "#ea650d", border: "1px solid #f5c5a8" }} onMouseEnter={e => (e.currentTarget.style.background = "#fff5f0")} onMouseLeave={e => (e.currentTarget.style.background = "")}>
              Revisar mensajes →
            </Link>
          </div>
        </div>

        {/* Clientes */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-700">Clientes</h2>
            <Link href="/clientes" className="text-xs hover:underline" style={{ color: "#ea650d" }}>Ver cartera →</Link>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">Activos</span>
              <span className="text-sm font-bold text-emerald-700">{stats!.clientes_activos}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">Renuevan en 30d</span>
              <span className={`text-sm font-bold ${stats!.renovaciones_30d > 0 ? "text-amber-600" : "text-slate-400"}`}>
                {stats!.renovaciones_30d}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Accesos rápidos ── */}
      <div>
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Accesos rápidos</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <QuickLink href="/hoy" icon="🎯" label="Hoy" sub="Tareas y cola del día" />
          <QuickLink href="/mensajes" icon="💬" label="Mensajes" sub="WhatsApp pendientes" />
          <QuickLink href="/prospeccion" icon="📥" label="Prospectar" sub="Importar y gestionar leads" />
          <QuickLink href="/desempeno" icon="📊" label="Desempeño" sub="Métricas del equipo" />
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, valor, sub, href, color }: { label: string; valor: number; sub: string; href: string; color?: "red" | "orange" | "green" }) {
  const valColor = color === "red" ? "text-red-600" : color === "orange" ? "" : color === "green" ? "text-emerald-700" : "text-slate-900";
  return (
    <Link href={href} className="bg-white border border-slate-200 rounded-xl p-4 hover:shadow-sm transition-all block" style={{ borderColor: undefined }} onMouseEnter={e => (e.currentTarget.style.borderColor = "#ea650d")} onMouseLeave={e => (e.currentTarget.style.borderColor = "")}>
      <p className={`text-2xl font-bold ${valColor}`} style={color === "orange" ? { color: "#ea650d" } : undefined}>{valor}</p>
      <p className="text-xs font-semibold text-slate-700 mt-1">{label}</p>
      <p className="text-xs text-slate-400">{sub}</p>
    </Link>
  );
}

function QuickLink({ href, icon, label, sub }: { href: string; icon: string; label: string; sub: string }) {
  return (
    <Link href={href} className="bg-white border border-slate-200 rounded-xl p-4 hover:shadow-sm transition-all flex items-start gap-3" onMouseEnter={e => (e.currentTarget.style.borderColor = "#ea650d")} onMouseLeave={e => (e.currentTarget.style.borderColor = "")}>
      <span className="text-xl">{icon}</span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-800">{label}</p>
        <p className="text-xs text-slate-400 mt-0.5 truncate">{sub}</p>
      </div>
    </Link>
  );
}
