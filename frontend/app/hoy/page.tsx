"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { format, formatDistanceToNow, addDays } from "date-fns";
import { es } from "date-fns/locale";
import { supabase } from "@/lib/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

type LeadRow = {
  id: string;
  nombre: string;
  apellidos: string | null;
  empresa: string | null;
  ciudad: string | null;
  sector: string | null;
  telefono: string | null;
  telefono_whatsapp: string | null;
  nivel_interes: number;
  prioridad: string | null;
  estado: string;
  proxima_accion: string | null;
  proxima_accion_fecha: string | null;
  proxima_accion_nota: string | null;
  comercial_asignado: string | null;
  updated_at?: string;
};

type CitaRow = {
  id: string;
  tipo: string;
  estado: string;
  fecha_hora: string;
  lead_id: string;
  leads: {
    nombre: string;
    apellidos: string | null;
    empresa: string | null;
    telefono_whatsapp: string | null;
  } | null;
};

type SeccionesData = {
  accionesVencidas: LeadRow[];
  accionesHoy: LeadRow[];
  altaPrioridadSinTocar: LeadRow[];
  respondieronSinSeguimiento: LeadRow[];
  mensajeEnviadoSinRespuesta: LeadRow[];
  citasHoy: CitaRow[];
};

// ─── Constants ────────────────────────────────────────────────────────────────

const ACCIONES_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  llamar:            { label: "Llamar",   icon: "📞", color: "bg-blue-100 text-blue-700 hover:bg-blue-200"   },
  whatsapp:          { label: "WhatsApp", icon: "💬", color: "bg-green-100 text-green-700 hover:bg-green-200" },
  email:             { label: "Email",    icon: "📧", color: "bg-sky-100 text-sky-700 hover:bg-sky-200"       },
  esperar_respuesta: { label: "Esperar",  icon: "⏳", color: "bg-slate-100 text-slate-700"                    },
  enviar_info:       { label: "Enviar info", icon: "📎", color: "bg-orange-100 text-orange-700 hover:bg-orange-200" },
  reunion:           { label: "Reunión",  icon: "📅", color: "bg-purple-100 text-purple-700 hover:bg-purple-200" },
};

const ESTADOS_CERRADOS = ["cerrado_ganado", "cerrado_perdido", "descartado"];

const TIPO_CITA_LABEL: Record<string, string> = {
  llamada: "Llamada",
  reunion_presencial: "Reunión presencial",
  videollamada: "Videollamada",
};

const ESTADO_CITA_STYLE: Record<string, string> = {
  pendiente:         "bg-amber-100 text-amber-700",
  confirmada:        "bg-green-100 text-green-700",
  solicitud_pendiente: "bg-slate-100 text-slate-600",
};

const SELECT_LEAD =
  "id, nombre, apellidos, empresa, ciudad, sector, telefono, telefono_whatsapp, nivel_interes, prioridad, estado, proxima_accion, proxima_accion_fecha, proxima_accion_nota, comercial_asignado, updated_at";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function nombreCompleto(lead: { nombre: string; apellidos: string | null }) {
  return [lead.nombre, lead.apellidos].filter(Boolean).join(" ");
}

function diasDesde(fechaStr: string): number {
  return Math.floor((Date.now() - new Date(fechaStr).getTime()) / 86400000);
}

function horasDesde(fechaStr: string): number {
  return Math.floor((Date.now() - new Date(fechaStr).getTime()) / 3600000);
}

function telLimpio(tel: string | null): string | null {
  return tel ? tel.replace(/\D/g, "") : null;
}

