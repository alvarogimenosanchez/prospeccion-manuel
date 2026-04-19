"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { usePermisos } from "@/components/PermisosProvider";
import { SinAcceso } from "@/components/SinAcceso";

type ComercialCoaching = {
  id: string;
  nombre: string;
  apellidos: string | null;
  email: string;
  rol: string;
  objetivo_cierres_mes: number;
  objetivo_citas_mes: number;
  // actuals
  cierres_mes: number;
  citas_mes: number;
  leads_activos: number;
  leads_sin_tocar_7d: number;
  leads_calientes_sin_seguimiento: number;
  tasa_respuesta: number;
  leads_atascados: number;
};

const semaforo = (val: number, objetivo: number): string => {
  if (objetivo === 0) return "slate";
  const pct = val / objetivo;
  if (pct >= 0.8) return "green";
  if (pct >= 0.4) return "amber";
  return "red";
};

const colorClasses: Record<string, string> = {
  green: "bg-green-100 text-green-700",
  amber: "bg-amber-100 text-amber-700",
  red: "bg-red-100 text-red-600",
  slate: "bg-slate-100 text-slate-500",
};

export default function CoachingPage() {
  const { puede, cargando: cargandoPermisos } = usePermisos();
  const [comerciales, setComerciales] = useState<ComercialCoaching[]>([]);
  const [cargando, setCargando] = useState(true);
  const [miId, setMiId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user?.email) return;
      const { data } = await supabase.from("comerciales").select("id").eq("email", user.email).single();
      setMiId(data?.id ?? null);
    });
  }, []);

  const cargar = useCallback(async () => {
    setCargando(true);

    const ahora = new Date();
    const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1).toISOString();
    const finMes = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0, 23, 59, 59).toISOString();
    const hace7dias = new Date(Date.now() - 7 * 86400_000).toISOString();
    const hace14dias = new Date(Date.now() - 14 * 86400_000).toISOString();

    const { data: coms } = await supabase
      .from("comerciales")
      .select("id, nombre, apellidos, email, rol, objetivo_cierres_mes, objetivo_citas_mes")
      .eq("activo", true)
      .not("rol", "eq", "admin")
      .order("nombre");

    if (!coms) { setCargando(false); return; }

    // Batch queries per comercial would be slow — fetch all and group
    const [
      { data: cierres },
      { data: citas },
      { data: leadsActivos },
      { data: leadsSinTocar },
      { data: calientes },
      { data: mensajes },
      { data: respuestas },
    ] = await Promise.all([
      supabase.from("leads").select("comercial_asignado").eq("estado", "cerrado_ganado")
        .gte("updated_at", inicioMes).lte("updated_at", finMes),
      supabase.from("appointments").select("comercial_id")
        .gte("fecha_hora", inicioMes).lte("fecha_hora", finMes)
        .not("estado", "in", "(cancelada,no_asistio)"),
      supabase.from("leads").select("comercial_asignado")
        .not("estado", "in", "(cerrado_ganado,cerrado_perdido,descartado)"),
      // Leads activos without any interaction in 7 days
      supabase.from("leads").select("comercial_asignado, updated_at")
        .not("estado", "in", "(cerrado_ganado,cerrado_perdido,descartado,nuevo)")
        .lt("updated_at", hace7dias),
      // Calientes sin seguimiento
      supabase.from("leads").select("comercial_asignado")
        .eq("temperatura", "caliente")
        .not("estado", "in", "(cerrado_ganado,cerrado_perdido,descartado)")
        .lt("updated_at", hace7dias),
      // Leads with messages sent (contactados)
      supabase.from("leads").select("comercial_asignado")
        .in("estado", ["mensaje_enviado", "respondio", "cita_agendada", "en_negociacion", "cerrado_ganado"]),
      // Responded leads
      supabase.from("leads").select("comercial_asignado")
        .in("estado", ["respondio", "cita_agendada", "en_negociacion", "cerrado_ganado"]),
    ]);

    const contar = (arr: { comercial_asignado?: string | null }[] | null, id: string) =>
      (arr ?? []).filter(r => r.comercial_asignado === id).length;
    const contarCitas = (arr: { comercial_id?: string | null }[] | null, id: string) =>
      (arr ?? []).filter(r => r.comercial_id === id).length;

    const resultado: ComercialCoaching[] = coms.map(c => {
      const totalContactados = contar(mensajes, c.id);
      const totalRespondidos = contar(respuestas, c.id);
      const tasa = totalContactados > 0 ? Math.round((totalRespondidos / totalContactados) * 100) : 0;

      return {
        ...c,
        objetivo_cierres_mes: c.objetivo_cierres_mes ?? 5,
        objetivo_citas_mes: c.objetivo_citas_mes ?? 10,
        cierres_mes: contar(cierres, c.id),
        citas_mes: contarCitas(citas, c.id),
        leads_activos: contar(leadsActivos, c.id),
        leads_sin_tocar_7d: contar(leadsSinTocar, c.id),
        leads_calientes_sin_seguimiento: contar(calientes, c.id),
        tasa_respuesta: tasa,
        leads_atascados: contar(leadsSinTocar, c.id),
      };
    });

    setComerciales(resultado);
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  if (!cargandoPermisos && !puede("gestionar_equipo")) return <SinAcceso />;

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Panel de coaching</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Análisis de rendimiento del equipo — detecta quién necesita apoyo
        </p>
      </div>

      {cargando ? (
        <div className="flex justify-center py-16">
          <div className="w-7 h-7 rounded-full border-2 animate-spin" style={{ borderColor: "#ea650d", borderTopColor: "transparent" }} />
        </div>
      ) : (
        <div className="space-y-4">
          {comerciales.map(c => {
            const semaforoCierres = semaforo(c.cierres_mes, c.objetivo_cierres_mes);
            const semaforoCitas = semaforo(c.citas_mes, c.objetivo_citas_mes);
            const hayAlertas = c.leads_sin_tocar_7d > 3 || c.leads_calientes_sin_seguimiento > 0;

            return (
              <div key={c.id} className={`bg-white rounded-xl border p-5 ${hayAlertas ? "border-amber-200" : "border-slate-200"}`}>
                {/* Header */}
                <div className="flex items-center justify-between gap-4 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold" style={{ background: "#ea650d" }}>
                      {c.nombre[0]}{c.apellidos?.[0] ?? ""}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-slate-800">{c.nombre} {c.apellidos ?? ""}</p>
                        <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 capitalize">{c.rol}</span>
                        {hayAlertas && <span className="text-xs font-bold text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">⚠️ Atención</span>}
                      </div>
                      <p className="text-xs text-slate-400">{c.email}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Link
                      href={`/mensajes-internos?para=${c.id}`}
                      className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:border-orange-300 hover:text-orange-600 transition-colors"
                    >
                      💬 Mensaje
                    </Link>
                    <Link
                      href={`/leads?comercial=${c.id}`}
                      className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:border-orange-300 hover:text-orange-600 transition-colors"
                    >
                      Ver leads
                    </Link>
                  </div>
                </div>

                {/* Metrics grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  {/* Cierres */}
                  <div className="text-center">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${colorClasses[semaforoCierres]}`}>
                      {c.cierres_mes}/{c.objetivo_cierres_mes}
                    </span>
                    <p className="text-[10px] text-slate-400 mt-1">cierres</p>
                  </div>

                  {/* Citas */}
                  <div className="text-center">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${colorClasses[semaforoCitas]}`}>
                      {c.citas_mes}/{c.objetivo_citas_mes}
                    </span>
                    <p className="text-[10px] text-slate-400 mt-1">citas</p>
                  </div>

                  {/* Leads activos */}
                  <div className="text-center">
                    <span className="text-sm font-bold text-slate-800">{c.leads_activos}</span>
                    <p className="text-[10px] text-slate-400 mt-1">leads activos</p>
                  </div>

                  {/* Tasa respuesta */}
                  <div className="text-center">
                    <span className={`text-sm font-bold ${c.tasa_respuesta > 20 ? "text-green-600" : c.tasa_respuesta > 10 ? "text-amber-600" : "text-red-500"}`}>
                      {c.tasa_respuesta}%
                    </span>
                    <p className="text-[10px] text-slate-400 mt-1">tasa respuesta</p>
                  </div>

                  {/* Sin tocar 7d */}
                  <div className="text-center">
                    <span className={`text-sm font-bold ${c.leads_sin_tocar_7d > 5 ? "text-red-500" : c.leads_sin_tocar_7d > 2 ? "text-amber-600" : "text-slate-400"}`}>
                      {c.leads_sin_tocar_7d}
                    </span>
                    <p className="text-[10px] text-slate-400 mt-1">sin tocar +7d</p>
                  </div>

                  {/* Calientes sin seguimiento */}
                  <div className="text-center">
                    <span className={`text-sm font-bold ${c.leads_calientes_sin_seguimiento > 0 ? "text-red-500 animate-pulse" : "text-slate-400"}`}>
                      {c.leads_calientes_sin_seguimiento}
                    </span>
                    <p className="text-[10px] text-slate-400 mt-1">🔥 sin contactar</p>
                  </div>
                </div>

                {/* Alert messages */}
                {hayAlertas && (
                  <div className="mt-3 pt-3 border-t border-slate-100 space-y-1">
                    {c.leads_calientes_sin_seguimiento > 0 && (
                      <p className="text-xs text-red-600 font-medium">
                        🔴 {c.leads_calientes_sin_seguimiento} lead{c.leads_calientes_sin_seguimiento > 1 ? "s" : ""} caliente{c.leads_calientes_sin_seguimiento > 1 ? "s" : ""} sin contactar en más de 7 días — riesgo de enfriamiento
                      </p>
                    )}
                    {c.leads_sin_tocar_7d > 5 && (
                      <p className="text-xs text-amber-600 font-medium">
                        🟡 {c.leads_sin_tocar_7d} leads sin actividad en más de 7 días — revisar pipeline
                      </p>
                    )}
                    {semaforoCierres === "red" && c.objetivo_cierres_mes > 0 && (
                      <p className="text-xs text-slate-500">
                        📉 Ritmo de cierres por debajo del 40% del objetivo mensual
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {comerciales.length === 0 && (
            <div className="bg-white rounded-xl border border-slate-200 py-14 text-center">
              <p className="text-slate-400 text-sm">No hay comerciales activos para mostrar</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
