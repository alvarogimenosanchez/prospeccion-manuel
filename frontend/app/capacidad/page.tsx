"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { usePermisos } from "@/components/PermisosProvider";
import { SinAcceso } from "@/components/SinAcceso";
import { differenceInDays, parseISO } from "date-fns";

// ─── Types ──────────────────────────────────────────────────────────────────

type AgentCapacity = {
  id: string;
  nombre: string;
  apellidos: string | null;
  email: string;
  rol: string;
  max_leads_activos: number;
  // actuals
  leads_activos: number;
  leads_calientes: number;
  leads_en_negociacion: number;
  leads_sin_accion: number; // no proxima_accion_fecha set
  leads_atascados: number;  // updated > 7d ago
  cierres_mes: number;
  citas_mes: number;
  // computed
  capacidad_libre: number;
  pct_ocupacion: number;
  estado_capacidad: "libre" | "optimo" | "lleno" | "saturado";
  velocidad_cierre_dias: number; // avg days from creation to closed
  recomendacion: string;
};

// ─── Helpers ────────────────────────────────────────────────────────────────

const ESTADOS_ACTIVOS = ["nuevo", "enriquecido", "segmentado", "mensaje_generado",
  "mensaje_enviado", "respondio", "cita_agendada", "en_negociacion"];

const CAPACIDAD_CFG = {
  libre:    { label: "Disponible",   bg: "bg-green-50",   border: "border-green-200",   text: "text-green-700",   bar: "#10b981" },
  optimo:   { label: "Óptimo",       bg: "bg-blue-50",    border: "border-blue-200",    text: "text-blue-700",    bar: "#3b82f6" },
  lleno:    { label: "Casi lleno",   bg: "bg-amber-50",   border: "border-amber-200",   text: "text-amber-700",   bar: "#f59e0b" },
  saturado: { label: "Saturado",     bg: "bg-red-50",     border: "border-red-200",     text: "text-red-700",     bar: "#ef4444" },
};

function estadoCapacidad(pct: number): AgentCapacity["estado_capacidad"] {
  if (pct < 50) return "libre";
  if (pct < 75) return "optimo";
  if (pct < 90) return "lleno";
  return "saturado";
}

