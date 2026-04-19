"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { LeadDashboard } from "@/lib/supabase";
import { LeadRow } from "@/components/LeadRow";
import { FiltrosBar, type EstadoFiltro } from "@/components/FiltrosBar";

const PAGE_SIZE = 50;

const ESTADOS_FUNNEL = [
  { estado: "nuevo",            label: "Nuevos",      color: "#64748b" },
  { estado: "segmentado",       label: "Segmentados", color: "#3b82f6" },
  { estado: "mensaje_enviado",  label: "Contactados", color: "#ea650d" },
  { estado: "respondio",        label: "Respondieron",color: "#d97706" },
  { estado: "cita_agendada",    label: "Cita",        color: "#f97316" },
  { estado: "en_negociacion",   label: "Negociando",  color: "#7c3aed" },
  { estado: "cerrado_ganado",   label: "Ganados",     color: "#16a34a" },
];

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
  const [prioridad,    setPrioridad   ] = useState(searchParams.get("prioridad") ?? "");
  const [busqueda,     setBusqueda    ] = useState("");
  const [teamId,       setTeamId      ] = useState(searchParams.get("team") ?? "");
  const [estado,       setEstado      ] = useState<EstadoFiltro>((searchParams.get("estado") as EstadoFiltro) ?? "");
  const [soloMios,     setSoloMios    ] = useState(true);
  const [temperatura,  setTemperatura ] = useState(searchParams.get("temperatura") ?? "");
  const [fuente,       setFuente      ] = useState(searchParams.get("fuente") ?? "");
  const [ordenar,      setOrdenar     ] = useState(searchParams.get("ordenar") ?? "reciente");

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

  // ── Counts por estado (funnel bar) ────────────────────────────────────────
  const [countsPorEstado, setCountsPorEstado] = useState<Record<string, number>>({});

  useEffect(() => {
    async function cargarCounts() {
      let q = supabase.from("leads").select("estado", { count: "exact" });
      if (soloMios && comercialId) q = q.eq("comercial_asignado", comercialId);
      const { data } = await q.in("estado", ESTADOS_FUNNEL.map(e => e.estado));
      if (!data) return;
      const counts: Record<string, number> = {};
      for (const row of data as { estado: string }[]) {
        counts[row.estado] = (counts[row.estado] ?? 0) + 1;
      }
      setCountsPorEstado(counts);
    }
    if (comercialCargado) cargarCounts();
  }, [comercialId, soloMios, comercialCargado]);

  // ── Alerta formularios sin contactar ─────────────────────────────────────
  const [formulariosSinContactar, setFormulariosSinContactar] = useState(0);
  useEffect(() => {
    if (!comercialCargado) return;
    let q = supabase.from("leads").select("id", { count: "exact", head: true })
      .eq("fuente", "formulario_web")
      .eq("estado", "nuevo");
    if (soloMios && comercialId) q = q.eq("comercial_asignado", comercialId);
    q.then(({ count }) => setFormulariosSinContactar(count ?? 0));
  }, [comercialCargado, comercialId, soloMios]);

  // ── Datos ─────────────────────────────────────────────────────────────────
  const [leads,    setLeads   ] = useState<LeadDashboard[]>([]);
  const [total,    setTotal   ] = useState(0);
  const [loading,  setLoading ] = useState(true);
  const [offset,   setOffset  ] = useState(0);
  const [hayMas,   setHayMas  ] = useState(false);

  const cargarLeads = useCallback(async (nuevoOffset = 0) => {
    if (!comercialCargado) return;
    if (nuevoOffset === 0) setLoading(true);

    const ORDEN_CFG: Record<string, { col: string; asc: boolean }> = {
      reciente:       { col: "created_at",   asc: false },
      actividad:      { col: "updated_at",   asc: false },
      interes_alto:   { col: "nivel_interes", asc: false },
      interes_bajo:   { col: "nivel_interes", asc: true  },
      prioridad_alta: { col: "prioridad",    asc: true  },
    };
    const ord = ORDEN_CFG[ordenar] ?? ORDEN_CFG.reciente;

    let query = supabase
      .from("leads_dashboard")
      .select("*", { count: "exact" })
      .order(ord.col, { ascending: ord.asc })
      .range(nuevoOffset, nuevoOffset + PAGE_SIZE - 1);

    if (prioridad)   query = query.eq("prioridad",   prioridad);
    if (estado)      query = query.eq("estado",      estado);
    if (teamId)      query = query.eq("team_id",     teamId);
    if (temperatura) query = query.eq("temperatura", temperatura);
    if (fuente)      query = query.eq("fuente",      fuente);

    // "Mis leads": filtrar por comercial asignado
    if (soloMios && comercialId) {
      query = query.eq("comercial_asignado", comercialId);
    }

    // Búsqueda server-side para buscar en todos los leads, no solo los cargados
    if (busqueda.trim()) {
      const q = `%${busqueda.trim()}%`;
      query = query.or(`nombre.ilike.${q},apellidos.ilike.${q},empresa.ilike.${q},ciudad.ilike.${q}`);
    }

    const { data, count } = await query;
    let resultado = (data as LeadDashboard[]) ?? [];

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
  }, [prioridad, busqueda, estado, soloMios, comercialId, comercialCargado, teamId, temperatura, fuente, ordenar]);

  // Reset y recargar cuando cambian los filtros
  useEffect(() => {
    cargarLeads(0);
  }, [cargarLeads]);

  function cargarMas() {
    cargarLeads(offset + PAGE_SIZE);
  }

  // Calcular texto de resumen
  const sinFiltros = !prioridad && !estado && !teamId && !temperatura;
  const labelFiltrado = [
    soloMios ? "mis leads" : null,
    estado ? `en "${estado}"` : null,
    prioridad ? `prioridad ${prioridad}` : null,
    temperatura ? `${temperatura === "caliente" ? "🔴" : temperatura === "templado" ? "🟡" : "🔵"} ${temperatura}` : null,
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
        <div className="flex items-center gap-2">
          <select
            value={ordenar}
            onChange={(e) => setOrdenar(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-600 focus:outline-none focus:border-slate-400"
          >
            <option value="reciente">Más recientes</option>
            <option value="actividad">Última actividad</option>
            <option value="interes_alto">Mayor interés</option>
            <option value="interes_bajo">Menor interés</option>
            <option value="prioridad_alta">Prioridad</option>
          </select>
          <button
            onClick={() => cargarLeads(0)}
            className="text-sm text-slate-500 hover:text-slate-800 px-3 py-2 rounded-lg hover:bg-slate-100 transition-colors"
          >
            Actualizar
          </button>
          <Link
            href="/leads/nuevo"
            className="text-sm font-medium px-4 py-2 rounded-lg text-white transition-colors"
            style={{ background: "#ea650d" }}
          >
            + Nuevo lead
          </Link>
        </div>
      </div>

      {/* Pipeline funnel strip */}
      {Object.keys(countsPorEstado).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {ESTADOS_FUNNEL.map(({ estado: e, label, color }) => {
            const count = countsPorEstado[e] ?? 0;
            if (count === 0) return null;
            const activo = estado === e;
            return (
              <button
                key={e}
                onClick={() => setEstado(activo ? "" : (e as EstadoFiltro))}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all"
                style={{
                  background: activo ? color : color + "18",
                  color: activo ? "#fff" : color,
                  border: `1px solid ${color}30`,
                }}
              >
                <span className="font-bold text-sm">{count}</span>
                {label}
              </button>
            );
          })}
        </div>
      )}

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-slate-200 px-4">
        <FiltrosBar
          prioridad={prioridad}
          busqueda={busqueda}
          estado={estado}
          soloMios={soloMios}
          teamId={teamId}
          temperatura={temperatura}
          fuente={fuente}
          onPrioridad={(v)    => setPrioridad(v)}
          onBusqueda={(v)     => setBusqueda(v)}
          onEstado={(v)       => setEstado(v)}
          onSoloMios={(v)     => setSoloMios(v)}
          onTeam={(v)         => setTeamId(v)}
          onTemperatura={(v)  => setTemperatura(v)}
          onFuente={(v)       => setFuente(v)}
        />
      </div>

      {/* Alerta leads de formulario sin contactar */}
      {formulariosSinContactar > 0 && !fuente && !estado && (
        <div className="flex items-center gap-3 rounded-xl border px-4 py-3" style={{ background: "#f5f3ff", borderColor: "#c4b5fd" }}>
          <span className="text-lg shrink-0">📋</span>
          <div className="flex-1">
            <p className="text-sm font-semibold" style={{ color: "#5b21b6" }}>
              {formulariosSinContactar} lead{formulariosSinContactar !== 1 ? "s" : ""} de formulario sin contactar
            </p>
            <p className="text-xs mt-0.5" style={{ color: "#7c3aed" }}>
              Llegaron a través de tus formularios de captación y aún no han sido contactados
            </p>
          </div>
          <button
            onClick={() => { setFuente("formulario_web"); setEstado("nuevo"); }}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white shrink-0"
            style={{ background: "#7c3aed" }}
          >
            Ver ahora →
          </button>
        </div>
      )}

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
          <div className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-100 bg-slate-50/50 text-xs text-slate-400 font-medium">
            <span className="w-52 min-w-0">Estado · Nombre / Empresa</span>
            <span className="w-28 min-w-0 hidden md:block">Ciudad / Fuente</span>
            <span className="flex-1 min-w-0 hidden lg:block">Productos</span>
            <span className="w-28 hidden sm:block">Interés</span>
            <span className="w-14 text-center hidden sm:block">Prioridad</span>
            <span className="w-36 text-right hidden md:block">Actividad / Acción</span>
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
