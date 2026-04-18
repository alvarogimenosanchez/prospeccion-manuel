"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { LeadDashboard } from "@/lib/supabase";
import { LeadRow } from "@/components/LeadRow";
import { FiltrosBar } from "@/components/FiltrosBar";

export default function LeadsPage() {
  return (
    <Suspense fallback={<div className="text-center py-20 text-slate-400 text-sm">Cargando...</div>}>
      <LeadsContent />
    </Suspense>
  );
}

function LeadsContent() {
  const searchParams = useSearchParams();
  const [leads, setLeads] = useState<LeadDashboard[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  const [prioridad, setPrioridad] = useState(searchParams.get("prioridad") ?? "");
  const [busqueda, setBusqueda] = useState("");
  const [teamId, setTeamId] = useState(searchParams.get("team") ?? "");

  const cargarLeads = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("leads_dashboard")
      .select("*", { count: "exact" })
      .order("nivel_interes", { ascending: false })
      .limit(100);

    if (prioridad) query = query.eq("prioridad", prioridad);
    if (teamId) query = query.eq("team_id", teamId);

    const { data, count } = await query;
    let resultado = (data as LeadDashboard[]) ?? [];

    // Filtro por búsqueda en cliente (rápido para volúmenes bajos)
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase();
      resultado = resultado.filter(
        (l) =>
          l.nombre?.toLowerCase().includes(q) ||
          l.apellidos?.toLowerCase().includes(q) ||
          l.empresa?.toLowerCase().includes(q) ||
          l.cargo?.toLowerCase().includes(q) ||
          l.ciudad?.toLowerCase().includes(q)
      );
    }

    setLeads(resultado);
    setTotal(count ?? 0);
    setLoading(false);
  }, [prioridad, busqueda, teamId]);

  useEffect(() => {
    cargarLeads();
  }, [cargarLeads]);

  const ESTADO_ORDEN = [
    "nuevo", "enriquecido", "segmentado", "mensaje_generado",
    "mensaje_enviado", "respondio", "cita_agendada", "en_negociacion",
    "cerrado_ganado", "cerrado_perdido", "descartado"
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Leads</h1>
          {!loading && (
            <p className="text-sm text-slate-400 mt-0.5">
              {leads.length} leads{prioridad ? " (filtrado)" : ""}
            </p>
          )}
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-slate-200 px-4">
        <FiltrosBar
          prioridad={prioridad}
          busqueda={busqueda}
          teamId={teamId}
          onPrioridad={setPrioridad}
          onBusqueda={setBusqueda}
          onTeam={setTeamId}
        />
      </div>

      {/* Tabla de leads */}
      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 px-4 py-12 text-center text-sm text-slate-400">
          Cargando leads...
        </div>
      ) : leads.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 px-4 py-12 text-center">
          <p className="text-slate-400 text-sm">No hay leads con estos filtros.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {/* Cabeceras */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 bg-slate-50/50">
            <span className="text-xs text-slate-400 font-medium">Nombre / Empresa</span>
            <div className="hidden md:flex items-center gap-4 text-xs text-slate-400 pr-6">
              <span className="w-28 hidden lg:block">Ciudad / Fuente</span>
              <span className="w-36 hidden lg:block">Productos</span>
              <span className="w-32 hidden sm:block">Interés</span>
              <span className="w-16 text-center">Prioridad</span>
              <span className="w-28 text-right">Actividad</span>
            </div>
          </div>
          {leads.map((lead) => (
            <LeadRow key={lead.id} lead={lead} />
          ))}
        </div>
      )}
    </div>
  );
}

