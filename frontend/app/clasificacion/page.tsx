"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { usePermisos } from "@/components/PermisosProvider";

type PuestoComercial = {
  id: string;
  nombre: string;
  apellidos: string | null;
  rol: string;
  objetivo_cierres_mes: number | null;
  objetivo_citas_mes: number | null;
  cierres: number;
  citas: number;
  leadsActivos: number;
  progresoCierres: number;
  progresoCitas: number;
};

const MES_LABELS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

const PODIUM_CONFIG = [
  { pos: 1, emoji: "🥇", bg: "bg-amber-50", border: "border-amber-300", text: "text-amber-700", label: "1º" },
  { pos: 2, emoji: "🥈", bg: "bg-slate-50",  border: "border-slate-300",  text: "text-slate-600",  label: "2º" },
  { pos: 3, emoji: "🥉", bg: "bg-orange-50", border: "border-orange-300", text: "text-orange-700", label: "3º" },
];

export default function ClasificacionPage() {
  const { cargando: cargandoPermisos } = usePermisos();
  const [puestos, setPuestos] = useState<PuestoComercial[]>([]);
  const [loading, setLoading] = useState(true);
  const [metrica, setMetrica] = useState<"cierres" | "citas">("cierres");
  const [miId, setMiId] = useState<string | null>(null);

  const ahora = new Date();
  const mesLabel = MES_LABELS[ahora.getMonth()];
  const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1).toISOString();
  const diasEnMes = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0).getDate();
  const diaActual = ahora.getDate();
  const porcentajeMesTranscurrido = Math.round((diaActual / diasEnMes) * 100);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user?.email) return;
      supabase.from("comerciales").select("id").eq("email", user.email).single()
        .then(({ data }) => setMiId(data?.id ?? null));
    });
  }, []);

  const cargar = useCallback(async () => {
    setLoading(true);

    const { data: comerciales } = await supabase
      .from("comerciales")
      .select("id, nombre, apellidos, rol, objetivo_cierres_mes, objetivo_citas_mes")
      .eq("activo", true)
      .order("nombre");

    if (!comerciales?.length) { setLoading(false); return; }

    const ids = comerciales.map(c => c.id);

    const [
      { data: cierresData },
      { data: citasData },
      { data: leadsData },
    ] = await Promise.all([
      supabase.from("leads").select("comercial_asignado")
        .eq("estado", "cerrado_ganado")
        .in("comercial_asignado", ids)
        .gte("updated_at", inicioMes),
      supabase.from("appointments").select("comercial_id")
        .eq("estado", "realizada")
        .in("comercial_id", ids)
        .gte("fecha_hora", inicioMes),
      supabase.from("leads").select("comercial_asignado")
        .not("estado", "in", '("cerrado_ganado","cerrado_perdido","descartado")')
        .in("comercial_asignado", ids),
    ]);

    const cierresPorComercial: Record<string, number> = {};
    for (const r of cierresData ?? []) {
      if (r.comercial_asignado) cierresPorComercial[r.comercial_asignado] = (cierresPorComercial[r.comercial_asignado] ?? 0) + 1;
    }

    const citasPorComercial: Record<string, number> = {};
    for (const r of citasData ?? []) {
      if (r.comercial_id) citasPorComercial[r.comercial_id] = (citasPorComercial[r.comercial_id] ?? 0) + 1;
    }

    const leadsPorComercial: Record<string, number> = {};
    for (const r of leadsData ?? []) {
      if (r.comercial_asignado) leadsPorComercial[r.comercial_asignado] = (leadsPorComercial[r.comercial_asignado] ?? 0) + 1;
    }

    const resultado: PuestoComercial[] = comerciales.map(c => {
      const cierres = cierresPorComercial[c.id] ?? 0;
      const citas = citasPorComercial[c.id] ?? 0;
      const objetivo_cierres = c.objetivo_cierres_mes ?? 0;
      const objetivo_citas = c.objetivo_citas_mes ?? 0;
      return {
        ...c,
        cierres,
        citas,
        leadsActivos: leadsPorComercial[c.id] ?? 0,
        progresoCierres: objetivo_cierres > 0 ? Math.min(100, Math.round((cierres / objetivo_cierres) * 100)) : 0,
        progresoCitas: objetivo_citas > 0 ? Math.min(100, Math.round((citas / objetivo_citas) * 100)) : 0,
      };
    });

    resultado.sort((a, b) => metrica === "cierres" ? b.cierres - a.cierres : b.citas - a.citas);

    setPuestos(resultado);
    setLoading(false);
  }, [metrica, inicioMes]);

  useEffect(() => {
    if (!cargandoPermisos) cargar();
  }, [cargar, cargandoPermisos]);

  const topTres = puestos.slice(0, 3);
  const resto = puestos.slice(3);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Clasificación del equipo</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Ranking del mes de {mesLabel} — {porcentajeMesTranscurrido}% del mes transcurrido (día {diaActual}/{diasEnMes})
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setMetrica("cierres")}
            className={`text-sm px-4 py-2 rounded-lg border transition-colors font-medium ${metrica === "cierres" ? "border-orange-400 bg-orange-50 text-orange-700" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}
          >
            Por cierres
          </button>
          <button
            onClick={() => setMetrica("citas")}
            className={`text-sm px-4 py-2 rounded-lg border transition-colors font-medium ${metrica === "citas" ? "border-orange-400 bg-orange-50 text-orange-700" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}
          >
            Por citas
          </button>
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 py-16 text-center text-sm text-slate-400">
          Cargando clasificación...
        </div>
      ) : (
        <>
          {/* Podium top 3 */}
          {topTres.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {topTres.map((p, i) => {
                const cfg = PODIUM_CONFIG[i];
                const esMio = p.id === miId;
                const valor = metrica === "cierres" ? p.cierres : p.citas;
                const progreso = metrica === "cierres" ? p.progresoCierres : p.progresoCitas;
                const objetivo = metrica === "cierres" ? p.objetivo_cierres_mes : p.objetivo_citas_mes;
                const nombre = [p.nombre, p.apellidos].filter(Boolean).join(" ");

                return (
                  <div key={p.id} className={`rounded-xl border-2 ${cfg.border} ${cfg.bg} p-5 text-center relative ${esMio ? "ring-2 ring-offset-1 ring-orange-400" : ""}`}>
                    {esMio && <span className="absolute top-2 right-2 text-xs font-medium text-orange-600 bg-white px-2 py-0.5 rounded-full border border-orange-200">Tú</span>}
                    <div className="text-3xl mb-2">{cfg.emoji}</div>
                    <p className={`text-sm font-bold ${cfg.text}`}>{cfg.label} lugar</p>
                    <p className="text-base font-semibold text-slate-800 mt-1">{nombre}</p>
                    <p className="text-xs text-slate-500 capitalize">{p.rol}</p>
                    <div className="mt-3">
                      <p className="text-3xl font-bold text-slate-900">{valor}</p>
                      <p className="text-xs text-slate-500">{metrica === "cierres" ? "cierres" : "citas realizadas"}</p>
                    </div>
                    {objetivo ? (
                      <div className="mt-3">
                        <div className="flex justify-between text-xs text-slate-400 mb-1">
                          <span>Objetivo: {objetivo}</span>
                          <span>{progreso}%</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${progreso}%`,
                              background: progreso >= porcentajeMesTranscurrido ? "#16a34a" : progreso >= porcentajeMesTranscurrido * 0.7 ? "#d97706" : "#ef4444",
                            }}
                          />
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-300 mt-3">Sin objetivo definido</p>
                    )}
                    <p className="text-xs text-slate-400 mt-2">{p.leadsActivos} leads activos</p>
                  </div>
                );
              })}
            </div>
          )}

          {/* Resto del ranking */}
          {resto.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
                <p className="text-sm font-medium text-slate-700">Resto del equipo</p>
              </div>
              <div className="divide-y divide-slate-50">
                {resto.map((p, i) => {
                  const esMio = p.id === miId;
                  const valor = metrica === "cierres" ? p.cierres : p.citas;
                  const progreso = metrica === "cierres" ? p.progresoCierres : p.progresoCitas;
                  const objetivo = metrica === "cierres" ? p.objetivo_cierres_mes : p.objetivo_citas_mes;
                  const nombre = [p.nombre, p.apellidos].filter(Boolean).join(" ");
                  const pos = i + 4;

                  return (
                    <div key={p.id} className={`flex items-center gap-4 px-4 py-3.5 ${esMio ? "bg-orange-50" : "hover:bg-slate-50"}`}>
                      <div className="w-8 text-center">
                        <span className="text-sm font-bold text-slate-400">{pos}º</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-800">{nombre}</span>
                          {esMio && <span className="text-xs text-orange-600 font-medium">Tú</span>}
                          <span className="text-xs text-slate-400 capitalize">{p.rol}</span>
                        </div>
                        {objetivo ? (
                          <div className="flex items-center gap-2 mt-1">
                            <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden max-w-32">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${progreso}%`,
                                  background: progreso >= porcentajeMesTranscurrido ? "#16a34a" : progreso >= porcentajeMesTranscurrido * 0.7 ? "#d97706" : "#ef4444",
                                }}
                              />
                            </div>
                            <span className="text-xs text-slate-400">{valor}/{objetivo} ({progreso}%)</span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-300">{valor} {metrica === "cierres" ? "cierres" : "citas"}</span>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xl font-bold text-slate-700">{valor}</p>
                        <p className="text-xs text-slate-400">{p.leadsActivos} leads</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {puestos.length === 0 && (
            <div className="bg-white rounded-xl border border-slate-200 py-16 text-center">
              <p className="text-slate-400 text-sm">No hay datos aún para este mes.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
