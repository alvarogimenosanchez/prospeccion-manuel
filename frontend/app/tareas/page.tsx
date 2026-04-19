"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { formatDistanceToNow, format, isPast, isToday, isTomorrow } from "date-fns";
import { es } from "date-fns/locale";

// ─── Types ─────────────────────────────────────────────────────────────────────

type Recordatorio = {
  id: string;
  titulo: string;
  descripcion: string | null;
  fecha_limite: string | null;
  completado: boolean;
  completado_at: string | null;
  lead_id: string | null;
  prioridad: "alta" | "media" | "baja";
  created_at: string;
  leads: { nombre: string; apellidos: string | null; empresa: string | null } | null;
};

type NuevoRecordatorio = {
  titulo: string;
  descripcion: string;
  fecha_limite: string;
  prioridad: "alta" | "media" | "baja";
  lead_id: string;
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

const PRIORIDAD_CONFIG = {
  alta:  { label: "Alta",  color: "text-red-700",   dot: "bg-red-500",   bg: "bg-red-50 border-red-200" },
  media: { label: "Media", color: "text-amber-700", dot: "bg-amber-500", bg: "bg-amber-50 border-amber-200" },
  baja:  { label: "Baja",  color: "text-slate-600", dot: "bg-slate-400", bg: "bg-slate-50 border-slate-200" },
};

function fechaLabel(fecha: string | null): { label: string; color: string } {
  if (!fecha) return { label: "Sin fecha", color: "text-slate-400" };
  const d = new Date(fecha);
  if (isPast(d) && !isToday(d)) return { label: `Vencida · ${format(d, "d MMM", { locale: es })}`, color: "text-red-600" };
  if (isToday(d)) return { label: `Hoy · ${format(d, "HH:mm")}`, color: "text-amber-600" };
  if (isTomorrow(d)) return { label: `Mañana · ${format(d, "HH:mm")}`, color: "text-blue-600" };
  return { label: format(d, "d MMM, HH:mm", { locale: es }), color: "text-slate-500" };
}

const VACÍO: NuevoRecordatorio = { titulo: "", descripcion: "", fecha_limite: "", prioridad: "media", lead_id: "" };

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function TareasPage() {
  const [tareas, setTareas] = useState<Recordatorio[]>([]);
  const [loading, setLoading] = useState(true);
  const [comId, setComId] = useState<string | null>(null);
  const [mostrarCompletadas, setMostrarCompletadas] = useState(false);
  const [filtroPrioridad, setFiltroPrioridad] = useState<"todas" | "alta" | "media" | "baja">("todas");
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState<NuevoRecordatorio>(VACÍO);
  const [guardando, setGuardando] = useState(false);
  const [leads, setLeads] = useState<{ id: string; nombre: string; empresa: string | null }[]>([]);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user?.email) return;
      const { data } = await supabase.from("comerciales").select("id").eq("email", user.email).single();
      if (data) setComId(data.id);
    });
  }, []);

  // Load leads for linking
  useEffect(() => {
    supabase.from("leads")
      .select("id, nombre, empresa")
      .not("estado", "in", "(cerrado_ganado,cerrado_perdido,descartado)")
      .order("nombre").limit(200)
      .then(({ data }) => setLeads(data ?? []));
  }, []);

  const cargar = useCallback(async () => {
    if (!comId) return;
    setLoading(true);
    const { data } = await supabase
      .from("recordatorios")
      .select("id, titulo, descripcion, fecha_limite, completado, completado_at, lead_id, prioridad, created_at, leads(nombre, apellidos, empresa)")
      .eq("comercial_id", comId)
      .order("completado", { ascending: true })
      .order("fecha_limite", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(200);
    setTareas((data ?? []).map(t => ({ ...t, leads: t.leads as unknown as Recordatorio["leads"] })));
    setLoading(false);
  }, [comId]);

  useEffect(() => {
    if (comId) cargar();
  }, [cargar, comId]);

  async function toggleCompletar(id: string, completado: boolean) {
    await supabase.from("recordatorios").update({
      completado: !completado,
      completado_at: !completado ? new Date().toISOString() : null,
    }).eq("id", id);
    setTareas(prev => prev.map(t => t.id === id ? { ...t, completado: !completado, completado_at: !completado ? new Date().toISOString() : null } : t));
  }

  async function eliminar(id: string) {
    await supabase.from("recordatorios").delete().eq("id", id);
    setTareas(prev => prev.filter(t => t.id !== id));
  }

  async function crear() {
    if (!form.titulo.trim() || !comId) return;
    setGuardando(true);
    const { data } = await supabase.from("recordatorios").insert({
      comercial_id: comId,
      titulo: form.titulo.trim(),
      descripcion: form.descripcion.trim() || null,
      fecha_limite: form.fecha_limite || null,
      prioridad: form.prioridad,
      lead_id: form.lead_id || null,
    }).select("id, titulo, descripcion, fecha_limite, completado, completado_at, lead_id, prioridad, created_at, leads(nombre, apellidos, empresa)").single();
    if (data) setTareas(prev => [{ ...data, leads: data.leads as unknown as Recordatorio["leads"] }, ...prev]);
    setForm(VACÍO);
    setModal(false);
    setGuardando(false);
  }

  const visibles = tareas.filter(t => {
    if (!mostrarCompletadas && t.completado) return false;
    if (filtroPrioridad !== "todas" && t.prioridad !== filtroPrioridad) return false;
    return true;
  });

  const pendientes = tareas.filter(t => !t.completado);
  const vencidas = pendientes.filter(t => t.fecha_limite && isPast(new Date(t.fecha_limite)) && !isToday(new Date(t.fecha_limite)));
  const hoy = pendientes.filter(t => t.fecha_limite && isToday(new Date(t.fecha_limite)));

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Mis tareas</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {loading ? "..." : `${pendientes.length} pendiente${pendientes.length !== 1 ? "s" : ""}${vencidas.length > 0 ? ` · ${vencidas.length} vencida${vencidas.length !== 1 ? "s" : ""}` : ""}${hoy.length > 0 ? ` · ${hoy.length} para hoy` : ""}`}
          </p>
        </div>
        <button
          onClick={() => setModal(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white rounded-xl transition-colors"
          style={{ background: "#ea650d" }}
        >
          <span>+</span> Nueva tarea
        </button>
      </div>

      {/* Quick stats */}
      {!loading && (
        <div className="flex items-center gap-3 flex-wrap">
          {vencidas.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded-full px-3 py-1">
              <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
              {vencidas.length} vencida{vencidas.length !== 1 ? "s" : ""}
            </div>
          )}
          {hoy.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-3 py-1">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              {hoy.length} para hoy
            </div>
          )}
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
          {(["todas", "alta", "media", "baja"] as const).map(p => (
            <button
              key={p}
              onClick={() => setFiltroPrioridad(p)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md capitalize transition-colors ${filtroPrioridad === p ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
              {p === "todas" ? "Todas" : PRIORIDAD_CONFIG[p].label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setMostrarCompletadas(v => !v)}
          className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${mostrarCompletadas ? "bg-slate-200 text-slate-700 border-slate-300" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}
        >
          {mostrarCompletadas ? "Ocultar completadas" : `Mostrar completadas (${tareas.filter(t => t.completado).length})`}
        </button>
      </div>

      {/* Task list */}
      {loading ? (
        <div className="py-16 text-center text-sm text-slate-400">Cargando tareas...</div>
      ) : visibles.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-4xl mb-3">{pendientes.length === 0 ? "✅" : "📋"}</p>
          <p className="text-base font-semibold text-slate-700 mb-1">
            {pendientes.length === 0 ? "Todo al día" : "Sin tareas en este filtro"}
          </p>
          <p className="text-sm text-slate-400">
            {pendientes.length === 0
              ? <button onClick={() => setModal(true)} className="text-orange-500 hover:underline">Crear primera tarea →</button>
              : "Cambia los filtros para ver más tareas."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {visibles.map(tarea => {
            const priCfg = PRIORIDAD_CONFIG[tarea.prioridad];
            const fechaCfg = fechaLabel(tarea.fecha_limite);
            const lead = tarea.leads as unknown as { nombre: string; apellidos: string | null; empresa: string | null } | null;
            return (
              <div
                key={tarea.id}
                className={`flex items-start gap-3 px-4 py-3.5 rounded-xl border transition-all ${
                  tarea.completado ? "border-slate-200 opacity-60" : priCfg.bg
                }`}
              >
                {/* Checkbox */}
                <button
                  onClick={() => toggleCompletar(tarea.id, tarea.completado)}
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${
                    tarea.completado ? "bg-green-500 border-green-500" : "border-slate-300 hover:border-orange-400"
                  }`}
                >
                  {tarea.completado && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>

                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${tarea.completado ? "line-through text-slate-400" : "text-slate-800"}`}>
                    {tarea.titulo}
                  </p>
                  {tarea.descripcion && (
                    <p className="text-xs text-slate-500 mt-0.5">{tarea.descripcion}</p>
                  )}
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    {tarea.fecha_limite && (
                      <span className={`text-xs font-medium ${fechaCfg.color}`}>
                        📅 {fechaCfg.label}
                      </span>
                    )}
                    <span className={`text-xs font-semibold ${priCfg.color}`}>
                      {priCfg.label}
                    </span>
                    {lead && (
                      <Link href={`/leads/${tarea.lead_id}`} className="text-xs text-slate-400 hover:text-orange-500 transition-colors">
                        👤 {lead.nombre}{lead.empresa ? ` · ${lead.empresa}` : ""}
                      </Link>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => eliminar(tarea.id)}
                  className="text-slate-300 hover:text-red-400 transition-colors p-1 flex-shrink-0 rounded"
                  title="Eliminar"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* New task modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.4)" }}>
          <div className="bg-white rounded-2xl p-6 shadow-2xl w-full max-w-md space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Nueva tarea</h2>
              <button onClick={() => setModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Tarea *</label>
                <input
                  type="text"
                  value={form.titulo}
                  onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))}
                  placeholder="¿Qué hay que hacer?"
                  className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-orange-300 placeholder-slate-300"
                  autoFocus
                  onKeyDown={e => e.key === "Enter" && crear()}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Descripción</label>
                <textarea
                  value={form.descripcion}
                  onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
                  placeholder="Detalles opcionales..."
                  rows={2}
                  className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-orange-300 placeholder-slate-300 resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Fecha límite</label>
                  <input
                    type="datetime-local"
                    value={form.fecha_limite}
                    onChange={e => setForm(f => ({ ...f, fecha_limite: e.target.value }))}
                    className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-orange-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Prioridad</label>
                  <select
                    value={form.prioridad}
                    onChange={e => setForm(f => ({ ...f, prioridad: e.target.value as NuevoRecordatorio["prioridad"] }))}
                    className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-orange-300 bg-white"
                  >
                    <option value="alta">Alta</option>
                    <option value="media">Media</option>
                    <option value="baja">Baja</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Lead relacionado (opcional)</label>
                <select
                  value={form.lead_id}
                  onChange={e => setForm(f => ({ ...f, lead_id: e.target.value }))}
                  className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-orange-300 bg-white"
                >
                  <option value="">— Sin lead —</option>
                  {leads.map(l => (
                    <option key={l.id} value={l.id}>{l.nombre}{l.empresa ? ` · ${l.empresa}` : ""}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setModal(false)}
                className="flex-1 px-4 py-2.5 text-sm font-medium border border-slate-200 rounded-xl text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={crear}
                disabled={!form.titulo.trim() || guardando}
                className="flex-1 px-4 py-2.5 text-sm font-semibold text-white rounded-xl transition-colors disabled:opacity-50"
                style={{ background: "#ea650d" }}
              >
                {guardando ? "Guardando..." : "Crear tarea"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
