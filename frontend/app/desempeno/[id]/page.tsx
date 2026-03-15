"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { LeadRow } from "@/components/LeadRow";
import type { LeadDashboard } from "@/lib/supabase";

type Comercial = {
  id: string;
  nombre: string;
  apellidos: string | null;
  email: string | null;
  telefono: string | null;
  rol: string;
  activo: boolean;
  objetivo_cierres_mes: number;
  objetivo_citas_mes: number;
  created_at: string;
};

type Stats = {
  totalLeads: number;
  leadsCalientes: number;
  contactados: number;
  respondieron: number;
  citasAgendadas: number;
  cerradosGanados: number;
  cerradosPerdidos: number;
  accionesVencidas: number;
  tasaRespuesta: number;
  tasaConversion: number;
};

type CitaResumen = {
  id: string;
  tipo: string;
  estado: string;
  fecha_hora: string;
  lead_nombre: string;
};

export default function FichaComercialPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [comercial, setComercial] = useState<Comercial | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [leadsActivos, setLeadsActivos] = useState<LeadDashboard[]>([]);
  const [citas, setCitas] = useState<CitaResumen[]>([]);
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState<"mes" | "todo">("mes");

  useEffect(() => {
    cargar();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, periodo]);

  async function cargar() {
    setLoading(true);
    const ahora = new Date();
    const fechaDesde = periodo === "mes"
      ? new Date(ahora.getFullYear(), ahora.getMonth(), 1).toISOString()
      : null;

    const [comRes, leadsRes, citasRes] = await Promise.all([
      supabase.from("comerciales").select("*").eq("id", id).single(),
      supabase.from("leads_dashboard").select("*").eq("comercial_asignado", id)
        .not("estado", "in", "(cerrado_ganado,cerrado_perdido,descartado)")
        .order("nivel_interes", { ascending: false })
        .limit(20),
      supabase.from("appointments")
        .select("id, tipo, estado, fecha_hora, lead:leads(nombre, apellidos)")
        .eq("comercial_id", id)
        .order("fecha_hora", { ascending: false })
        .limit(10),
    ]);

    setComercial(comRes.data as Comercial);
    setLeadsActivos((leadsRes.data as LeadDashboard[]) ?? []);

    const citasRaw = (citasRes.data ?? []) as { id: string; tipo: string; estado: string; fecha_hora: string; lead: { nombre: string; apellidos: string | null } | null }[];
    setCitas(citasRaw.map(c => ({
      id: c.id,
      tipo: c.tipo,
      estado: c.estado,
      fecha_hora: c.fecha_hora,
      lead_nombre: c.lead ? [c.lead.nombre, c.lead.apellidos].filter(Boolean).join(" ") : "Lead",
    })));

    // Stats
    const base = supabase.from("leads").select("*", { count: "exact", head: true }).eq("comercial_asignado", id);
    const applyFecha = (q: typeof base) => fechaDesde ? q.gte("fecha_captacion", fechaDesde) : q;

    const [
      { count: total },
      { count: calientes },
      { count: contactados },
      { count: respondieron },
      { count: citas_count },
      { count: ganados },
      { count: perdidos },
      { count: vencidas },
    ] = await Promise.all([
      applyFecha(base),
      applyFecha(supabase.from("leads").select("*", { count: "exact", head: true }).eq("comercial_asignado", id).eq("temperatura", "caliente")),
      applyFecha(supabase.from("leads").select("*", { count: "exact", head: true }).eq("comercial_asignado", id).in("estado", ["mensaje_enviado", "respondio", "cita_agendada", "en_negociacion", "cerrado_ganado", "cerrado_perdido"])),
      applyFecha(supabase.from("leads").select("*", { count: "exact", head: true }).eq("comercial_asignado", id).in("estado", ["respondio", "cita_agendada", "en_negociacion", "cerrado_ganado"])),
      applyFecha(supabase.from("leads").select("*", { count: "exact", head: true }).eq("comercial_asignado", id).in("estado", ["cita_agendada", "en_negociacion", "cerrado_ganado"])),
      applyFecha(supabase.from("leads").select("*", { count: "exact", head: true }).eq("comercial_asignado", id).eq("estado", "cerrado_ganado")),
      applyFecha(supabase.from("leads").select("*", { count: "exact", head: true }).eq("comercial_asignado", id).eq("estado", "cerrado_perdido")),
      supabase.from("leads").select("*", { count: "exact", head: true }).eq("comercial_asignado", id).not("proxima_accion", "is", null).neq("proxima_accion", "ninguna").lt("proxima_accion_fecha", ahora.toISOString()).not("estado", "in", "(cerrado_ganado,cerrado_perdido,descartado)"),
    ]);

    const t = total ?? 0;
    const c = contactados ?? 0;
    const r = respondieron ?? 0;
    setStats({
      totalLeads: t,
      leadsCalientes: calientes ?? 0,
      contactados: c,
      respondieron: r,
      citasAgendadas: citas_count ?? 0,
      cerradosGanados: ganados ?? 0,
      cerradosPerdidos: perdidos ?? 0,
      accionesVencidas: vencidas ?? 0,
      tasaRespuesta: c > 0 ? Math.round((r / c) * 100) : 0,
      tasaConversion: t > 0 ? Math.round(((ganados ?? 0) / t) * 100) : 0,
    });

    setLoading(false);
  }

  if (loading) return <div className="py-24 text-center text-sm text-slate-400">Cargando ficha...</div>;
  if (!comercial) return <div className="py-24 text-center text-sm text-slate-400">Comercial no encontrado</div>;

  const nombre = [comercial.nombre, comercial.apellidos].filter(Boolean).join(" ");
  const iniciales = nombre.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase();

  const ESTADO_COLOR: Record<string, string> = {
    pendiente: "text-amber-600",
    confirmada: "text-green-600",
    realizada: "text-slate-400",
    cancelada: "text-red-500",
    no_show: "text-orange-500",
  };

  return (
    <div className="space-y-6">
      {/* Back */}
      <button onClick={() => router.back()} className="text-sm text-slate-500 hover:text-slate-800 flex items-center gap-1">
        ← Volver a desempeño
      </button>

      {/* Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-lg flex-shrink-0">
            {iniciales}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-slate-900">{nombre}</h1>
            <p className="text-sm text-slate-500 mt-0.5 capitalize">{comercial.rol === "director" ? "Director comercial" : "Comercial"}</p>
            <div className="flex flex-wrap gap-4 mt-3 text-sm text-slate-600">
              {comercial.email && <a href={`mailto:${comercial.email}`} className="hover:text-indigo-600">{comercial.email}</a>}
              {comercial.telefono && <a href={`tel:${comercial.telefono}`} className="hover:text-indigo-600">{comercial.telefono}</a>}
            </div>
          </div>
          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 shrink-0">
            {(["mes", "todo"] as const).map(p => (
              <button key={p} onClick={() => setPeriodo(p)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${periodo === p ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                {p === "mes" ? "Este mes" : "Todo"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {stats && (
        <>
          {/* Stats principales */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatBox label="Leads asignados" valor={stats.totalLeads} color="slate" />
            <StatBox label="Calientes" valor={stats.leadsCalientes} color="red" />
            <StatBox label="Citas agendadas" valor={stats.citasAgendadas} color="indigo" />
            <StatBox label="Cerrados ganados" valor={stats.cerradosGanados} color="green" />
          </div>

          {/* Funnel */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">Embudo de ventas</h2>
            <div className="space-y-2">
              {[
                { label: "Total leads", val: stats.totalLeads, color: "bg-slate-200" },
                { label: "Contactados", val: stats.contactados, color: "bg-indigo-200" },
                { label: "Respondieron", val: stats.respondieron, color: "bg-indigo-400" },
                { label: "Citas agendadas", val: stats.citasAgendadas, color: "bg-indigo-600" },
                { label: "Cerrados ganados", val: stats.cerradosGanados, color: "bg-green-500" },
              ].map(row => {
                const pct = stats.totalLeads > 0 ? Math.round((row.val / stats.totalLeads) * 100) : 0;
                return (
                  <div key={row.label} className="flex items-center gap-3">
                    <span className="text-xs text-slate-500 w-32 shrink-0">{row.label}</span>
                    <div className="flex-1 h-4 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full ${row.color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs font-semibold text-slate-700 w-8 text-right">{row.val}</span>
                    <span className="text-xs text-slate-400 w-8">{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Métricas clave */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
              <p className={`text-2xl font-bold ${stats.tasaRespuesta >= 30 ? "text-green-600" : stats.tasaRespuesta >= 15 ? "text-amber-600" : "text-red-600"}`}>
                {stats.tasaRespuesta}%
              </p>
              <p className="text-xs font-semibold text-slate-600 mt-0.5">Tasa de respuesta</p>
              <p className="text-xs text-slate-400">Contactados que responden</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
              <p className={`text-2xl font-bold ${stats.tasaConversion >= 5 ? "text-green-600" : "text-slate-500"}`}>
                {stats.tasaConversion}%
              </p>
              <p className="text-xs font-semibold text-slate-600 mt-0.5">Conversión global</p>
              <p className="text-xs text-slate-400">Leads → ganados</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
              <p className={`text-2xl font-bold ${stats.accionesVencidas === 0 ? "text-green-600" : stats.accionesVencidas <= 2 ? "text-amber-600" : "text-red-600"}`}>
                {stats.accionesVencidas}
              </p>
              <p className="text-xs font-semibold text-slate-600 mt-0.5">Acciones vencidas</p>
              <p className="text-xs text-slate-400">Compromisos sin cumplir</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-slate-700">
                {stats.cerradosGanados + stats.cerradosPerdidos > 0
                  ? `${Math.round((stats.cerradosGanados / (stats.cerradosGanados + stats.cerradosPerdidos)) * 100)}%`
                  : "—"}
              </p>
              <p className="text-xs font-semibold text-slate-600 mt-0.5">Win rate</p>
              <p className="text-xs text-slate-400">Ganados vs total cerrados</p>
            </div>
          </div>
        </>
      )}

      {/* Leads activos */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-800">Leads activos</h2>
          <Link href={`/leads?comercial=${id}`} className="text-xs text-indigo-600 hover:underline">Ver todos →</Link>
        </div>
        {leadsActivos.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">Sin leads activos</p>
        ) : (
          leadsActivos.map(l => <LeadRow key={l.id} lead={l} />)
        )}
      </div>

      {/* Últimas citas */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-800">Últimas citas</h2>
        </div>
        {citas.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">Sin citas registradas</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {citas.map(c => (
              <div key={c.id} className="flex items-center gap-4 px-4 py-3">
                <div className="w-20 shrink-0">
                  <p className="text-xs font-medium text-slate-700">
                    {new Date(c.fecha_hora).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
                  </p>
                  <p className="text-xs text-slate-400">
                    {new Date(c.fecha_hora).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{c.lead_nombre}</p>
                  <p className="text-xs text-slate-400 capitalize">{c.tipo.replace("_", " ")}</p>
                </div>
                <span className={`text-xs font-medium capitalize ${ESTADO_COLOR[c.estado] ?? "text-slate-500"}`}>
                  {c.estado}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatBox({ label, valor, color }: { label: string; valor: number; color: "slate" | "red" | "indigo" | "green" }) {
  const colorClass = {
    slate: "text-slate-800",
    red: "text-red-600",
    indigo: "text-indigo-700",
    green: "text-emerald-700",
  }[color];
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
      <p className={`text-2xl font-bold ${colorClass}`}>{valor}</p>
      <p className="text-xs font-semibold text-slate-600 mt-0.5">{label}</p>
    </div>
  );
}
