"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { usePermisos } from "@/components/PermisosProvider";
import { SinAcceso } from "@/components/SinAcceso";

type Cita = {
  id: string;
  lead_id: string;
  comercial_id: string | null;
  tipo: string | null;
  estado: string;
  fecha_hora: string;
  duracion_minutos: number | null;
  producto_a_tratar: string | null;
  notas_previas: string | null;
  lead_nombre?: string;
  lead_empresa?: string;
  comercial_nombre?: string;
};

type Accion = {
  id: string;
  lead_id: string;
  nombre: string;
  empresa: string | null;
  proxima_accion: string;
  proxima_accion_fecha: string;
  proxima_accion_nota: string | null;
  comercial_asignado: string | null;
  comercial_nombre?: string;
};

const COLORES_COMERCIAL = [
  "#ea650d", "#3b82f6", "#10b981", "#8b5cf6",
  "#f59e0b", "#ef4444", "#06b6d4", "#84cc16",
];

const TIPO_LABEL: Record<string, string> = {
  llamada: "📞 Llamada",
  reunion_presencial: "🤝 Reunión",
  videollamada: "💻 Video",
  email: "📧 Email",
};

const ACCION_ICON: Record<string, string> = {
  llamar: "📞",
  whatsapp: "💬",
  email: "📧",
  reunion: "🤝",
  enviar_info: "📎",
  esperar_respuesta: "⏳",
};

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

