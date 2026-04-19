"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { supabase } from "@/lib/supabase";

// ─── Types ─────────────────────────────────────────────────────────────────────

type Urgencia = "critico" | "importante" | "info";

type Notificacion = {
  id: string;
  urgencia: Urgencia;
  categoria: string;
  emoji: string;
  titulo: string;
  descripcion: string;
  href: string;
  lead_id?: string;
  fecha?: string;
  accion?: string;
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

const URGENCIA_CONFIG: Record<Urgencia, { label: string; color: string; dot: string; bg: string }> = {
  critico:    { label: "Crítico",    color: "text-red-700",    dot: "bg-red-500",    bg: "bg-red-50 border-red-200" },
  importante: { label: "Importante", color: "text-amber-700",  dot: "bg-amber-500",  bg: "bg-amber-50 border-amber-200" },
  info:       { label: "Info",       color: "text-blue-700",   dot: "bg-blue-400",   bg: "bg-blue-50 border-blue-200" },
};

const ESTADO_LABEL: Record<string, string> = {
  nuevo: "Nuevo", enriquecido: "Enriquecido", segmentado: "Segmentado",
  mensaje_generado: "Msg. generado", mensaje_enviado: "Contactado",
  respondio: "Respondió", cita_agendada: "Cita agendada",
  en_negociacion: "En negociación", cerrado_ganado: "Cerrado ganado",
};

function tiempoDesde(fecha: string): string {
  return formatDistanceToNow(new Date(fecha), { locale: es, addSuffix: true });
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function NotificacionesPage() {
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [descartados, setDescartados] = useState<Set<string>>(new Set());
  const [filtroUrgencia, setFiltroUrgencia] = useState<Urgencia | "todas">("todas");
  const [comId, setComId] = useState<string | null>(null);
  const [esDirector, setEsDirector] = useState(false);

  // Load dismissed IDs from localStorage
  useEffect(() => {
    const stored = localStorage.getItem("notif_descartadas");
    if (stored) {
      try { setDescartados(new Set(JSON.parse(stored))); } catch { /* ignore */ }
    }
  }, []);

  // Get current user
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user?.email) return;
      const { data } = await supabase.from("comerciales").select("id, rol").eq("email", user.email).single();
      if (data) {
        setComId(data.id);
        setEsDirector(["admin", "director", "manager"].includes(data.rol));
      }
    });
  }, []);

  const cargar = useCallback(async () => {
    if (!comId) return;
    setLoading(true);

    const ahora = new Date();
    const hace7d = new Date(ahora); hace7d.setDate(ahora.getDate() - 7);
    const en2h = new Date(ahora); en2h.setHours(ahora.getHours() + 2);
    const finDia = new Date(ahora); finDia.setHours(23, 59, 59, 999);

    // Build lead filter: director sees all, comercial sees own leads
    const leadFilter = esDirector ? {} : { comercial_asignado: comId };

    const [
      { data: respondieronSinSeguimiento },
      { data: negociacionParados },
      { data: citasProximas },
      { data: mensajesPendientes },
      { data: leadsSinAsignar },
      { data: accionesVencidas },
      { data: calientesSinTocar },
    ] = await Promise.all([
      // Leads that responded but no follow-up interaction since
      supabase.from("leads")
        .select("id, nombre, apellidos, empresa, updated_at")
        .eq("estado", "respondio")
        .not("estado", "in", "(cerrado_ganado,cerrado_perdido,descartado)")
        .lt("updated_at", new Date(ahora.getTime() - 48 * 3600 * 1000).toISOString())
        .order("updated_at", { ascending: true })
        .limit(10),

      // In-negotiation leads without activity for 5+ days
      supabase.from("leads")
        .select("id, nombre, apellidos, empresa, updated_at")
        .eq("estado", "en_negociacion")
        .lt("updated_at", new Date(ahora.getTime() - 5 * 24 * 3600 * 1000).toISOString())
        .order("updated_at", { ascending: true })
        .limit(8),

      // Appointments in the next 2 hours
      supabase.from("appointments")
        .select("id, tipo, fecha_hora, leads(id, nombre, apellidos, empresa)")
        .gte("fecha_hora", ahora.toISOString())
        .lte("fecha_hora", en2h.toISOString())
        .not("estado", "in", "(cancelada,no_asistio,realizada)")
        .order("fecha_hora", { ascending: true })
        .limit(5),

      // IA messages pending review
      supabase.from("mensajes_pendientes")
        .select("id, lead_id, created_at, leads(nombre, apellidos, empresa)")
        .eq("estado", "pendiente")
        .order("created_at", { ascending: false })
        .limit(10),

      // Unassigned leads (directors only)
      esDirector ? supabase.from("leads")
        .select("id, nombre, apellidos, empresa, created_at")
        .is("comercial_asignado", null)
        .not("estado", "in", "(cerrado_ganado,cerrado_perdido,descartado)")
        .order("created_at", { ascending: false })
        .limit(8) : Promise.resolve({ data: [] }),

      // Overdue actions for this user
      supabase.from("leads")
        .select("id, nombre, apellidos, empresa, proxima_accion, proxima_accion_fecha")
        .not("proxima_accion", "is", null)
        .neq("proxima_accion", "ninguna")
        .lt("proxima_accion_fecha", ahora.toISOString())
        .not("estado", "in", "(cerrado_ganado,cerrado_perdido,descartado)")
        .eq(esDirector ? "id" : "comercial_asignado", esDirector ? "00000000-0000-0000-0000-000000000000" : comId)
        .order("proxima_accion_fecha", { ascending: true })
        .limit(esDirector ? 0 : 10),

      // Hot leads without contact 7+ days (directors)
      esDirector ? supabase.from("leads")
        .select("id, nombre, apellidos, empresa, updated_at")
        .eq("temperatura", "caliente")
        .lt("updated_at", hace7d.toISOString())
        .not("estado", "in", "(cerrado_ganado,cerrado_perdido,descartado)")
        .order("updated_at", { ascending: true })
        .limit(8) : Promise.resolve({ data: [] }),
    ]);

    const items: Notificacion[] = [];

    // Overdue actions (critico for individual users)
    if (!esDirector) {
      for (const l of accionesVencidas ?? []) {
        const nombre = [l.nombre, l.apellidos].filter(Boolean).join(" ");
        const vencioHace = l.proxima_accion_fecha ? tiempoDesde(l.proxima_accion_fecha) : "";
        items.push({
          id: `accion-${l.id}`,
          urgencia: "critico",
          categoria: "Acción vencida",
          emoji: "⚠️",
          titulo: nombre,
          descripcion: `Acción "${l.proxima_accion}" vencida ${vencioHace}${l.empresa ? ` · ${l.empresa}` : ""}`,
          href: `/leads/${l.id}`,
          lead_id: l.id,
          fecha: l.proxima_accion_fecha ?? undefined,
        });
      }
    }

    // In-negotiation without activity (critico)
    for (const l of negociacionParados ?? []) {
      const nombre = [l.nombre, l.apellidos].filter(Boolean).join(" ");
      items.push({
        id: `neg-${l.id}`,
        urgencia: "critico",
        categoria: "Negociación parada",
        emoji: "🛑",
        titulo: nombre,
        descripcion: `En negociación sin actividad · última actualización ${tiempoDesde(l.updated_at)}${l.empresa ? ` · ${l.empresa}` : ""}`,
        href: `/leads/${l.id}`,
        lead_id: l.id,
        fecha: l.updated_at,
      });
    }

    // Respondió sin seguimiento (importante)
    for (const l of respondieronSinSeguimiento ?? []) {
      const nombre = [l.nombre, l.apellidos].filter(Boolean).join(" ");
      items.push({
        id: `resp-${l.id}`,
        urgencia: "importante",
        categoria: "Respuesta sin seguimiento",
        emoji: "💬",
        titulo: nombre,
        descripcion: `Respondió y lleva ${tiempoDesde(l.updated_at)} sin seguimiento${l.empresa ? ` · ${l.empresa}` : ""}`,
        href: `/leads/${l.id}`,
        lead_id: l.id,
        fecha: l.updated_at,
      });
    }

    // Hot leads without contact (importante, directors)
    for (const l of calientesSinTocar ?? []) {
      const nombre = [l.nombre, l.apellidos].filter(Boolean).join(" ");
      items.push({
        id: `cal-${l.id}`,
        urgencia: "importante",
        categoria: "Lead caliente inactivo",
        emoji: "🔥",
        titulo: nombre,
        descripcion: `Lead caliente sin actividad ${tiempoDesde(l.updated_at)}${l.empresa ? ` · ${l.empresa}` : ""}`,
        href: `/leads/${l.id}`,
        lead_id: l.id,
        fecha: l.updated_at,
      });
    }

    // IA messages pending (importante)
    for (const m of mensajesPendientes ?? []) {
      const lead = m.leads as unknown as { nombre: string; apellidos: string | null; empresa: string | null } | null;
      const nombre = lead ? [lead.nombre, lead.apellidos].filter(Boolean).join(" ") : "Lead";
      items.push({
        id: `msg-${m.id}`,
        urgencia: "importante",
        categoria: "Mensaje IA pendiente",
        emoji: "🤖",
        titulo: `Revisar mensaje para ${nombre}`,
        descripcion: `Generado ${tiempoDesde(m.created_at)}${lead?.empresa ? ` · ${lead.empresa}` : ""}`,
        href: `/mensajes`,
        lead_id: m.lead_id,
        fecha: m.created_at,
        accion: "Revisar →",
      });
    }

    // Unassigned leads (importante, directors)
    for (const l of leadsSinAsignar ?? []) {
      const nombre = [l.nombre, l.apellidos].filter(Boolean).join(" ");
      items.push({
        id: `sin-${l.id}`,
        urgencia: "importante",
        categoria: "Lead sin asignar",
        emoji: "👤",
        titulo: nombre,
        descripcion: `Sin comercial asignado · creado ${tiempoDesde(l.created_at)}${l.empresa ? ` · ${l.empresa}` : ""}`,
        href: `/leads/${l.id}`,
        lead_id: l.id,
        fecha: l.created_at,
      });
    }

    // Upcoming appointments (info)
    for (const c of citasProximas ?? []) {
      const lead = c.leads as unknown as { id: string; nombre: string; apellidos: string | null; empresa: string | null } | null;
      const nombre = lead ? [lead.nombre, lead.apellidos].filter(Boolean).join(" ") : "Lead";
      const horaFmt = new Date(c.fecha_hora).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
      items.push({
        id: `cita-${c.id}`,
        urgencia: "info",
        categoria: "Cita próxima",
        emoji: "📅",
        titulo: `${c.tipo === "llamada" ? "Llamada" : c.tipo === "videollamada" ? "Videollamada" : "Reunión"} con ${nombre}`,
        descripcion: `Hoy a las ${horaFmt}${lead?.empresa ? ` · ${lead.empresa}` : ""}`,
        href: `/agenda`,
        fecha: c.fecha_hora,
        accion: "Ver agenda →",
      });
    }

    setNotificaciones(items);
    setLoading(false);
  }, [comId, esDirector]);

  useEffect(() => {
    if (comId !== null) cargar();
  }, [cargar, comId]);

  function descartar(id: string) {
    const nuevos = new Set(descartados);
    nuevos.add(id);
    setDescartados(nuevos);
    localStorage.setItem("notif_descartadas", JSON.stringify([...nuevos]));
  }

  function descartarTodas() {
    const ids = notificaciones.map(n => n.id);
    const nuevos = new Set([...descartados, ...ids]);
    setDescartados(nuevos);
    localStorage.setItem("notif_descartadas", JSON.stringify([...nuevos]));
  }

  const visibles = notificaciones.filter(n => !descartados.has(n.id) && (filtroUrgencia === "todas" || n.urgencia === filtroUrgencia));

  const contadores = {
    critico: notificaciones.filter(n => !descartados.has(n.id) && n.urgencia === "critico").length,
    importante: notificaciones.filter(n => !descartados.has(n.id) && n.urgencia === "importante").length,
    info: notificaciones.filter(n => !descartados.has(n.id) && n.urgencia === "info").length,
  };
  const totalActivo = contadores.critico + contadores.importante + contadores.info;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Notificaciones</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {loading ? "Calculando alertas..." : totalActivo === 0 ? "Todo al día · sin alertas pendientes" : `${totalActivo} alerta${totalActivo !== 1 ? "s" : ""} pendiente${totalActivo !== 1 ? "s" : ""}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={cargar}
            className="px-3 py-2 text-sm font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
          >
            ↺ Actualizar
          </button>
          {totalActivo > 0 && (
            <button
              onClick={descartarTodas}
              className="px-3 py-2 text-sm font-medium rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
            >
              Marcar todas como leídas
            </button>
          )}
        </div>
      </div>

      {/* Urgency filter */}
      <div className="flex items-center gap-2 flex-wrap">
        {([
          { key: "todas", label: "Todas", count: totalActivo },
          { key: "critico", label: "Crítico", count: contadores.critico },
          { key: "importante", label: "Importante", count: contadores.importante },
          { key: "info", label: "Informativo", count: contadores.info },
        ] as const).map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => setFiltroUrgencia(key as typeof filtroUrgencia)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-full transition-colors ${
              filtroUrgencia === key
                ? "bg-slate-900 text-white"
                : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {label}
            {count > 0 && (
              <span className={`text-xs font-semibold rounded-full px-1.5 py-0 leading-5 ${
                filtroUrgencia === key ? "bg-white/20 text-white" : (
                  key === "critico" ? "bg-red-100 text-red-700" :
                  key === "importante" ? "bg-amber-100 text-amber-700" :
                  "bg-blue-100 text-blue-700"
                )
              }`}>
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Feed */}
      {loading ? (
        <div className="py-24 text-center text-sm text-slate-400">Calculando alertas...</div>
      ) : visibles.length === 0 ? (
        <div className="py-24 text-center">
          <p className="text-4xl mb-3">✅</p>
          <p className="text-base font-semibold text-slate-700 mb-1">Todo al día</p>
          <p className="text-sm text-slate-400">
            {descartados.size > 0
              ? <>Has descartado {descartados.size} notificaciones. <button onClick={() => { setDescartados(new Set()); localStorage.removeItem("notif_descartadas"); }} className="underline text-orange-500">Restaurar</button></>
              : "No hay alertas pendientes ahora mismo"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Group by urgency */}
          {(["critico", "importante", "info"] as Urgencia[]).map(urg => {
            const grupo = visibles.filter(n => n.urgencia === urg);
            if (grupo.length === 0) return null;
            const cfg = URGENCIA_CONFIG[urg];
            return (
              <div key={urg}>
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                  <p className={`text-xs font-semibold uppercase tracking-wide ${cfg.color}`}>{cfg.label}</p>
                  <div className="flex-1 h-px bg-slate-200" />
                  <span className="text-xs text-slate-400">{grupo.length}</span>
                </div>

                <div className="space-y-2">
                  {grupo.map(n => (
                    <div key={n.id} className={`relative flex items-start gap-4 px-4 py-3.5 rounded-xl border ${cfg.bg} group`}>
                      <span className="text-xl flex-shrink-0 mt-0.5">{n.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{n.categoria}</p>
                        </div>
                        <p className="text-sm font-semibold text-slate-800">{n.titulo}</p>
                        <p className="text-xs text-slate-600 mt-0.5">{n.descripcion}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
                        {n.lead_id || n.href ? (
                          <Link
                            href={n.href}
                            className="text-xs font-medium text-slate-700 hover:text-orange-600 border border-slate-300 hover:border-orange-300 rounded-md px-2 py-1 transition-colors bg-white"
                          >
                            {n.accion ?? "Ver →"}
                          </Link>
                        ) : null}
                        <button
                          onClick={() => descartar(n.id)}
                          title="Marcar como leída"
                          className="text-slate-300 hover:text-slate-500 transition-colors p-1 rounded"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer: link to diagnostics */}
      <div className="pt-4 border-t border-slate-200">
        <p className="text-xs text-slate-400">
          Estas alertas se calculan en tiempo real.{" "}
          <Link href="/diagnostico" className="text-orange-500 hover:underline">Ver diagnóstico completo del CRM →</Link>
        </p>
      </div>
    </div>
  );
}
