"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { Team, TeamMember, Comercial } from "@/lib/supabase";

type TeamConMiembros = Team & {
  miembros: (TeamMember & { comercial: Comercial })[];
  stats: { total: number; calientes: number; ganados: number; enProceso: number };
};

type ComercialConCarga = Comercial & {
  leads_activos: number;
  porcentaje_carga: number;
};

export default function EquiposPage() {
  const [equipos, setEquipos] = useState<TeamConMiembros[]>([]);
  const [comerciales, setComerciales] = useState<ComercialConCarga[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"equipos" | "comerciales">("equipos");
  const [equipoSeleccionado, setEquipoSeleccionado] = useState<TeamConMiembros | null>(null);
  const [mostrarNuevoEquipo, setMostrarNuevoEquipo] = useState(false);
  const [formEquipo, setFormEquipo] = useState({ nombre: "", descripcion: "", zona_geografica: "" });
  const [guardando, setGuardando] = useState(false);
  const [mostrarAnadirMiembro, setMostrarAnadirMiembro] = useState(false);
  const [comercialParaAnadir, setComercialParaAnadir] = useState("");
  const [rolParaAnadir, setRolParaAnadir] = useState<"lider" | "miembro">("miembro");

  const cargarDatos = useCallback(async () => {
    setLoading(true);

    const [{ data: teamsData }, { data: membersData }, { data: comercialesData }] = await Promise.all([
      supabase.from("teams").select("*").order("nombre"),
      supabase.from("team_members").select("*, comercial:comerciales(*)"),
      supabase.from("comerciales").select("*").eq("activo", true).order("nombre"),
    ]);

    const teams = (teamsData as Team[]) ?? [];
    const members = (membersData as (TeamMember & { comercial: Comercial })[]) ?? [];
    const coms = (comercialesData as Comercial[]) ?? [];

    // Stats por equipo
    const equiposConDatos: TeamConMiembros[] = await Promise.all(
      teams.map(async (t) => {
        const miembros = members.filter(m => m.team_id === t.id);
        const [{ count: total }, { count: calientes }, { count: ganados }, { count: enProceso }] = await Promise.all([
          supabase.from("leads").select("*", { count: "exact", head: true }).eq("team_id", t.id),
          supabase.from("leads").select("*", { count: "exact", head: true }).eq("team_id", t.id).eq("temperatura", "caliente"),
          supabase.from("leads").select("*", { count: "exact", head: true }).eq("team_id", t.id).eq("estado", "cerrado_ganado"),
          supabase.from("leads").select("*", { count: "exact", head: true }).eq("team_id", t.id).in("estado", ["respondio", "cita_agendada", "en_negociacion"]),
        ]);
        return { ...t, miembros, stats: { total: total ?? 0, calientes: calientes ?? 0, ganados: ganados ?? 0, enProceso: enProceso ?? 0 } };
      })
    );

    // Carga por comercial
    const comercialesConCarga: ComercialConCarga[] = await Promise.all(
      coms.map(async (c) => {
        const { count } = await supabase
          .from("leads")
          .select("*", { count: "exact", head: true })
          .eq("comercial_asignado", c.id)
          .not("estado", "in", '("cerrado_ganado","cerrado_perdido","descartado")');
        const activos = count ?? 0;
        const max = c.max_leads_activos ?? 50;
        return { ...c, leads_activos: activos, porcentaje_carga: Math.round((activos / max) * 100) };
      })
    );

    setEquipos(equiposConDatos);
    setComerciales(comercialesConCarga);
    setLoading(false);
  }, []);

  useEffect(() => { cargarDatos(); }, [cargarDatos]);

  async function crearEquipo() {
    if (!formEquipo.nombre.trim()) return;
    setGuardando(true);
    await supabase.from("teams").insert({
      nombre: formEquipo.nombre.trim(),
      descripcion: formEquipo.descripcion.trim() || null,
      zona_geografica: formEquipo.zona_geografica.trim() || null,
      activo: true,
    });
    setFormEquipo({ nombre: "", descripcion: "", zona_geografica: "" });
    setMostrarNuevoEquipo(false);
    setGuardando(false);
    cargarDatos();
  }

  async function anadirMiembro() {
    if (!equipoSeleccionado || !comercialParaAnadir) return;
    await supabase.from("team_members").insert({
      team_id: equipoSeleccionado.id,
      comercial_id: comercialParaAnadir,
      rol: rolParaAnadir,
    });
    setComercialParaAnadir("");
    setMostrarAnadirMiembro(false);
    cargarDatos().then(() => {
      // Re-seleccionar el equipo actualizado
      setEquipoSeleccionado(prev =>
        prev ? equipos.find(e => e.id === prev.id) ?? null : null
      );
    });
  }

  async function quitarMiembro(memberId: string) {
    await supabase.from("team_members").delete().eq("id", memberId);
    cargarDatos();
  }

  async function toggleEquipo(equipo: TeamConMiembros) {
    await supabase.from("teams").update({ activo: !equipo.activo }).eq("id", equipo.id);
    cargarDatos();
  }

  async function actualizarMaxLeads(comercialId: string, max: number) {
    await supabase.from("comerciales").update({ max_leads_activos: max }).eq("id", comercialId);
    setComerciales(prev => prev.map(c =>
      c.id === comercialId
        ? { ...c, max_leads_activos: max, porcentaje_carga: Math.round((c.leads_activos / max) * 100) }
        : c
    ));
  }

  const comercialesNoMiembros = comerciales.filter(
    c => !equipoSeleccionado?.miembros.some(m => m.comercial_id === c.id)
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Organización</h1>
          <p className="text-sm text-slate-500 mt-0.5">Equipos, comerciales y capacidad</p>
        </div>
        {tab === "equipos" && (
          <button
            onClick={() => setMostrarNuevoEquipo(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            + Nuevo equipo
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 w-fit">
        {(["equipos", "comerciales"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              tab === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {t === "equipos" ? `Equipos (${equipos.length})` : `Comerciales (${comerciales.length})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-20 text-center text-sm text-slate-400">Cargando...</div>
      ) : tab === "equipos" ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Lista de equipos */}
          <div className="space-y-3">
            {equipos.length === 0 && (
              <div className="bg-white rounded-xl border border-dashed border-slate-300 p-8 text-center">
                <p className="text-slate-400 text-sm mb-3">Aún no hay equipos</p>
                <button onClick={() => setMostrarNuevoEquipo(true)} className="text-indigo-600 text-sm font-medium hover:underline">
                  Crear el primer equipo →
                </button>
              </div>
            )}
            {equipos.map(eq => {
              const seleccionado = equipoSeleccionado?.id === eq.id;
              return (
                <div
                  key={eq.id}
                  onClick={() => setEquipoSeleccionado(eq)}
                  className={`bg-white rounded-xl border p-4 cursor-pointer transition-all ${
                    seleccionado ? "border-indigo-400 ring-2 ring-indigo-100" : "border-slate-200 hover:border-slate-300"
                  } ${!eq.activo ? "opacity-50" : ""}`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-semibold text-slate-800 text-sm">{eq.nombre}</p>
                      {eq.zona_geografica && (
                        <p className="text-xs text-slate-400 mt-0.5">📍 {eq.zona_geografica}</p>
                      )}
                      {eq.descripcion && (
                        <p className="text-xs text-slate-400 mt-0.5 truncate max-w-[180px]">{eq.descripcion}</p>
                      )}
                    </div>
                    <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                      {eq.miembros.length} {eq.miembros.length === 1 ? "miembro" : "miembros"}
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-1 text-center mt-3">
                    <div className="bg-slate-50 rounded py-1">
                      <p className="text-sm font-bold text-slate-700">{eq.stats.total}</p>
                      <p className="text-xs text-slate-400">leads</p>
                    </div>
                    <div className="bg-red-50 rounded py-1">
                      <p className="text-sm font-bold text-red-600">{eq.stats.calientes}</p>
                      <p className="text-xs text-slate-400">calientes</p>
                    </div>
                    <div className="bg-indigo-50 rounded py-1">
                      <p className="text-sm font-bold text-indigo-600">{eq.stats.enProceso}</p>
                      <p className="text-xs text-slate-400">proceso</p>
                    </div>
                    <div className="bg-emerald-50 rounded py-1">
                      <p className="text-sm font-bold text-emerald-600">{eq.stats.ganados}</p>
                      <p className="text-xs text-slate-400">ganados</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Panel detalle del equipo */}
          <div className="lg:col-span-2">
            {!equipoSeleccionado ? (
              <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
                <p className="text-slate-400 text-sm">Selecciona un equipo para gestionar sus miembros</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                  <div>
                    <h2 className="font-bold text-slate-800">{equipoSeleccionado.nombre}</h2>
                    {equipoSeleccionado.zona_geografica && (
                      <p className="text-xs text-slate-400 mt-0.5">📍 {equipoSeleccionado.zona_geografica}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setMostrarAnadirMiembro(true)}
                      className="text-xs bg-indigo-50 text-indigo-600 border border-indigo-200 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors font-medium"
                    >
                      + Añadir miembro
                    </button>
                    <button
                      onClick={() => toggleEquipo(equipoSeleccionado)}
                      className="text-xs text-slate-400 hover:text-red-600 border border-slate-200 hover:border-red-200 px-2.5 py-1.5 rounded-lg transition-colors"
                    >
                      {equipoSeleccionado.activo ? "Desactivar" : "Activar"}
                    </button>
                  </div>
                </div>

                {equipoSeleccionado.miembros.length === 0 ? (
                  <div className="py-12 text-center">
                    <p className="text-slate-400 text-sm mb-3">Este equipo no tiene miembros todavía</p>
                    <button onClick={() => setMostrarAnadirMiembro(true)} className="text-indigo-600 text-sm hover:underline">
                      Añadir el primer miembro →
                    </button>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-50">
                    {equipoSeleccionado.miembros.map(m => {
                      const carga = comerciales.find(c => c.id === m.comercial_id);
                      const pct = carga?.porcentaje_carga ?? 0;
                      const iniciales = [m.comercial.nombre, m.comercial.apellidos].filter(Boolean).join(" ")
                        .split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase();
                      return (
                        <div key={m.id} className="flex items-center gap-4 px-5 py-3.5">
                          <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xs flex-shrink-0">
                            {iniciales}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-slate-800 truncate">
                                {m.comercial.nombre} {m.comercial.apellidos ?? ""}
                              </p>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
                                m.rol === "lider" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"
                              }`}>
                                {m.rol === "lider" ? "Líder" : "Miembro"}
                              </span>
                            </div>
                            {m.comercial.email && (
                              <p className="text-xs text-slate-400 truncate">{m.comercial.email}</p>
                            )}
                            {/* Barra de capacidad */}
                            {carga && (
                              <div className="flex items-center gap-2 mt-1.5">
                                <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all ${
                                      pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-emerald-500"
                                    }`}
                                    style={{ width: `${Math.min(100, pct)}%` }}
                                  />
                                </div>
                                <span className={`text-xs font-medium flex-shrink-0 ${
                                  pct >= 90 ? "text-red-600" : pct >= 70 ? "text-amber-600" : "text-slate-400"
                                }`}>
                                  {carga.leads_activos}/{carga.max_leads_activos}
                                </span>
                              </div>
                            )}
                          </div>
                          <button
                            onClick={() => quitarMiembro(m.id)}
                            className="text-xs text-slate-300 hover:text-red-500 transition-colors px-1 flex-shrink-0"
                            title="Quitar del equipo"
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Panel añadir miembro inline */}
                {mostrarAnadirMiembro && (
                  <div className="border-t border-slate-100 p-4 bg-slate-50">
                    <p className="text-xs font-semibold text-slate-500 mb-3">Añadir miembro al equipo</p>
                    <div className="flex gap-2">
                      <select
                        value={comercialParaAnadir}
                        onChange={e => setComercialParaAnadir(e.target.value)}
                        className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-300 bg-white"
                      >
                        <option value="">Seleccionar comercial...</option>
                        {comercialesNoMiembros.map(c => (
                          <option key={c.id} value={c.id}>{c.nombre} {c.apellidos ?? ""}</option>
                        ))}
                      </select>
                      <select
                        value={rolParaAnadir}
                        onChange={e => setRolParaAnadir(e.target.value as "lider" | "miembro")}
                        className="w-28 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-300 bg-white"
                      >
                        <option value="miembro">Miembro</option>
                        <option value="lider">Líder</option>
                      </select>
                      <button
                        onClick={anadirMiembro}
                        disabled={!comercialParaAnadir}
                        className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors"
                      >
                        Añadir
                      </button>
                      <button
                        onClick={() => setMostrarAnadirMiembro(false)}
                        className="px-3 py-2 text-slate-400 hover:text-slate-600 text-sm"
                      >
                        ×
                      </button>
                    </div>
                    {comercialesNoMiembros.length === 0 && (
                      <p className="text-xs text-slate-400 mt-2">Todos los comerciales activos ya son miembros de este equipo.</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Tab comerciales: carga de trabajo */
        <div className="space-y-4">
          {/* Resumen de saturación */}
          {(() => {
            const saturados = comerciales.filter(c => c.porcentaje_carga >= 90);
            const aviso = comerciales.filter(c => c.porcentaje_carga >= 70 && c.porcentaje_carga < 90);
            if (saturados.length === 0 && aviso.length === 0) return null;
            return (
              <div className={`rounded-xl border p-4 flex items-start gap-3 ${
                saturados.length > 0 ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200"
              }`}>
                <span className="text-lg">{saturados.length > 0 ? "🔴" : "🟡"}</span>
                <div>
                  <p className={`text-sm font-semibold ${saturados.length > 0 ? "text-red-700" : "text-amber-700"}`}>
                    {saturados.length > 0
                      ? `${saturados.length} comercial${saturados.length > 1 ? "es" : ""} al límite de capacidad`
                      : `${aviso.length} comercial${aviso.length > 1 ? "es" : ""} cerca del límite`}
                  </p>
                  <p className={`text-xs mt-0.5 ${saturados.length > 0 ? "text-red-500" : "text-amber-500"}`}>
                    {saturados.length > 0
                      ? `${saturados.map(c => c.nombre).join(", ")} — considera redistribuir leads`
                      : `${aviso.map(c => c.nombre).join(", ")} — monitoriza la carga`}
                  </p>
                </div>
              </div>
            );
          })()}

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {comerciales.map(c => {
              const pct = c.porcentaje_carga;
              const colorBarra = pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-emerald-500";
              const colorTexto = pct >= 90 ? "text-red-600" : pct >= 70 ? "text-amber-600" : "text-emerald-600";
              const iniciales = [c.nombre, c.apellidos].filter(Boolean).join(" ")
                .split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase();

              // Equipos a los que pertenece
              const misEquipos = equipos.filter(e => e.miembros.some(m => m.comercial_id === c.id));

              return (
                <div key={c.id} className="bg-white rounded-xl border border-slate-200 p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${
                      c.rol === "director" ? "bg-amber-100 text-amber-700" : "bg-indigo-100 text-indigo-700"
                    }`}>
                      {iniciales}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-slate-800 text-sm truncate">
                          {c.nombre} {c.apellidos ?? ""}
                        </p>
                        {c.rol === "director" && (
                          <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium flex-shrink-0">Director</span>
                        )}
                      </div>
                      {c.email && <p className="text-xs text-slate-400 truncate">{c.email}</p>}
                    </div>
                  </div>

                  {/* Barra de capacidad */}
                  <div className="mb-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs text-slate-500">Carga de trabajo</span>
                      <span className={`text-xs font-bold ${colorTexto}`}>{pct}%</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${colorBarra}`}
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs text-slate-400">{c.leads_activos} leads activos</span>
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-slate-400">máx.</span>
                        <input
                          type="number"
                          min={1}
                          max={500}
                          value={c.max_leads_activos}
                          onChange={e => actualizarMaxLeads(c.id, parseInt(e.target.value) || 50)}
                          className="w-14 text-xs text-right border border-slate-200 rounded px-1 py-0.5 focus:outline-none focus:border-indigo-300"
                          onClick={e => e.stopPropagation()}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Equipos */}
                  {misEquipos.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {misEquipos.map(e => (
                        <span key={e.id} className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full">
                          {e.nombre}
                        </span>
                      ))}
                    </div>
                  )}
                  {misEquipos.length === 0 && (
                    <p className="text-xs text-slate-300">Sin equipo asignado</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal nuevo equipo */}
      {mostrarNuevoEquipo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-800">Nuevo equipo</h2>
              <button onClick={() => setMostrarNuevoEquipo(false)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Nombre del equipo *</label>
                <input
                  value={formEquipo.nombre}
                  onChange={e => setFormEquipo(p => ({ ...p, nombre: e.target.value }))}
                  placeholder="Ej: Equipo Madrid"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-300"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Zona geográfica</label>
                <input
                  value={formEquipo.zona_geografica}
                  onChange={e => setFormEquipo(p => ({ ...p, zona_geografica: e.target.value }))}
                  placeholder="Ej: Madrid y alrededores"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-300"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Descripción</label>
                <textarea
                  value={formEquipo.descripcion}
                  onChange={e => setFormEquipo(p => ({ ...p, descripcion: e.target.value }))}
                  rows={2}
                  placeholder="Especialización, objetivos..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-300 resize-none"
                />
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button
                onClick={crearEquipo}
                disabled={!formEquipo.nombre.trim() || guardando}
                className="flex-1 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {guardando ? "Creando..." : "Crear equipo"}
              </button>
              <button onClick={() => setMostrarNuevoEquipo(false)} className="px-5 py-2.5 border border-slate-200 text-slate-600 text-sm rounded-xl hover:bg-slate-50">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
