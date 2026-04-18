"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { LeadDashboard } from "@/lib/supabase";
import { LeadRow } from "@/components/LeadRow";
import { FiltrosBar, type EstadoFiltro } from "@/components/FiltrosBar";

const PAGE_SIZE = 50;

export default function LeadsPage() {
  return (
    <Suspense fallback={<div className="text-center py-20 text-slate-400 text-sm">Cargando...</div>}>
      <LeadsContent />
    </Suspense>
  );
}

function LeadsContent() {
  const searchParams = useSearchParams();

  // ── Filtros ────────────────────────────────────────────────────────────────
  const [prioridad, setPrioridad] = useState(searchParams.get("prioridad") ?? "");
  const [busqueda,  setBusqueda ] = useState("");
  const [teamId,    setTeamId   ] = useState(searchParams.get("team") ?? "");
  const [estado,    setEstado   ] = useState<EstadoFiltro>((searchParams.get("estado") as EstadoFiltro) ?? "");
  const [soloMios,  setSoloMios ] = useState(true);

  // ── Comercial del usuario logueado ────────────────────────────────────────
  const [comercialId, setComercialId] = useState<string | null>(null);
  const [comercialCargado, setComercialCargado] = useState(false);

  useEffect(() => {
    async function obtenerComercial() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) { setComercialCargado(true); return; }
      const { data } = await supabase
        .from("comerciales")
        .select("id")
        .eq("email", user.email)
        .single();
      setComercialId(data?.id ?? null);
      setComercialCargado(true);
    }
    obtenerComercial();
  }, []);

  // ── Datos ─────────────────────────────────────────────────────────────────
  const [leads,    setLeads   ] = useState<LeadDashboard[]>([]);
  const [total,    setTotal   ] = useState(0);
  const [loading,  setLoading ] = useState(true);
  const [offset,   setOffset  ] = useState(0);
  const [hayMas,   setHayMas  ] = useState(false);

  const cargarLeads = useCallback(async (nuevoOffset = 0) => {
    if (!comercialCargado) return;
    if (nuevoOffset === 0) setLoading(true);

    let query = supabase
      .from("leads_dashboard")
      .select("*", { count: "exact" })
      .order("nivel_interes", { ascending: false })
      .order("updated_at",    { ascending: false })
      .range(nuevoOffset, nuevoOffset + PAGE_SIZE - 1);

    if (prioridad) query = query.eq("prioridad", prioridad);
    if (estado)    query = query.eq("estado",    estado);
    if (teamId)    query = query.eq("team_id",   teamId);

    // "Mis leads": filtrar por comercial asignado
    if (soloMios && comercialId) {
      query = query.eq("comercial_asignado", comercialId);
    }

    const { data, count } = await query;
    let resultado = (data as LeadDashboard[]) ?? [];

    // Filtro por búsqueda en cliente (funciona sobre la página cargada)
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

    const totalCount = count ?? 0;
    if (nuevoOffset === 0) {
      setLeads(resultado);
    } else {
      setLeads((prev) => [...prev, ...resultado]);
    }
    setTotal(totalCount);
    setOffset(nuevoOffset);
    setHayMas(nuevoOffset + PAGE_SIZE < totalCount);
    setLoading(false);
  }, [prioridad, busqueda, estado, soloMios, comercialId, comercialCargado, teamId]);

  // Reset y recargar cuando cambian los filtros
  useEffect(() => {
    cargarLeads(0);
  }, [cargarLeads]);

  function cargarMas() {
    cargarLeads(offset + PAGE_SIZE);
  }

  // Calcular texto de resumen
  const sinFiltros = !prioridad && !estado && !teamId;
  const labelFiltrado = [
    soloMios ? "mis leads" : null,
    estado ? `en "${estado}"` : null,
    prioridad ? `prioridad ${prioridad}` : null,
  ].filter(Boolean).join(", ");

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Leads</h1>
          {!loading && (
            <p className="text-sm text-slate-400 mt-0.5">
              {leads.length < total
                ? `${leads.length} de ${total} leads`
                : `${total} leads`}
              {labelFiltrado ? ` · ${labelFiltrado}` : ""}
            </p>
          )}
        </div>
        <button
          onClick={() => cargarLeads(0)}
          className="text-sm text-slate-500 hover:text-slate-800 px-3 py-2 rounded-lg hover:bg-slate-100 transition-colors"
        >
          Actualizar
        </button>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-slate-200 px-4">
        <FiltrosBar
          prioridad={prioridad}
          busqueda={busqueda}
          estado={estado}
          soloMios={soloMios}
          teamId={teamId}
          onPrioridad={(v) => setPrioridad(v)}
          onBusqueda={(v)  => setBusqueda(v)}
          onEstado={(v)    => setEstado(v)}
          onSoloMios={(v)  => setSoloMios(v)}
          onTeam={(v)      => setTeamId(v)}
        />
      </div>

      {/* Aviso si mis leads está activo pero no hay comercial */}
      {soloMios && !comercialId && comercialCargado && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
          No se encontró tu perfil de comercial — mostrando todos los leads.
        </div>
      )}

      {/* Tabla de leads */}
      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 px-4 py-12 text-center text-sm text-slate-400">
          Cargando leads...
        </div>
      ) : leads.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 px-4 py-12 text-center">
          <p className="text-slate-400 text-sm">
            {soloMios && comercialId
              ? "No tienes leads con estos filtros."
              : "No hay leads con estos filtros."}
          </p>
          {soloMios && (
            <button
              onClick={() => setSoloMios(false)}
              className="mt-2 text-sm hover:underline" style={{ color: "#ea650d" }}
            >
              Ver todos los leads
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {/* Cabeceras */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 bg-slate-50/50">
            <span className="text-xs text-slate-400 font-medium">Estado · Nombre / Empresa</span>
            <div className="hidden md:flex items-center gap-3 text-xs text-slate-400 pr-2">
              <span className="w-28 hidden lg:block">Ciudad / Fuente</span>
              <span className="w-28 hidden lg:block">Productos</span>
              <span className="w-28 hidden sm:block">Interés</span>
              <span className="w-14 text-center hidden sm:block">Prioridad</span>
              <span className="w-36 text-right">Actividad / Acción</span>
              <span className="w-20">—</span>
            </div>
          </div>

          {leads.map((lead) => (
            <LeadRow key={lead.id} lead={lead} />
          ))}

          {/* Cargar más */}
          {hayMas && (
            <div className="px-4 py-4 border-t border-slate-100 text-center">
              <button
                onClick={cargarMas}
                className="text-sm font-medium px-4 py-2 rounded-lg transition-colors" style={{ color: "#ea650d" }}
              >
                Cargar más leads ({total - leads.length} restantes)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
