"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";

type Comercial = {
  id: string;
  nombre: string;
  apellidos: string | null;
  email: string | null;
  telefono: string | null;
  activo: boolean;
  created_at: string;
};

type LeadResumen = {
  id: string;
  nombre: string;
  apellidos: string | null;
  empresa: string | null;
  estado: string;
  temperatura: string;
  nivel_interes: number;
  ciudad: string | null;
};

type StatsComercial = {
  total: number;
  calientes: number;
  ganados: number;
  enProceso: number;
};

const TEMP_COLOR: Record<string, string> = {
  caliente: "bg-red-100 text-red-700",
  templado: "bg-amber-100 text-amber-700",
  frio: "bg-blue-100 text-blue-700",
};

const ESTADO_LABEL: Record<string, string> = {
  nuevo: "Nuevo", enriquecido: "Enriquecido", segmentado: "Segmentado",
  mensaje_generado: "Msg. Generado", mensaje_enviado: "Contactado",
  respondio: "Respondió", cita_agendada: "Cita", en_negociacion: "Negociación",
  cerrado_ganado: "Ganado", cerrado_perdido: "Perdido", descartado: "Descartado",
};

export default function EquipoPage() {
  const [comerciales, setComerciales] = useState<Comercial[]>([]);
  const [loading, setLoading] = useState(true);
  const [comercialSeleccionado, setComercialSeleccionado] = useState<Comercial | null>(null);
  const [leadsComercial, setLeadsComercial] = useState<LeadResumen[]>([]);
  const [stats, setStats] = useState<Record<string, StatsComercial>>({});
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [mostrarNuevo, setMostrarNuevo] = useState(false);
  const [formNuevo, setFormNuevo] = useState({ nombre: "", apellidos: "", email: "", telefono: "" });
  const [guardandoNuevo, setGuardandoNuevo] = useState(false);
  const [editandoComercial, setEditandoComercial] = useState<Comercial | null>(null);
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);

  const cargarComerciales = useCallback(async () => {
    setLoading(true);
    const [{ data: comercialesData }, { data: leadsData }] = await Promise.all([
      supabase.from("comerciales").select("*").order("nombre"),
      supabase.from("leads").select("id, comercial_asignado, temperatura, estado"),
    ]);
    const lista = (comercialesData as Comercial[]) ?? [];
    setComerciales(lista);

    const todosLeads = (leadsData ?? []) as { id: string; comercial_asignado: string | null; temperatura: string; estado: string }[];
    const statsMap: Record<string, StatsComercial> = {};
    for (const c of lista) {
      const lc = todosLeads.filter(l => l.comercial_asignado === c.id);
      statsMap[c.id] = {
        total: lc.length,
        calientes: lc.filter(l => l.temperatura === "caliente").length,
        ganados: lc.filter(l => l.estado === "cerrado_ganado").length,
        enProceso: lc.filter(l => ["respondio", "cita_agendada", "en_negociacion"].includes(l.estado)).length,
      };
    }
    setStats(statsMap);
    setLoading(false);
  }, []);

  useEffect(() => { cargarComerciales(); }, [cargarComerciales]);

  async function verLeads(comercial: Comercial) {
    setComercialSeleccionado(comercial);
    setLoadingLeads(true);
    const { data } = await supabase
      .from("leads")
      .select("id, nombre, apellidos, empresa, estado, temperatura, nivel_interes, ciudad")
      .eq("comercial_asignado", comercial.id)
      .order("nivel_interes", { ascending: false })
      .limit(50);
    setLeadsComercial((data as LeadResumen[]) ?? []);
    setLoadingLeads(false);
  }

  async function crearComercial() {
    if (!formNuevo.nombre.trim()) return;
    setGuardandoNuevo(true);
    await supabase.from("comerciales").insert({
      nombre: formNuevo.nombre.trim(),
      apellidos: formNuevo.apellidos.trim() || null,
      email: formNuevo.email.trim() || null,
      telefono: formNuevo.telefono.trim() || null,
      activo: true,
    });
    setFormNuevo({ nombre: "", apellidos: "", email: "", telefono: "" });
    setMostrarNuevo(false);
    setGuardandoNuevo(false);
    cargarComerciales();
  }

  async function toggleActivo(comercial: Comercial) {
    await supabase.from("comerciales").update({ activo: !comercial.activo }).eq("id", comercial.id);
    setComerciales(prev => prev.map(c => c.id === comercial.id ? { ...c, activo: !c.activo } : c));
  }

  async function guardarEdicionComercial() {
    if (!editandoComercial) return;
    setGuardandoEdicion(true);
    await supabase.from("comerciales").update({
      nombre: editandoComercial.nombre,
      apellidos: editandoComercial.apellidos || null,
      email: editandoComercial.email || null,
      telefono: editandoComercial.telefono || null,
    }).eq("id", editandoComercial.id);
    setComerciales(prev => prev.map(c => c.id === editandoComercial.id ? editandoComercial : c));
    setEditandoComercial(null);
    setGuardandoEdicion(false);
  }

  async function reasignarLead(leadId: string, nuevoComercialId: string) {
    await supabase.from("leads").update({ comercial_asignado: nuevoComercialId, updated_at: new Date().toISOString() }).eq("id", leadId);
    setLeadsComercial(prev => prev.filter(l => l.id !== leadId));
    // Refrescar stats
    cargarComerciales();
  }

  const activos = comerciales.filter(c => c.activo);
  const inactivos = comerciales.filter(c => !c.activo);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Equipo comercial</h1>
          <p className="text-sm text-slate-500 mt-0.5">{activos.length} comerciales activos</p>
        </div>
        <button
          onClick={() => setMostrarNuevo(true)}
          className="flex items-center gap-2 px-4 py-2 text-white text-sm font-medium rounded-lg transition-colors"
          style={{ background: "#ea650d" }}
        >
          + Añadir comercial
        </button>
      </div>

      {loading ? (
        <div className="py-20 text-center text-sm text-slate-400">Cargando equipo...</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Lista de comerciales */}
          <div className="space-y-3">
            {activos.length === 0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-sm text-slate-400">
                No hay comerciales activos. Añade el primero.
              </div>
            )}

            {activos.map(c => {
              const s = stats[c.id] ?? { total: 0, calientes: 0, ganados: 0, enProceso: 0 };
              const iniciales = [c.nombre, c.apellidos].filter(Boolean).join(" ").split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase();
              const seleccionado = comercialSeleccionado?.id === c.id;
              return (
                <div
                  key={c.id}
                  className={`bg-white rounded-xl border p-4 transition-all cursor-pointer ${seleccionado ? "ring-2" : "border-slate-200 hover:border-slate-300"}`}
                  style={seleccionado ? { borderColor: "#ea650d", outline: "2px solid #fff5f0" } : undefined}
                  onClick={() => verLeads(c)}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0" style={{ background: "#fff5f0", color: "#ea650d" }}>
                      {iniciales}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-800 text-sm truncate">{c.nombre} {c.apellidos ?? ""}</p>
                      {c.email && <p className="text-xs text-slate-400 truncate">{c.email}</p>}
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button
                        onClick={e => { e.stopPropagation(); setEditandoComercial({ ...c }); }}
                        className="text-xs text-slate-400 px-1.5 py-1 rounded hover:bg-orange-50 transition-colors"
                        onMouseEnter={e => (e.currentTarget.style.color = "#ea650d")}
                        onMouseLeave={e => (e.currentTarget.style.color = "")}
                      >
                        Editar
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-1 text-center">
                    <div className="bg-slate-50 rounded-lg py-1.5">
                      <p className="text-sm font-bold text-slate-700">{s.total}</p>
                      <p className="text-xs text-slate-400">leads</p>
                    </div>
                    <div className="bg-red-50 rounded-lg py-1.5">
                      <p className="text-sm font-bold text-red-600">{s.calientes}</p>
                      <p className="text-xs text-slate-400">calientes</p>
                    </div>
                    <div className="rounded-lg py-1.5" style={{ background: "#fff5f0" }}>
                      <p className="text-sm font-bold" style={{ color: "#ea650d" }}>{s.enProceso}</p>
                      <p className="text-xs text-slate-400">en proceso</p>
                    </div>
                    <div className="bg-emerald-50 rounded-lg py-1.5">
                      <p className="text-sm font-bold text-emerald-600">{s.ganados}</p>
                      <p className="text-xs text-slate-400">ganados</p>
                    </div>
                  </div>

                  {seleccionado && (
                    <div className="mt-2 pt-2 border-t border-slate-100 text-xs text-center font-medium" style={{ color: "#ea650d" }}>
                      Ver leads →
                    </div>
                  )}
                </div>
              );
            })}

            {/* Comerciales inactivos */}
            {inactivos.length > 0 && (
              <details className="group">
                <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-600 py-1">
                  {inactivos.length} comercial{inactivos.length > 1 ? "es" : ""} inactivo{inactivos.length > 1 ? "s" : ""}
                </summary>
                <div className="space-y-2 mt-2">
                  {inactivos.map(c => (
                    <div key={c.id} className="bg-white rounded-xl border border-slate-200 p-3 opacity-60 flex items-center justify-between">
                      <p className="text-sm text-slate-600">{c.nombre} {c.apellidos ?? ""}</p>
                      <button onClick={() => toggleActivo(c)} className="text-xs hover:underline" style={{ color: "#ea650d" }}>Reactivar</button>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>

          {/* Panel de leads del comercial seleccionado */}
          <div className="lg:col-span-2">
            {!comercialSeleccionado ? (
              <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
                <p className="text-slate-400 text-sm">Selecciona un comercial para ver sus leads y reasignarlos</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-bold text-slate-800">
                      Leads de {comercialSeleccionado.nombre} {comercialSeleccionado.apellidos ?? ""}
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">{leadsComercial.length} leads asignados</p>
                  </div>
                  <button
                    onClick={() => toggleActivo(comercialSeleccionado)}
                    className="text-xs text-slate-400 hover:text-red-600 border border-slate-200 hover:border-red-200 px-2.5 py-1.5 rounded-lg transition-colors"
                  >
                    {comercialSeleccionado.activo ? "Desactivar" : "Activar"}
                  </button>
                </div>

                {loadingLeads ? (
                  <div className="py-12 text-center text-sm text-slate-400">Cargando leads...</div>
                ) : leadsComercial.length === 0 ? (
                  <div className="py-12 text-center text-sm text-slate-400">No tiene leads asignados</div>
                ) : (
                  <div className="overflow-y-auto max-h-[600px]">
                    {leadsComercial.map(lead => (
                      <div key={lead.id} className="flex items-center gap-3 px-5 py-3 border-b border-slate-50 hover:bg-slate-50 group">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <Link href={`/leads/${lead.id}`} className="text-sm font-medium text-slate-800 truncate hover:opacity-70">
                              {[lead.nombre, lead.apellidos].filter(Boolean).join(" ") || "Sin nombre"}
                            </Link>
                            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${TEMP_COLOR[lead.temperatura] ?? "bg-slate-100 text-slate-500"}`}>
                              {lead.temperatura}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            {lead.empresa && <p className="text-xs text-slate-400 truncate">{lead.empresa}</p>}
                            {lead.ciudad && <p className="text-xs text-slate-300">· {lead.ciudad}</p>}
                            <span className="text-xs text-slate-400 ml-auto">
                              {ESTADO_LABEL[lead.estado] ?? lead.estado}
                            </span>
                          </div>
                        </div>

                        {/* Reasignar a otro comercial */}
                        <select
                          defaultValue=""
                          onChange={e => { if (e.target.value) reasignarLead(lead.id, e.target.value); }}
                          className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 text-slate-500 bg-white opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100 focus:border-orange-300 focus:outline-none"
                          onClick={e => e.stopPropagation()}
                        >
                          <option value="" disabled>Reasignar →</option>
                          {activos.filter(c => c.id !== comercialSeleccionado.id).map(c => (
                            <option key={c.id} value={c.id}>{c.nombre} {c.apellidos ?? ""}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal nuevo comercial */}
      {mostrarNuevo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-800">Añadir comercial</h2>
              <button onClick={() => setMostrarNuevo(false)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Nombre *</label>
                  <input
                    value={formNuevo.nombre}
                    onChange={e => setFormNuevo(p => ({ ...p, nombre: e.target.value }))}
                    placeholder="Nombre"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-orange-300"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Apellidos</label>
                  <input
                    value={formNuevo.apellidos}
                    onChange={e => setFormNuevo(p => ({ ...p, apellidos: e.target.value }))}
                    placeholder="Apellidos"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-orange-300"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Email</label>
                  <input
                    type="email"
                    value={formNuevo.email}
                    onChange={e => setFormNuevo(p => ({ ...p, email: e.target.value }))}
                    placeholder="email@ejemplo.com"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-orange-300"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Teléfono</label>
                  <input
                    value={formNuevo.telefono}
                    onChange={e => setFormNuevo(p => ({ ...p, telefono: e.target.value }))}
                    placeholder="+34 600 000 000"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-orange-300"
                  />
                </div>
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button
                onClick={crearComercial}
                disabled={!formNuevo.nombre.trim() || guardandoNuevo}
                className="flex-1 py-2.5 text-white text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors"
                style={{ background: "#ea650d" }}
              >
                {guardandoNuevo ? "Guardando..." : "Crear comercial"}
              </button>
              <button onClick={() => setMostrarNuevo(false)} className="px-5 py-2.5 border border-slate-200 text-slate-600 text-sm rounded-xl hover:bg-slate-50">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal editar comercial */}
      {editandoComercial && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-800">Editar comercial</h2>
              <button onClick={() => setEditandoComercial(null)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Nombre *</label>
                  <input
                    value={editandoComercial.nombre}
                    onChange={e => setEditandoComercial(p => p ? ({ ...p, nombre: e.target.value }) : p)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-orange-300"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Apellidos</label>
                  <input
                    value={editandoComercial.apellidos ?? ""}
                    onChange={e => setEditandoComercial(p => p ? ({ ...p, apellidos: e.target.value }) : p)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-orange-300"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Email</label>
                  <input
                    type="email"
                    value={editandoComercial.email ?? ""}
                    onChange={e => setEditandoComercial(p => p ? ({ ...p, email: e.target.value }) : p)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-orange-300"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Teléfono</label>
                  <input
                    value={editandoComercial.telefono ?? ""}
                    onChange={e => setEditandoComercial(p => p ? ({ ...p, telefono: e.target.value }) : p)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-orange-300"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="activo"
                  checked={editandoComercial.activo}
                  onChange={e => setEditandoComercial(p => p ? ({ ...p, activo: e.target.checked }) : p)}
                  className="rounded"
                />
                <label htmlFor="activo" className="text-sm text-slate-600">Comercial activo</label>
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button
                onClick={guardarEdicionComercial}
                disabled={!editandoComercial.nombre.trim() || guardandoEdicion}
                className="flex-1 py-2.5 text-white text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors"
                style={{ background: "#ea650d" }}
              >
                {guardandoEdicion ? "Guardando..." : "Guardar cambios"}
              </button>
              <button onClick={() => setEditandoComercial(null)} className="px-5 py-2.5 border border-slate-200 text-slate-600 text-sm rounded-xl hover:bg-slate-50">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