export default function CalendarioEquipoPage() {
  const { puede, cargando: cargandoPermisos } = usePermisos();
  const [semanaBase, setSemanaBase] = useState(() => startOfWeek(new Date()));
  const [citas, setCitas] = useState<Cita[]>([]);
  const [acciones, setAcciones] = useState<Accion[]>([]);
  const [comerciales, setComerciales] = useState<{ id: string; nombre: string }[]>([]);
  const [filtroComercial, setFiltroComercial] = useState("todos");
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    supabase.from("comerciales").select("id, nombre").eq("activo", true)
      .then(({ data }) => setComerciales(data ?? []));
  }, []);

  const colorMap = useCallback((id: string | null) => {
    if (!id) return "#94a3b8";
    const idx = comerciales.findIndex(c => c.id === id);
    return COLORES_COMERCIAL[idx % COLORES_COMERCIAL.length] ?? "#94a3b8";
  }, [comerciales]);

  const cargar = useCallback(async () => {
    setCargando(true);
    const desde = semanaBase.toISOString();
    const hasta = addDays(semanaBase, 7).toISOString();

    let qCitas = supabase.from("appointments")
      .select("id, lead_id, comercial_id, tipo, estado, fecha_hora, duracion_minutos, producto_a_tratar, notas_previas")
      .gte("fecha_hora", desde)
      .lt("fecha_hora", hasta)
      .not("estado", "in", "(cancelada,no_asistio)")
      .order("fecha_hora");

    let qAcciones = supabase.from("leads")
      .select("id, nombre, empresa, proxima_accion, proxima_accion_fecha, proxima_accion_nota, comercial_asignado")
      .not("proxima_accion", "is", null)
      .neq("proxima_accion", "ninguna")
      .gte("proxima_accion_fecha", desde)
      .lt("proxima_accion_fecha", hasta)
      .not("estado", "in", "(cerrado_ganado,cerrado_perdido,descartado)")
      .order("proxima_accion_fecha");

    if (filtroComercial !== "todos") {
      qCitas = qCitas.eq("comercial_id", filtroComercial);
      qAcciones = qAcciones.eq("comercial_asignado", filtroComercial);
    }

    const [{ data: citasData }, { data: accionesData }] = await Promise.all([qCitas, qAcciones]);

    // Enrich with lead and comercial names
    const leadIds = [...new Set([
      ...(citasData ?? []).map(c => c.lead_id),
    ])].filter(Boolean);

    let leadMap: Record<string, { nombre: string; empresa: string | null }> = {};
    if (leadIds.length > 0) {
      const { data: leads } = await supabase.from("leads").select("id, nombre, empresa").in("id", leadIds);
      for (const l of leads ?? []) leadMap[l.id] = { nombre: l.nombre, empresa: l.empresa };
    }

    const comMap: Record<string, string> = {};
    for (const c of comerciales) comMap[c.id] = c.nombre;

    setCitas((citasData ?? []).map(c => ({
      ...c,
      lead_nombre: leadMap[c.lead_id]?.nombre,
      lead_empresa: leadMap[c.lead_id]?.empresa ?? undefined,
      comercial_nombre: c.comercial_id ? comMap[c.comercial_id] : undefined,
    })));

    setAcciones((accionesData ?? []).map(a => ({
      ...a,
      comercial_nombre: a.comercial_asignado ? comMap[a.comercial_asignado] : undefined,
    })));

    setCargando(false);
  }, [semanaBase, filtroComercial, comerciales]);

  useEffect(() => { cargar(); }, [cargar]);

  // Build days array
  const dias = Array.from({ length: 7 }, (_, i) => addDays(semanaBase, i));
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  function getEventosDia(fecha: Date) {
    const isoDate = fecha.toISOString().split("T")[0];
    const citasDia = citas.filter(c => c.fecha_hora.startsWith(isoDate));
    const accionesDia = acciones.filter(a => a.proxima_accion_fecha.startsWith(isoDate));
    return { citasDia, accionesDia };
  }

  const totalCitas = citas.length;
  const totalAcciones = acciones.length;
  const citasHoy = citas.filter(c => c.fecha_hora.startsWith(hoy.toISOString().split("T")[0])).length;

  if (!cargandoPermisos && !puede("ver_todos_leads") && !puede("gestionar_equipo")) return <SinAcceso />;

  return (
    <div className="space-y-5 max-w-6xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Calendario del equipo</h1>
          <p className="text-sm text-slate-500 mt-0.5">Vista semanal de citas y acciones de todos los comerciales</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={filtroComercial}
            onChange={e => setFiltroComercial(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:border-orange-300"
          >
            <option value="todos">Todo el equipo</option>
            {comerciales.map((c, i) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
          <button
            onClick={() => setSemanaBase(startOfWeek(new Date()))}
            className="text-sm px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          >
            Hoy
          </button>
          <button
            onClick={() => setSemanaBase(d => addDays(d, -7))}
            className="text-sm px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          >
            ←
          </button>
          <span className="text-sm font-medium text-slate-700 px-1">
            {semanaBase.toLocaleDateString("es-ES", { day: "numeric", month: "short" })} –{" "}
            {addDays(semanaBase, 6).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}
          </span>
          <button
            onClick={() => setSemanaBase(d => addDays(d, 7))}
            className="text-sm px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          >
            →
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Citas esta semana</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{totalCitas}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Acciones pendientes</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{totalAcciones}</p>
        </div>
        <div className={`rounded-xl border p-4 ${citasHoy > 0 ? "bg-orange-50 border-orange-200" : "bg-white border-slate-200"}`}>
          <p className={`text-xs font-medium uppercase tracking-wide ${citasHoy > 0 ? "" : "text-slate-500"}`} style={citasHoy > 0 ? { color: "#ea650d" } : undefined}>
            Citas hoy
          </p>
          <p className="text-2xl font-bold mt-1" style={citasHoy > 0 ? { color: "#ea650d" } : { color: "#1e293b" }}>{citasHoy}</p>
        </div>
      </div>

      {/* Comercial legend */}
      {filtroComercial === "todos" && comerciales.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {comerciales.map((c, i) => (
            <div key={c.id} className="flex items-center gap-1.5 text-xs text-slate-600">
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: COLORES_COMERCIAL[i % COLORES_COMERCIAL.length] }} />
              {c.nombre}
            </div>
          ))}
        </div>
      )}

      {/* Weekly calendar grid */}
      {cargando ? (
        <div className="flex justify-center py-16">
          <div className="w-7 h-7 rounded-full border-2 animate-spin" style={{ borderColor: "#ea650d", borderTopColor: "transparent" }} />
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-2">
          {dias.map((dia, i) => {
            const { citasDia, accionesDia } = getEventosDia(dia);
            const esHoy = dia.getTime() === hoy.getTime();
            const esFinde = dia.getDay() === 0 || dia.getDay() === 6;
            const total = citasDia.length + accionesDia.length;

            return (
              <div
                key={i}
                className={`rounded-xl border min-h-32 p-2 ${esHoy ? "border-orange-300" : "border-slate-200"} ${esFinde ? "bg-slate-50/50" : "bg-white"}`}
              >
                {/* Day header */}
                <div className={`text-center mb-2 ${esHoy ? "pb-1.5 border-b" : ""}`} style={esHoy ? { borderColor: "#ea650d" } : undefined}>
                  <p className={`text-xs font-medium uppercase tracking-wide ${esFinde ? "text-slate-400" : "text-slate-500"}`}>
                    {dia.toLocaleDateString("es-ES", { weekday: "short" })}
                  </p>
                  <p className={`text-lg font-bold leading-tight ${esHoy ? "" : esFinde ? "text-slate-400" : "text-slate-800"}`}
                    style={esHoy ? { color: "#ea650d" } : undefined}>
                    {dia.getDate()}
                  </p>
                  {total > 0 && (
                    <div className="flex justify-center mt-0.5">
                      <span className="text-[10px] font-bold text-white px-1.5 py-0.5 rounded-full" style={{ background: esHoy ? "#ea650d" : "#64748b" }}>
                        {total}
                      </span>
                    </div>
                  )}
                </div>

                {/* Events */}
                <div className="space-y-1">
                  {citasDia.map(c => (
                    <Link
                      key={c.id}
                      href={`/leads/${c.lead_id}`}
                      className="block rounded-md px-1.5 py-1 text-white text-[10px] leading-tight hover:opacity-90 transition-opacity"
                      style={{ background: colorMap(c.comercial_id) }}
                      title={`${c.lead_nombre ?? "Lead"} — ${TIPO_LABEL[c.tipo ?? ""] ?? c.tipo ?? "Cita"}`}
                    >
                      <p className="font-semibold truncate">
                        {new Date(c.fecha_hora).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })} {c.lead_nombre ?? "—"}
                      </p>
                      {c.lead_empresa && <p className="truncate opacity-80">{c.lead_empresa}</p>}
                      <p className="opacity-70">{TIPO_LABEL[c.tipo ?? ""] ?? "Cita"}</p>
                    </Link>
                  ))}

                  {accionesDia.map(a => (
                    <Link
                      key={a.id}
                      href={`/leads/${a.lead_id}`}
                      className="block rounded-md px-1.5 py-1 text-[10px] leading-tight border hover:bg-slate-100 transition-colors"
                      style={{ borderColor: colorMap(a.comercial_asignado), borderLeftWidth: 3 }}
                      title={`${a.nombre} — ${a.proxima_accion}`}
                    >
                      <p className="font-semibold text-slate-700 truncate">
                        {ACCION_ICON[a.proxima_accion] ?? "•"} {a.nombre}
                      </p>
                      {a.empresa && <p className="text-slate-500 truncate">{a.empresa}</p>}
                    </Link>
                  ))}

                  {total === 0 && !esFinde && (
                    <p className="text-[10px] text-slate-300 text-center pt-2">—</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
