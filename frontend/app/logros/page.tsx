"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { startOfMonth, endOfMonth, startOfYear, format } from "date-fns";
import { es } from "date-fns/locale";

// ─── Types ────────────────────────────────────────────────────────────────────

type Comercial = {
  id: string;
  nombre: string;
  apellidos: string | null;
  rol: string;
};

type AgentStats = {
  llamadas: number;
  mensajes: number;
  citas: number;
  cierres: number;
  nps_promotores: number;
  referidos_ganados: number;
};

type AgentPoints = {
  comercial: Comercial;
  stats: AgentStats;
  puntos: number;
  logros: Logro[];
};

type Logro = {
  id: string;
  nombre: string;
  descripcion: string;
  icono: string;
  color: string;
  obtenido: boolean;
};

// ─── Points config ────────────────────────────────────────────────────────────

const PUNTOS = {
  llamada: 10,
  mensaje: 5,
  cita: 30,
  cierre: 100,
  nps_promotor: 20,
  referido_ganado: 50,
};

// ─── Achievement definitions ──────────────────────────────────────────────────

type LogroDefinicion = {
  id: string;
  nombre: string;
  descripcion: string;
  icono: string;
  color: string;
  check: (stats: AgentStats) => boolean;
};

const LOGROS_DEF: LogroDefinicion[] = [
  // Llamadas
  { id: "primer_llamada",    nombre: "Primera llamada",     descripcion: "Realiza tu primera llamada",           icono: "📞", color: "#3b82f6", check: s => s.llamadas >= 1 },
  { id: "10_llamadas",       nombre: "10 llamadas",         descripcion: "10 llamadas este mes",                 icono: "📞", color: "#2563eb", check: s => s.llamadas >= 10 },
  { id: "50_llamadas",       nombre: "Teléfono de oro",     descripcion: "50 llamadas en un mes",                icono: "🥇", color: "#d97706", check: s => s.llamadas >= 50 },
  // Mensajes
  { id: "primer_wa",         nombre: "Primera campaña",     descripcion: "Envía tu primer WhatsApp",             icono: "💬", color: "#16a34a", check: s => s.mensajes >= 1 },
  { id: "100_mensajes",      nombre: "WhatsApp Master",     descripcion: "100 mensajes enviados",                icono: "💬", color: "#15803d", check: s => s.mensajes >= 100 },
  // Citas
  { id: "primera_cita",      nombre: "Primera cita",        descripcion: "Agenda tu primera cita con un cliente",icono: "📅", color: "#7c3aed", check: s => s.citas >= 1 },
  { id: "5_citas",           nombre: "Agendador pro",       descripcion: "5 citas en un mes",                   icono: "📅", color: "#6d28d9", check: s => s.citas >= 5 },
  { id: "10_citas",          nombre: "Máquina de citas",    descripcion: "10 citas en un mes",                  icono: "🏆", color: "#5b21b6", check: s => s.citas >= 10 },
  // Cierres
  { id: "primer_cierre",     nombre: "¡Primer cierre!",     descripcion: "Cierra tu primera venta",             icono: "🎉", color: "#ea650d", check: s => s.cierres >= 1 },
  { id: "5_cierres",         nombre: "Cinco estrellas",     descripcion: "5 cierres en un mes",                 icono: "⭐", color: "#ea650d", check: s => s.cierres >= 5 },
  { id: "10_cierres",        nombre: "Comercial élite",     descripcion: "10 cierres en un mes",                icono: "🚀", color: "#c2410c", check: s => s.cierres >= 10 },
  { id: "20_cierres",        nombre: "Leyenda",             descripcion: "20 cierres en un mes",                icono: "👑", color: "#b45309", check: s => s.cierres >= 20 },
  // NPS
  { id: "primer_nps",        nombre: "Voz del cliente",     descripcion: "Primer promotor NPS registrado",      icono: "😍", color: "#16a34a", check: s => s.nps_promotores >= 1 },
  { id: "5_promotores",      nombre: "Fans del negocio",    descripcion: "5 clientes promotores NPS",           icono: "🌟", color: "#15803d", check: s => s.nps_promotores >= 5 },
  // Referidos
  { id: "primer_referido",   nombre: "Red de confianza",    descripcion: "Cierra tu primer referido",           icono: "🤝", color: "#0891b2", check: s => s.referidos_ganados >= 1 },
  { id: "5_referidos",       nombre: "Embajador",           descripcion: "5 referidos cerrados",                icono: "🏅", color: "#0e7490", check: s => s.referidos_ganados >= 5 },
  // Combo
  { id: "triple_corona",     nombre: "Triple corona",       descripcion: "Cita + cierre + promotor NPS en el mismo mes", icono: "👑", color: "#7c3aed", check: s => s.citas >= 1 && s.cierres >= 1 && s.nps_promotores >= 1 },
];

