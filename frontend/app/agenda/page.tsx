"use client";

import { useEffect, useState, useCallback } from "react";
import { format, startOfWeek, addDays, isToday, isSameDay, parseISO, startOfDay, endOfDay } from "date-fns";
import { es } from "date-fns/locale";
import { supabase } from "@/lib/supabase";
import Link from "next/link";

type CitaConLead = {
  id: string;
  lead_id: string;
  comercial_id: string | null;
  tipo: "llamada" | "videollamada" | "reunion_presencial";
  estado: string;
  fecha_hora: string;
  duracion_minutos: number;
  notas_previas: string | null;
  notas_post: string | null;
  lead: {
    nombre: string;
    apellidos: string | null;
    empresa: string | null;
    telefono_whatsapp: string | null;
    temperatura: string;
  } | null;
  comercial: {
    nombre: string;
    apellidos: string | null;
  } | null;
};

const ESTADO_COLOR: Record<string, string> = {
  pendiente: "bg-amber-100 text-amber-700 border-amber-200",
  confirmada: "bg-green-100 text-green-700 border-green-200",
  realizada: "bg-slate-100 text-slate-500 border-slate-200",
  cancelada: "bg-red-100 text-red-500 border-red-200",
  no_show: "bg-orange-100 text-orange-600 border-orange-200",
  solicitud_pendiente: "bg-blue-100 text-blue-600 border-blue-200",
};

const TEMP_DOT: Record<string, string> = {
  caliente: "bg-red-500",
  templado: "bg-amber-400",
  frio: "bg-blue-400",
};

const TIPO_ICON: Record<string, string> = {
  llamada: "📞",
  videollamada: "💻",
  reunion_presencial: "🤝",
};

const RESULTADOS_CITA = [
  { value: "interesado", label: "✅ Interesado — quiere seguir" },
  { value: "necesita_mas_info", label: "🤔 Necesita más información" },
  { value: "no_interesado", label: "❌ No interesado" },
  { value: "cerrado_ganado", label: "🏆 Cerrado — contratado" },
  { value: "aplazado", label: "⏳ Aplazado — contactar más adelante" },
];

const PROXIMAS_ACCIONES_POST = [
  { value: "llamar", label: "📞 Llamar" },
  { value: "whatsapp", label: "💬 Enviar WhatsApp" },
  { value: "enviar_info", label: "📎 Enviar información" },
  { value: "reunion", label: "📅 Nueva reunión" },
  { value: "ninguna", label: "— Ninguna (cerrado)" },
];

type ModalPostCitaProps = {
  cita: CitaConLead;
  onGuardar: (citaId: string, datos: { notas_post: string; resultado: string; proxima_accion: string; proxima_accion_nota: string }) => Promise<void>;
  onCerrar: () => void;
};

