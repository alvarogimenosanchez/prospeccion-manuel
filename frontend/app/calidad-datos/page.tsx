"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { usePermisos } from "@/components/PermisosProvider";
import { SinAcceso } from "@/components/SinAcceso";

// ─── Types ─────────────────────────────────────────────────────────────────────

type LeadMin = {
  id: string;
  nombre: string;
  apellidos: string | null;
  empresa: string | null;
  telefono: string | null;
  telefono_whatsapp: string | null;
  email: string | null;
  estado: string;
  sector: string | null;
  producto_interes_principal: string | null;
  comercial_asignado: string | null;
  ciudad: string | null;
  created_at: string;
};

type Problema = {
  id: string;
  label: string;
  descripcion: string;
  emoji: string;
  gravedad: "alta" | "media" | "baja";
  leads: LeadMin[];
  campo: string;
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

const GRAVEDAD_CONFIG = {
  alta:  { label: "Alta",  color: "text-red-700",   dot: "bg-red-500",   bg: "bg-red-50 border-red-200" },
  media: { label: "Media", color: "text-amber-700", dot: "bg-amber-500", bg: "bg-amber-50 border-amber-200" },
  baja:  { label: "Baja",  color: "text-blue-700",  dot: "bg-blue-400",  bg: "bg-blue-50 border-blue-200" },
};

const ESTADO_LABEL: Record<string, string> = {
  nuevo: "Nuevo", enriquecido: "Enriquecido", segmentado: "Segmentado",
  mensaje_generado: "Msg. generado", mensaje_enviado: "Contactado",
  respondio: "Respondió", cita_agendada: "Cita agendada",
  en_negociacion: "Negociación", cerrado_ganado: "Ganado",
};

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function CalidadDatosPage() {
  const { puede, cargando: cargandoPermisos } = usePermisos();
  const [problemas, setProblemas] = useState<Problema[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandido, setExpandido] = useState<string | null>(null);
  const [filtroGravedad, setFiltroGravedad] = useState<"todas" | "alta" | "media" | "baja">("todas");

  const cargar = useCallback(async () => {
    setLoading(true);

    const { data: leads } = await supabase
      .from("leads")
      .select("id, nombre, apellidos, empresa, telefono, telefono_whatsapp, email, estado, sector, producto_interes_principal, comercial_asignado, ciudad, created_at")
      .not("estado", "in", "(cerrado_ganado,cerrado_perdido,descartado)")
      .order("created_at", { ascending: false })
      .limit(3000);

    if (!leads) { setLoading(false); return; }

    const l = leads as LeadMin[];

    const sinContacto = l.filter(lead => !lead.telefono && !lead.telefono_whatsapp && !lead.email);
    const sinTelefono = l.filter(lead => !lead.telefono && !lead.telefono_whatsapp && lead.email);
    const sinEmail = l.filter(lead => lead.email === null && (lead.telefono || lead.telefono_whatsapp));
    const sinEmpresa = l.filter(lead => !lead.empresa && ["autonomo", "pyme", "empresa"].some(t => lead.estado !== "nuevo"));
    const sinProducto = l.filter(lead => !lead.producto_interes_principal && !["nuevo", "enriquecido"].includes(lead.estado));
    const sinSector = l.filter(lead => !lead.sector);
    const sinCiudad = l.filter(lead => !lead.ciudad);
    const sinAsignar = l.filter(lead => !lead.comercial_asignado);
    const nombreIncompleto = l.filter(lead => !lead.apellidos && lead.nombre && lead.nombre.split(" ").length < 2);

    const ps: Problema[] = [];

    if (sinContacto.length > 0) ps.push({
      id: "sin_contacto", label: "Sin ningún dato de contacto", emoji: "🚫",
      descripcion: "No tienen teléfono, WhatsApp ni email. Imposible contactarlos.",
      gravedad: "alta", leads: sinContacto, campo: "Teléfono + Email",
    });
    if (sinAsignar.length > 0) ps.push({
      id: "sin_asignar", label: "Sin comercial asignado", emoji: "👤",
      descripcion: "Nadie es responsable de dar seguimiento a estos leads.",
      gravedad: "alta", leads: sinAsignar, campo: "Comercial asignado",
    });
    if (sinTelefono.length > 0) ps.push({
      id: "sin_telefono", label: "Sin teléfono (solo email)", emoji: "📵",
      descripcion: "Solo tienen email. Contactar por WhatsApp es imposible.",
      gravedad: "media", leads: sinTelefono, campo: "Teléfono / WhatsApp",
    });
    if (sinProducto.length > 0) ps.push({
      id: "sin_producto", label: "Sin producto de interés definido", emoji: "🎯",
      descripcion: "Leads en estado avanzado sin producto asignado. No se puede personalizar la oferta.",
      gravedad: "media", leads: sinProducto, campo: "Producto de interés",
    });
    if (sinEmail.length > 0) ps.push({
      id: "sin_email", label: "Sin email", emoji: "📧",
      descripcion: "Solo tienen teléfono. No se puede enviar documentación ni emails de seguimiento.",
      gravedad: "media", leads: sinEmail, campo: "Email",
    });
    if (nombreIncompleto.length > 0) ps.push({
      id: "nombre_incompleto", label: "Solo nombre de pila (sin apellidos)", emoji: "📝",
      descripcion: "El nombre está incompleto. Dificulta la personalización y la búsqueda.",
      gravedad: "baja", leads: nombreIncompleto, campo: "Apellidos",
    });
    if (sinSector.length > 0) ps.push({
      id: "sin_sector", label: "Sin sector definido", emoji: "🏭",
      descripcion: "Sin sector, el scoring y la segmentación son menos precisos.",
      gravedad: "baja", leads: sinSector.slice(0, 200), campo: "Sector",
    });
    if (sinCiudad.length > 0) ps.push({
      id: "sin_ciudad", label: "Sin ciudad / ubicación", emoji: "📍",
      descripcion: "Sin ubicación no se puede usar el mapa ni filtrar por zona.",
      gravedad: "baja", leads: sinCiudad.slice(0, 200), campo: "Ciudad",
    });

    setProblemas(ps);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!cargandoPermisos) cargar();
  }, [cargar, cargandoPermisos]);

  if (!cargandoPermisos && !puede("ver_metricas") && !puede("asignar_leads")) return <SinAcceso />;

  const visibles = problemas.filter(p => filtroGravedad === "todas" || p.gravedad === filtroGravedad);
  const totalLeadsAfectados = new Set(problemas.flatMap(p => p.leads.map(l => l.id))).size;
  const scoreCalidad = problemas.length === 0 ? 100 : Math.max(0, Math.round(100 - (
    problemas.filter(p => p.gravedad === "alta").reduce((s, p) => s + p.leads.length * 3, 0) +
    problemas.filter(p => p.gravedad === "media").reduce((s, p) => s + p.leads.length * 1.5, 0) +
    problemas.filter(p => p.gravedad === "baja").reduce((s, p) => s + p.leads.length * 0.5, 0)
  ) / 10));

  const scoreColor = scoreCalidad >= 80 ? "#10b981" : scoreCalidad >= 60 ? "#f59e0b" : "#ef4444";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Calidad de datos</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {loading ? "Analizando..." : `${totalLeadsAfectados} leads activos con datos incompletos`}
          </p>
        </div>
        <button onClick={cargar} className="px-3 py-2 text-sm font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
          ↺ Actualizar
        </button>
      </div>

      {/* Score KPI */}
      {!loading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-slate-200 px-5 py-4 flex items-center gap-4 col-span-2 md:col-span-1">
            <div className="relative w-14 h-14 flex-shrink-0">
              <svg width="56" height="56" viewBox="0 0 56 56" className="-rotate-90">
                <circle cx="28" cy="28" r="22" fill="none" stroke="#f1edeb" strokeWidth="6" />
                <circle cx="28" cy="28" r="22" fill="none" stroke={scoreColor} strokeWidth="6"
                  strokeDasharray={`${2 * Math.PI * 22 * scoreCalidad / 100} ${2 * Math.PI * 22}`}
                  strokeLinecap="round" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-sm font-bold" style={{ color: scoreColor }}>{scoreCalidad}</span>
              </div>
            </div>
            <div>
              <p className="text-xs text-slate-500">Score calidad</p>
              <p className="text-sm font-semibold" style={{ color: scoreColor }}>
                {scoreCalidad >= 80 ? "Buena" : scoreCalidad >= 60 ? "Mejorable" : "Deficiente"}
              </p>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
            <p className="text-xs text-slate-500 mb-1">Problemas alta prioridad</p>
            <p className="text-2xl font-bold text-red-600">{problemas.filter(p => p.gravedad === "alta").reduce((s, p) => s + p.leads.length, 0)}</p>
            <p className="text-xs text-slate-400">leads afectados</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
            <p className="text-xs text-slate-500 mb-1">Problemas media prioridad</p>
            <p className="text-2xl font-bold text-amber-600">{problemas.filter(p => p.gravedad === "media").reduce((s, p) => s + p.leads.length, 0)}</p>
            <p className="text-xs text-slate-400">leads afectados</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
            <p className="text-xs text-slate-500 mb-1">Tipos de problema</p>
            <p className="text-2xl font-bold text-slate-800">{problemas.length}</p>
            <p className="text-xs text-slate-400">categorías detectadas</p>
          </div>
        </div>
      )}

      {/* Gravity filter */}
      <div className="flex items-center gap-2 flex-wrap">
        {(["todas", "alta", "media", "baja"] as const).map(g => (
          <button
            key={g}
            onClick={() => setFiltroGravedad(g)}
            className={`px-3 py-1.5 text-sm font-medium rounded-full transition-colors ${
              filtroGravedad === g
                ? "bg-slate-900 text-white"
                : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {g === "todas" ? "Todos" : g.charAt(0).toUpperCase() + g.slice(1)}
            {g !== "todas" && (
              <span className="ml-1.5 text-xs opacity-70">
                {problemas.filter(p => p.gravedad === g).reduce((s, p) => s + p.leads.length, 0)}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Problems list */}
      {loading ? (
        <div className="py-24 text-center text-sm text-slate-400">Analizando calidad de datos...</div>
      ) : visibles.length === 0 ? (
        <div className="py-24 text-center">
          <p className="text-4xl mb-3">✅</p>
          <p className="text-base font-semibold text-slate-700 mb-1">Datos en perfecto estado</p>
          <p className="text-sm text-slate-400">No se detectaron problemas de calidad en los leads activos.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visibles.map(prob => {
            const cfg = GRAVEDAD_CONFIG[prob.gravedad];
            const abierto = expandido === prob.id;
            return (
              <div key={prob.id} className={`bg-white rounded-xl border overflow-hidden ${abierto ? "border-slate-300" : "border-slate-200"}`}>
                {/* Problem header */}
                <button
                  onClick={() => setExpandido(abierto ? null : prob.id)}
                  className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-slate-50 transition-colors"
                >
                  <span className="text-xl flex-shrink-0">{prob.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <div className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                      <span className={`text-xs font-semibold uppercase tracking-wide ${cfg.color}`}>{cfg.label} prioridad</span>
                    </div>
                    <p className="text-sm font-semibold text-slate-800">{prob.label}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{prob.descripcion}</p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="text-right">
                      <p className="text-lg font-bold text-slate-800">{prob.leads.length}</p>
                      <p className="text-xs text-slate-400">leads</p>
                    </div>
                    <svg
                      width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                      className={`text-slate-400 transition-transform ${abierto ? "rotate-180" : ""}`}
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </div>
                </button>

                {/* Expanded lead list */}
                {abierto && (
                  <div className="border-t border-slate-100">
                    <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                      <p className="text-xs text-slate-500">Campo a completar: <strong>{prob.campo}</strong></p>
                      <Link href="/leads" className="text-xs text-orange-500 hover:underline font-medium">
                        Ir a lista de leads →
                      </Link>
                    </div>
                    <div className="divide-y divide-slate-50 max-h-96 overflow-y-auto">
                      {prob.leads.slice(0, 50).map(lead => {
                        const nombre = [lead.nombre, lead.apellidos].filter(Boolean).join(" ");
                        return (
                          <div key={lead.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-800 truncate">{nombre}</p>
                              <p className="text-xs text-slate-400 truncate">
                                {[lead.empresa, ESTADO_LABEL[lead.estado] ?? lead.estado, lead.ciudad].filter(Boolean).join(" · ")}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className="text-xs text-slate-400">
                                {new Date(lead.created_at).toLocaleDateString("es-ES", { day: "2-digit", month: "short" })}
                              </span>
                              <Link
                                href={`/leads/${lead.id}`}
                                className="text-xs font-medium text-slate-500 hover:text-orange-600 border border-slate-200 hover:border-orange-300 rounded-md px-2 py-1 transition-colors"
                              >
                                Editar →
                              </Link>
                            </div>
                          </div>
                        );
                      })}
                      {prob.leads.length > 50 && (
                        <div className="px-5 py-3 text-center text-xs text-slate-400">
                          +{prob.leads.length - 50} leads más — usa la <Link href="/leads" className="text-orange-500 hover:underline">lista de leads</Link> para ver todos
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Links */}
      <div className="pt-2 border-t border-slate-200 flex gap-4">
        <Link href="/duplicados" className="text-sm text-orange-500 hover:underline">Ver leads duplicados →</Link>
        <Link href="/diagnostico" className="text-sm text-orange-500 hover:underline">Ver diagnóstico CRM →</Link>
      </div>
    </div>
  );
}
