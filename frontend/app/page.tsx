"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { LeadDashboard, DashboardResumen } from "@/lib/supabase";
import { StatsCard } from "@/components/StatsCard";
import { AlertasUrgentes } from "@/components/AlertasUrgentes";
import { LeadRow } from "@/components/LeadRow";

export default function DashboardPage() {
  const [resumen, setResumen] = useState<DashboardResumen | null>(null);
  const [leadsCalientes, setLeadsCalientes] = useState<LeadDashboard[]>([]);
  const [accionesVencidas, setAccionesVencidas] = useState<LeadDashboard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function cargarDatos() {
      // Resumen del día (llamada al backend si está disponible, si no directo a Supabase)
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;

      if (apiUrl) {
        try {
          const res = await fetch(`${apiUrl}/api/dashboard/resumen`);
          if (res.ok) setResumen(await res.json());
        } catch {
          // Backend no disponible, usar Supabase directamente
        }
      }

      // Leads calientes directamente desde Supabase
      const [calientes, vencidas] = await Promise.all([
        supabase
          .from("leads_dashboard")
          .select("*")
          .eq("temperatura", "caliente")
          .order("nivel_interes", { ascending: false })
          .limit(10),
        supabase
          .from("leads_dashboard")
          .select("*")
          .not("proxima_accion", "is", null)
          .neq("proxima_accion", "ninguna")
          .lt("proxima_accion_fecha", new Date().toISOString())
          .order("proxima_accion_fecha", { ascending: true })
          .limit(5),
      ]);

      setLeadsCalientes((calientes.data as LeadDashboard[]) ?? []);
      setAccionesVencidas((vencidas.data as LeadDashboard[]) ?? []);
      setLoading(false);
    }

    cargarDatos();
  }, []);

  const sinAtencion = leadsCalientes.filter(
    (l) => l.horas_sin_atencion && l.horas_sin_atencion > 2
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Resumen del día</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatsCard
          titulo="Leads nuevos hoy"
          valor={resumen?.leads_nuevos_hoy ?? "—"}
          descripcion="Captados en las últimas 24h"
        />
        <StatsCard
          titulo="Leads calientes"
          valor={resumen?.leads_calientes_total ?? leadsCalientes.length}
          descripcion="Alta intención de compra"
          urgente={false}
        />
        <StatsCard
          titulo="Citas hoy"
          valor={resumen?.citas_hoy ?? "—"}
          descripcion="Llamadas y reuniones"
        />
        <StatsCard
          titulo="Sin atender"
          valor={sinAtencion.length}
          descripcion="Respondieron hace +2h"
          urgente={sinAtencion.length > 0}
        />
      </div>

      {/* Alertas urgentes */}
      {sinAtencion.length > 0 && (
        <AlertasUrgentes leads={sinAtencion} />
      )}

      {/* Acciones vencidas */}
      {accionesVencidas.length > 0 && (
        <div className="bg-white rounded-xl border border-red-200">
          <div className="flex items-center justify-between px-4 py-3 border-b border-red-100 bg-red-50 rounded-t-xl">
            <div className="flex items-center gap-2">
              <span className="text-red-500">⚠</span>
              <h2 className="text-sm font-semibold text-red-700">Acciones vencidas</h2>
              <span className="text-xs bg-red-100 text-red-600 border border-red-200 px-1.5 py-0.5 rounded-full font-medium">
                {accionesVencidas.length}
              </span>
            </div>
            <Link href="/leads" className="text-xs text-red-600 hover:underline">Ver todos</Link>
          </div>
          <div>
            {accionesVencidas.map((lead) => (
              <LeadRow key={lead.id} lead={lead} />
            ))}
          </div>
        </div>
      )}

      {/* Leads calientes */}
      <div className="bg-white rounded-xl border border-slate-200">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-800">
            Leads calientes — actúa ahora
          </h2>
          <Link href="/leads?temperatura=caliente" className="text-xs text-indigo-600 hover:underline">
            Ver todos
          </Link>
        </div>

        {loading ? (
          <div className="px-4 py-8 text-center text-sm text-slate-400">Cargando...</div>
        ) : leadsCalientes.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-slate-400">No hay leads calientes ahora mismo.</p>
            <Link href="/leads" className="text-sm text-indigo-600 hover:underline mt-1 block">
              Ver todos los leads
            </Link>
          </div>
        ) : (
          <div>
            {leadsCalientes.map((lead) => (
              <LeadRow key={lead.id} lead={lead} />
            ))}
          </div>
        )}
      </div>

      {/* Accesos rápidos */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link href="/leads?prioridad=alta" className="rounded-xl border border-slate-200 bg-white p-4 hover:border-indigo-300 hover:shadow-sm transition-all">
          <p className="text-sm font-semibold text-slate-800">Prioridad alta</p>
          <p className="text-xs text-slate-400 mt-0.5">Leads que necesitan atención hoy</p>
        </Link>
        <Link href="/leads" className="rounded-xl border border-slate-200 bg-white p-4 hover:border-indigo-300 hover:shadow-sm transition-all">
          <p className="text-sm font-semibold text-slate-800">Todos los leads</p>
          <p className="text-xs text-slate-400 mt-0.5">Ver y filtrar el pipeline completo</p>
        </Link>
        <Link href="/leads?fuente=inbound" className="rounded-xl border border-slate-200 bg-white p-4 hover:border-indigo-300 hover:shadow-sm transition-all">
          <p className="text-sm font-semibold text-slate-800">Nuevos inbound</p>
          <p className="text-xs text-slate-400 mt-0.5">Leads que llegaron solos</p>
        </Link>
      </div>
    </div>
  );
}
