"use client";

import Link from "next/link";
import { formatDistanceToNow, format, isToday, isTomorrow, isPast } from "date-fns";
import { es } from "date-fns/locale";
import { useState, useRef, useEffect } from "react";
import { PrioridadBadge } from "./PrioridadBadge";
import { NivelInteresBar } from "./NivelInteresBar";
import { FuenteBadge } from "./FuenteBadge";
import type { LeadDashboard } from "@/lib/supabase";
import { supabase } from "@/lib/supabase";

// ── Estado badge ──────────────────────────────────────────────────────────────
const ESTADO_CFG: Record<string, { label: string; cls: string }> = {
  nuevo:             { label: "Nuevo",       cls: "bg-slate-100 text-slate-600"     },
  enriquecido:       { label: "Enriquecido", cls: "bg-sky-50 text-sky-700"          },
  segmentado:        { label: "Segmentado",  cls: "bg-blue-50 text-blue-700"        },
  mensaje_generado:  { label: "Msg. listo",  cls: "bg-cyan-50 text-cyan-700"        },
  mensaje_enviado:   { label: "Contactado",  cls: "bg-orange-50 text-orange-700"    },
  respondio:         { label: "Respondió",   cls: "bg-amber-50 text-amber-700 font-semibold" },
  cita_agendada:     { label: "Cita",        cls: "bg-orange-100 text-orange-800"   },
  en_negociacion:    { label: "Negociando",  cls: "bg-violet-50 text-violet-700"    },
  cerrado_ganado:    { label: "✓ Ganado",    cls: "bg-emerald-50 text-emerald-700"  },
  cerrado_perdido:   { label: "Perdido",     cls: "bg-red-50 text-red-600"          },
};

