"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
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
  telefono_whatsapp: string | null;
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
  calientesSinTocar: LeadRow[];
  respondieronSinSeguimiento: LeadRow[];
  mensajeEnviadoSinRespuesta: LeadRow[];
  citasHoy: CitaRow[];
};

// ─── Constants ────────────────────────────────────────────────────────────────

const ACCIONES_CONFIG: Record<string, string> = {
  llamar: "📞 Llamar",
  whatsapp: "💬 WhatsApp",
  email: "📧 Email",
  esperar_respuesta: "⏳ Esperar",
  enviar_info: "📎 Info",
  reunion: "📅 Reunión",
};

const ESTADOS_CERRADOS = ["cerrado_ganado", "cerrado_perdido", "descartado"];

const TIPO_CITA_LABEL: Record<string, string> = {
  llamada: "Llamada",
  reunion_presencial: "Reunión presencial",
  videollamada: "Videollamada",
};

const ESTADO_CITA_STYLE: Record<string, string> = {
  pendiente: "bg-amber-100 text-amber-700",
  confirmada: "bg-green-100 text-green-700",
  solicitud_pendiente: "bg-slate-100 text-slate-600",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function nombreCompleto(lead: { nombre: string; apellidos: string | null }) {
  return [lead.nombre, lead.apellidos].filter(Boolean).join(" ");
}

function tiempoDesde(fechaStr: string): string {
  try {
    return formatDistanceToNow(new Date(fechaStr), { locale: es, addSuffix: false });
  } catch {
    return "—";
  }
}

function diasDesde(fechaStr: string): number {
  return Math.floor((Date.now() - new Date(fechaStr).getTime()) / 86400000);
}

function horasDesde(fechaStr: string): number {
  return Math.floor((Date.now() - new Date(fechaStr).getTime()) / 3600000);
}

function badgeAccion(tipo: string | null) {
  if (!tipo) return null;
  const label = ACCIONES_CONFIG[tipo] ?? tipo;
  return (
    <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
      {label}
    </span>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function HoyPage() {
  const [seccionesData, setSeccionesData] = useState<SeccionesData>({
    accionesVencidas: [],
    accionesHoy: [],
    calientesSinTocar: [],
    respondieronSinSeguimiento: [],
    mensajeEnviadoSinRespuesta: [],
    citasHoy: [],
  });
  const [loading, setLoading] = useState(true);
  const [guardandoAccion, setGuardandoAccion] = useState<string | null>(null);

  const cargarDatos = useCallback(async () => {
    setLoading(true);
    try {
      const ahora = new Date();
      const hoy = ahora.toISOString().split("T")[0];
      const ayer = new Date(ahora.getTime() - 24 * 3600000).toISOString();
      const hace3dias = new Date(ahora.getTime() - 3 * 86400000).toISOString();
      const hace4dias = new Date(ahora.getTime() - 4 * 86400000).toISOString();
      const manana = new Date(ahora.getTime() + 24 * 3600000).toISOString();

      const SELECT_LEAD =
        "id, nombre, apellidos, empresa, ciudad, sector, telefono_whatsapp, estado, proxima_accion, proxima_accion_fecha, proxima_accion_nota, comercial_asignado";
      const SELECT_LEAD_WITH_UPDATED = SELECT_LEAD + ", updated_at";

      const [
        accionesVencidasRes,
        accionesHoyRes,
        calientesSinTocarRes,
        respondieronSinSeguimientoRes,
        mensajeEnviadoSinRespuestaRes,
        citasHoyRes,
      ] = await Promise.all([
        supabase
          .from("leads")
          .select(SELECT_LEAD)
          .lt("proxima_accion_fecha", ahora.toISOString())
          .not("proxima_accion", "is", null)
          .not("proxima_accion", "eq", "ninguna")
          .not("estado", "in", `(${ESTADOS_CERRADOS.join(",")})`)
          .order("proxima_accion_fecha", { ascending: true })
          .limit(20),

        supabase
          .from("leads")
          .select(SELECT_LEAD)
          .gte("proxima_accion_fecha", hoy)
          .lte("proxima_accion_fecha", manana)
          .not("proxima_accion", "is", null)
          .not("proxima_accion", "eq", "ninguna")
          .not("estado", "in", `(${ESTADOS_CERRADOS.join(",")})`)
          .order("proxima_accion_fecha", { ascending: true })
          .limit(20),

        supabase
          .from("leads")
          .select(SELECT_LEAD_WITH_UPDATED)
          .eq("temperatura", "caliente")
          .lt("updated_at", ayer)
          .not("estado", "in", `(${ESTADOS_CERRADOS.join(",")})`)
          .order("updated_at", { ascending: true })
          .limit(15),

        supabase
          .from("leads")
          .select(SELECT_LEAD_WITH_UPDATED)
          .eq("estado", "respondio")
          .lt("updated_at", hace3dias)
          .order("updated_at", { ascending: true })
          .limit(10),

        supabase
          .from("leads")
          .select(SELECT_LEAD_WITH_UPDATED)
          .eq("estado", "mensaje_enviado")
          .lt("updated_at", hace4dias)
          .order("updated_at", { ascending: true })
          .limit(10),

        supabase
          .from("appointments")
          .select("id, tipo, estado, fecha_hora, lead_id, leads(nombre, apellidos, empresa, telefono_whatsapp)")
          .gte("fecha_hora", `${hoy}T00:00:00`)
          .lt("fecha_hora", `${hoy}T23:59:59`)
          .not("estado", "eq", "cancelada")
          .not("estado", "eq", "realizada")
          .order("fecha_hora", { ascending: true })
          .limit(10),
      ]);

      setSeccionesData({
        accionesVencidas: (accionesVencidasRes.data as unknown as LeadRow[]) ?? [],
        accionesHoy: (accionesHoyRes.data as unknown as LeadRow[]) ?? [],
        calientesSinTocar: (calientesSinTocarRes.data as unknown as LeadRow[]) ?? [],
        respondieronSinSeguimiento: (respondieronSinSeguimientoRes.data as unknown as LeadRow[]) ?? [],
        mensajeEnviadoSinRespuesta: (mensajeEnviadoSinRespuestaRes.data as unknown as LeadRow[]) ?? [],
        citasHoy: (citasHoyRes.data as unknown as CitaRow[]) ?? [],
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  // ─── Quick action handler ────────────────────────────────────────────────

  const accionRapida = useCallback(
    async (
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
        // 1. Insert interaction
        await supabase.from("interactions").insert({
          lead_id: leadId,
          tipo: "nota_manual",
          mensaje,
          origen: "comercial",
        });

        // 2. Update lead if needed
        if (nuevoEstado || clearAccion) {
          const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
          if (nuevoEstado) updates.estado = nuevoEstado;
          if (clearAccion) {
            updates.proxima_accion = null;
            updates.proxima_accion_fecha = null;
          }
          await supabase.from("leads").update(updates).eq("id", leadId);
        }

        // 3. Optimistic removal from section
        setSeccionesData((prev) => {
          const updated = { ...prev };
          if (seccion === "citasHoy") {
            updated.citasHoy = prev.citasHoy.filter((c) => c.lead_id !== leadId);
          } else {
            (updated[seccion] as LeadRow[]) = (prev[seccion] as LeadRow[]).filter(
              (l) => l.id !== leadId
            );
          }
          return updated;
        });
      } finally {
        setGuardandoAccion(null);
      }
    },
    []
  );

  // Mark cita action
  const accionCita = useCallback(
    async (citaId: string, leadId: string, nuevoEstado: string, mensaje: string) => {
      const key = `cita-${citaId}`;
      setGuardandoAccion(key);
      try {
        await supabase.from("appointments").update({ estado: nuevoEstado, updated_at: new Date().toISOString() }).eq("id", citaId);
        await supabase.from("interactions").insert({
          lead_id: leadId,
          tipo: "nota_manual",
          mensaje,
          origen: "comercial",
        });
        setSeccionesData((prev) => ({
          ...prev,
          citasHoy: prev.citasHoy.filter((c) => c.id !== citaId),
        }));
      } finally {
        setGuardandoAccion(null);
      }
    },
    []
  );

  // ─── Total tasks ─────────────────────────────────────────────────────────

  const totalTareas =
    seccionesData.accionesVencidas.length +
    seccionesData.accionesHoy.length +
    seccionesData.calientesSinTocar.length +
    seccionesData.respondieronSinSeguimiento.length +
    seccionesData.mensajeEnviadoSinRespuesta.length +
    seccionesData.citasHoy.length;

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
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
              </p>
            ) : (
              <p className="mt-0.5 text-sm text-green-600 font-medium">Todo al día</p>
            )}
          </div>
          <div className="text-right">
            <p className="text-sm font-medium text-slate-700">
              {format(new Date(), "EEEE d 'de' MMMM", { locale: es })}
            </p>
            <p className="text-xs text-slate-400">
              {format(new Date(), "yyyy")}
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-4xl space-y-4 px-4 pt-4">

        {/* ── Empty state ── */}
        {totalTareas === 0 && (
          <div className="flex flex-col items-center justify-center rounded-xl border border-green-200 bg-green-50 py-16">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-3xl">
              ✅
            </div>
            <p className="text-lg font-semibold text-green-800">Todo al día</p>
            <p className="mt-1 text-sm text-green-600">No tienes tareas pendientes por ahora.</p>
          </div>
        )}

        {/* ── Section 1: Acciones vencidas ── */}
        {seccionesData.accionesVencidas.length > 0 && (
          <SeccionCard
            color="red"
            titulo="Acciones vencidas"
            emoji="🔴"
            count={seccionesData.accionesVencidas.length}
          >
            {seccionesData.accionesVencidas.map((lead) => {
              const diasVencido = lead.proxima_accion_fecha
                ? Math.floor((Date.now() - new Date(lead.proxima_accion_fecha).getTime()) / 86400000)
                : 0;
              return (
                <FilaLead key={lead.id}>
                  <div className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
                    <span className="font-medium text-slate-900 truncate">
                      {nombreCompleto(lead)}
                      {lead.empresa && (
                        <span className="ml-1 font-normal text-slate-500">· {lead.empresa}</span>
                      )}
                    </span>
                    {(lead.sector || lead.ciudad) && (
                      <span className="text-xs text-slate-400">
                        {[lead.sector, lead.ciudad].filter(Boolean).join(" · ")}
                      </span>
                    )}
                    {badgeAccion(lead.proxima_accion)}
                    <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                      venció hace {diasVencido === 0 ? "hoy" : `${diasVencido}d`}
                    </span>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <BtnAccion
                      loading={guardandoAccion === `${lead.id}-hecha`}
                      onClick={() =>
                        accionRapida(lead.id, "accionesVencidas", "hecha", "Acción marcada como hecha", undefined, true)
                      }
                      className="bg-green-100 text-green-700 hover:bg-green-200"
                    >
                      ✓ Hecha
                    </BtnAccion>
                    <BtnAccion
                      loading={guardandoAccion === `${lead.id}-no_cogio`}
                      onClick={() =>
                        accionRapida(lead.id, "accionesVencidas", "no_cogio", "Llamada: no cogió el teléfono")
                      }
                      className="bg-slate-100 text-slate-600 hover:bg-slate-200"
                    >
                      📞 No cogió
                    </BtnAccion>
                    <Link
                      href={`/leads/${lead.id}`}
                      className="rounded px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                    >
                      → Ver ficha
                    </Link>
                  </div>
                </FilaLead>
              );
            })}
          </SeccionCard>
        )}

        {/* ── Section 2: Hacer hoy ── */}
        {seccionesData.accionesHoy.length > 0 && (
          <SeccionCard
            color="orange"
            titulo="Hacer hoy"
            emoji="🟠"
            count={seccionesData.accionesHoy.length}
          >
            {seccionesData.accionesHoy.map((lead) => {
              const horaAccion = lead.proxima_accion_fecha
                ? format(new Date(lead.proxima_accion_fecha), "HH:mm")
                : null;
              return (
                <FilaLead key={lead.id}>
                  <div className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
                    <span className="font-medium text-slate-900 truncate">
                      {nombreCompleto(lead)}
                      {lead.empresa && (
                        <span className="ml-1 font-normal text-slate-500">· {lead.empresa}</span>
                      )}
                    </span>
                    {badgeAccion(lead.proxima_accion)}
                    {horaAccion && (
                      <span className="text-xs text-slate-500 font-mono">{horaAccion}</span>
                    )}
                    {lead.proxima_accion_nota && (
                      <span className="truncate text-xs text-slate-400 max-w-[180px]">
                        {lead.proxima_accion_nota}
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <BtnAccion
                      loading={guardandoAccion === `${lead.id}-hecha`}
                      onClick={() =>
                        accionRapida(lead.id, "accionesHoy", "hecha", "Acción del día marcada como hecha", undefined, true)
                      }
                      className="bg-green-100 text-green-700 hover:bg-green-200"
                    >
                      ✓ Hecha
                    </BtnAccion>
                    <Link
                      href={`/leads/${lead.id}`}
                      className="rounded px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                    >
                      → Ver ficha
                    </Link>
                  </div>
                </FilaLead>
              );
            })}
          </SeccionCard>
        )}

        {/* ── Section 3: Calientes sin tocar ── */}
        {seccionesData.calientesSinTocar.length > 0 && (
          <SeccionCard
            color="amber"
            titulo="Calientes sin tocar"
            emoji="🔥"
            count={seccionesData.calientesSinTocar.length}
          >
            {seccionesData.calientesSinTocar.map((lead) => {
              const horas = lead.updated_at ? horasDesde(lead.updated_at) : 0;
              const tiempoLabel = horas < 24 ? `${horas}h` : `${Math.floor(horas / 24)}d`;
              return (
                <FilaLead key={lead.id}>
                  <div className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
                    <span className="font-medium text-slate-900 truncate">
                      {nombreCompleto(lead)}
                      {lead.empresa && (
                        <span className="ml-1 font-normal text-slate-500">· {lead.empresa}</span>
                      )}
                    </span>
                    {lead.sector && (
                      <span className="text-xs text-slate-400">{lead.sector}</span>
                    )}
                    <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                      sin tocar {tiempoLabel}
                    </span>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <BtnAccion
                      loading={guardandoAccion === `${lead.id}-llamar`}
                      onClick={() =>
                        accionRapida(lead.id, "calientesSinTocar", "llamar", "Llamada realizada a lead caliente")
                      }
                      className="bg-blue-100 text-blue-700 hover:bg-blue-200"
                    >
                      📞 Llamar
                    </BtnAccion>
                    {lead.telefono_whatsapp && (
                      <a
                        href={`https://wa.me/${lead.telefono_whatsapp.replace(/\D/g, "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded px-2 py-1 text-xs font-medium bg-green-100 text-green-700 hover:bg-green-200 transition-colors"
                        onClick={() =>
                          accionRapida(lead.id, "calientesSinTocar", "whatsapp", "WhatsApp enviado a lead caliente")
                        }
                      >
                        💬 WhatsApp
                      </a>
                    )}
                    <Link
                      href={`/leads/${lead.id}`}
                      className="rounded px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                    >
                      → Ver
                    </Link>
                  </div>
                </FilaLead>
              );
            })}
          </SeccionCard>
        )}

        {/* ── Section 4: Respondieron, seguir ── */}
        {seccionesData.respondieronSinSeguimiento.length > 0 && (
          <SeccionCard
            color="green"
            titulo="Respondieron — seguir"
            emoji="✅"
            count={seccionesData.respondieronSinSeguimiento.length}
          >
            {seccionesData.respondieronSinSeguimiento.map((lead) => {
              const dias = lead.updated_at ? diasDesde(lead.updated_at) : 0;
              return (
                <FilaLead key={lead.id}>
                  <div className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
                    <span className="font-medium text-slate-900 truncate">
                      {nombreCompleto(lead)}
                      {lead.empresa && (
                        <span className="ml-1 font-normal text-slate-500">· {lead.empresa}</span>
                      )}
                    </span>
                    <span className="text-xs text-slate-500">
                      hace {dias === 0 ? "hoy" : `${dias}d`}
                    </span>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {lead.telefono_whatsapp && (
                      <a
                        href={`https://wa.me/${lead.telefono_whatsapp.replace(/\D/g, "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded px-2 py-1 text-xs font-medium bg-green-100 text-green-700 hover:bg-green-200 transition-colors"
                        onClick={() =>
                          accionRapida(
                            lead.id,
                            "respondieronSinSeguimiento",
                            "whatsapp",
                            "WhatsApp de seguimiento enviado"
                          )
                        }
                      >
                        💬 Responder
                      </a>
                    )}
                    <Link
                      href={`/leads/${lead.id}?tab=agenda`}
                      className="rounded px-2 py-1 text-xs font-medium bg-purple-100 text-purple-700 hover:bg-purple-200 transition-colors"
                    >
                      📅 Agendar cita
                    </Link>
                    <Link
                      href={`/leads/${lead.id}`}
                      className="rounded px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                    >
                      → Ver
                    </Link>
                  </div>
                </FilaLead>
              );
            })}
          </SeccionCard>
        )}

        {/* ── Section 5: Mensaje enviado sin respuesta ── */}
        {seccionesData.mensajeEnviadoSinRespuesta.length > 0 && (
          <SeccionCard
            color="blue"
            titulo="Mensaje enviado sin respuesta"
            emoji="📩"
            count={seccionesData.mensajeEnviadoSinRespuesta.length}
          >
            {seccionesData.mensajeEnviadoSinRespuesta.map((lead) => {
              const dias = lead.updated_at ? diasDesde(lead.updated_at) : 0;
              return (
                <FilaLead key={lead.id}>
                  <div className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
                    <span className="font-medium text-slate-900 truncate">
                      {nombreCompleto(lead)}
                      {lead.empresa && (
                        <span className="ml-1 font-normal text-slate-500">· {lead.empresa}</span>
                      )}
                    </span>
                    <span className="text-xs text-slate-500">
                      hace {dias === 0 ? "hoy" : `${dias}d`} sin respuesta
                    </span>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {lead.telefono_whatsapp && (
                      <a
                        href={`https://wa.me/${lead.telefono_whatsapp.replace(/\D/g, "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors"
                        onClick={() =>
                          accionRapida(
                            lead.id,
                            "mensajeEnviadoSinRespuesta",
                            "whatsapp",
                            "Recordatorio enviado por WhatsApp"
                          )
                        }
                      >
                        💬 Recordatorio
                      </a>
                    )}
                    <Link
                      href={`/leads/${lead.id}`}
                      className="rounded px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                    >
                      → Ver
                    </Link>
                  </div>
                </FilaLead>
              );
            })}
          </SeccionCard>
        )}

        {/* ── Section 6: Citas de hoy ── */}
        {seccionesData.citasHoy.length > 0 && (
          <SeccionCard
            color="purple"
            titulo="Citas de hoy"
            emoji="📅"
            count={seccionesData.citasHoy.length}
          >
            {seccionesData.citasHoy.map((cita) => {
              const lead = cita.leads;
              const hora = format(new Date(cita.fecha_hora), "HH:mm");
              const estadoStyle =
                ESTADO_CITA_STYLE[cita.estado] ?? "bg-slate-100 text-slate-600";
              return (
                <FilaLead key={cita.id}>
                  <div className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
                    <span className="font-mono text-sm font-semibold text-slate-700 bg-slate-100 rounded px-2 py-0.5">
                      {hora}
                    </span>
                    <span className="text-xs text-slate-500">
                      {TIPO_CITA_LABEL[cita.tipo] ?? cita.tipo}
                    </span>
                    {lead && (
                      <span className="font-medium text-slate-900 truncate">
                        {nombreCompleto(lead)}
                        {lead.empresa && (
                          <span className="ml-1 font-normal text-slate-500">· {lead.empresa}</span>
                        )}
                      </span>
                    )}
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${estadoStyle}`}>
                      {cita.estado.replace(/_/g, " ")}
                    </span>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <BtnAccion
                      loading={guardandoAccion === `cita-${cita.id}`}
                      onClick={() =>
                        accionCita(cita.id, cita.lead_id, "realizada", "Cita marcada como realizada")
                      }
                      className="bg-green-100 text-green-700 hover:bg-green-200"
                    >
                      ✓ Realizada
                    </BtnAccion>
                    <BtnAccion
                      loading={guardandoAccion === `cita-noshow-${cita.id}`}
                      onClick={() =>
                        accionCita(cita.id, cita.lead_id, "no_show", "Cita marcada como no show")
                      }
                      className="bg-red-100 text-red-700 hover:bg-red-200"
                    >
                      ✗ No show
                    </BtnAccion>
                    <Link
                      href={`/leads/${cita.lead_id}`}
                      className="rounded px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                    >
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

const SECTION_COLORS: Record<
  string,
  { header: string; border: string; badge: string }
> = {
  red: {
    header: "bg-red-50 border-red-200",
    border: "border-red-200",
    badge: "bg-red-100 text-red-700",
  },
  orange: {
    header: "bg-orange-50 border-orange-200",
    border: "border-orange-200",
    badge: "bg-orange-100 text-orange-700",
  },
  amber: {
    header: "bg-amber-50 border-amber-200",
    border: "border-amber-200",
    badge: "bg-amber-100 text-amber-700",
  },
  green: {
    header: "bg-green-50 border-green-200",
    border: "border-green-200",
    badge: "bg-green-100 text-green-700",
  },
  blue: {
    header: "bg-blue-50 border-blue-200",
    border: "border-blue-200",
    badge: "bg-blue-100 text-blue-700",
  },
  purple: {
    header: "bg-purple-50 border-purple-200",
    border: "border-purple-200",
    badge: "bg-purple-100 text-purple-700",
  },
};

function SeccionCard({
  color,
  titulo,
  emoji,
  count,
  children,
}: {
  color: string;
  titulo: string;
  emoji: string;
  count: number;
  children: React.ReactNode;
}) {
  const c = SECTION_COLORS[color] ?? SECTION_COLORS.blue;
  return (
    <div className={`overflow-hidden rounded-xl border ${c.border} bg-white shadow-sm`}>
      <div className={`flex items-center justify-between px-4 py-3 border-b ${c.header}`}>
        <h2 className="text-sm font-semibold text-slate-800">
          {emoji} {titulo}
        </h2>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${c.badge}`}>
          {count}
        </span>
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

function BtnAccion({
  children,
  onClick,
  className,
  loading,
}: {
  children: React.ReactNode;
  onClick: () => void;
  className: string;
  loading: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`rounded px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
    >
      {loading ? (
        <span className="inline-flex items-center gap-1">
          <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          ...
        </span>
      ) : (
        children
      )}
    </button>
  );
}