function badgeAccion(tipo: string | null) {
  if (!tipo || tipo === "ninguna") return null;
  const cfg = ACCIONES_CONFIG[tipo];
  if (!cfg) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
      {cfg.icon} {cfg.label}
    </span>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function HoyPage() {
  const [comercialId,  setComercialId ] = useState<string | null>(null);
  const [comercialCargado, setComercialCargado] = useState(false);

  const [seccionesData, setSeccionesData] = useState<SeccionesData>({
    accionesVencidas:           [],
    accionesHoy:                [],
    altaPrioridadSinTocar:      [],
    respondieronSinSeguimiento: [],
    mensajeEnviadoSinRespuesta: [],
    citasHoy:                   [],
  });
  const [loading,        setLoading       ] = useState(true);
  const [guardandoAccion, setGuardandoAccion] = useState<string | null>(null);

  // ─── Get logged comercial ──────────────────────────────────────────────────
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

  // ─── Load data ────────────────────────────────────────────────────────────
  const cargarDatos = useCallback(async () => {
    if (!comercialCargado) return;
    setLoading(true);
    try {
      const ahora = new Date();
      const hoyStr  = ahora.toISOString().split("T")[0];
      const mananaStr = addDays(ahora, 1).toISOString().split("T")[0];
      const hace3dias = new Date(ahora.getTime() - 3 * 86400000).toISOString();
      const hace4dias = new Date(ahora.getTime() - 4 * 86400000).toISOString();
      const hace24h   = new Date(ahora.getTime() - 86400000).toISOString();

      // Construir queries con filtro de comercial aplicado inline
      let qVencidas = supabase.from("leads").select(SELECT_LEAD)
        .lt("proxima_accion_fecha", ahora.toISOString())
        .not("proxima_accion", "is", null)
        .not("proxima_accion", "eq", "ninguna")
        .not("estado", "in", `(${ESTADOS_CERRADOS.join(",")})`)
        .order("proxima_accion_fecha", { ascending: true })
        .limit(20);
      if (comercialId) qVencidas = qVencidas.eq("comercial_asignado", comercialId);

      let qHoy = supabase.from("leads").select(SELECT_LEAD)
        .gte("proxima_accion_fecha", `${hoyStr}T00:00:00`)
        .lt("proxima_accion_fecha", `${mananaStr}T00:00:00`)
        .not("proxima_accion", "is", null)
        .not("proxima_accion", "eq", "ninguna")
        .not("estado", "in", `(${ESTADOS_CERRADOS.join(",")})`)
        .order("proxima_accion_fecha", { ascending: true })
        .limit(20);
      if (comercialId) qHoy = qHoy.eq("comercial_asignado", comercialId);

      // Sección 3: Alta prioridad o alto interés sin tocar en 24h
      // Reemplaza el antiguo "calientes sin tocar" que filtraba por temperatura
      let qAltaPrioridad = supabase.from("leads").select(SELECT_LEAD)
        .or("prioridad.eq.alta,nivel_interes.gte.7")
        .lt("updated_at", hace24h)
        .not("estado", "in", `(${ESTADOS_CERRADOS.join(",")})`)
        .not("estado", "eq", "cita_agendada")
        .is("proxima_accion", null)
        .order("nivel_interes", { ascending: false })
        .order("updated_at", { ascending: true })
        .limit(15);
      if (comercialId) qAltaPrioridad = qAltaPrioridad.eq("comercial_asignado", comercialId);

      let qRespondieron = supabase.from("leads").select(SELECT_LEAD)
        .eq("estado", "respondio")
        .lt("updated_at", hace3dias)
        .order("updated_at", { ascending: true })
        .limit(10);
      if (comercialId) qRespondieron = qRespondieron.eq("comercial_asignado", comercialId);

      let qMensajeEnviado = supabase.from("leads").select(SELECT_LEAD)
        .eq("estado", "mensaje_enviado")
        .lt("updated_at", hace4dias)
        .order("updated_at", { ascending: true })
        .limit(10);
      if (comercialId) qMensajeEnviado = qMensajeEnviado.eq("comercial_asignado", comercialId);

      const baseVencidas     = qVencidas;
      const baseHoy          = qHoy;
      const baseAltaPrioridad = qAltaPrioridad;
      const baseRespondieron = qRespondieron;
      const baseMensajeEnviado = qMensajeEnviado;

      // Citas: no filtramos por comercial aquí (puede que el lead no esté asignado todavía)
      const citasQuery = supabase
        .from("appointments")
        .select("id, tipo, estado, fecha_hora, lead_id, leads(nombre, apellidos, empresa, telefono_whatsapp)")
        .gte("fecha_hora", `${hoyStr}T00:00:00`)
        .lt("fecha_hora", `${hoyStr}T23:59:59`)
        .not("estado", "eq", "cancelada")
        .not("estado", "eq", "realizada")
        .order("fecha_hora", { ascending: true })
        .limit(10);

      const [r1, r2, r3, r4, r5, r6] = await Promise.all([
        baseVencidas, baseHoy, baseAltaPrioridad,
        baseRespondieron, baseMensajeEnviado, citasQuery,
      ]);

      setSeccionesData({
        accionesVencidas:           (r1.data as unknown as LeadRow[]) ?? [],
        accionesHoy:                (r2.data as unknown as LeadRow[]) ?? [],
        altaPrioridadSinTocar:      (r3.data as unknown as LeadRow[]) ?? [],
        respondieronSinSeguimiento: (r4.data as unknown as LeadRow[]) ?? [],
        mensajeEnviadoSinRespuesta: (r5.data as unknown as LeadRow[]) ?? [],
        citasHoy:                   (r6.data as unknown as CitaRow[]) ?? [],
      });
    } finally {
      setLoading(false);
    }
  }, [comercialCargado, comercialId]);

  useEffect(() => { cargarDatos(); }, [cargarDatos]);

  // ─── Actions ──────────────────────────────────────────────────────────────

  const accionRapida = useCallback(async (
    leadId: string,
    seccion: keyof SeccionesData,
    tipo: string,
    mensaje: string,
    nuevoEstado?: string,
    clearAccion?: boolean
  ) => {
    const key = `${leadId}-${tipo}`;
    setGuardandoAccion(key);
    try {
      await supabase.from("interactions").insert({
        lead_id: leadId, tipo: "nota_manual", mensaje, origen: "comercial",
      });
      if (nuevoEstado || clearAccion) {
        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (nuevoEstado) updates.estado = nuevoEstado;
        if (clearAccion) { updates.proxima_accion = null; updates.proxima_accion_fecha = null; }
        await supabase.from("leads").update(updates).eq("id", leadId);
      }
      setSeccionesData(prev => {
        const updated = { ...prev };
        if (seccion !== "citasHoy") {
          (updated[seccion] as LeadRow[]) = (prev[seccion] as LeadRow[]).filter(l => l.id !== leadId);
        }
        return updated;
      });
    } finally {
      setGuardandoAccion(null);
    }
  }, []);

  const posponerAccion = useCallback(async (leadId: string, seccion: keyof SeccionesData, dias: number) => {
    const key = `${leadId}-posponer`;
    setGuardandoAccion(key);
    try {
      const nuevaFecha = addDays(new Date(), dias).toISOString();
      await supabase.from("leads").update({
        proxima_accion_fecha: nuevaFecha,
        updated_at: new Date().toISOString(),
      }).eq("id", leadId);
      await supabase.from("interactions").insert({
        lead_id: leadId,
        tipo: "nota_manual",
        mensaje: `Acción pospuesta ${dias === 1 ? "1 día" : `${dias} días`}`,
        origen: "comercial",
      });
      setSeccionesData(prev => {
        const updated = { ...prev };
        if (seccion !== "citasHoy") {
          (updated[seccion] as LeadRow[]) = (prev[seccion] as LeadRow[]).filter(l => l.id !== leadId);
        }
        return updated;
      });
    } finally {
      setGuardandoAccion(null);
    }
  }, []);

  const accionCita = useCallback(async (citaId: string, leadId: string, nuevoEstado: string, mensaje: string) => {
    setGuardandoAccion(`cita-${citaId}`);
    try {
      await supabase.from("appointments").update({ estado: nuevoEstado, updated_at: new Date().toISOString() }).eq("id", citaId);
      await supabase.from("interactions").insert({ lead_id: leadId, tipo: "nota_manual", mensaje, origen: "comercial" });
      setSeccionesData(prev => ({ ...prev, citasHoy: prev.citasHoy.filter(c => c.id !== citaId) }));
    } finally {
      setGuardandoAccion(null);
    }
  }, []);

  // ─── Total tasks ─────────────────────────────────────────────────────────
  const totalTareas =
    seccionesData.accionesVencidas.length +
    seccionesData.accionesHoy.length +
    seccionesData.altaPrioridadSinTocar.length +
    seccionesData.respondieronSinSeguimiento.length +
    seccionesData.mensajeEnviadoSinRespuesta.length +
    seccionesData.citasHoy.length;

  // ─── Render ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-t-transparent" style={{ borderColor: "#ea650d", borderTopColor: "transparent" }} />
          <p className="text-sm text-slate-500">Cargando tareas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      {/* ── Header ── */}
      <div className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="mx-auto max-w-4xl flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Trabajo de hoy</h1>
            {totalTareas > 0 ? (
              <p className="mt-0.5 text-sm text-slate-500">
                <span className="font-semibold text-slate-700">{totalTareas}</span> tareas pendientes
                {!comercialId && (
                  <span className="ml-2 text-xs text-amber-600">(mostrando todos los comerciales)</span>
                )}
              </p>
            ) : (
              <p className="mt-0.5 text-sm text-green-600 font-medium">Todo al día ✓</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={cargarDatos}
              className="text-sm text-slate-400 hover:text-slate-700 transition-colors"
            >
              ↺
            </button>
            <div className="text-right">
              <p className="text-sm font-medium text-slate-700">
                {format(new Date(), "EEEE d 'de' MMMM", { locale: es })}
              </p>
              <p className="text-xs text-slate-400">{format(new Date(), "yyyy")}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-4xl space-y-4 px-4 pt-4">

        {/* ── Empty state ── */}
        {totalTareas === 0 && (
          <div className="flex flex-col items-center justify-center rounded-xl border border-green-200 bg-green-50 py-16">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-3xl">✅</div>
            <p className="text-lg font-semibold text-green-800">Todo al día</p>
            <p className="mt-1 text-sm text-green-600">No tienes tareas pendientes por ahora.</p>
          </div>
        )}

        {/* ── Sección 1: Acciones vencidas ── */}
        {seccionesData.accionesVencidas.length > 0 && (
          <SeccionCard color="red" titulo="Acciones vencidas" emoji="🔴" count={seccionesData.accionesVencidas.length}>
            {seccionesData.accionesVencidas.map(lead => {
              const diasVencido = lead.proxima_accion_fecha
                ? Math.floor((Date.now() - new Date(lead.proxima_accion_fecha).getTime()) / 86400000)
                : 0;
              const tel = telLimpio(lead.telefono_whatsapp ?? lead.telefono);
              return (
                <FilaLead key={lead.id}>
                  <div className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
                    <Link href={`/leads/${lead.id}`} className="font-medium text-slate-900 transition-colors truncate" style={{ color: "#414141" }} onMouseEnter={e => (e.currentTarget.style.color = "#ea650d")} onMouseLeave={e => (e.currentTarget.style.color = "#414141")}>
                      {nombreCompleto(lead)}
                      {lead.empresa && <span className="ml-1 font-normal text-slate-500">· {lead.empresa}</span>}
                    </Link>
                    {badgeAccion(lead.proxima_accion)}
                    <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                      venció hace {diasVencido === 0 ? "hoy" : `${diasVencido}d`}
                    </span>
                    {lead.proxima_accion_nota && (
                      <span className="truncate text-xs text-slate-400 max-w-[160px]">{lead.proxima_accion_nota}</span>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1.5">
                    {/* Botón contextual según tipo de acción */}
                    {lead.proxima_accion === "whatsapp" && tel && (
                      <a href={`https://wa.me/${tel}`} target="_blank" rel="noopener noreferrer"
                        className="rounded px-2 py-1 text-xs font-medium bg-green-100 text-green-700 hover:bg-green-200 transition-colors"
                        onClick={() => accionRapida(lead.id, "accionesVencidas", "hecha", "WhatsApp enviado", undefined, true)}>
                        💬 WhatsApp
                      </a>
                    )}
                    {lead.proxima_accion === "llamar" && tel && (
                      <a href={`tel:${tel}`}
                        className="rounded px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors"
                        onClick={() => accionRapida(lead.id, "accionesVencidas", "hecha", "Llamada realizada", undefined, true)}>
                        📞 Llamar
                      </a>
                    )}
                    <BtnAccion loading={guardandoAccion === `${lead.id}-hecha`}
                      onClick={() => accionRapida(lead.id, "accionesVencidas", "hecha", "Acción marcada como hecha", undefined, true)}
                      className="bg-green-100 text-green-700 hover:bg-green-200">
                      ✓ Hecha
                    </BtnAccion>
                    <BtnAccion loading={guardandoAccion === `${lead.id}-posponer`}
                      onClick={() => posponerAccion(lead.id, "accionesVencidas", 1)}
                      className="bg-slate-100 text-slate-600 hover:bg-slate-200">
                      ↻ +1 día
                    </BtnAccion>
                    <BtnAccion loading={guardandoAccion === `${lead.id}-no_cogio`}
                      onClick={() => accionRapida(lead.id, "accionesVencidas", "no_cogio", "Llamada: no cogió el teléfono")}
                      className="bg-slate-100 text-slate-600 hover:bg-slate-200">
                      📞 No cogió
                    </BtnAccion>
                  </div>
                </FilaLead>
              );
            })}
          </SeccionCard>
        )}

        {/* ── Sección 2: Hacer hoy ── */}
        {seccionesData.accionesHoy.length > 0 && (
          <SeccionCard color="orange" titulo="Hacer hoy" emoji="🟠" count={seccionesData.accionesHoy.length}>
            {seccionesData.accionesHoy.map(lead => {
              const horaAccion = lead.proxima_accion_fecha
                ? format(new Date(lead.proxima_accion_fecha), "HH:mm")
                : null;
              const tel = telLimpio(lead.telefono_whatsapp ?? lead.telefono);
              const cfgAccion = lead.proxima_accion ? ACCIONES_CONFIG[lead.proxima_accion] : null;
              return (
                <FilaLead key={lead.id}>
                  <div className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
                    <Link href={`/leads/${lead.id}`} className="font-medium text-slate-900 transition-colors truncate" style={{ color: "#414141" }} onMouseEnter={e => (e.currentTarget.style.color = "#ea650d")} onMouseLeave={e => (e.currentTarget.style.color = "#414141")}>
                      {nombreCompleto(lead)}
                      {lead.empresa && <span className="ml-1 font-normal text-slate-500">· {lead.empresa}</span>}
                    </Link>
                    {badgeAccion(lead.proxima_accion)}
                    {horaAccion && <span className="text-xs text-slate-500 font-mono">{horaAccion}</span>}
                    {lead.proxima_accion_nota && (
                      <span className="truncate text-xs text-slate-400 max-w-[160px]">{lead.proxima_accion_nota}</span>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1.5">
                    {/* Botón de acción principal según tipo */}
                    {lead.proxima_accion === "whatsapp" && tel && (
                      <a href={`https://wa.me/${tel}`} target="_blank" rel="noopener noreferrer"
                        className={`rounded px-2 py-1 text-xs font-medium transition-colors ${cfgAccion?.color ?? ""}`}
                        onClick={() => accionRapida(lead.id, "accionesHoy", "hecha", "WhatsApp enviado", undefined, true)}>
                        💬 Enviar WA
                      </a>
                    )}
                    {lead.proxima_accion === "llamar" && tel && (
                      <a href={`tel:${tel}`}
                        className={`rounded px-2 py-1 text-xs font-medium transition-colors ${cfgAccion?.color ?? ""}`}
                        onClick={() => accionRapida(lead.id, "accionesHoy", "hecha", "Llamada realizada", undefined, true)}>
                        📞 Llamar
                      </a>
                    )}
                    {lead.proxima_accion === "enviar_info" && (
                      <Link href={`/mensajes?lead=${lead.id}`}
                        className={`rounded px-2 py-1 text-xs font-medium transition-colors ${cfgAccion?.color ?? ""}`}>
                        📎 Generar mensaje
                      </Link>
                    )}
                    <BtnAccion loading={guardandoAccion === `${lead.id}-hecha`}
                      onClick={() => accionRapida(lead.id, "accionesHoy", "hecha", "Acción del día marcada como hecha", undefined, true)}
                      className="bg-green-100 text-green-700 hover:bg-green-200">
                      ✓ Hecha
                    </BtnAccion>
                  </div>
                </FilaLead>
              );
            })}
          </SeccionCard>
        )}

        {/* ── Sección 3: Alta prioridad sin tocar ── */}
        {/* Antes filtraba por temperatura='caliente' que siempre estaba vacío.
            Ahora usa nivel_interes >= 7 o prioridad = 'alta' sin proxima_accion asignada */}
        {seccionesData.altaPrioridadSinTocar.length > 0 && (
          <SeccionCard color="amber" titulo="Alta prioridad sin acción programada" emoji="⚡" count={seccionesData.altaPrioridadSinTocar.length}>
            {seccionesData.altaPrioridadSinTocar.map(lead => {
              const horas = lead.updated_at ? horasDesde(lead.updated_at) : 0;
              const tiempoLabel = horas < 24 ? `${horas}h` : `${Math.floor(horas / 24)}d`;
              const tel = telLimpio(lead.telefono_whatsapp ?? lead.telefono);
              return (
                <FilaLead key={lead.id}>
                  <div className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
                    <Link href={`/leads/${lead.id}`} className="font-medium text-slate-900 transition-colors truncate" style={{ color: "#414141" }} onMouseEnter={e => (e.currentTarget.style.color = "#ea650d")} onMouseLeave={e => (e.currentTarget.style.color = "#414141")}>
                      {nombreCompleto(lead)}
                      {lead.empresa && <span className="ml-1 font-normal text-slate-500">· {lead.empresa}</span>}
                    </Link>
                    {lead.sector && <span className="text-xs text-slate-400">{lead.sector}</span>}
                    <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                      sin acción · {tiempoLabel}
                    </span>
                    <span className="rounded px-2 py-0.5 text-xs" style={{ background: "#fff5f0", color: "#ea650d" }}>
                      {lead.nivel_interes}/10
                    </span>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1.5">
                    {tel && (
                      <a href={`https://wa.me/${tel}`} target="_blank" rel="noopener noreferrer"
                        className="rounded px-2 py-1 text-xs font-medium bg-green-100 text-green-700 hover:bg-green-200 transition-colors"
                        onClick={() => accionRapida(lead.id, "altaPrioridadSinTocar", "whatsapp", "WhatsApp enviado a lead alta prioridad")}>
                        💬 WhatsApp
                      </a>
                    )}
                    {tel && (
                      <a href={`tel:${tel}`}
                        className="rounded px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors"
                        onClick={() => accionRapida(lead.id, "altaPrioridadSinTocar", "llamar", "Llamada realizada a lead alta prioridad")}>
                        📞 Llamar
                      </a>
                    )}
                    <Link href={`/leads/${lead.id}`}
                      className="rounded px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 hover:text-blue-700 transition-colors">
                      → Ver
                    </Link>
                  </div>
                </FilaLead>
              );
            })}
          </SeccionCard>
        )}

        {/* ── Sección 4: Respondieron — seguir ── */}
        {seccionesData.respondieronSinSeguimiento.length > 0 && (
          <SeccionCard color="green" titulo="Respondieron — dar seguimiento" emoji="✅" count={seccionesData.respondieronSinSeguimiento.length}>
            {seccionesData.respondieronSinSeguimiento.map(lead => {
              const dias = lead.updated_at ? diasDesde(lead.updated_at) : 0;
              const tel = telLimpio(lead.telefono_whatsapp ?? lead.telefono);
              return (
                <FilaLead key={lead.id}>
                  <div className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
                    <Link href={`/leads/${lead.id}`} className="font-medium text-slate-900 transition-colors truncate" style={{ color: "#414141" }} onMouseEnter={e => (e.currentTarget.style.color = "#ea650d")} onMouseLeave={e => (e.currentTarget.style.color = "#414141")}>
                      {nombreCompleto(lead)}
                      {lead.empresa && <span className="ml-1 font-normal text-slate-500">· {lead.empresa}</span>}
                    </Link>
                    <span className="text-xs text-slate-500">respondió hace {dias === 0 ? "hoy" : `${dias}d`}</span>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1.5">
                    {tel && (
                      <a href={`https://wa.me/${tel}`} target="_blank" rel="noopener noreferrer"
                        className="rounded px-2 py-1 text-xs font-medium bg-green-100 text-green-700 hover:bg-green-200 transition-colors"
                        onClick={() => accionRapida(lead.id, "respondieronSinSeguimiento", "whatsapp", "WhatsApp de seguimiento enviado")}>
                        💬 Responder
                      </a>
                    )}
                    <Link href={`/leads/${lead.id}?tab=agenda`}
                      className="rounded px-2 py-1 text-xs font-medium bg-purple-100 text-purple-700 hover:bg-purple-200 transition-colors">
                      📅 Agendar cita
                    </Link>
                    <Link href={`/leads/${lead.id}`}
                      className="rounded px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 hover:text-blue-700 transition-colors">
                      → Ver
                    </Link>
                  </div>
                </FilaLead>
              );
            })}
          </SeccionCard>
        )}

        {/* ── Sección 5: Mensaje enviado sin respuesta ── */}
        {seccionesData.mensajeEnviadoSinRespuesta.length > 0 && (
          <SeccionCard color="blue" titulo="Enviado, sin respuesta" emoji="📩" count={seccionesData.mensajeEnviadoSinRespuesta.length}>
            {seccionesData.mensajeEnviadoSinRespuesta.map(lead => {
              const dias = lead.updated_at ? diasDesde(lead.updated_at) : 0;
              const tel = telLimpio(lead.telefono_whatsapp ?? lead.telefono);
              return (
                <FilaLead key={lead.id}>
                  <div className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
                    <Link href={`/leads/${lead.id}`} className="font-medium text-slate-900 transition-colors truncate" style={{ color: "#414141" }} onMouseEnter={e => (e.currentTarget.style.color = "#ea650d")} onMouseLeave={e => (e.currentTarget.style.color = "#414141")}>
                      {nombreCompleto(lead)}
                      {lead.empresa && <span className="ml-1 font-normal text-slate-500">· {lead.empresa}</span>}
                    </Link>
                    <span className="text-xs text-slate-500">hace {dias}d sin respuesta</span>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1.5">
                    {tel && (
                      <a href={`https://wa.me/${tel}`} target="_blank" rel="noopener noreferrer"
                        className="rounded px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors"
                        onClick={() => accionRapida(lead.id, "mensajeEnviadoSinRespuesta", "whatsapp", "Recordatorio enviado por WhatsApp")}>
                        💬 Recordatorio
                      </a>
                    )}
                    <BtnAccion loading={guardandoAccion === `${lead.id}-descartado`}
                      onClick={() => accionRapida(lead.id, "mensajeEnviadoSinRespuesta", "descartado", "Sin respuesta — marcado para revisión posterior")}
                      className="bg-slate-100 text-slate-500 hover:bg-slate-200">
                      Archivar
                    </BtnAccion>
                    <Link href={`/leads/${lead.id}`}
                      className="rounded px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 hover:text-blue-700 transition-colors">
                      → Ver
                    </Link>
                  </div>
                </FilaLead>
              );
            })}
          </SeccionCard>
        )}

        {/* ── Sección 6: Citas de hoy ── */}
        {seccionesData.citasHoy.length > 0 && (
          <SeccionCard color="purple" titulo="Citas de hoy" emoji="📅" count={seccionesData.citasHoy.length}>
            {seccionesData.citasHoy.map(cita => {
              const lead = cita.leads;
              const hora = format(new Date(cita.fecha_hora), "HH:mm");
              const estadoStyle = ESTADO_CITA_STYLE[cita.estado] ?? "bg-slate-100 text-slate-600";
              const tel = lead ? telLimpio(lead.telefono_whatsapp) : null;
              return (
                <FilaLead key={cita.id}>
                  <div className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
                    <span className="font-mono text-sm font-semibold text-slate-700 bg-slate-100 rounded px-2 py-0.5">
                      {hora}
                    </span>
                    <span className="text-xs text-slate-500">{TIPO_CITA_LABEL[cita.tipo] ?? cita.tipo}</span>
                    {lead && (
                      <Link href={`/leads/${cita.lead_id}`} className="font-medium text-slate-900 transition-colors truncate" style={{ color: "#414141" }} onMouseEnter={e => (e.currentTarget.style.color = "#ea650d")} onMouseLeave={e => (e.currentTarget.style.color = "#414141")}>
                        {nombreCompleto(lead)}
                        {lead.empresa && <span className="ml-1 font-normal text-slate-500">· {lead.empresa}</span>}
                      </Link>
                    )}
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${estadoStyle}`}>
                      {cita.estado.replace(/_/g, " ")}
                    </span>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1.5">
                    {tel && (
                      <a href={`https://wa.me/${tel}`} target="_blank" rel="noopener noreferrer"
                        className="rounded px-2 py-1 text-xs font-medium bg-green-100 text-green-700 hover:bg-green-200 transition-colors">
                        💬 WA
                      </a>
                    )}
                    <BtnAccion loading={guardandoAccion === `cita-${cita.id}`}
                      onClick={() => accionCita(cita.id, cita.lead_id, "realizada", "Cita marcada como realizada")}
                      className="bg-green-100 text-green-700 hover:bg-green-200">
                      ✓ Realizada
                    </BtnAccion>
                    <BtnAccion loading={guardandoAccion === `cita-noshow-${cita.id}`}
                      onClick={() => accionCita(cita.id, cita.lead_id, "no_show", "Cita: no show")}
                      className="bg-red-100 text-red-700 hover:bg-red-200">
                      ✗ No show
                    </BtnAccion>
                    <Link href={`/leads/${cita.lead_id}`}
                      className="rounded px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 hover:text-blue-700 transition-colors">
                      → Ver ficha
                    </Link>
                  </div>
                </FilaLead>
              );
            })}
          </SeccionCard>
        )}

      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const SECTION_COLORS: Record<string, { header: string; border: string; badge: string }> = {
  red:    { header: "bg-red-50 border-red-200",       border: "border-red-200",    badge: "bg-red-100 text-red-700"    },
  orange: { header: "bg-orange-50 border-orange-200", border: "border-orange-200", badge: "bg-orange-100 text-orange-700" },
  amber:  { header: "bg-amber-50 border-amber-200",   border: "border-amber-200",  badge: "bg-amber-100 text-amber-700"  },
  green:  { header: "bg-green-50 border-green-200",   border: "border-green-200",  badge: "bg-green-100 text-green-700"  },
  blue:   { header: "bg-blue-50 border-blue-200",     border: "border-blue-200",   badge: "bg-blue-100 text-blue-700"    },
  purple: { header: "bg-purple-50 border-purple-200", border: "border-purple-200", badge: "bg-purple-100 text-purple-700" },
};

function SeccionCard({ color, titulo, emoji, count, children }: {
  color: string; titulo: string; emoji: string; count: number; children: React.ReactNode;
}) {
  const c = SECTION_COLORS[color] ?? SECTION_COLORS.blue;
  return (
    <div className={`overflow-hidden rounded-xl border ${c.border} bg-white shadow-sm`}>
      <div className={`flex items-center justify-between px-4 py-3 border-b ${c.header}`}>
        <h2 className="text-sm font-semibold text-slate-800">{emoji} {titulo}</h2>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${c.badge}`}>{count}</span>
      </div>
      <div className="divide-y divide-slate-100">{children}</div>
    </div>
  );
}

function FilaLead({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors">
      {children}
    </div>
  );
}

function BtnAccion({ children, onClick, className, loading }: {
  children: React.ReactNode; onClick: () => void; className: string; loading: boolean;
}) {
  return (
    <button onClick={onClick} disabled={loading}
      className={`rounded px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${className}`}>
      {loading ? (
        <span className="inline-flex items-center gap-1">
          <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          ...
        </span>
      ) : children}
    </button>
  );
}