function ModalPostCita({ cita, onGuardar, onCerrar }: ModalPostCitaProps) {
  const nombre = [cita.lead?.nombre, cita.lead?.apellidos].filter(Boolean).join(" ") || "Lead";
  const [resultado, setResultado] = useState("interesado");
  const [notasPost, setNotasPost] = useState("");
  const [proximaAccion, setProximaAccion] = useState("llamar");
  const [proximaNota, setProximaNota] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  async function handleGuardar() {
    if (!notasPost.trim()) { setError("Escribe al menos una nota sobre cómo fue la cita."); return; }
    setGuardando(true);
    await onGuardar(cita.id, { notas_post: notasPost, resultado, proxima_accion: proximaAccion, proxima_accion_nota: proximaNota });
    setGuardando(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-800">Resultado de la cita</h2>
          <p className="text-sm text-slate-500 mt-0.5">{nombre} · {format(parseISO(cita.fecha_hora), "d MMM · HH:mm", { locale: es })}</p>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 block">¿Cómo fue?</label>
            <div className="space-y-1.5">
              {RESULTADOS_CITA.map(r => (
                <button
                  key={r.value}
                  onClick={() => setResultado(r.value)}
                  className={`w-full text-left text-sm px-3 py-2 rounded-lg border transition-colors ${resultado === r.value ? "bg-indigo-50 border-indigo-300 text-indigo-700 font-medium" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">
              Nota post-cita <span className="text-red-400">*</span>
            </label>
            <textarea
              value={notasPost}
              onChange={e => { setNotasPost(e.target.value); setError(""); }}
              rows={3}
              placeholder="¿Qué se habló? ¿Qué le interesó? ¿Qué objeciones hubo?..."
              className={`w-full text-sm border rounded-lg px-3 py-2 resize-none focus:outline-none ${error ? "border-red-300 focus:border-red-400" : "border-slate-200 focus:border-indigo-300"}`}
            />
            {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Próxima acción</label>
            <select
              value={proximaAccion}
              onChange={e => setProximaAccion(e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-indigo-300"
            >
              {PROXIMAS_ACCIONES_POST.map(a => (
                <option key={a.value} value={a.value}>{a.label}</option>
              ))}
            </select>
            {proximaAccion !== "ninguna" && (
              <input
                type="text"
                value={proximaNota}
                onChange={e => setProximaNota(e.target.value)}
                placeholder="Nota para la próxima acción (opcional)"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 mt-1.5 focus:outline-none focus:border-indigo-300"
              />
            )}
          </div>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex gap-3">
          <button
            onClick={handleGuardar}
            disabled={guardando}
            className="flex-1 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {guardando ? "Guardando..." : "Guardar resultado"}
          </button>
          <button onClick={onCerrar} className="px-4 py-2.5 border border-slate-200 text-slate-600 text-sm rounded-xl hover:bg-slate-50">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AgendaPage() {
  const [citas, setCitas] = useState<CitaConLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [semanaBase, setSemanaBase] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [vista, setVista] = useState<"hoy" | "semana" | "lista">("semana");
  const [filtroComercial, setFiltroComercial] = useState("");
  const [filtroEquipo, setFiltroEquipo] = useState("");
  const [comerciales, setComerciales] = useState<{ id: string; nombre: string; apellidos: string | null; team_id?: string | null }[]>([]);
  const [equipos, setEquipos] = useState<{ id: string; nombre: string }[]>([]);
  const [citaParaRegistrar, setCitaParaRegistrar] = useState<CitaConLead | null>(null);

  useEffect(() => {
    Promise.all([
      supabase.from("comerciales").select("id, nombre, apellidos").eq("activo", true).order("nombre"),
      supabase.from("teams").select("id, nombre").eq("activo", true).order("nombre"),
    ]).then(([comRes, teamRes]) => {
      setComerciales(comRes.data ?? []);
      setEquipos(teamRes.data ?? []);
    });
  }, []);

  const cargarCitas = useCallback(async () => {
    setLoading(true);
    const esHoy = vista === "hoy";
    const base = esHoy ? startOfDay(new Date()) : startOfDay(semanaBase);
    const fin = esHoy ? endOfDay(new Date()) : endOfDay(addDays(semanaBase, 6));

    let query = supabase
      .from("appointments")
      .select(`
        *,
        lead:leads(nombre, apellidos, empresa, telefono_whatsapp, temperatura, team_id),
        comercial:comerciales(nombre, apellidos)
      `)
      .gte("fecha_hora", base.toISOString())
      .lte("fecha_hora", fin.toISOString())
      .order("fecha_hora");

    if (filtroComercial) query = query.eq("comercial_id", filtroComercial);

    const { data } = await query;
    let resultado = (data as CitaConLead[]) ?? [];

    // Filtro equipo: filtrar por team_id del lead
    if (filtroEquipo) {
      resultado = resultado.filter(c => (c.lead as unknown as { team_id?: string | null })?.team_id === filtroEquipo);
    }

    setCitas(resultado);
    setLoading(false);
  }, [semanaBase, filtroComercial, filtroEquipo, vista]);

  useEffect(() => { cargarCitas(); }, [cargarCitas]);

  async function actualizarEstado(citaId: string, nuevoEstado: string) {
    // Si se marca como realizada → abrir modal obligatorio
    if (nuevoEstado === "realizada") {
      const cita = citas.find(c => c.id === citaId);
      if (cita) { setCitaParaRegistrar(cita); return; }
    }
    await supabase.from("appointments").update({ estado: nuevoEstado }).eq("id", citaId);
    setCitas(prev => prev.map(c => c.id === citaId ? { ...c, estado: nuevoEstado } : c));
  }

  async function guardarResultadoCita(citaId: string, datos: { notas_post: string; resultado: string; proxima_accion: string; proxima_accion_nota: string }) {
    const cita = citas.find(c => c.id === citaId);
    // Guardar en appointment
    await supabase.from("appointments").update({
      estado: "realizada",
      notas_post: datos.notas_post,
      resultado: datos.resultado,
    }).eq("id", citaId);
    // Guardar nota en interactions
    if (cita?.lead_id) {
      await supabase.from("interactions").insert({
        lead_id: cita.lead_id,
        tipo: "nota_manual",
        mensaje: `📋 Post-cita: ${datos.notas_post}`,
        origen: "comercial",
      });
      // Actualizar estado del lead + próxima acción
      const leadUpdates: Record<string, string | null> = {
        proxima_accion: datos.proxima_accion !== "ninguna" ? datos.proxima_accion : null,
        proxima_accion_nota: datos.proxima_accion_nota || null,
        proxima_accion_fecha: null,
        updated_at: new Date().toISOString(),
      };
      if (datos.resultado === "cerrado_ganado") leadUpdates.estado = "cerrado_ganado";
      else if (datos.resultado === "no_interesado") leadUpdates.estado = "cerrado_perdido";
      else if (datos.resultado === "interesado" || datos.resultado === "necesita_mas_info") leadUpdates.estado = "en_negociacion";
      await supabase.from("leads").update(leadUpdates).eq("id", cita.lead_id);
    }
    setCitas(prev => prev.map(c => c.id === citaId ? { ...c, estado: "realizada", notas_post: datos.notas_post } : c));
    setCitaParaRegistrar(null);
  }

  const dias = Array.from({ length: 7 }, (_, i) => addDays(semanaBase, i));
  const hoy = new Date();

  const citasHoy = citas.filter(c => isSameDay(parseISO(c.fecha_hora), hoy));
  const citasPendientes = citas.filter(c => c.estado === "pendiente" || c.estado === "solicitud_pendiente");
  const citasSinRegistrar = citas.filter(c => {
    const pasada = new Date(c.fecha_hora) < new Date();
    return pasada && c.estado !== "cancelada" && c.estado !== "no_show" && c.estado !== "realizada";
  });

  return (
    <div className="space-y-6">
      {/* Modal post-cita */}
      {citaParaRegistrar && (
        <ModalPostCita
          cita={citaParaRegistrar}
          onGuardar={guardarResultadoCita}
          onCerrar={() => setCitaParaRegistrar(null)}
        />
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Agenda</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {vista === "hoy"
              ? format(new Date(), "EEEE d MMMM yyyy", { locale: es })
              : `${format(semanaBase, "d MMM", { locale: es })} – ${format(addDays(semanaBase, 6), "d MMM yyyy", { locale: es })}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Filtro equipo */}
          {equipos.length > 0 && (
            <select
              value={filtroEquipo}
              onChange={e => { setFiltroEquipo(e.target.value); setFiltroComercial(""); }}
              className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-slate-400 text-slate-600"
            >
              <option value="">Todos los equipos</option>
              {equipos.map(t => (
                <option key={t.id} value={t.id}>{t.nombre}</option>
              ))}
            </select>
          )}
          {/* Filtro comercial */}
          {comerciales.length > 1 && (
            <select
              value={filtroComercial}
              onChange={e => { setFiltroComercial(e.target.value); setFiltroEquipo(""); }}
              className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-slate-400 text-slate-600"
            >
              <option value="">Todos los comerciales</option>
              {comerciales.map(c => (
                <option key={c.id} value={c.id}>{c.nombre} {c.apellidos ?? ""}</option>
              ))}
            </select>
          )}
          {/* Vista toggle */}
          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
            {(["hoy", "semana", "lista"] as const).map(v => (
              <button
                key={v}
                onClick={() => setVista(v)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${vista === v ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              >
                {v === "hoy" ? "Hoy" : v === "semana" ? "Semana" : "Lista"}
              </button>
            ))}
          </div>
          {/* Navegación semana (solo en vista semana/lista) */}
          {vista !== "hoy" && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setSemanaBase(d => addDays(d, -7))}
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors text-sm"
              >
                ←
              </button>
              <button
                onClick={() => setSemanaBase(startOfWeek(new Date(), { weekStartsOn: 1 }))}
                className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-800 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Hoy
              </button>
              <button
                onClick={() => setSemanaBase(d => addDays(d, 7))}
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors text-sm"
              >
                →
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Alertas */}
      {citasSinRegistrar.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-3">
          <span className="text-red-500 text-lg">🔴</span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-800">
              {citasSinRegistrar.length} cita{citasSinRegistrar.length > 1 ? "s" : ""} sin registrar resultado
            </p>
            <p className="text-xs text-red-600 mt-0.5">
              {citasSinRegistrar.map(c => c.lead?.nombre ?? "Lead").join(", ")}
            </p>
          </div>
          <button
            onClick={() => setCitaParaRegistrar(citasSinRegistrar[0])}
            className="text-xs font-medium text-red-700 border border-red-300 bg-white hover:bg-red-50 px-3 py-1.5 rounded-lg whitespace-nowrap"
          >
            Registrar ahora
          </button>
        </div>
      )}
      {citasPendientes.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3">
          <span className="text-amber-500 text-lg">⚠️</span>
          <div>
            <p className="text-sm font-semibold text-amber-800">
              {citasPendientes.length} cita{citasPendientes.length > 1 ? "s" : ""} pendiente{citasPendientes.length > 1 ? "s" : ""} de confirmar esta semana
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              {citasPendientes.map(c => c.lead?.nombre ?? "Lead").join(", ")}
            </p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-20 text-center text-sm text-slate-400">Cargando agenda...</div>
      ) : vista === "hoy" ? (
        /* Vista hoy */
        <div className="space-y-3">
          {citas.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 py-16 text-center">
              <p className="text-2xl mb-2">📅</p>
              <p className="text-slate-500 text-sm font-medium">Sin citas hoy</p>
              <p className="text-xs text-slate-300 mt-1">Puedes agendar desde el detalle de cada lead</p>
            </div>
          ) : (
            citas
              .sort((a, b) => new Date(a.fecha_hora).getTime() - new Date(b.fecha_hora).getTime())
              .map(cita => (
                <TarjetaCitaCompleta key={cita.id} cita={cita} onActualizar={actualizarEstado} />
              ))
          )}
        </div>
      ) : vista === "semana" ? (
        /* Vista semanal */
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {/* Cabeceras días */}
          <div className="grid grid-cols-7 border-b border-slate-100">
            {dias.map(dia => {
              const citasDia = citas.filter(c => isSameDay(parseISO(c.fecha_hora), dia));
              const esHoy = isToday(dia);
              return (
                <div
                  key={dia.toISOString()}
                  className={`p-3 text-center border-r last:border-r-0 border-slate-100 ${esHoy ? "bg-indigo-50" : ""}`}
                >
                  <p className={`text-xs font-medium uppercase tracking-wide ${esHoy ? "text-indigo-600" : "text-slate-400"}`}>
                    {format(dia, "EEE", { locale: es })}
                  </p>
                  <p className={`text-lg font-bold mt-0.5 ${esHoy ? "text-indigo-600" : "text-slate-700"}`}>
                    {format(dia, "d")}
                  </p>
                  {citasDia.length > 0 && (
                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${esHoy ? "bg-indigo-100 text-indigo-600" : "bg-slate-100 text-slate-500"}`}>
                      {citasDia.length}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Celdas con citas */}
          <div className="grid grid-cols-7 min-h-64">
            {dias.map(dia => {
              const citasDia = citas
                .filter(c => isSameDay(parseISO(c.fecha_hora), dia))
                .sort((a, b) => new Date(a.fecha_hora).getTime() - new Date(b.fecha_hora).getTime());
              return (
                <div key={dia.toISOString()} className="border-r last:border-r-0 border-slate-100 p-2 space-y-1.5 min-h-32">
                  {citasDia.length === 0 && (
                    <p className="text-xs text-slate-200 text-center mt-4">—</p>
                  )}
                  {citasDia.map(cita => (
                    <TarjetaCitaCompacta key={cita.id} cita={cita} onActualizar={actualizarEstado} />
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Vista lista */
        <div className="space-y-3">
          {dias.map(dia => {
            const citasDia = citas
              .filter(c => isSameDay(parseISO(c.fecha_hora), dia))
              .sort((a, b) => new Date(a.fecha_hora).getTime() - new Date(b.fecha_hora).getTime());
            const esHoy = isToday(dia);
            return (
              <div key={dia.toISOString()}>
                <div className={`flex items-center gap-3 mb-2`}>
                  <div className={`flex items-center gap-2 ${esHoy ? "text-indigo-600" : "text-slate-500"}`}>
                    {esHoy && <span className="text-xs font-bold bg-indigo-600 text-white px-2 py-0.5 rounded-full">HOY</span>}
                    <span className={`text-sm font-semibold ${esHoy ? "text-indigo-700" : "text-slate-700"}`}>
                      {format(dia, "EEEE d MMMM", { locale: es })}
                    </span>
                  </div>
                  {citasDia.length > 0 && (
                    <span className="text-xs text-slate-400">{citasDia.length} cita{citasDia.length > 1 ? "s" : ""}</span>
                  )}
                </div>
                {citasDia.length === 0 ? (
                  <p className="text-xs text-slate-300 pl-2 mb-3">Sin citas</p>
                ) : (
                  <div className="space-y-2 mb-4">
                    {citasDia.map(cita => (
                      <TarjetaCitaCompleta key={cita.id} cita={cita} onActualizar={actualizarEstado} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {citas.length === 0 && (
            <div className="bg-white rounded-xl border border-slate-200 py-16 text-center">
              <p className="text-slate-400 text-sm">No hay citas esta semana</p>
              <p className="text-xs text-slate-300 mt-1">Puedes agendar citas desde el detalle de cada lead</p>
            </div>
          )}
        </div>
      )}

      {/* Métricas técnicas */}
      {(() => {
        const realizadas = citas.filter(c => c.estado === "realizada").length;
        const noShow = citas.filter(c => c.estado === "no_show").length;
        const canceladas = citas.filter(c => c.estado === "cancelada").length;
        const total = citas.length;
        const tasaNoShow = total > 0 ? Math.round((noShow / total) * 100) : 0;
        const tasaRealizacion = total > 0 ? Math.round((realizadas / total) * 100) : 0;
        const cerradas = citas.filter(c => c.notas_post?.includes("cerrado") || c.resultado === "cerrado_ganado").length;
        const tasaConversion = realizadas > 0 ? Math.round((cerradas / realizadas) * 100) : 0;
        return (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                {vista === "hoy" ? "Métricas de hoy" : "Métricas de la semana"}
              </h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 divide-x divide-slate-100">
              {[
                { label: "Total citas", value: total, color: "text-slate-800", sub: `${citas.filter(c => c.tipo === "llamada").length} llamadas · ${citas.filter(c => c.tipo === "videollamada").length} video · ${citas.filter(c => c.tipo === "reunion_presencial").length} presencial` },
                { label: "Tasa realización", value: `${tasaRealizacion}%`, color: tasaRealizacion >= 70 ? "text-emerald-600" : tasaRealizacion >= 50 ? "text-amber-600" : "text-red-600", sub: `${realizadas} realizadas de ${total}` },
                { label: "No-show", value: `${tasaNoShow}%`, color: tasaNoShow === 0 ? "text-emerald-600" : tasaNoShow <= 15 ? "text-amber-600" : "text-red-600", sub: `${noShow} no asistieron · ${canceladas} canceladas` },
                { label: "Conversión", value: `${tasaConversion}%`, color: tasaConversion >= 30 ? "text-emerald-600" : "text-slate-500", sub: `${cerradas} cierres sobre ${realizadas} realizadas` },
              ].map(stat => (
                <div key={stat.label} className="p-4 text-center">
                  <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                  <p className="text-xs font-semibold text-slate-600 mt-0.5">{stat.label}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{stat.sub}</p>
                </div>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function TarjetaCitaCompacta({ cita, onActualizar }: { cita: CitaConLead; onActualizar: (id: string, estado: string) => void }) {
  const nombre = [cita.lead?.nombre, cita.lead?.apellidos].filter(Boolean).join(" ") || "Lead";
  const esPasada = new Date(cita.fecha_hora) < new Date();

  return (
    <div className={`rounded-lg border p-2 text-xs ${ESTADO_COLOR[cita.estado] ?? "bg-slate-50 border-slate-200"}`}>
      <div className="flex items-center gap-1 mb-0.5">
        <span>{TIPO_ICON[cita.tipo]}</span>
        <span className="font-semibold text-slate-700 truncate">{nombre}</span>
      </div>
      <p className="text-slate-500">{format(parseISO(cita.fecha_hora), "HH:mm")}</p>
      {cita.lead?.empresa && (
        <p className="text-slate-400 truncate">{cita.lead.empresa}</p>
      )}
      <Link href={`/leads/${cita.lead_id}`} className="text-indigo-500 hover:underline mt-1 block">
        Ver lead →
      </Link>
      {esPasada && cita.estado !== "realizada" && cita.estado !== "cancelada" && (
        <div className="flex gap-1 mt-1 pt-1 border-t border-current/20">
          <button onClick={() => onActualizar(cita.id, "realizada")} className="font-medium text-slate-600 hover:text-slate-800">✓</button>
          <button onClick={() => onActualizar(cita.id, "no_show")} className="text-orange-500 ml-1">✗</button>
        </div>
      )}
      {!esPasada && cita.estado === "pendiente" && (
        <button onClick={() => onActualizar(cita.id, "confirmada")} className="mt-1 font-medium text-green-700 hover:text-green-900">
          Confirmar
        </button>
      )}
    </div>
  );
}

function TarjetaCitaCompleta({ cita, onActualizar }: { cita: CitaConLead; onActualizar: (id: string, estado: string) => void }) {
  const nombre = [cita.lead?.nombre, cita.lead?.apellidos].filter(Boolean).join(" ") || "Lead";
  const esPasada = new Date(cita.fecha_hora) < new Date();

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-start gap-4">
      {/* Hora */}
      <div className="flex-shrink-0 text-center w-12">
        <p className="text-sm font-bold text-slate-700">{format(parseISO(cita.fecha_hora), "HH:mm")}</p>
        <p className="text-xs text-slate-400">{cita.duracion_minutos}min</p>
      </div>

      {/* Contenido */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-base">{TIPO_ICON[cita.tipo]}</span>
          <Link href={`/leads/${cita.lead_id}`} className="font-semibold text-slate-800 hover:text-indigo-600 transition-colors">
            {nombre}
          </Link>
          {cita.lead?.temperatura && (
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${TEMP_DOT[cita.lead.temperatura] ?? "bg-slate-300"}`} />
          )}
        </div>
        {cita.lead?.empresa && (
          <p className="text-xs text-slate-500">{cita.lead.empresa}</p>
        )}
        {cita.notas_previas && (
          <p className="text-xs text-slate-400 mt-1 italic">{cita.notas_previas}</p>
        )}
        {cita.comercial && (
          <p className="text-xs text-slate-400 mt-1">
            Con {cita.comercial.nombre} {cita.comercial.apellidos ?? ""}
          </p>
        )}
        {/* Acciones */}
        <div className="flex items-center gap-3 mt-2">
          {cita.lead?.telefono_whatsapp && (
            <a
              href={`https://wa.me/${cita.lead.telefono_whatsapp.replace("+", "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-green-600 hover:text-green-800 font-medium"
            >
              WhatsApp
            </a>
          )}
          {!esPasada && cita.estado === "pendiente" && (
            <button onClick={() => onActualizar(cita.id, "confirmada")} className="text-xs text-green-600 hover:text-green-800 font-medium">
              ✓ Confirmar
            </button>
          )}
          {esPasada && cita.estado !== "realizada" && cita.estado !== "cancelada" && (
            <>
              <button onClick={() => onActualizar(cita.id, "realizada")} className="text-xs text-slate-600 hover:text-slate-800 font-medium">
                ✓ Realizada
              </button>
              <button onClick={() => onActualizar(cita.id, "no_show")} className="text-xs text-orange-500 hover:text-orange-700">
                No asistió
              </button>
            </>
          )}
          {cita.estado !== "cancelada" && cita.estado !== "realizada" && (
            <button onClick={() => onActualizar(cita.id, "cancelada")} className="text-xs text-red-400 hover:text-red-600 ml-auto">
              Cancelar
            </button>
          )}
        </div>
      </div>

      {/* Estado badge */}
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium border flex-shrink-0 ${ESTADO_COLOR[cita.estado] ?? "bg-slate-100 text-slate-500 border-slate-200"}`}>
        {cita.estado === "solicitud_pendiente" ? "Solicitud" : cita.estado}
      </span>
    </div>
  );
}
