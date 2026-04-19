"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { usePermisos } from "@/components/PermisosProvider";
import { SinAcceso } from "@/components/SinAcceso";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

// ─── Types ─────────────────────────────────────────────────────────────────────

type EventoActividad = {
  id: string;
  fuente: "estado" | "interaccion" | "cita" | "cliente";
  lead_id: string | null;
  lead_nombre?: string;
  comercial_nombre?: string;
  descripcion: string;
  subtitulo?: string;
  created_at: string;
  emoji: string;
};

type StateHistoryRow = {
  id: string;
  lead_id: string;
  comercial_id: string | null;
  estado_anterior: string;
  estado_nuevo: string;
  created_at: string;
  lead: { nombre: string; empresa: string | null } | null;
  comercial: { nombre: string; apellidos: string | null } | null;
};

type InteractionRow = {
  id: string;
  lead_id: string;
  comercial_id: string | null;
  tipo: string;
  mensaje: string | null;
  created_at: string;
  lead: { nombre: string; empresa: string | null } | null;
  comercial: { nombre: string; apellidos: string | null } | null;
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

const ESTADO_LABEL: Record<string, string> = {
  nuevo: "Nuevo",
  enriquecido: "Enriquecido",
  segmentado: "Segmentado",
  mensaje_generado: "Msg. generado",
  mensaje_enviado: "Contactado",
  respondio: "Respondió",
  cita_agendada: "Cita agendada",
  en_negociacion: "En negociación",
  cerrado_ganado: "Cerrado ganado",
  cerrado_perdido: "Cerrado perdido",
  descartado: "Descartado",
};

const ESTADO_EMOJI: Record<string, string> = {
  nuevo: "🆕",
  enriquecido: "🔍",
  segmentado: "🎯",
  mensaje_generado: "✍️",
  mensaje_enviado: "📤",
  respondio: "💬",
  cita_agendada: "📅",
  en_negociacion: "🤝",
  cerrado_ganado: "🏆",
  cerrado_perdido: "❌",
  descartado: "🗑️",
};

const TIPO_INTERACCION_EMOJI: Record<string, string> = {
  llamada: "📞",
  whatsapp: "💬",
  email: "📧",
  reunion: "🤝",
  nota: "📝",
};

function Filtro({ label, activo, onClick }: { label: string; activo: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
        activo ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
      }`}
    >
      {label}
    </button>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function ActividadPage() {
  const { puede, cargando: cargandoPermisos } = usePermisos();
  const [eventos, setEventos] = useState<EventoActividad[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroPeriodo, setFiltroPeriodo] = useState<"hoy" | "semana" | "mes">("hoy");
  const [filtroComercial, setFiltroComercial] = useState<string>("todos");
  const [filtroTipo, setFiltroTipo] = useState<"todo" | "estados" | "interacciones">("todo");
  const [comerciales, setComerciales] = useState<{ id: string; nombre: string }[]>([]);

  const cargar = useCallback(async () => {
    setLoading(true);

    const ahora = new Date();
    let desde: Date;
    if (filtroPeriodo === "hoy") {
      desde = new Date(ahora); desde.setHours(0, 0, 0, 0);
    } else if (filtroPeriodo === "semana") {
      desde = new Date(ahora); desde.setDate(ahora.getDate() - 7);
    } else {
      desde = new Date(ahora); desde.setDate(ahora.getDate() - 30);
    }
    const desdeISO = desde.toISOString();

    let estadosQ = supabase
      .from("lead_state_history")
      .select("id, lead_id, comercial_id, estado_anterior, estado_nuevo, created_at, lead:leads(nombre, empresa), comercial:comerciales(nombre, apellidos)")
      .gte("created_at", desdeISO)
      .order("created_at", { ascending: false })
      .limit(100);

    let interaccionesQ = supabase
      .from("interactions")
      .select("id, lead_id, comercial_id, tipo, mensaje, created_at, lead:leads(nombre, empresa), comercial:comerciales(nombre, apellidos)")
      .gte("created_at", desdeISO)
      .order("created_at", { ascending: false })
      .limit(100);

    if (filtroComercial !== "todos") {
      estadosQ = estadosQ.eq("comercial_id", filtroComercial);
      interaccionesQ = interaccionesQ.eq("comercial_id", filtroComercial);
    }

    const [{ data: estados }, { data: interacciones }] = await Promise.all([
      filtroTipo !== "interacciones" ? estadosQ : Promise.resolve({ data: [] }),
      filtroTipo !== "estados" ? interaccionesQ : Promise.resolve({ data: [] }),
    ]);

    const items: EventoActividad[] = [];

    for (const e of (estados as StateHistoryRow[]) ?? []) {
      const comNombre = e.comercial ? `${e.comercial.nombre}${e.comercial.apellidos ? " " + e.comercial.apellidos : ""}` : "Sistema";
      const leadNombre = e.lead ? `${e.lead.nombre}${e.lead.empresa ? ` (${e.lead.empresa})` : ""}` : "Lead";
      items.push({
        id: `e-${e.id}`,
        fuente: "estado",
        lead_id: e.lead_id,
        lead_nombre: leadNombre,
        comercial_nombre: comNombre,
        descripcion: `${ESTADO_LABEL[e.estado_nuevo] ?? e.estado_nuevo}`,
        subtitulo: `${comNombre} movió a ${leadNombre} de "${ESTADO_LABEL[e.estado_anterior] ?? e.estado_anterior}"`,
        created_at: e.created_at,
        emoji: ESTADO_EMOJI[e.estado_nuevo] ?? "📌",
      });
    }

    for (const i of (interacciones as InteractionRow[]) ?? []) {
      const comNombre = i.comercial ? `${i.comercial.nombre}${i.comercial.apellidos ? " " + i.comercial.apellidos : ""}` : "Sistema";
      const leadNombre = i.lead ? `${i.lead.nombre}${i.lead.empresa ? ` (${i.lead.empresa})` : ""}` : "Lead";
      items.push({
        id: `i-${i.id}`,
        fuente: "interaccion",
        lead_id: i.lead_id,
        lead_nombre: leadNombre,
        comercial_nombre: comNombre,
        descripcion: i.mensaje ? (i.mensaje.length > 80 ? i.mensaje.slice(0, 80) + "…" : i.mensaje) : `${i.tipo}`,
        subtitulo: `${comNombre} · ${i.tipo}`,
        created_at: i.created_at,
        emoji: TIPO_INTERACCION_EMOJI[i.tipo] ?? "📋",
      });
    }

    // Sort by date desc
    items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    setEventos(items.slice(0, 200));
    setLoading(false);
  }, [filtroPeriodo, filtroComercial, filtroTipo]);

  useEffect(() => {
    if (cargandoPermisos) return;
    cargar();
  }, [cargar, cargandoPermisos]);

  useEffect(() => {
    supabase.from("comerciales").select("id, nombre").eq("activo", true).order("nombre")
      .then(({ data }) => setComerciales(data ?? []));
  }, []);

  if (!cargandoPermisos && !puede("ver_metricas")) return <SinAcceso />;

  // Group events by date
  const grupos: { fecha: string; eventos: EventoActividad[] }[] = [];
  for (const ev of eventos) {
    const fecha = new Date(ev.created_at).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
    const g = grupos.find(g => g.fecha === fecha);
    if (g) g.eventos.push(ev);
    else grupos.push({ fecha, eventos: [ev] });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Actividad del equipo</h1>
          <p className="text-sm text-slate-500 mt-0.5">Historial de acciones en tiempo real</p>
        </div>
        <button
          onClick={cargar}
          className="px-3 py-2 text-sm font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
        >
          ↺ Actualizar
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
          {(["hoy", "semana", "mes"] as const).map(p => (
            <Filtro key={p} label={{ hoy: "Hoy", semana: "7 días", mes: "30 días" }[p]} activo={filtroPeriodo === p} onClick={() => setFiltroPeriodo(p)} />
          ))}
        </div>

        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
          {(["todo", "estados", "interacciones"] as const).map(t => (
            <Filtro key={t} label={{ todo: "Todo", estados: "Cambios estado", interacciones: "Interacciones" }[t]} activo={filtroTipo === t} onClick={() => setFiltroTipo(t)} />
          ))}
        </div>

        <select
          value={filtroComercial}
          onChange={e => setFiltroComercial(e.target.value)}
          className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white text-slate-600 focus:outline-none focus:border-orange-300"
        >
          <option value="todos">Todos los comerciales</option>
          {comerciales.map(c => (
            <option key={c.id} value={c.id}>{c.nombre}</option>
          ))}
        </select>
      </div>

      {/* Feed */}
      {loading ? (
        <div className="py-24 text-center text-sm text-slate-400">Cargando actividad...</div>
      ) : eventos.length === 0 ? (
        <div className="py-24 text-center">
          <p className="text-3xl mb-3">📭</p>
          <p className="text-sm text-slate-400">Sin actividad en este período</p>
        </div>
      ) : (
        <div className="space-y-8">
          {grupos.map(g => (
            <div key={g.fecha}>
              <div className="flex items-center gap-3 mb-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide capitalize">{g.fecha}</p>
                <div className="flex-1 h-px bg-slate-200" />
                <span className="text-xs text-slate-400">{g.eventos.length} eventos</span>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden divide-y divide-slate-50">
                {g.eventos.map(ev => (
                  <div key={ev.id} className="flex items-start gap-4 px-5 py-3.5 hover:bg-slate-50 transition-colors group">
                    <span className="text-xl flex-shrink-0 mt-0.5">{ev.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{ev.descripcion}</p>
                      {ev.subtitulo && (
                        <p className="text-xs text-slate-400 mt-0.5 truncate">{ev.subtitulo}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {ev.lead_id && (
                        <Link
                          href={`/leads/${ev.lead_id}`}
                          className="text-xs text-slate-300 group-hover:text-orange-500 transition-colors hover:underline"
                        >
                          Ver lead →
                        </Link>
                      )}
                      <span className="text-xs text-slate-400 whitespace-nowrap">
                        {formatDistanceToNow(new Date(ev.created_at), { locale: es, addSuffix: true })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
