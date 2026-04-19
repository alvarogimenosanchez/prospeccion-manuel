"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { usePermisos } from "@/components/PermisosProvider";
import { SinAcceso } from "@/components/SinAcceso";

type ComercialObjetivo = {
  id: string;
  nombre: string;
  apellidos: string | null;
  email: string;
  rol: string;
  activo: boolean;
  objetivo_cierres_mes: number;
  objetivo_citas_mes: number;
  max_leads_activos: number;
  // actuals
  cierres_mes: number;
  citas_mes: number;
  leads_activos: number;
  leads_nuevos_mes: number;
};

const ESTADOS_CERRADO = ["cerrado_ganado", "cerrado_perdido", "descartado"];

function BarraProgreso({ valor, objetivo, color = "#ea650d" }: { valor: number; objetivo: number; color?: string }) {
  const pct = objetivo > 0 ? Math.min(100, Math.round((valor / objetivo) * 100)) : 0;
  const overGoal = objetivo > 0 && valor >= objetivo;
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: overGoal ? "#10b981" : color }}
        />
      </div>
      <span className={`text-xs font-semibold tabular-nums ${overGoal ? "text-green-600" : "text-slate-500"}`}>
        {valor}/{objetivo}
      </span>
    </div>
  );
}

export default function ObjetivosPage() {
  const { puede, cargando: cargandoPermisos } = usePermisos();
  const [comerciales, setComerciales] = useState<ComercialObjetivo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [editando, setEditando] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, { cierres: number; citas: number; max_leads: number }>>({});
  const [guardando, setGuardando] = useState<string | null>(null);
  const [mesSeleccionado] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data: coms } = await supabase
      .from("comerciales")
      .select("id, nombre, apellidos, email, rol, activo, objetivo_cierres_mes, objetivo_citas_mes, max_leads_activos")
      .eq("activo", true)
      .order("nombre");

    if (!coms) { setCargando(false); return; }

    const ahora = new Date();
    const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1).toISOString();
    const finMes = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0, 23, 59, 59).toISOString();

    const [{ data: cierres }, { data: citas }, { data: leadsActivos }, { data: leadsNuevos }] = await Promise.all([
      supabase.from("leads").select("comercial_asignado").eq("estado", "cerrado_ganado")
        .gte("updated_at", inicioMes).lte("updated_at", finMes),
      supabase.from("appointments").select("comercial_id")
        .gte("fecha_hora", inicioMes).lte("fecha_hora", finMes)
        .not("estado", "in", "(cancelada,no_asistio)"),
      supabase.from("leads").select("comercial_asignado")
        .not("estado", "in", `(${ESTADOS_CERRADO.join(",")})`),
      supabase.from("leads").select("comercial_asignado")
        .gte("fecha_captacion", inicioMes).lte("fecha_captacion", finMes),
    ]);

    const contar = (arr: { comercial_asignado?: string | null; comercial_id?: string | null }[] | null, id: string, field: "comercial_asignado" | "comercial_id") =>
      (arr ?? []).filter(r => r[field] === id).length;

    const result: ComercialObjetivo[] = coms.map(c => ({
      ...c,
      objetivo_cierres_mes: c.objetivo_cierres_mes ?? 5,
      objetivo_citas_mes: c.objetivo_citas_mes ?? 10,
      max_leads_activos: c.max_leads_activos ?? 50,
      cierres_mes: contar(cierres, c.id, "comercial_asignado"),
      citas_mes: contar(citas, c.id, "comercial_id"),
      leads_activos: contar(leadsActivos, c.id, "comercial_asignado"),
      leads_nuevos_mes: contar(leadsNuevos, c.id, "comercial_asignado"),
    }));

    setComerciales(result);
    const initEdits: typeof edits = {};
    for (const c of result) {
      initEdits[c.id] = {
        cierres: c.objetivo_cierres_mes,
        citas: c.objetivo_citas_mes,
        max_leads: c.max_leads_activos,
      };
    }
    setEdits(initEdits);
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  async function guardar(id: string) {
    setGuardando(id);
    const e = edits[id];
    await supabase.from("comerciales").update({
      objetivo_cierres_mes: e.cierres,
      objetivo_citas_mes: e.citas,
      max_leads_activos: e.max_leads,
    }).eq("id", id);
    setEditando(null);
    setGuardando(null);
    await cargar();
  }

  const puedeEditar = puede("gestionar_equipo");

  const mesLabel = new Date(mesSeleccionado + "-01").toLocaleDateString("es-ES", { month: "long", year: "numeric" });

  const totalCierres = comerciales.reduce((a, c) => a + c.cierres_mes, 0);
  const totalObjetivoCierres = comerciales.reduce((a, c) => a + c.objetivo_cierres_mes, 0);
  const totalCitas = comerciales.reduce((a, c) => a + c.citas_mes, 0);
  const totalObjetivoCitas = comerciales.reduce((a, c) => a + c.objetivo_citas_mes, 0);

  if (!cargandoPermisos && !puede("ver_metricas") && !puede("gestionar_equipo")) return <SinAcceso />;

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Objetivos del equipo</h1>
          <p className="text-sm text-slate-500 mt-0.5 capitalize">{mesLabel} · seguimiento en tiempo real</p>
        </div>
      </div>

      {/* Team totals */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Cierres equipo</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{totalCierres}</p>
          <BarraProgreso valor={totalCierres} objetivo={totalObjetivoCierres} />
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Citas equipo</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{totalCitas}</p>
          <BarraProgreso valor={totalCitas} objetivo={totalObjetivoCitas} color="#a78bfa" />
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Comerciales activos</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{comerciales.length}</p>
          <p className="text-xs text-slate-400 mt-1">en el equipo</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">% Objetivo cierres</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">
            {totalObjetivoCierres > 0 ? Math.round((totalCierres / totalObjetivoCierres) * 100) : 0}%
          </p>
          <p className="text-xs text-slate-400 mt-1">del objetivo conjunto</p>
        </div>
      </div>

      {/* Per-comercial table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Objetivos por comercial</h2>
          {puedeEditar && (
            <p className="text-xs text-slate-400">Haz clic en editar para modificar los objetivos</p>
          )}
        </div>

        {cargando ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 rounded-full border-2 animate-spin" style={{ borderColor: "#ea650d", borderTopColor: "transparent" }} />
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {comerciales.map(c => {
              const isEditing = editando === c.id;
              const e = edits[c.id] ?? { cierres: c.objetivo_cierres_mes, citas: c.objetivo_citas_mes, max_leads: c.max_leads_activos };
              const cierresPct = c.objetivo_cierres_mes > 0 ? Math.round((c.cierres_mes / c.objetivo_cierres_mes) * 100) : 0;
              const semaforo = cierresPct >= 80 ? "🟢" : cierresPct >= 40 ? "🟡" : "🔴";

              return (
                <div key={c.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white text-xs font-bold" style={{ background: "#ea650d" }}>
                        {c.nombre[0]}{c.apellidos?.[0] ?? ""}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-slate-800 truncate">
                            {c.nombre} {c.apellidos ?? ""}
                          </p>
                          <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 capitalize shrink-0">{c.rol}</span>
                          <span title="Estado vs objetivo" className="text-base">{semaforo}</span>
                        </div>
                        <p className="text-xs text-slate-400 truncate">{c.email}</p>
                      </div>
                    </div>

                    {puedeEditar && !isEditing && (
                      <button
                        onClick={() => setEditando(c.id)}
                        className="text-xs text-slate-400 hover:text-orange-600 transition-colors shrink-0 px-2 py-1 rounded hover:bg-orange-50"
                      >
                        Editar
                      </button>
                    )}
                  </div>

                  {isEditing ? (
                    <div className="mt-4 grid grid-cols-3 gap-4">
                      <div>
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 block">Cierres/mes</label>
                        <input
                          type="number"
                          min={0}
                          value={e.cierres}
                          onChange={ev => setEdits(prev => ({ ...prev, [c.id]: { ...prev[c.id], cierres: parseInt(ev.target.value) || 0 } }))}
                          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-orange-300"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 block">Citas/mes</label>
                        <input
                          type="number"
                          min={0}
                          value={e.citas}
                          onChange={ev => setEdits(prev => ({ ...prev, [c.id]: { ...prev[c.id], citas: parseInt(ev.target.value) || 0 } }))}
                          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-orange-300"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 block">Máx. leads activos</label>
                        <input
                          type="number"
                          min={0}
                          value={e.max_leads}
                          onChange={ev => setEdits(prev => ({ ...prev, [c.id]: { ...prev[c.id], max_leads: parseInt(ev.target.value) || 0 } }))}
                          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-orange-300"
                        />
                      </div>
                      <div className="col-span-3 flex gap-2">
                        <button
                          onClick={() => guardar(c.id)}
                          disabled={guardando === c.id}
                          className="text-sm px-4 py-2 rounded-lg text-white font-semibold disabled:opacity-50 transition-opacity"
                          style={{ background: "#ea650d" }}
                        >
                          {guardando === c.id ? "Guardando..." : "Guardar"}
                        </button>
                        <button
                          onClick={() => setEditando(null)}
                          className="text-sm px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 grid grid-cols-3 gap-4">
                      <div>
                        <p className="text-xs text-slate-400 font-medium">Cierres</p>
                        <BarraProgreso valor={c.cierres_mes} objetivo={c.objetivo_cierres_mes} />
                      </div>
                      <div>
                        <p className="text-xs text-slate-400 font-medium">Citas</p>
                        <BarraProgreso valor={c.citas_mes} objetivo={c.objetivo_citas_mes} color="#a78bfa" />
                      </div>
                      <div>
                        <p className="text-xs text-slate-400 font-medium">Leads activos</p>
                        <BarraProgreso valor={c.leads_activos} objetivo={c.max_leads_activos} color="#60a5fa" />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {comerciales.length === 0 && (
              <div className="py-12 text-center">
                <p className="text-slate-400 text-sm">No hay comerciales activos</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