function EstadoBadge({ estado }: { estado: string }) {
  const cfg = ESTADO_CFG[estado] ?? { label: estado, cls: "bg-slate-100 text-slate-500" };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border border-transparent ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

// ── Próxima acción label ───────────────────────────────────────────────────────
const ACCION_LABEL: Record<string, string> = {
  llamar:            "Llamar",
  whatsapp:          "WhatsApp",
  email:             "Email",
  esperar_respuesta: "Esperar",
  enviar_info:       "Enviar info",
  reunion:           "Reunión",
};

function proximaAccionTexto(
  proxima_accion: string | null,
  proxima_accion_fecha: string | null,
): { text: string; urgente: boolean } | null {
  if (!proxima_accion || proxima_accion === "ninguna") return null;
  const label = ACCION_LABEL[proxima_accion] ?? proxima_accion;
  if (!proxima_accion_fecha) return { text: label, urgente: false };

  const fecha = new Date(proxima_accion_fecha);
  if (isPast(fecha) && !isToday(fecha)) {
    return { text: `${label} · vencida`, urgente: true };
  }
  if (isToday(fecha)) return { text: `Hoy · ${label}`, urgente: false };
  if (isTomorrow(fecha)) return { text: `Mañana · ${label}`, urgente: false };
  return { text: `${format(fecha, "d MMM", { locale: es })} · ${label}`, urgente: false };
}

// ── Productos label ───────────────────────────────────────────────────────────
const PRODUCTOS_LABEL: Record<string, string> = {
  contigo_futuro:   "C. Futuro",
  sialp:            "SIALP",
  contigo_autonomo: "Autónomo",
  contigo_familia:  "Familia",
  contigo_pyme:     "Pyme",
  contigo_senior:   "Senior",
  liderplus:        "LiderPlus",
  sanitas_salud:    "Sanitas",
  mihogar:          "MiHogar",
  hipotecas:        "Hipoteca",
};

// ── Transiciones válidas por estado ───────────────────────────────────────────
const TRANSICIONES: Record<string, { estado: string; label: string; color: string }[]> = {
  nuevo:            [{ estado: "segmentado",      label: "→ Segmentado",   color: "#3b82f6" }, { estado: "mensaje_enviado", label: "→ Contactado", color: "#ea650d" }, { estado: "cerrado_perdido", label: "✕ Descartar", color: "#ef4444" }],
  enriquecido:      [{ estado: "segmentado",      label: "→ Segmentado",   color: "#3b82f6" }, { estado: "mensaje_enviado", label: "→ Contactado", color: "#ea650d" }, { estado: "cerrado_perdido", label: "✕ Descartar", color: "#ef4444" }],
  segmentado:       [{ estado: "mensaje_enviado", label: "→ Contactado",   color: "#ea650d" }, { estado: "cerrado_perdido", label: "✕ Descartar", color: "#ef4444" }],
  mensaje_generado: [{ estado: "mensaje_enviado", label: "→ Enviado",      color: "#ea650d" }, { estado: "cerrado_perdido", label: "✕ Descartar", color: "#ef4444" }],
  mensaje_enviado:  [{ estado: "respondio",       label: "→ Respondió",    color: "#f59e0b" }, { estado: "cerrado_perdido", label: "✕ Descartar", color: "#ef4444" }],
  respondio:        [{ estado: "cita_agendada",   label: "→ Cita",         color: "#f97316" }, { estado: "en_negociacion", label: "→ Negociando", color: "#7c3aed" }, { estado: "cerrado_perdido", label: "✕ Perdido", color: "#ef4444" }],
  cita_agendada:    [{ estado: "en_negociacion",  label: "→ Negociando",   color: "#7c3aed" }, { estado: "respondio", label: "← Atrás", color: "#6b7280" }],
  en_negociacion:   [{ estado: "cerrado_ganado",  label: "✓ Ganado",       color: "#10b981" }, { estado: "cerrado_perdido", label: "✕ Perdido", color: "#ef4444" }],
};

// ── Component ─────────────────────────────────────────────────────────────────
export function LeadRow({ lead, onEstadoCambiado }: { lead: LeadDashboard; onEstadoCambiado?: (id: string, nuevoEstado: string) => void }) {
  const nombre = [lead.nombre, lead.apellidos].filter(Boolean).join(" ");
  const sublinea = [lead.cargo, lead.empresa].filter(Boolean).join(" · ");
  const [estadoActual, setEstadoActual] = useState(lead.estado);
  const [avanzando, setAvanzando] = useState(false);
  const [generandoMsg, setGenerandoMsg] = useState<"idle" | "generando" | "ok" | "error">("idle");

  const siguienteTransicion = TRANSICIONES[estadoActual]?.[0] ?? null;

  async function avanzarEstado() {
    if (!siguienteTransicion || avanzando) return;
    setAvanzando(true);
    await supabase.from("leads").update({ estado: siguienteTransicion.estado, updated_at: new Date().toISOString() }).eq("id", lead.id);
    setEstadoActual(siguienteTransicion.estado);
    setAvanzando(false);
    onEstadoCambiado?.(lead.id, siguienteTransicion.estado);
  }

  async function generarMensajeIA() {
    setGenerandoMsg("generando");
    try {
      const resp = await fetch("/api/backend/mensajes/generar-uno", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: lead.id }),
      });
      setGenerandoMsg(resp.ok ? "ok" : "error");
      setTimeout(() => setGenerandoMsg("idle"), 3000);
    } catch {
      setGenerandoMsg("error");
      setTimeout(() => setGenerandoMsg("idle"), 3000);
    }
  }

  const puedeGenerarMsg = ["nuevo", "enriquecido", "segmentado"].includes(estadoActual) && !!lead.telefono_whatsapp;

  const accionInfo = proximaAccionTexto(lead.proxima_accion, lead.proxima_accion_fecha);

  const ultimaActividad = lead.ultima_interaccion
    ? formatDistanceToNow(new Date(lead.ultima_interaccion), { locale: es, addSuffix: true })
    : null;

  const alertaAtencion = lead.horas_sin_atencion && lead.horas_sin_atencion > 2;

  // Número para WhatsApp / llamada
  const tel = lead.telefono_whatsapp ?? lead.telefono ?? null;
  const waLink = tel ? `https://wa.me/${tel.replace(/\D/g, "")}` : null;
  const telLink = tel ? `tel:${tel.replace(/\s/g, "")}` : null;

  return (
    <div className={`group flex items-center gap-3 px-4 py-3 hover:bg-slate-50 border-b border-slate-100 transition-colors ${alertaAtencion ? "bg-amber-50/40" : ""}`}>

      {/* Nombre / Estado */}
      <div className="w-52 min-w-0">
        <div className="flex items-center gap-1.5 mb-1">
          <EstadoBadge estado={estadoActual} />
          {accionInfo?.urgente && (
            <span className="text-xs text-red-500 font-medium">⚠</span>
          )}
        </div>
        <Link href={`/leads/${lead.id}`} className="block group/link">
          <p className="text-sm font-semibold text-slate-800 truncate leading-tight">
            {nombre || "Sin nombre"}
          </p>
          {sublinea && (
            <p className="text-xs text-slate-400 truncate">{sublinea}</p>
          )}
        </Link>
      </div>

      {/* Ciudad + fuente */}
      <div className="w-28 min-w-0 hidden md:block">
        <p className="text-xs text-slate-500 truncate">{lead.ciudad ?? "—"}</p>
        <div className="mt-0.5">
          <FuenteBadge fuente={lead.fuente ?? null} />
        </div>
      </div>

      {/* Productos */}
      <div className="flex-1 min-w-0 hidden lg:flex items-center gap-1 flex-wrap">
        {lead.productos_recomendados && lead.productos_recomendados.length > 0 ? (
          lead.productos_recomendados.slice(0, 3).map((p) => (
            <span
              key={p}
              className={`text-xs px-1.5 py-0.5 rounded border ${
                p === lead.producto_interes_principal
                  ? "border-orange-200 font-medium text-orange-700 bg-orange-50"
                  : "bg-slate-50 border-slate-200 text-slate-500"
              }`}
            >
              {PRODUCTOS_LABEL[p] ?? p}
            </span>
          ))
        ) : (
          <span className="text-xs text-slate-300">—</span>
        )}
      </div>

      {/* Interés */}
      <div className="w-28 hidden sm:block">
        <NivelInteresBar nivel={lead.nivel_interes} />
      </div>

      {/* Prioridad */}
      <div className="w-14 text-center hidden sm:block">
        <PrioridadBadge prioridad={lead.prioridad} />
      </div>

      {/* Actividad / próxima acción */}
      <div className="w-36 text-right hidden md:block">
        {accionInfo ? (
          <p className={`text-xs font-medium ${accionInfo.urgente ? "text-red-500" : ""}`} style={accionInfo.urgente ? undefined : { color: "#ea650d" }}>
            {accionInfo.text}
          </p>
        ) : lead.proxima_cita ? (
          <p className="text-xs font-medium" style={{ color: "#ea650d" }}>
            Cita {format(new Date(lead.proxima_cita), "d MMM", { locale: es })}
          </p>
        ) : ultimaActividad ? (
          <p className="text-xs text-slate-400">{ultimaActividad}</p>
        ) : (
          <p className="text-xs text-slate-300">Sin actividad</p>
        )}
        {lead.comercial_nombre && (
          <p className="text-xs text-slate-300 mt-0.5 truncate">{lead.comercial_nombre}</p>
        )}
      </div>

      {/* Acciones rápidas — visibles al hacer hover */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {puedeGenerarMsg && (
          <button
            onClick={(e) => { e.stopPropagation(); generarMensajeIA(); }}
            disabled={generandoMsg === "generando"}
            title="Generar mensaje IA"
            className="px-2 py-1 text-xs font-semibold rounded-lg border transition-colors disabled:opacity-50"
            style={
              generandoMsg === "ok" ? { color: "#16a34a", borderColor: "#bbf7d0", background: "#f0fdf4" }
              : generandoMsg === "error" ? { color: "#dc2626", borderColor: "#fca5a5", background: "#fef2f2" }
              : { color: "#ea650d", borderColor: "#f5a677", background: "#fff5f0" }
            }
          >
            {generandoMsg === "generando" ? "..." : generandoMsg === "ok" ? "✓ Listo" : generandoMsg === "error" ? "Error" : "✦ IA"}
          </button>
        )}
        {waLink && (
          <a
            href={waLink}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            title="Abrir WhatsApp"
            className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
          </a>
        )}
        {telLink && (
          <a
            href={telLink}
            onClick={(e) => e.stopPropagation()}
            title="Llamar"
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 10.8a19.79 19.79 0 01-3.07-8.67A2 2 0 012 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92z"/>
            </svg>
          </a>
        )}
        {siguienteTransicion && !["cerrado_ganado","cerrado_perdido"].includes(estadoActual) && (
          <button
            onClick={avanzarEstado}
            disabled={avanzando}
            title={siguienteTransicion.label}
            className="px-2 py-1 text-xs font-medium rounded-lg border transition-colors disabled:opacity-50"
            style={{ color: siguienteTransicion.color, borderColor: siguienteTransicion.color + "40", background: siguienteTransicion.color + "10" }}
          >
            {avanzando ? "..." : siguienteTransicion.label}
          </button>
        )}
        <Link
          href={`/leads/${lead.id}`}
          className="p-1.5 rounded-lg text-slate-400 hover:bg-orange-50 transition-colors"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 18l6-6-6-6"/>
          </svg>
        </Link>
      </div>

      {/* Flecha siempre visible en mobile */}
      <div className="text-slate-300 text-lg group-hover:hidden sm:hidden">›</div>
    </div>
  );
}