function recomendacion(agent: Omit<AgentCapacity, "estado_capacidad" | "recomendacion">): string {
  const { pct_ocupacion, capacidad_libre, leads_sin_accion, leads_atascados, leads_calientes, leads_activos } = agent;
  if (pct_ocupacion >= 90) return `Saturado — redirigir nuevos leads a otro agente`;
  if (pct_ocupacion < 40 && leads_calientes === 0) return `Baja actividad — asignar más leads o revisar pipeline`;
  if (leads_atascados > leads_activos * 0.4) return `Muchos leads atascados — priorizar seguimiento activo`;
  if (leads_sin_accion > 5) return `${leads_sin_accion} leads sin acción programada — planificar seguimientos`;
  if (capacidad_libre > 20) return `Puede absorber hasta ${capacidad_libre} leads más`;
  if (pct_ocupacion >= 75) return `Capacidad casi completa — priorizar calidad sobre volumen`;
  return `Pipeline saludable`;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CapacidadPage() {
  const { puede, cargando: cargandoPermisos } = usePermisos();
  const [agentes, setAgentes] = useState<AgentCapacity[]>([]);
  const [loading, setLoading] = useState(true);
  const [editandoMax, setEditandoMax] = useState<string | null>(null);
  const [nuevoMax, setNuevoMax] = useState("");
  const [guardandoMax, setGuardandoMax] = useState(false);

  // ── Distribuir leads ────────────────────────────────────────────────────────
  const [modalDistribuir, setModalDistribuir] = useState(false);
  const [leadsSinAsignar, setLeadsSinAsignar] = useState(0);
  const [distribuyendo, setDistribuyendo] = useState(false);
  const [distribuirResultado, setDistribuirResultado] = useState<string | null>(null);

  async function abrirModalDistribuir() {
    const { count } = await supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .is("comercial_asignado", null)
      .not("estado", "in", "(cerrado_ganado,cerrado_perdido,descartado)");
    setLeadsSinAsignar(count ?? 0);
    setDistribuirResultado(null);
    setModalDistribuir(true);
  }

  async function distribuirLeads() {
    setDistribuyendo(true);
    const agentesDisponibles = agentes.filter(a => a.estado_capacidad !== "saturado" && a.capacidad_libre > 0);
    if (agentesDisponibles.length === 0) { setDistribuyendo(false); return; }

    const { data: leads } = await supabase
      .from("leads")
      .select("id")
      .is("comercial_asignado", null)
      .not("estado", "in", "(cerrado_ganado,cerrado_perdido,descartado)")
      .order("created_at", { ascending: true });

    if (!leads || leads.length === 0) { setDistribuyendo(false); return; }

    // Round-robin weighted by free capacity
    const asignaciones: Record<string, string[]> = {};
    agentesDisponibles.forEach(a => { asignaciones[a.id] = []; });

    let idx = 0;
    for (const lead of leads) {
      const agente = agentesDisponibles[idx % agentesDisponibles.length];
      if (asignaciones[agente.id].length < agente.capacidad_libre) {
        asignaciones[agente.id].push(lead.id);
        idx++;
      } else {
        // Skip saturated agent in rotation
        idx++;
        const next = agentesDisponibles[idx % agentesDisponibles.length];
        if (next && asignaciones[next.id].length < next.capacidad_libre) {
          asignaciones[next.id].push(lead.id);
        }
      }
    }

    // Batch update per agent
    let totalAsignados = 0;
    for (const [agenteId, leadIds] of Object.entries(asignaciones)) {
      if (leadIds.length === 0) continue;
      await supabase.from("leads")
        .update({ comercial_asignado: agenteId, updated_at: new Date().toISOString() })
        .in("id", leadIds);
      totalAsignados += leadIds.length;
    }

    const resumen = agentesDisponibles
      .filter(a => asignaciones[a.id].length > 0)
      .map(a => `${a.nombre}: ${asignaciones[a.id].length} leads`)
      .join(" · ");
    setDistribuirResultado(`✅ ${totalAsignados} leads asignados — ${resumen}`);
    setDistribuyendo(false);
    cargar();
  }

  const cargar = useCallback(async () => {
    setLoading(true);
    const ahora = new Date();
    const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1).toISOString();
    const finMes = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0, 23, 59, 59).toISOString();
    const hace7d = new Date(Date.now() - 7 * 86400_000).toISOString();

    const { data: coms } = await supabase
      .from("comerciales")
      .select("id, nombre, apellidos, email, rol, max_leads_activos")
      .eq("activo", true)
      .not("rol", "eq", "admin")
      .order("nombre");

    if (!coms) { setLoading(false); return; }

    // Load leads per comercial
    const [
      { data: leadsActivos },
      { data: leadsCerrados },
      { data: citas },
    ] = await Promise.all([
      supabase.from("leads")
        .select("id, comercial_asignado, temperatura, estado, proxima_accion, proxima_accion_fecha, updated_at, created_at")
        .in("estado", ESTADOS_ACTIVOS),
      supabase.from("leads")
        .select("id, comercial_asignado, created_at, updated_at")
        .eq("estado", "cerrado_ganado")
        .gte("updated_at", inicioMes).lte("updated_at", finMes),
      supabase.from("appointments")
        .select("id, comercial_id")
        .gte("fecha_hora", inicioMes).lte("fecha_hora", finMes)
        .not("estado", "in", "(cancelada,no_asistio)"),
    ]);

    // Group by comercial
    const comLeads = new Map<string, typeof leadsActivos>(); // activos
    for (const l of leadsActivos ?? []) {
      if (!l.comercial_asignado) continue;
      if (!comLeads.has(l.comercial_asignado)) comLeads.set(l.comercial_asignado, []);
      comLeads.get(l.comercial_asignado)!.push(l);
    }

    const comCierres = new Map<string, number>();
    for (const l of leadsCerrados ?? []) {
      if (l.comercial_asignado) comCierres.set(l.comercial_asignado, (comCierres.get(l.comercial_asignado) ?? 0) + 1);
    }

    const comCitas = new Map<string, number>();
    for (const c of citas ?? []) {
      if (c.comercial_id) comCitas.set(c.comercial_id, (comCitas.get(c.comercial_id) ?? 0) + 1);
    }

    // Compute velocity from cerrados (avg days from creation to close)
    const velMap = new Map<string, number[]>();
    for (const l of leadsCerrados ?? []) {
      if (!l.comercial_asignado || !l.created_at || !l.updated_at) continue;
      const dias = differenceInDays(parseISO(l.updated_at), parseISO(l.created_at));
      if (!velMap.has(l.comercial_asignado)) velMap.set(l.comercial_asignado, []);
      velMap.get(l.comercial_asignado)!.push(dias);
    }

    const result: AgentCapacity[] = coms.map(com => {
      const leads = comLeads.get(com.id) ?? [];
      const max = com.max_leads_activos ?? 50;
      const activos = leads.length;
      const calientes = leads.filter(l => l.temperatura === "caliente").length;
      const en_negociacion = leads.filter(l => l.estado === "en_negociacion").length;
      const sin_accion = leads.filter(l => !l.proxima_accion_fecha || l.proxima_accion === "ninguna").length;
      const atascados = leads.filter(l => l.updated_at && differenceInDays(ahora, parseISO(l.updated_at)) > 7).length;
      const libre = Math.max(0, max - activos);
      const pct = max > 0 ? Math.min(100, Math.round((activos / max) * 100)) : 0;

      const velDays = velMap.get(com.id) ?? [];
      const avgVel = velDays.length > 0 ? Math.round(velDays.reduce((a, b) => a + b, 0) / velDays.length) : 0;

      const agent: Omit<AgentCapacity, "estado_capacidad" | "recomendacion"> = {
        id: com.id, nombre: com.nombre, apellidos: com.apellidos, email: com.email, rol: com.rol,
        max_leads_activos: max, leads_activos: activos, leads_calientes: calientes,
        leads_en_negociacion: en_negociacion, leads_sin_accion: sin_accion, leads_atascados: atascados,
        cierres_mes: comCierres.get(com.id) ?? 0, citas_mes: comCitas.get(com.id) ?? 0,
        capacidad_libre: libre, pct_ocupacion: pct, velocidad_cierre_dias: avgVel,
      };

      return {
        ...agent,
        estado_capacidad: estadoCapacidad(pct),
        recomendacion: recomendacion(agent),
      };
    });

    result.sort((a, b) => b.pct_ocupacion - a.pct_ocupacion);
    setAgentes(result);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!cargandoPermisos && puede("gestionar_equipo")) cargar();
  }, [cargar, cargandoPermisos, puede]);

  async function guardarMax(comId: string) {
    if (!nuevoMax || isNaN(parseInt(nuevoMax))) return;
    setGuardandoMax(true);
    await supabase.from("comerciales").update({ max_leads_activos: parseInt(nuevoMax) }).eq("id", comId);
    setGuardandoMax(false);
    setEditandoMax(null);
    setNuevoMax("");
    cargar();
  }

  if (!cargandoPermisos && !puede("gestionar_equipo")) return <SinAcceso />;

  const totalActivos = agentes.reduce((s, a) => s + a.leads_activos, 0);
  const totalCapacidad = agentes.reduce((s, a) => s + a.max_leads_activos, 0);
  const totalLibre = agentes.reduce((s, a) => s + a.capacidad_libre, 0);
  const saturados = agentes.filter(a => a.estado_capacidad === "saturado").length;
  const libres = agentes.filter(a => a.estado_capacidad === "libre").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Capacidad del equipo</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Carga de trabajo actual y capacidad disponible por agente
          </p>
        </div>
        {!loading && puede("asignar_leads") && (
          <button onClick={abrirModalDistribuir}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors"
            style={{ background: "#ea650d" }}>
            ⚡ Distribuir leads sin asignar
          </button>
        )}
      </div>

      {/* Summary */}
      {!loading && (
        <>
          {saturados > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-3">
              <span className="text-xl">⚠️</span>
              <p className="text-sm font-medium text-red-800">
                {saturados} agente{saturados > 1 ? "s" : ""} saturado{saturados > 1 ? "s" : ""} — redirigir nuevos leads a agentes disponibles
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
              <p className="text-xs text-slate-500 mb-1">Leads activos</p>
              <p className="text-2xl font-bold text-slate-900">{totalActivos}</p>
              <p className="text-xs text-slate-400">de {totalCapacidad} capacidad total</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
              <p className="text-xs text-slate-500 mb-1">Capacidad libre</p>
              <p className="text-2xl font-bold text-green-700">{totalLibre}</p>
              <p className="text-xs text-slate-400">slots disponibles</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
              <p className="text-xs text-slate-500 mb-1">Saturados</p>
              <p className={`text-2xl font-bold ${saturados > 0 ? "text-red-600" : "text-slate-400"}`}>{saturados}</p>
              <p className="text-xs text-slate-400">agentes ≥90%</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
              <p className="text-xs text-slate-500 mb-1">Disponibles</p>
              <p className="text-2xl font-bold text-green-700">{libres}</p>
              <p className="text-xs text-slate-400">agentes con espacio</p>
            </div>
          </div>
        </>
      )}

      {/* Agent cards */}
      {loading ? (
        <div className="py-16 text-center text-sm text-slate-400">Calculando capacidad...</div>
      ) : agentes.length === 0 ? (
        <div className="py-16 text-center text-sm text-slate-400">No hay agentes activos.</div>
      ) : (
        <div className="space-y-3">
          {agentes.map(a => {
            const cfg = CAPACIDAD_CFG[a.estado_capacidad];
            return (
              <div key={a.id} className={`bg-white rounded-xl border overflow-hidden hover:border-orange-200 transition-colors ${a.estado_capacidad === "saturado" ? "border-l-4 border-l-red-400 border-r border-t border-b border-slate-200" : "border-slate-200"}`}>
                <div className="px-5 py-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-semibold text-slate-900">{a.nombre} {a.apellidos}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.bg} ${cfg.text} border ${cfg.border}`}>
                          {cfg.label}
                        </span>
                        <span className="text-xs text-slate-400 capitalize">{a.rol}</span>
                      </div>

                      {/* Capacity bar */}
                      <div className="flex items-center gap-2 mb-2">
                        <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all"
                            style={{ width: `${a.pct_ocupacion}%`, background: cfg.bar }} />
                        </div>
                        <span className="text-xs font-bold text-slate-700 w-24 text-right">
                          {a.leads_activos} / {a.max_leads_activos} leads
                        </span>
                        <span className={`text-xs font-semibold w-10 text-right ${cfg.text}`}>
                          {a.pct_ocupacion}%
                        </span>
                      </div>

                      {/* Stats chips */}
                      <div className="flex flex-wrap gap-2">
                        <span className="text-xs px-2 py-0.5 bg-red-50 text-red-700 rounded-full border border-red-100">
                          🔥 {a.leads_calientes} calientes
                        </span>
                        <span className="text-xs px-2 py-0.5 bg-violet-50 text-violet-700 rounded-full border border-violet-100">
                          🤝 {a.leads_en_negociacion} negociación
                        </span>
                        {a.leads_atascados > 0 && (
                          <span className="text-xs px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full border border-amber-100">
                            😴 {a.leads_atascados} atascados
                          </span>
                        )}
                        {a.leads_sin_accion > 0 && (
                          <span className="text-xs px-2 py-0.5 bg-slate-50 text-slate-500 rounded-full border border-slate-200">
                            ❓ {a.leads_sin_accion} sin acción
                          </span>
                        )}
                        <span className="text-xs px-2 py-0.5 bg-green-50 text-green-700 rounded-full border border-green-100">
                          ✅ {a.cierres_mes} cierres/mes
                        </span>
                        {a.velocidad_cierre_dias > 0 && (
                          <span className="text-xs px-2 py-0.5 bg-slate-50 text-slate-500 rounded-full border border-slate-200">
                            ⏱ {a.velocidad_cierre_dias}d/cierre
                          </span>
                        )}
                      </div>

                      {/* Recommendation */}
                      <p className="text-xs text-slate-500 mt-2 italic">💡 {a.recomendacion}</p>
                    </div>

                    {/* Max leads editor */}
                    <div className="shrink-0 text-right">
                      {editandoMax === a.id ? (
                        <div className="flex items-center gap-1">
                          <input type="number" value={nuevoMax} onChange={e => setNuevoMax(e.target.value)}
                            className="w-16 border border-slate-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-orange-300"
                            placeholder={String(a.max_leads_activos)} />
                          <button onClick={() => guardarMax(a.id)} disabled={guardandoMax}
                            className="text-xs px-2 py-1 bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-50">
                            OK
                          </button>
                          <button onClick={() => { setEditandoMax(null); setNuevoMax(""); }}
                            className="text-xs px-1 py-1 text-slate-400 hover:text-slate-600">
                            ✕
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => { setEditandoMax(a.id); setNuevoMax(String(a.max_leads_activos)); }}
                          className="text-xs text-slate-400 hover:text-orange-600 transition-colors">
                          Máx: {a.max_leads_activos} leads ✏️
                        </button>
                      )}
                      <div className="mt-1">
                        <Link href={`/leads?comercial=${a.id}`}
                          className="text-xs text-orange-600 hover:underline">
                          Ver leads →
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal distribuir leads */}
      {modalDistribuir && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900">Distribuir leads sin asignar</h2>
              <button onClick={() => setModalDistribuir(false)} className="text-slate-400 hover:text-slate-600 text-xl">×</button>
            </div>

            {distribuirResultado ? (
              <div className="space-y-4">
                <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-800">{distribuirResultado}</div>
                <button onClick={() => setModalDistribuir(false)}
                  className="w-full py-2.5 text-sm font-medium text-white rounded-xl" style={{ background: "#ea650d" }}>
                  Cerrar
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-orange-50 border border-orange-100 rounded-xl px-4 py-3">
                  <p className="text-sm font-semibold text-orange-900">{leadsSinAsignar} leads sin comercial asignado</p>
                  <p className="text-xs text-orange-700 mt-1">Se distribuirán en round-robin entre los agentes disponibles, respetando su capacidad máxima.</p>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-medium text-slate-600 uppercase tracking-wide">Distribución estimada</p>
                  {agentes.filter(a => a.estado_capacidad !== "saturado" && a.capacidad_libre > 0).length === 0 ? (
                    <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">⚠️ Todos los agentes están saturados. Aumenta la capacidad máxima antes de distribuir.</p>
                  ) : (
                    agentes.filter(a => a.estado_capacidad !== "saturado" && a.capacidad_libre > 0).map(a => {
                      const disponibles = agentes.filter(x => x.estado_capacidad !== "saturado" && x.capacidad_libre > 0);
                      const totalLibre = disponibles.reduce((s, x) => s + x.capacidad_libre, 0);
                      const estimado = totalLibre > 0 ? Math.round((a.capacidad_libre / totalLibre) * Math.min(leadsSinAsignar, totalLibre)) : 0;
                      return (
                        <div key={a.id} className="flex items-center justify-between py-1.5 border-b border-slate-100 last:border-0">
                          <span className="text-sm text-slate-700">{a.nombre} {a.apellidos ?? ""}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-400">{a.leads_activos}/{a.max_leads_activos} actuales</span>
                            <span className="text-sm font-semibold text-orange-600">+{estimado}</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="flex gap-2 pt-2">
                  <button onClick={() => setModalDistribuir(false)}
                    className="flex-1 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors">
                    Cancelar
                  </button>
                  <button onClick={distribuirLeads} disabled={distribuyendo || agentes.filter(a => a.estado_capacidad !== "saturado" && a.capacidad_libre > 0).length === 0}
                    className="flex-1 py-2.5 text-sm font-medium text-white rounded-xl transition-colors disabled:opacity-50"
                    style={{ background: "#ea650d" }}>
                    {distribuyendo ? "Distribuyendo..." : "Confirmar y distribuir"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="bg-white rounded-xl border border-slate-200 px-5 py-4">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Guía de capacidad</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Object.entries(CAPACIDAD_CFG).map(([k, v]) => (
            <div key={k} className={`rounded-lg border px-3 py-2 ${v.bg} ${v.border}`}>
              <p className={`text-xs font-semibold ${v.text}`}>{v.label}</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {k === "libre" ? "<50% ocupación" : k === "optimo" ? "50–75%" : k === "lleno" ? "75–90%" : ">90% ocupación"}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
