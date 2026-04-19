"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { usePermisos } from "@/components/PermisosProvider";
import { SinAcceso } from "@/components/SinAcceso";
import type { Team, TeamMember, Comercial } from "@/lib/supabase";

type TeamConMiembros = Team & {
  miembros: (TeamMember & { comercial: Comercial })[];
  stats: { total: number; calientes: number; ganados: number; enProceso: number };
};

type ComercialConCarga = Comercial & {
  leads_activos: number;
  porcentaje_carga: number;
};

type FormEquipo = {
  nombre: string;
  descripcion: string;
  zona_geografica: string;
  miembros_ids: string[];
};

type FormEditComercial = {
  id: string;
  nombre: string;
  apellidos: string;
  rol: "admin" | "director" | "manager" | "comercial";
  max_leads_activos: number;
};

export default function EquiposPage() {
  const { puede, cargando: cargandoPermisos } = usePermisos();
  const [equipos, setEquipos] = useState<TeamConMiembros[]>([]);
  const [comerciales, setComerciales] = useState<ComercialConCarga[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"equipos" | "comerciales">("equipos");
  const [equipoSeleccionado, setEquipoSeleccionado] = useState<TeamConMiembros | null>(null);
  const [mostrarNuevoEquipo, setMostrarNuevoEquipo] = useState(false);
  const [formEquipo, setFormEquipo] = useState<FormEquipo>({ nombre: "", descripcion: "", zona_geografica: "", miembros_ids: [] });
  const [guardando, setGuardando] = useState(false);
  const [mostrarAnadirMiembro, setMostrarAnadirMiembro] = useState(false);
  const [comercialParaAnadir, setComercialParaAnadir] = useState("");
  const [rolParaAnadir, setRolParaAnadir] = useState<"lider" | "miembro">("miembro");
  const [miembroParaMover, setMiembroParaMover] = useState<(TeamMember & { comercial: Comercial }) | null>(null);
  const [equipoDestinoId, setEquipoDestinoId] = useState("");
  const [comercialEditando, setComercialEditando] = useState<FormEditComercial | null>(null);
  const [guardandoComercial, setGuardandoComercial] = useState(false);
  const [mostrarNuevoComercial, setMostrarNuevoComercial] = useState(false);
  const [formNuevoComercial, setFormNuevoComercial] = useState({ nombre: "", apellidos: "", email: "", rol: "comercial" as "admin" | "director" | "manager" | "comercial" });
  const [guardandoNuevoComercial, setGuardandoNuevoComercial] = useState(false);
  const [errorNuevoComercial, setErrorNuevoComercial] = useState("");

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

    const { data: nuevoEquipo } = await supabase.from("teams").insert({
      nombre: formEquipo.nombre.trim(),
      descripcion: formEquipo.descripcion.trim() || null,
      zona_geografica: formEquipo.zona_geografica.trim() || null,
      activo: true,
    }).select().single();

    // Añadir miembros seleccionados si hay alguno
    if (nuevoEquipo && formEquipo.miembros_ids.length > 0) {
      await supabase.from("team_members").insert(
        formEquipo.miembros_ids.map((cid, idx) => ({
          team_id: (nuevoEquipo as Team).id,
          comercial_id: cid,
          rol: idx === 0 ? "lider" : "miembro",
        }))
      );
    }

    setFormEquipo({ nombre: "", descripcion: "", zona_geografica: "", miembros_ids: [] });
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
      setEquipoSeleccionado(prev =>
        prev ? equipos.find(e => e.id === prev.id) ?? null : null
      );
    });
  }

  async function quitarMiembro(memberId: string) {
    await supabase.from("team_members").delete().eq("id", memberId);
    cargarDatos();
  }

  async function moverMiembro() {
    if (!miembroParaMover || !equipoDestinoId) return;
    await supabase.from("team_members").delete().eq("id", miembroParaMover.id);
    await supabase.from("team_members").insert({
      team_id: equipoDestinoId,
      comercial_id: miembroParaMover.comercial_id,
      rol: miembroParaMover.rol,
    });
    setMiembroParaMover(null);
    setEquipoDestinoId("");
    await cargarDatos();
    setEquipoSeleccionado(prev => prev ? equipos.find(e => e.id === prev.id) ?? null : null);
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

  async function guardarComercial() {
    if (!comercialEditando) return;
    setGuardandoComercial(true);
    await supabase.from("comerciales").update({
      rol: comercialEditando.rol,
      max_leads_activos: comercialEditando.max_leads_activos,
    }).eq("id", comercialEditando.id);
    setComercialEditando(null);
    setGuardandoComercial(false);
    cargarDatos();
  }

  async function crearComercial() {
    const { nombre, apellidos, email, rol } = formNuevoComercial;
    if (!nombre.trim() || !email.trim()) { setErrorNuevoComercial("Nombre y email son obligatorios."); return; }
    setGuardandoNuevoComercial(true); setErrorNuevoComercial("");
    const { error } = await supabase.from("comerciales").insert({ nombre: nombre.trim(), apellidos: apellidos.trim() || null, email: email.trim().toLowerCase(), rol, activo: true });
    if (error) { setErrorNuevoComercial(error.message.includes("duplicate") ? "Ya existe un comercial con ese email." : "Error al crear el comercial."); }
    else { setFormNuevoComercial({ nombre: "", apellidos: "", email: "", rol: "comercial" }); setMostrarNuevoComercial(false); cargarDatos(); }
    setGuardandoNuevoComercial(false);
  }

  function toggleMiembroEnForm(comercialId: string) {
    setFormEquipo(prev => ({
      ...prev,
      miembros_ids: prev.miembros_ids.includes(comercialId)
        ? prev.miembros_ids.filter(id => id !== comercialId)
        : [...prev.miembros_ids, comercialId],
    }));
  }

  const comercialesNoMiembros = comerciales.filter(
    c => !equipoSeleccionado?.miembros.some(m => m.comercial_id === c.id)
  );

  if (!cargandoPermisos && !puede("gestionar_equipo")) return <SinAcceso />;
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
            className="flex items-center gap-2 px-4 py-2 text-white text-sm font-medium rounded-lg transition-colors" style={{ background: "#ea650d" }}
          >
            + Nuevo equipo
          </button>
        )}
        {tab === "comerciales" && (
          <button
            onClick={() => setMostrarNuevoComercial(true)}
            className="flex items-center gap-2 px-4 py-2 text-white text-sm font-medium rounded-lg transition-colors" style={{ background: "#ea650d" }}
          >
            + Nuevo comercial
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
            {equipos.length === 0 ? (
              /* Empty state útil con guía de primeros pasos */
              <div className="bg-white rounded-xl border border-dashed border-slate-300 p-6 space-y-5">
                <div className="text-center">
                  <div className="w-12 h-12 bg-orange-50 rounded-xl flex items-center justify-center mx-auto mb-3">
                    <svg className="w-6 h-6 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <p className="text-sm font-semibold text-slate-700">Aún no hay equipos</p>
                  <p className="text-xs text-slate-400 mt-1">Organiza tu fuerza comercial en grupos por zona, producto o estrategia</p>
                </div>

                <div className="space-y-2.5">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Para qué sirven los equipos</p>
                  <div className="space-y-2">
                    {[
                      { icon: "📍", text: "Asignar comerciales a una zona geográfica" },
                      { icon: "🎯", text: "Distribuir leads por grupo de trabajo" },
                      { icon: "📊", text: "Ver métricas y carga por equipo" },
                      { icon: "🏆", text: "Comparar rendimiento entre equipos" },
                    ].map(({ icon, text }) => (
                      <div key={text} className="flex items-start gap-2">
                        <span className="text-sm flex-shrink-0">{icon}</span>
                        <p className="text-xs text-slate-500">{text}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2.5">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Primeros pasos</p>
                  <div className="space-y-1.5">
                    {[
                      { n: "1", text: `Tienes ${comerciales.length} comercial${comerciales.length !== 1 ? "es" : ""} activo${comerciales.length !== 1 ? "s" : ""}` },
                      { n: "2", text: "Crea un equipo y asigna quién lo integra" },
                      { n: "3", text: "Distribuye leads desde la lista de prospectos" },
                    ].map(({ n, text }) => (
                      <div key={n} className="flex items-start gap-2.5">
                        <span className="w-5 h-5 rounded-full bg-orange-100 text-orange-600 text-xs font-bold flex items-center justify-center flex-shrink-0">{n}</span>
                        <p className="text-xs text-slate-500 pt-0.5">{text}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  onClick={() => setMostrarNuevoEquipo(true)}
                  className="w-full py-2.5 text-white text-sm font-semibold rounded-lg transition-colors" style={{ background: "#ea650d" }}
                >
                  Crear el primer equipo
                </button>
              </div>
            ) : (
              equipos.map(eq => {
                const seleccionado = equipoSeleccionado?.id === eq.id;
                return (
                  <div
                    key={eq.id}
                    onClick={() => setEquipoSeleccionado(eq)}
                    className={`bg-white rounded-xl border p-4 cursor-pointer transition-all ${
                      seleccionado ? "border-orange-300 ring-2 ring-orange-100" : "border-slate-200 hover:border-slate-300"
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
                      <div className="bg-orange-50 rounded py-1">
                        <p className="text-sm font-bold text-orange-600">{eq.stats.enProceso}</p>
                        <p className="text-xs text-slate-400">proceso</p>
                      </div>
                      <div className="bg-emerald-50 rounded py-1">
                        <p className="text-sm font-bold text-emerald-600">{eq.stats.ganados}</p>
                        <p className="text-xs text-slate-400">ganados</p>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Panel detalle del equipo */}
          <div className="lg:col-span-2">
            {!equipoSeleccionado ? (
              equipos.length === 0 ? (
                <div className="bg-white rounded-xl border border-slate-100 p-12 text-center">
                  <p className="text-slate-300 text-sm">El panel de miembros aparecerá aquí</p>
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
                  <p className="text-slate-400 text-sm">Selecciona un equipo para gestionar sus miembros</p>
                </div>
              )
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
                      className="text-xs bg-orange-50 text-orange-600 border border-orange-300 hover:bg-orange-100 px-3 py-1.5 rounded-lg transition-colors font-medium"
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
                    <button onClick={() => setMostrarAnadirMiembro(true)} className="text-orange-600 text-sm hover:underline">
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
                          <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0" style={{ background: "#fff5f0", color: "#ea650d" }}>
                            {iniciales}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <Link href={`/desempeno/${m.comercial_id}`} className="text-sm font-medium text-slate-800 truncate hover:text-orange-600 hover:underline">
                                {m.comercial.nombre} {m.comercial.apellidos ?? ""}
                              </Link>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
                                m.rol === "lider" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"
                              }`}>
                                {m.rol === "lider" ? "Líder" : "Miembro"}
                              </span>
                            </div>
                            {m.comercial.email && (
                              <p className="text-xs text-slate-400 truncate">{m.comercial.email}</p>
                            )}
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
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                              onClick={() => { setMiembroParaMover(m); setEquipoDestinoId(""); }}
                              className="text-xs text-slate-400 hover:text-orange-600 border border-slate-200 hover:border-orange-300 px-2 py-1 rounded transition-colors"
                              title="Mover a otro equipo"
                            >
                              Mover
                            </button>
                            <button
                              onClick={() => quitarMiembro(m.id)}
                              className="text-xs text-slate-300 hover:text-red-500 transition-colors px-1 flex-shrink-0"
                              title="Quitar del equipo"
                            >
                              ×
                            </button>
                          </div>
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
                        className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-orange-300 bg-white"
                      >
                        <option value="">Seleccionar comercial...</option>
                        {comercialesNoMiembros.map(c => (
                          <option key={c.id} value={c.id}>{c.nombre} {c.apellidos ?? ""}</option>
                        ))}
                      </select>
                      <select
                        value={rolParaAnadir}
                        onChange={e => setRolParaAnadir(e.target.value as "lider" | "miembro")}
                        className="w-28 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-orange-300 bg-white"
                      >
                        <option value="miembro">Miembro</option>
                        <option value="lider">Líder</option>
                      </select>
                      <button
                        onClick={anadirMiembro}
                        disabled={!comercialParaAnadir}
                        className="px-4 py-2 text-white text-sm rounded-lg disabled:opacity-40 transition-colors" style={{ background: "#ea650d" }}
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
        /* Tab comerciales: tabla con datos reales */
        <div className="space-y-4">
          {/* Aviso de saturación */}
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

          {/* Tabla de comerciales */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-700">{comerciales.length} comerciales activos</p>
              <p className="text-xs text-slate-400">Carga calculada sobre leads activos (excluye cerrados/descartados)</p>
            </div>

            {comerciales.length === 0 ? (
              <div className="py-16 text-center">
                <p className="text-slate-400 text-sm">No hay comerciales activos</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {comerciales.map(c => {
                  const pct = c.porcentaje_carga;
                  const colorBarra = pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-emerald-500";
                  const colorPct = pct >= 90 ? "text-red-600" : pct >= 70 ? "text-amber-600" : "text-emerald-600";
                  const iniciales = [c.nombre, c.apellidos].filter(Boolean).join(" ")
                    .split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase();
                  const misEquipos = equipos.filter(e => e.miembros.some(m => m.comercial_id === c.id));

                  return (
                    <div key={c.id} className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50/50 transition-colors">
                      {/* Avatar */}
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${
                        c.rol === "director" ? "bg-amber-100 text-amber-700" : "bg-orange-100 text-orange-700"
                      }`}>
                        {iniciales}
                      </div>

                      {/* Nombre y datos */}
                      <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-4 gap-x-4 gap-y-1 items-center">
                        {/* Columna 1: Nombre + rol */}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Link
                              href={`/desempeno/${c.id}`}
                              className="text-sm font-semibold text-slate-800 hover:text-orange-600 hover:underline truncate"
                            >
                              {c.nombre} {c.apellidos ?? ""}
                            </Link>
                            <span className={`text-xs px-2 py-0.5 rounded font-medium flex-shrink-0 ${
                              c.rol === "director"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-slate-100 text-slate-500"
                            }`}>
                              {c.rol === "director" ? "Director" : "Comercial"}
                            </span>
                          </div>
                          {c.email && <p className="text-xs text-slate-400 truncate">{c.email}</p>}
                        </div>

                        {/* Columna 2: Leads activos */}
                        <div>
                          <p className="text-xs text-slate-400 mb-0.5">Leads activos</p>
                          <p className="text-sm font-bold text-slate-700">
                            {c.leads_activos}
                            <span className="text-xs font-normal text-slate-400"> / {c.max_leads_activos} máx.</span>
                          </p>
                        </div>

                        {/* Columna 3: Barra de carga */}
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-xs text-slate-400">Carga</p>
                            <span className={`text-xs font-bold ${colorPct}`}>{pct}%</span>
                          </div>
                          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${colorBarra}`}
                              style={{ width: `${Math.min(100, pct)}%` }}
                            />
                          </div>
                        </div>

                        {/* Columna 4: Equipos */}
                        <div>
                          <p className="text-xs text-slate-400 mb-1">Equipos</p>
                          {misEquipos.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {misEquipos.map(e => (
                                <span key={e.id} className="text-xs bg-orange-50 text-orange-600 px-2 py-0.5 rounded-full">
                                  {e.nombre}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-300">Sin equipo</span>
                          )}
                        </div>
                      </div>

                      {/* Botón editar */}
                      <button
                        onClick={() => setComercialEditando({
                          id: c.id,
                          nombre: c.nombre,
                          apellidos: c.apellidos ?? "",
                          rol: c.rol,
                          max_leads_activos: c.max_leads_activos,
                        })}
                        className="flex-shrink-0 text-xs text-slate-400 hover:text-orange-600 border border-slate-200 hover:border-orange-300 px-3 py-1.5 rounded-lg transition-colors font-medium"
                      >
                        Editar
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal mover miembro */}
      {miembroParaMover && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-800">Mover a otro equipo</h2>
              <button onClick={() => setMiembroParaMover(null)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-600">
                Mover a <strong>{miembroParaMover.comercial.nombre} {miembroParaMover.comercial.apellidos ?? ""}</strong> a:
              </p>
              <select
                value={equipoDestinoId}
                onChange={e => setEquipoDestinoId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-orange-300 bg-white"
              >
                <option value="">Seleccionar equipo destino...</option>
                {equipos.filter(e => e.id !== equipoSeleccionado?.id).map(e => (
                  <option key={e.id} value={e.id}>{e.nombre}</option>
                ))}
              </select>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button
                onClick={moverMiembro}
                disabled={!equipoDestinoId}
                className="flex-1 py-2.5 text-white text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors" style={{ background: "#ea650d" }}
              >
                Mover
              </button>
              <button onClick={() => setMiembroParaMover(null)} className="px-5 py-2.5 border border-slate-200 text-slate-600 text-sm rounded-xl hover:bg-slate-50">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal nuevo equipo — con selección de miembros */}
      {mostrarNuevoEquipo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
              <h2 className="text-base font-bold text-slate-800">Nuevo equipo</h2>
              <button onClick={() => setMostrarNuevoEquipo(false)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Nombre del equipo *</label>
                <input
                  value={formEquipo.nombre}
                  onChange={e => setFormEquipo(p => ({ ...p, nombre: e.target.value }))}
                  placeholder="Ej: Equipo Madrid"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-orange-300"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Zona geográfica</label>
                <input
                  value={formEquipo.zona_geografica}
                  onChange={e => setFormEquipo(p => ({ ...p, zona_geografica: e.target.value }))}
                  placeholder="Ej: Madrid y alrededores"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-orange-300"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Descripción</label>
                <textarea
                  value={formEquipo.descripcion}
                  onChange={e => setFormEquipo(p => ({ ...p, descripcion: e.target.value }))}
                  rows={2}
                  placeholder="Especialización, objetivos..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-orange-300 resize-none"
                />
              </div>

              {/* Selección de miembros */}
              {comerciales.length > 0 && (
                <div>
                  <label className="block text-xs text-slate-500 mb-2">
                    Miembros iniciales
                    {formEquipo.miembros_ids.length > 0 && (
                      <span className="ml-1.5 bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded text-xs font-semibold">
                        {formEquipo.miembros_ids.length} seleccionado{formEquipo.miembros_ids.length > 1 ? "s" : ""}
                      </span>
                    )}
                  </label>
                  <div className="space-y-1.5">
                    {comerciales.map((c, idx) => {
                      const selected = formEquipo.miembros_ids.includes(c.id);
                      const isFirst = formEquipo.miembros_ids[0] === c.id;
                      const iniciales = [c.nombre, c.apellidos].filter(Boolean).join(" ")
                        .split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase();
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => toggleMiembroEnForm(c.id)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all ${
                            selected
                              ? "border-orange-300 bg-orange-50"
                              : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                          }`}
                        >
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0 ${
                            c.rol === "director" ? "bg-amber-100 text-amber-700" : "bg-orange-100 text-orange-700"
                          }`}>
                            {iniciales}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-700 truncate">
                              {c.nombre} {c.apellidos ?? ""}
                            </p>
                            <p className="text-xs text-slate-400">
                              {c.rol === "director" ? "Director" : "Comercial"} · {c.leads_activos} leads activos
                            </p>
                          </div>
                          {selected && (
                            <span className={`text-xs font-semibold flex-shrink-0 ${
                              isFirst ? "text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded" : "text-orange-500"
                            }`}>
                              {isFirst ? "Líder" : "Miembro"}
                            </span>
                          )}
                          <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                            selected ? "bg-orange-500 border-orange-300" : "border-slate-300"
                          }`}>
                            {selected && (
                              <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  {formEquipo.miembros_ids.length > 0 && (
                    <p className="text-xs text-slate-400 mt-2">
                      El primero seleccionado ({comerciales.find(c => c.id === formEquipo.miembros_ids[0])?.nombre}) será asignado como líder.
                    </p>
                  )}
                </div>
              )}
            </div>
            <div className="px-6 pb-6 flex gap-3 flex-shrink-0 border-t border-slate-100 pt-4">
              <button
                onClick={crearEquipo}
                disabled={!formEquipo.nombre.trim() || guardando}
                className="flex-1 py-2.5 text-white text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors" style={{ background: "#ea650d" }}
              >
                {guardando ? "Creando..." : `Crear equipo${formEquipo.miembros_ids.length > 0 ? ` con ${formEquipo.miembros_ids.length} miembro${formEquipo.miembros_ids.length > 1 ? "s" : ""}` : ""}`}
              </button>
              <button
                onClick={() => { setMostrarNuevoEquipo(false); setFormEquipo({ nombre: "", descripcion: "", zona_geografica: "", miembros_ids: [] }); }}
                className="px-5 py-2.5 border border-slate-200 text-slate-600 text-sm rounded-xl hover:bg-slate-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal editar comercial */}
      {comercialEditando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-800">Editar comercial</h2>
              <button onClick={() => setComercialEditando(null)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <p className="text-sm font-semibold text-slate-800">{comercialEditando.nombre} {comercialEditando.apellidos}</p>
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1.5">Rol</label>
                <div className="grid grid-cols-2 gap-2">
                  {(["comercial", "director"] as const).map(r => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setComercialEditando(prev => prev ? { ...prev, rol: r } : null)}
                      className={`py-2.5 rounded-lg border text-sm font-medium transition-all ${
                        comercialEditando.rol === r
                          ? r === "director"
                            ? "bg-amber-50 border-amber-300 text-amber-700"
                            : "bg-orange-50 border-orange-300 text-orange-700"
                          : "border-slate-200 text-slate-500 hover:border-slate-300"
                      }`}
                    >
                      {r === "director" ? "Director" : "Comercial"}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1.5">Capacidad máxima de leads activos</label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={5}
                    max={200}
                    step={5}
                    value={comercialEditando.max_leads_activos}
                    onChange={e => setComercialEditando(prev => prev ? { ...prev, max_leads_activos: parseInt(e.target.value) } : null)}
                    className="flex-1 accent-orange-600"
                  />
                  <span className="text-sm font-bold text-slate-700 w-10 text-right">{comercialEditando.max_leads_activos}</span>
                </div>
                <p className="text-xs text-slate-400 mt-1">Define cuántos leads activos puede gestionar simultáneamente</p>
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button
                onClick={guardarComercial}
                disabled={guardandoComercial}
                className="flex-1 py-2.5 text-white text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors" style={{ background: "#ea650d" }}
              >
                {guardandoComercial ? "Guardando..." : "Guardar cambios"}
              </button>
              <button onClick={() => setComercialEditando(null)} className="px-5 py-2.5 border border-slate-200 text-slate-600 text-sm rounded-xl hover:bg-slate-50">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modal nuevo comercial */}
      {mostrarNuevoComercial && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-800">Añadir comercial</h2>
              <button onClick={() => { setMostrarNuevoComercial(false); setErrorNuevoComercial(""); }} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-500">El comercial podrá acceder con Google OAuth usando el email registrado.</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Nombre *</label>
                  <input value={formNuevoComercial.nombre} onChange={e => setFormNuevoComercial(p => ({...p, nombre: e.target.value}))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-orange-300" placeholder="Juan" />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Apellidos</label>
                  <input value={formNuevoComercial.apellidos} onChange={e => setFormNuevoComercial(p => ({...p, apellidos: e.target.value}))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-orange-300" placeholder="García" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Email Google *</label>
                <input type="email" value={formNuevoComercial.email} onChange={e => setFormNuevoComercial(p => ({...p, email: e.target.value}))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-orange-300" placeholder="juan@gmail.com" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1.5">Rol</label>
                <div className="grid grid-cols-2 gap-2">
                  {(["comercial", "manager", "director", "admin"] as const).map(r => (
                    <button key={r} type="button"
                      onClick={() => setFormNuevoComercial(p => ({...p, rol: r}))}
                      className={`py-2 rounded-lg border text-sm font-medium transition-all ${formNuevoComercial.rol === r ? "text-white border-transparent" : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"}`}
                      style={formNuevoComercial.rol === r ? { background: "#ea650d" } : undefined}>
                      {r.charAt(0).toUpperCase() + r.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              {errorNuevoComercial && <p className="text-xs text-red-600">{errorNuevoComercial}</p>}
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button onClick={crearComercial} disabled={guardandoNuevoComercial}
                className="flex-1 py-2.5 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50"
                style={{ background: "#ea650d" }}>
                {guardandoNuevoComercial ? "Creando..." : "Crear comercial"}
              </button>
              <button onClick={() => { setMostrarNuevoComercial(false); setErrorNuevoComercial(""); }} className="px-5 py-2.5 border border-slate-200 text-slate-600 text-sm rounded-xl hover:bg-slate-50">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
