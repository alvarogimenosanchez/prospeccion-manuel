"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { usePermisos } from "@/components/PermisosProvider";
import { differenceInDays, parseISO } from "date-fns";

// ─── Types ──────────────────────────────────────────────────────────────────

type Oportunidad = {
  id: string;
  nombre: string;
  apellidos: string | null;
  empresa: string | null;
  sector: string | null;
  ciudad: string | null;
  telefono_whatsapp: string | null;
  telefono: string | null;
  estado: string;
  temperatura: string;
  nivel_interes: number;
  prioridad: string | null;
  producto_interes_principal: string | null;
  productos_recomendados: string[] | null;
  proxima_accion: string | null;
  proxima_accion_fecha: string | null;
  updated_at: string;
  comercial_asignado: string | null;
  comercial_nombre?: string;
  // computed
  score: number;
  razon: string;
  diasSinActividad: number;
  urgencia: "alta" | "media" | "baja";
};

// ─── Constants ───────────────────────────────────────────────────────────────

const ESTADO_PESO: Record<string, number> = {
  en_negociacion: 40,
  cita_agendada: 30,
  respondio: 20,
  mensaje_enviado: 10,
  segmentado: 5,
};

const TEMPERATURA_PESO: Record<string, number> = {
  caliente: 30,
  templado: 15,
  frio: 0,
};

const PRIORIDAD_PESO: Record<string, number> = {
  alta: 20,
  media: 10,
  baja: 0,
};

const ESTADO_LABEL: Record<string, string> = {
  nuevo: "Nuevo", segmentado: "Segmentado", mensaje_generado: "Msg. listo",
  mensaje_enviado: "Contactado", respondio: "Respondió", cita_agendada: "Cita agendada",
  en_negociacion: "En negociación",
};

const PRODUCTOS_LABEL: Record<string, string> = {
  contigo_autonomo: "C. Autónomo", contigo_pyme: "C. Pyme", contigo_familia: "C. Familia",
  contigo_futuro: "C. Futuro", contigo_senior: "C. Senior", sialp: "SIALP",
  liderplus: "LiderPlus", sanitas_salud: "Sanitas", mihogar: "MiHogar", hipotecas: "Hipoteca",
};

const TEMP_COLOR: Record<string, string> = {
  caliente: "text-red-600 bg-red-50",
  templado: "text-amber-700 bg-amber-50",
  frio: "text-blue-600 bg-blue-50",
};

const TEMP_LABEL: Record<string, string> = { caliente: "🔥 Caliente", templado: "🌡 Templado", frio: "❄️ Frío" };

const ACCION_LABEL: Record<string, string> = {
  llamar: "📞 Llamar", whatsapp: "💬 WhatsApp", email: "📧 Email",
  cita: "📅 Cita", seguimiento: "🔄 Seguimiento",
};