// ─── Rank labels ──────────────────────────────────────────────────────────────

function getRango(puntos: number): { nombre: string; icono: string; color: string } {
  if (puntos >= 5000) return { nombre: "Leyenda",    icono: "👑", color: "#b45309" };
  if (puntos >= 2000) return { nombre: "Élite",      icono: "🚀", color: "#7c3aed" };
  if (puntos >= 1000) return { nombre: "Experto",    icono: "⭐", color: "#ea650d" };
  if (puntos >= 500)  return { nombre: "Avanzado",   icono: "🎯", color: "#2563eb" };
  if (puntos >= 200)  return { nombre: "Junior",     icono: "📈", color: "#16a34a" };
  return { nombre: "Novato", icono: "🌱", color: "#64748b" };
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function LogrosPage() {
  const [agentes, setAgentes] = useState<AgentPoints[]>([]);
  const [cargando, setCargando] = useState(true);
  const [miId, setMiId] = useState<string | null>(null);
  const [periodo, setPeriodo] = useState<"mes" | "ano">("mes");
  const [vistaActual, setVistaActual] = useState<"ranking" | "logros">("ranking");
  const [agenteFocus, setAgenteFocus] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data: { user } } = await supabase.auth.getUser();
    let cId: string | null = null;
    if (user?.email) {
      const { data: com } = await supabase.from("comerciales").select("id").eq("email", user.email).single();
      cId = com?.id ?? null;
    }
    setMiId(cId);

    const ahora = new Date();
    const desde = periodo === "mes" ? startOfMonth(ahora) : startOfYear(ahora);
    const hasta = periodo === "mes" ? endOfMonth(ahora) : ahora;

    const [{ data: coms }, { data: inters }, { data: citas }, { data: cierres }, { data: npsData }, { data: referidosData }] = await Promise.all([
      supabase.from("comerciales").select("id, nombre, apellidos, rol").eq("activo", true).order("nombre"),
      supabase.from("interactions").select("tipo, leads(comercial_asignado)").gte("created_at", desde.toISOString()).lte("created_at", hasta.toISOString()),
      supabase.from("appointments").select("comercial_id").gte("created_at", desde.toISOString()).lte("created_at", hasta.toISOString()),
      supabase.from("clientes").select("comercial_asignado").gte("created_at", desde.toISOString()).lte("created_at", hasta.toISOString()),
      supabase.from("nps_respuestas").select("comercial_id, puntuacion").gte("created_at", desde.toISOString()).lte("created_at", hasta.toISOString()),
      supabase.from("referidos").select("comercial_id, estado").gte("created_at", desde.toISOString()).lte("created_at", hasta.toISOString()),
    ]);

    // Build stats per agent
    const statsMap: Record<string, AgentStats> = {};
    const initStats = (): AgentStats => ({ llamadas: 0, mensajes: 0, citas: 0, cierres: 0, nps_promotores: 0, referidos_ganados: 0 });

    for (const i of inters ?? []) {
      const lead = i.leads as unknown as { comercial_asignado: string | null } | null;
      const comId = lead?.comercial_asignado;
      if (!comId) continue;
      if (!statsMap[comId]) statsMap[comId] = initStats();
      if (i.tipo === "llamada") statsMap[comId].llamadas++;
      else if (["whatsapp", "mensaje"].includes(i.tipo)) statsMap[comId].mensajes++;
    }

    for (const c of citas ?? []) {
      if (!c.comercial_id) continue;
      if (!statsMap[c.comercial_id]) statsMap[c.comercial_id] = initStats();
      statsMap[c.comercial_id].citas++;
    }

    for (const c of cierres ?? []) {
      if (!c.comercial_asignado) continue;
      if (!statsMap[c.comercial_asignado]) statsMap[c.comercial_asignado] = initStats();
      statsMap[c.comercial_asignado].cierres++;
    }

    for (const n of npsData ?? []) {
      if (!n.comercial_id) continue;
      if (!statsMap[n.comercial_id]) statsMap[n.comercial_id] = initStats();
      if (n.puntuacion >= 9) statsMap[n.comercial_id].nps_promotores++;
    }

    for (const r of referidosData ?? []) {
      if (!r.comercial_id) continue;
      if (!statsMap[r.comercial_id]) statsMap[r.comercial_id] = initStats();
      if (r.estado === "cerrado_ganado") statsMap[r.comercial_id].referidos_ganados++;
    }

    // Build agent points
    const agentesData: AgentPoints[] = (coms ?? []).map(c => {
      const stats = statsMap[c.id] ?? initStats();
      const puntos =
        stats.llamadas * PUNTOS.llamada +
        stats.mensajes * PUNTOS.mensaje +
        stats.citas * PUNTOS.cita +
        stats.cierres * PUNTOS.cierre +
        stats.nps_promotores * PUNTOS.nps_promotor +
        stats.referidos_ganados * PUNTOS.referido_ganado;

      const logros: Logro[] = LOGROS_DEF.map(d => ({
        id: d.id,
        nombre: d.nombre,
        descripcion: d.descripcion,
        icono: d.icono,
        color: d.color,
        obtenido: d.check(stats),
      }));

      return { comercial: c, stats, puntos, logros };
    });

    agentesData.sort((a, b) => b.puntos - a.puntos);
    setAgentes(agentesData);
    if (!agenteFocus && cId) setAgenteFocus(cId);
    setCargando(false);
  }, [periodo]);

  useEffect(() => { cargar(); }, [cargar]);

  const miAgente = agentes.find(a => a.comercial.id === miId);
  const focusAgente = agentes.find(a => a.comercial.id === agenteFocus) ?? miAgente ?? agentes[0];

  const periodoLabel = periodo === "mes"
    ? format(new Date(), "MMMM yyyy", { locale: es })
    : format(new Date(), "yyyy");

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Logros y ranking</h1>
          <p className="text-sm text-slate-500 mt-0.5">Puntuación, logros y clasificación del equipo</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setPeriodo("mes")}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors ${periodo === "mes" ? "border-orange-400 text-white" : "border-slate-200 text-slate-600 bg-white"}`}
            style={periodo === "mes" ? { background: "#ea650d" } : undefined}>
            Este mes
          </button>
          <button onClick={() => setPeriodo("ano")}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors ${periodo === "ano" ? "border-orange-400 text-white" : "border-slate-200 text-slate-600 bg-white"}`}
            style={periodo === "ano" ? { background: "#ea650d" } : undefined}>
            Este año
          </button>
        </div>
      </div>

      {/* My card */}
      {miAgente && (
        <div className="bg-gradient-to-r from-orange-50 to-amber-50 rounded-2xl border border-orange-200 p-5">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="text-4xl">{getRango(miAgente.puntos).icono}</div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-base font-bold text-slate-900">
                  {miAgente.comercial.nombre} {miAgente.comercial.apellidos ?? ""} (tú)
                </span>
                <span className="text-sm font-semibold" style={{ color: getRango(miAgente.puntos).color }}>
                  {getRango(miAgente.puntos).nombre}
                </span>
              </div>
              <div className="text-sm text-slate-500 mt-0.5">
                {periodoLabel} · Posición #{agentes.findIndex(a => a.comercial.id === miId) + 1} de {agentes.length}
              </div>
              <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                <span>📞 {miAgente.stats.llamadas} llamadas</span>
                <span>💬 {miAgente.stats.mensajes} mensajes</span>
                <span>📅 {miAgente.stats.citas} citas</span>
                <span>✅ {miAgente.stats.cierres} cierres</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold" style={{ color: "#ea650d" }}>
                {miAgente.puntos.toLocaleString()}
              </div>
              <div className="text-xs text-slate-400">puntos</div>
              <div className="text-xs text-slate-500 mt-1">
                🏅 {miAgente.logros.filter(l => l.obtenido).length}/{LOGROS_DEF.length} logros
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2">
        <button onClick={() => setVistaActual("ranking")}
          className={`px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${vistaActual === "ranking" ? "border-orange-400 text-white" : "border-slate-200 text-slate-600 bg-white"}`}
          style={vistaActual === "ranking" ? { background: "#ea650d" } : undefined}>
          🏆 Ranking del equipo
        </button>
        <button onClick={() => setVistaActual("logros")}
          className={`px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${vistaActual === "logros" ? "border-orange-400 text-white" : "border-slate-200 text-slate-600 bg-white"}`}
          style={vistaActual === "logros" ? { background: "#ea650d" } : undefined}>
          🏅 Logros
        </button>
      </div>

      {/* ── RANKING view ── */}
      {vistaActual === "ranking" && (
        cargando ? (
          <div className="py-10 text-center text-sm text-slate-400">Calculando puntuaciones...</div>
        ) : (
          <div className="space-y-2">
            {agentes.map((a, idx) => {
              const rango = getRango(a.puntos);
              const esYo = a.comercial.id === miId;
              return (
                <div key={a.comercial.id}
                  className={`bg-white rounded-xl border px-4 py-3 flex items-center gap-4 ${esYo ? "border-orange-300 bg-orange-50/20" : "border-slate-200"}`}>
                  {/* Position */}
                  <div className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm ${
                    idx === 0 ? "bg-yellow-400 text-white" :
                    idx === 1 ? "bg-slate-400 text-white" :
                    idx === 2 ? "bg-amber-600 text-white" :
                    "bg-slate-100 text-slate-500"
                  }`}>
                    {idx < 3 ? ["🥇","🥈","🥉"][idx] : idx + 1}
                  </div>
                  {/* Agent info */}
                  <div className="text-2xl">{rango.icono}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900">
                        {a.comercial.nombre} {a.comercial.apellidos ?? ""}
                        {esYo && <span className="text-orange-500 ml-1">(tú)</span>}
                      </span>
                      <span className="text-xs font-medium" style={{ color: rango.color }}>{rango.nombre}</span>
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      ✅{a.stats.cierres} cierres · 📅{a.stats.citas} citas · 📞{a.stats.llamadas} llamadas
                      · 🏅{a.logros.filter(l => l.obtenido).length} logros
                    </div>
                  </div>
                  {/* Points */}
                  <div className="text-right shrink-0">
                    <div className="text-xl font-bold text-slate-900">{a.puntos.toLocaleString()}</div>
                    <div className="text-[10px] text-slate-400">pts</div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* ── LOGROS view ── */}
      {vistaActual === "logros" && (
        <div className="space-y-4">
          {/* Agent selector */}
          <div className="flex gap-2 flex-wrap">
            {agentes.slice(0, 8).map(a => (
              <button key={a.comercial.id} onClick={() => setAgenteFocus(a.comercial.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                  agenteFocus === a.comercial.id ? "border-orange-400 text-white" : "border-slate-200 text-slate-600 bg-white"
                }`}
                style={agenteFocus === a.comercial.id ? { background: "#ea650d" } : undefined}>
                {a.comercial.nombre} {a.comercial.id === miId ? "(tú)" : ""}
              </button>
            ))}
          </div>

          {focusAgente && (
            <>
              <div className="text-sm text-slate-500">
                {focusAgente.logros.filter(l => l.obtenido).length} de {LOGROS_DEF.length} logros obtenidos
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {focusAgente.logros.map(l => (
                  <div key={l.id}
                    className={`rounded-xl border p-3 flex items-start gap-3 transition-all ${
                      l.obtenido
                        ? "bg-white border-slate-200 shadow-sm"
                        : "bg-slate-50 border-slate-100 opacity-40"
                    }`}>
                    <div className="text-2xl shrink-0"
                      style={l.obtenido ? { filter: "none" } : { filter: "grayscale(100%)" }}>
                      {l.icono}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-800 leading-tight">{l.nombre}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5 leading-tight">{l.descripcion}</div>
                      {l.obtenido && (
                        <div className="text-[10px] font-medium mt-1" style={{ color: l.color }}>✓ Obtenido</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Points reference */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-xs font-semibold text-slate-700 mb-3">Sistema de puntos</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs text-slate-600">
              {Object.entries(PUNTOS).map(([k, v]) => {
                const labels: Record<string, string> = {
                  llamada: "📞 Llamada realizada",
                  mensaje: "💬 Mensaje enviado",
                  cita: "📅 Cita agendada",
                  cierre: "✅ Cierre conseguido",
                  nps_promotor: "😍 Cliente promotor NPS",
                  referido_ganado: "🤝 Referido cerrado",
                };
                return (
                  <div key={k} className="flex items-center justify-between px-2 py-1.5 bg-slate-50 rounded-lg">
                    <span>{labels[k]}</span>
                    <span className="font-bold text-orange-600">+{v}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