function calcularScore(lead: Omit<Oportunidad, "score" | "razon" | "diasSinActividad" | "urgencia">): { score: number; razon: string } {
  let score = 0;
  const razones: string[] = [];

  // Estado
  const ep = ESTADO_PESO[lead.estado] ?? 0;
  score += ep;
  if (lead.estado === "en_negociacion") razones.push("en negociación");
  else if (lead.estado === "cita_agendada") razones.push("cita programada");
  else if (lead.estado === "respondio") razones.push("respondió");

  // Temperatura
  const tp = TEMPERATURA_PESO[lead.temperatura] ?? 0;
  score += tp;
  if (lead.temperatura === "caliente") razones.push("lead caliente");

  // Prioridad
  const pp = PRIORIDAD_PESO[lead.prioridad ?? ""] ?? 0;
  score += pp;
  if (lead.prioridad === "alta") razones.push("prioridad alta");

  // Nivel de interés (0-10 → 0-10 puntos)
  score += lead.nivel_interes;
  if (lead.nivel_interes >= 8) razones.push(`interés ${lead.nivel_interes}/10`);

  // Penalizar inactividad
  const dias = differenceInDays(new Date(), parseISO(lead.updated_at));
  if (dias > 14) score -= 10;
  else if (dias > 7) score -= 5;
  else if (dias <= 1) { score += 5; razones.push("actividad reciente"); }

  // Bonus producto vinculado
  if (lead.producto_interes_principal) score += 5;

  // Bonus acción vencida (urgente)
  if (lead.proxima_accion_fecha) {
    const diasAccion = differenceInDays(new Date(), parseISO(lead.proxima_accion_fecha));
    if (diasAccion > 0) { score += 8; razones.push("acción vencida"); }
    else if (diasAccion >= -1) { score += 4; razones.push("acción hoy"); }
  }

  const razon = razones.slice(0, 2).join(", ") || "lead activo";
  return { score: Math.max(0, score), razon };
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function OportunidadesPage() {
  const { puede, cargando: cargandoPermisos } = usePermisos();
  const [oportunidades, setOportunidades] = useState<Oportunidad[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroComercial, setFiltroComercial] = useState("todos");
  const [filtroUrgencia, setFiltroUrgencia] = useState<"" | "alta" | "media" | "baja">("");
  const [comerciales, setComerciales] = useState<{ id: string; nombre: string }[]>([]);
  const [miId, setMiId] = useState<string | null>(null);
  const [limite, setLimite] = useState(25);

  useEffect(() => {
    async function cargarMiId() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) return;
      const { data: com } = await supabase.from("comerciales").select("id").eq("email", user.email).single();
      setMiId(com?.id ?? null);
    }
    cargarMiId();
  }, []);

  const cargar = useCallback(async () => {
    setLoading(true);

    let q = supabase.from("leads")
      .select("id, nombre, apellidos, empresa, sector, ciudad, telefono_whatsapp, telefono, estado, temperatura, nivel_interes, prioridad, producto_interes_principal, productos_recomendados, proxima_accion, proxima_accion_fecha, updated_at, comercial_asignado")
      .not("estado", "in", "(cerrado_ganado,cerrado_perdido,descartado,nuevo)")
      .gte("nivel_interes", 3)
      .limit(300);

    if (!puede("ver_metricas") && miId) q = q.eq("comercial_asignado", miId);
    else if (filtroComercial !== "todos") q = q.eq("comercial_asignado", filtroComercial);

    const { data: leads } = await q;

    // Load comercial names
    const comIds = [...new Set((leads ?? []).map(l => l.comercial_asignado).filter(Boolean))] as string[];
    const { data: comsData } = comIds.length > 0
      ? await supabase.from("comerciales").select("id, nombre").in("id", comIds)
      : { data: [] };
    const comMap = new Map((comsData ?? []).map(c => [c.id, c.nombre]));

    // Score and rank
    const scored: Oportunidad[] = (leads ?? []).map(l => {
      const { score, razon } = calcularScore(l);
      const dias = differenceInDays(new Date(), parseISO(l.updated_at));
      let urgencia: "alta" | "media" | "baja" = "baja";
      if (score >= 60) urgencia = "alta";
      else if (score >= 35) urgencia = "media";
      return {
        ...l,
        comercial_nombre: l.comercial_asignado ? comMap.get(l.comercial_asignado) : undefined,
        score,
        razon,
        diasSinActividad: dias,
        urgencia,
      };
    });

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    setOportunidades(scored);
    setLoading(false);
  }, [puede, miId, filtroComercial]);

  useEffect(() => {
    if (!cargandoPermisos) cargar();
  }, [cargar, cargandoPermisos]);

  useEffect(() => {
    supabase.from("comerciales").select("id, nombre").eq("activo", true).order("nombre")
      .then(({ data }) => setComerciales(data ?? []));
  }, []);

  const datos = oportunidades.filter(o => {
    if (filtroUrgencia && o.urgencia !== filtroUrgencia) return false;
    return true;
  }).slice(0, limite);

  const nAlta   = oportunidades.filter(o => o.urgencia === "alta").length;
  const nMedia  = oportunidades.filter(o => o.urgencia === "media").length;
  const nBaja   = oportunidades.filter(o => o.urgencia === "baja").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Oportunidades calientes</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Leads ordenados por probabilidad de cierre — actúa sobre los más urgentes primero
        </p>
      </div>

      {/* KPIs */}
      {!loading && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 cursor-pointer"
            onClick={() => setFiltroUrgencia(filtroUrgencia === "alta" ? "" : "alta")}>
            <p className="text-xs font-semibold text-red-500 uppercase tracking-wide mb-1">Urgencia alta</p>
            <p className="text-3xl font-bold text-red-700">{nAlta}</p>
            <p className="text-xs text-red-500 mt-0.5">actuar hoy</p>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 cursor-pointer"
            onClick={() => setFiltroUrgencia(filtroUrgencia === "media" ? "" : "media")}>
            <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-1">Urgencia media</p>
            <p className="text-3xl font-bold text-amber-700">{nMedia}</p>
            <p className="text-xs text-amber-600 mt-0.5">esta semana</p>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 cursor-pointer"
            onClick={() => setFiltroUrgencia(filtroUrgencia === "baja" ? "" : "baja")}>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Urgencia baja</p>
            <p className="text-3xl font-bold text-slate-600">{nBaja}</p>
            <p className="text-xs text-slate-400 mt-0.5">seguimiento normal</p>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="flex items-center gap-2 flex-wrap">
        {filtroUrgencia && (
          <button onClick={() => setFiltroUrgencia("")}
            className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-full bg-orange-100 text-orange-700 border border-orange-200 font-medium">
            Urgencia: {filtroUrgencia} ✕
          </button>
        )}
        {puede("ver_metricas") && comerciales.length > 1 && (
          <select value={filtroComercial} onChange={e => setFiltroComercial(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:border-orange-300">
            <option value="todos">Todos los comerciales</option>
            {comerciales.map(c => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className="py-16 text-center text-sm text-slate-400">Calculando oportunidades...</div>
      ) : datos.length === 0 ? (
        <div className="py-16 text-center text-sm text-slate-400">No hay oportunidades activas con estos filtros.</div>
      ) : (
        <div className="space-y-3">
          {datos.map((o, idx) => {
            const urgBg = o.urgencia === "alta" ? "border-l-4 border-l-red-400" : o.urgencia === "media" ? "border-l-4 border-l-amber-400" : "";
            const accionVencida = o.proxima_accion_fecha && differenceInDays(new Date(), parseISO(o.proxima_accion_fecha)) > 0;
            return (
              <div key={o.id} className={`bg-white rounded-xl border border-slate-200 hover:border-orange-200 transition-colors overflow-hidden ${urgBg}`}>
                <div className="px-4 py-3 flex items-start gap-3">
                  {/* Rank + score */}
                  <div className="shrink-0 text-center w-10">
                    <p className="text-sm font-bold text-slate-400">#{idx + 1}</p>
                    <div className="mt-1 w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold"
                      style={{
                        background: o.urgencia === "alta" ? "#fee2e2" : o.urgencia === "media" ? "#fef3c7" : "#f1f5f9",
                        color: o.urgencia === "alta" ? "#dc2626" : o.urgencia === "media" ? "#d97706" : "#64748b",
                      }}>
                      {o.score}
                    </div>
                  </div>

                  {/* Lead info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div>
                        <Link href={`/leads/${o.id}`}
                          className="text-sm font-semibold text-slate-900 hover:text-orange-600">
                          {o.nombre} {o.apellidos}
                        </Link>
                        {o.empresa && <span className="text-sm text-slate-400 ml-1">— {o.empresa}</span>}
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TEMP_COLOR[o.temperatura] ?? "bg-slate-50 text-slate-500"}`}>
                            {TEMP_LABEL[o.temperatura] ?? o.temperatura}
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">
                            {ESTADO_LABEL[o.estado] ?? o.estado}
                          </span>
                          {o.producto_interes_principal && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 border border-orange-100">
                              {PRODUCTOS_LABEL[o.producto_interes_principal] ?? o.producto_interes_principal}
                            </span>
                          )}
                          {accionVencida && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200 font-medium">
                              ⚠️ Acción vencida
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-slate-400">Interés</p>
                        <p className="text-lg font-bold text-slate-700">{o.nivel_interes}/10</p>
                      </div>
                    </div>

                    {/* Razon + context */}
                    <p className="text-xs text-slate-500 mt-1.5">
                      💡 {o.razon.charAt(0).toUpperCase() + o.razon.slice(1)}
                      {o.diasSinActividad > 0 && ` · sin actividad hace ${o.diasSinActividad}d`}
                      {o.ciudad && ` · ${o.ciudad}`}
                    </p>

                    {/* Next action */}
                    {o.proxima_accion && (
                      <p className={`text-xs mt-1 font-medium ${accionVencida ? "text-red-600" : "text-slate-500"}`}>
                        {ACCION_LABEL[o.proxima_accion] ?? o.proxima_accion}
                        {o.proxima_accion_fecha && ` — ${new Date(o.proxima_accion_fecha).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}`}
                      </p>
                    )}
                  </div>

                  {/* Quick actions */}
                  <div className="shrink-0 flex flex-col gap-1.5">
                    {o.telefono_whatsapp && (
                      <a href={`https://wa.me/${o.telefono_whatsapp.replace(/\D/g, "")}`}
                        target="_blank" rel="noopener noreferrer"
                        className="text-xs px-2.5 py-1.5 bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100 transition-colors font-medium">
                        💬 WA
                      </a>
                    )}
                    <Link href={`/leads/${o.id}`}
                      className="text-xs px-2.5 py-1.5 bg-slate-50 text-slate-600 border border-slate-200 rounded-lg hover:bg-orange-50 hover:border-orange-200 hover:text-orange-700 transition-colors font-medium text-center">
                      Ver
                    </Link>
                  </div>
                </div>

                {/* Comercial */}
                {puede("ver_metricas") && o.comercial_nombre && (
                  <div className="px-4 py-1.5 bg-slate-50 border-t border-slate-100">
                    <p className="text-xs text-slate-400">Asignado a <span className="font-medium text-slate-600">{o.comercial_nombre}</span></p>
                  </div>
                )}
              </div>
            );
          })}

          {/* Load more */}
          {oportunidades.filter(o => !filtroUrgencia || o.urgencia === filtroUrgencia).length > limite && (
            <button onClick={() => setLimite(l => l + 25)}
              className="w-full py-3 text-sm text-slate-500 hover:text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
              Cargar más oportunidades
            </button>
          )}
        </div>
      )}
    </div>
  );
}
