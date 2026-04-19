"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Lead = {
  id: string;
  nombre: string;
  apellidos?: string;
  empresa?: string;
  sector?: string;
  ciudad?: string;
  telefono_whatsapp?: string;
  cargo?: string;
};

type MensajePendiente = {
  id: string;
  lead_id: string;
  mensaje: string;
  canal: string;
  estado: string;
  editado_por_comercial: boolean;
  campana_nombre: string | null;
  created_at: string;
  leads: Lead;
};

type PlantillaWA = {
  id: string;
  titulo: string;
  contenido: string;
  descripcion: string | null;
  orden: number;
};

function aplicarVariables(texto: string, lead: Lead): string {
  const nombre = [lead.nombre, lead.apellidos].filter(Boolean).join(" ") || "";
  return texto
    .replaceAll("{{nombre}}", lead.nombre || nombre)
    .replaceAll("{{empresa}}", lead.empresa || "")
    .replaceAll("{{ciudad}}", lead.ciudad || "")
    .replaceAll("{{sector}}", lead.sector || "")
    .replaceAll("{{cargo}}", lead.cargo || "");
}

export default function MensajesPage() {
  const [mensajes, setMensajes] = useState<MensajePendiente[]>([]);
  const [loading, setLoading] = useState(true);
  const [generando, setGenerando] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [textoEditado, setTextoEditado] = useState<Record<string, string>>({});
  const [procesando, setProcesando] = useState<Set<string>>(new Set());
  const [stats, setStats] = useState({ pendientes: 0, aprobados: 0, enviados: 0 });
  const [leadsElegibles, setLeadsElegibles] = useState(0);
  const [plantillas, setPlantillas] = useState<PlantillaWA[]>([]);
  const [plantillaPickerAbierto, setPlantillaPickerAbierto] = useState<string | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const [filtroSector, setFiltroSector] = useState("");
  const [filtroCiudad, setFiltroCiudad] = useState("");

  const cargarMensajes = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("mensajes_pendientes")
      .select("*, campana_nombre, leads(id, nombre, apellidos, empresa, sector, ciudad, telefono_whatsapp, cargo)")
      .eq("estado", "pendiente")
      .order("created_at", { ascending: true })
      .limit(50);

    setMensajes((data as MensajePendiente[]) ?? []);

    // Stats
    const { count: pendientes } = await supabase.from("mensajes_pendientes").select("id", { count: "exact", head: true }).eq("estado", "pendiente");
    const { count: aprobados } = await supabase.from("mensajes_pendientes").select("id", { count: "exact", head: true }).eq("estado", "aprobado");
    const { count: enviados } = await supabase.from("mensajes_pendientes").select("id", { count: "exact", head: true }).eq("estado", "enviado");
    setStats({ pendientes: pendientes ?? 0, aprobados: aprobados ?? 0, enviados: enviados ?? 0 });

    // Leads que podrían recibir un mensaje (nuevos/enriquecidos/segmentados con teléfono)
    const { count: elegibles } = await supabase.from("leads")
      .select("id", { count: "exact", head: true })
      .in("estado", ["nuevo", "enriquecido", "segmentado"])
      .not("telefono_whatsapp", "is", null);
    setLeadsElegibles(elegibles ?? 0);

    setLoading(false);
  }, []);

  useEffect(() => { cargarMensajes(); }, [cargarMensajes]);

  useEffect(() => {
    supabase.from("recursos_rapidos").select("id, titulo, contenido, descripcion, orden")
      .eq("tipo", "plantilla_wa").order("orden", { ascending: true }).order("created_at", { ascending: true })
      .then(({ data }) => setPlantillas((data as PlantillaWA[]) ?? []));
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPlantillaPickerAbierto(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const generarMensajes = async () => {
    setGenerando(true);
    try {
      await fetch("/api/backend/mensajes/generar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limite: 30 }),
      });
      setTimeout(() => {
        cargarMensajes();
        setGenerando(false);
      }, 4000);
    } catch {
      setGenerando(false);
    }
  };

  const aprobar = async (id: string) => {
    setProcesando(prev => new Set(prev).add(id));
    const mensajeEditado = textoEditado[id];
    await fetch(`/api/backend/mensajes/${id}/aprobar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mensaje_editado: mensajeEditado || null }),
    });
    setProcesando(prev => { const s = new Set(prev); s.delete(id); return s; });
    setEditando(null);
    cargarMensajes();
  };

  const descartar = async (id: string) => {
    setProcesando(prev => new Set(prev).add(id));
    await fetch(`/api/backend/mensajes/${id}/descartar`, { method: "POST" });
    setProcesando(prev => { const s = new Set(prev); s.delete(id); return s; });
    cargarMensajes();
  };

  const regenerar = async (leadId: string, mensajeId: string) => {
    setProcesando(prev => new Set(prev).add(mensajeId));
    const resp = await fetch("/api/backend/mensajes/generar-uno", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lead_id: leadId }),
    });
    if (resp.ok) {
      const data = await resp.json();
      setTextoEditado(prev => ({ ...prev, [mensajeId]: data.mensaje }));
      setEditando(mensajeId);
    }
    setProcesando(prev => { const s = new Set(prev); s.delete(mensajeId); return s; });
  };

  const abrirWhatsApp = (telefono: string, mensaje: string) => {
    const num = telefono.replace("+", "");
    const url = `https://wa.me/${num}?text=${encodeURIComponent(mensaje)}`;
    window.open(url, "_blank");
  };

  const aprobarTodos = async () => {
    if (!confirm(`¿Aprobar los ${mensajes.length} mensajes pendientes?`)) return;
    const ids = mensajes.map(m => m.id);
    for (const id of ids) {
      await fetch(`/api/backend/mensajes/${id}/aprobar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mensaje_editado: textoEditado[id] || null }) });
    }
    cargarMensajes();
  };

  const sectores = Array.from(new Set(mensajes.map(m => m.leads.sector).filter(Boolean) as string[])).sort();
  const ciudades = Array.from(new Set(mensajes.map(m => m.leads.ciudad).filter(Boolean) as string[])).sort();
  const mensajesFiltrados = mensajes.filter(m => {
    if (filtroSector && m.leads.sector !== filtroSector) return false;
    if (filtroCiudad && m.leads.ciudad !== filtroCiudad) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Cabecera */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Mensajes</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Revisa y aprueba los mensajes generados por IA antes de enviarlos
          </p>
        </div>
        <div className="flex items-center gap-2">
          {mensajes.length > 1 && (
            <button
              onClick={aprobarTodos}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-green-200 text-green-700 bg-green-50 hover:bg-green-100 transition-colors"
            >
              ✓ Aprobar todos ({mensajes.length})
            </button>
          )}
        <button
          onClick={generarMensajes}
          disabled={generando}
          className="flex items-center gap-2 px-4 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors" style={{ background: "#ea650d" }}
        >
          {generando ? (
            <>
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
              Generando...
            </>
          ) : (
            <>✦ Generar mensajes con IA</>
          )}
        </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-amber-600">{stats.pendientes}</p>
          <p className="text-xs text-slate-500 mt-1">Pendientes de revisión</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-green-600">{stats.aprobados}</p>
          <p className="text-xs text-slate-500 mt-1">Aprobados (listos para enviar)</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold" style={{ color: "#ea650d" }}>{stats.enviados}</p>
          <p className="text-xs text-slate-500 mt-1">Enviados</p>
        </div>
      </div>

      {/* Filtros rápidos */}
      {!loading && mensajes.length > 0 && (sectores.length > 1 || ciudades.length > 1) && (
        <div className="flex flex-wrap items-center gap-2 pb-1">
          <span className="text-xs text-slate-400 font-medium">Filtrar:</span>
          {sectores.length > 1 && (
            <select value={filtroSector} onChange={e => setFiltroSector(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-600 focus:outline-none focus:border-orange-300">
              <option value="">Todos los sectores</option>
              {sectores.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          {ciudades.length > 1 && (
            <select value={filtroCiudad} onChange={e => setFiltroCiudad(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-600 focus:outline-none focus:border-orange-300">
              <option value="">Todas las ciudades</option>
              {ciudades.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          {(filtroSector || filtroCiudad) && (
            <button onClick={() => { setFiltroSector(""); setFiltroCiudad(""); }}
              className="text-xs text-slate-400 hover:text-slate-700 underline">
              Limpiar
            </button>
          )}
          {(filtroSector || filtroCiudad) && (
            <span className="text-xs text-slate-500 ml-1">{mensajesFiltrados.length} de {mensajes.length}</span>
          )}
        </div>
      )}

      {/* Lista de mensajes */}
      {loading ? (
        <div className="py-16 text-center text-sm text-slate-400">Cargando mensajes...</div>
      ) : mensajes.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl py-12 text-center space-y-3 px-6">
          <p className="text-slate-500 text-sm">No hay mensajes pendientes de revisión</p>
          {leadsElegibles > 0 ? (
            <div className="space-y-2">
              <p className="text-xs text-slate-400">
                Tienes <strong className="text-slate-700">{leadsElegibles} leads</strong> en el pipeline sin mensaje enviado
              </p>
              <button
                onClick={generarMensajes}
                disabled={generando}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-50"
                style={{ background: "#ea650d" }}
              >
                {generando ? "Generando..." : `✦ Generar mensajes para ${leadsElegibles} leads`}
              </button>
            </div>
          ) : (
            <button onClick={generarMensajes} className="text-sm hover:underline" style={{ color: "#ea650d" }}>
              Generar mensajes para leads nuevos
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {mensajesFiltrados.map(m => {
            const lead = m.leads;
            const nombreCompleto = lead.nombre && lead.apellidos
              ? `${lead.nombre} ${lead.apellidos}`
              : lead.nombre || "";
            const destinatario = nombreCompleto || lead.empresa || "Sin nombre";
            const mensajeActual = textoEditado[m.id] ?? m.mensaje;
            const estaEditando = editando === m.id;
            const ocupado = procesando.has(m.id);

            return (
              <div key={m.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                {/* Cabecera del lead */}
                <div className="flex items-center justify-between px-5 py-3 bg-slate-50 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0" style={{ background: "#fff5f0", color: "#ea650d" }}>
                      {destinatario[0]?.toUpperCase()}
                    </div>
                    <div>
                      <Link href={`/leads/${lead.id}`} className="text-sm font-semibold text-slate-800 hover:underline" style={{ color: "#ea650d" }}>
                        {destinatario} →
                      </Link>
                      <p className="text-xs text-slate-400">
                        {[lead.cargo, lead.empresa, lead.sector, lead.ciudad].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {m.campana_nombre && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium max-w-32 truncate" title={m.campana_nombre}>
                        📢 {m.campana_nombre}
                      </span>
                    )}
                    {lead.telefono_whatsapp ? (
                      <span className="text-xs text-green-600 font-mono bg-green-50 px-2 py-0.5 rounded">
                        {lead.telefono_whatsapp}
                      </span>
                    ) : (
                      <span className="text-xs text-amber-500 bg-amber-50 px-2 py-0.5 rounded">
                        Sin teléfono
                      </span>
                    )}
                  </div>
                </div>

                {/* Mensaje */}
                <div className="px-5 py-4">
                  {estaEditando && plantillas.length > 0 && (
                    <div className="relative mb-2" ref={plantillaPickerAbierto === m.id ? pickerRef : undefined}>
                      <button
                        onClick={() => setPlantillaPickerAbierto(prev => prev === m.id ? null : m.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-orange-200 transition-colors hover:bg-orange-50"
                        style={{ color: "#ea650d" }}
                      >
                        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                        </svg>
                        Usar plantilla
                        <span className="text-orange-300">({plantillas.length})</span>
                      </button>
                      {plantillaPickerAbierto === m.id && (
                        <div ref={pickerRef} className="absolute left-0 top-full mt-1 z-20 w-80 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                          <div className="px-3 py-2 bg-slate-50 border-b border-slate-100">
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Selecciona una plantilla</p>
                            <p className="text-xs text-slate-400 mt-0.5">Las variables se rellenan con los datos del lead</p>
                          </div>
                          <div className="max-h-56 overflow-y-auto">
                            {plantillas.map(p => (
                              <button
                                key={p.id}
                                onClick={() => {
                                  setTextoEditado(prev => ({ ...prev, [m.id]: aplicarVariables(p.contenido, lead) }));
                                  setPlantillaPickerAbierto(null);
                                }}
                                className="w-full text-left px-3 py-2.5 hover:bg-orange-50 border-b border-slate-50 transition-colors"
                              >
                                <p className="text-xs font-semibold text-slate-800">{p.titulo}</p>
                                {p.descripcion && <p className="text-xs text-slate-400 mt-0.5">{p.descripcion}</p>}
                                <p className="text-xs text-slate-300 mt-0.5 truncate">{p.contenido.slice(0, 60)}…</p>
                              </button>
                            ))}
                          </div>
                          <div className="px-3 py-2 bg-slate-50 border-t border-slate-100">
                            <Link href="/ajustes" className="text-xs hover:underline" style={{ color: "#ea650d" }}>
                              Gestionar plantillas en Ajustes →
                            </Link>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {estaEditando ? (
                    <textarea
                      value={mensajeActual}
                      onChange={e => setTextoEditado(prev => ({ ...prev, [m.id]: e.target.value }))}
                      className="w-full text-sm text-slate-700 bg-amber-50 border border-amber-200 rounded-lg p-3 resize-none focus:outline-none focus:ring-2 focus:ring-amber-300"
                      rows={4}
                    />
                  ) : (
                    <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                      {mensajeActual}
                    </p>
                  )}
                  <div className="flex items-center justify-between mt-2">
                    <span className={`text-xs ${mensajeActual.length > 1000 ? "text-amber-500 font-medium" : "text-slate-400"}`}>
                      {mensajeActual.length} caracteres{mensajeActual.length > 1000 ? " · largo para WA" : ""}
                    </span>
                    <div className="flex items-center gap-2">
                      {m.editado_por_comercial && (
                        <span className="text-xs text-amber-600">✏ Editado</span>
                      )}
                      <button
                        onClick={() => navigator.clipboard.writeText(mensajeActual)}
                        className="text-xs text-slate-400 hover:text-slate-700 transition-colors"
                        title="Copiar mensaje"
                      >
                        Copiar
                      </button>
                    </div>
                  </div>
                </div>

                {/* Acciones */}
                <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-slate-50">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        if (estaEditando) {
                          setEditando(null);
                        } else {
                          setTextoEditado(prev => ({ ...prev, [m.id]: m.mensaje }));
                          setEditando(m.id);
                        }
                      }}
                      className="px-3 py-1.5 text-xs text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
                    >
                      {estaEditando ? "Cancelar edición" : "✏ Editar"}
                    </button>
                    <button
                      onClick={() => regenerar(lead.id, m.id)}
                      disabled={ocupado}
                      className="px-3 py-1.5 text-xs text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-100 disabled:opacity-50 transition-colors"
                    >
                      {ocupado ? "..." : "↺ Regenerar"}
                    </button>
                    <button
                      onClick={() => descartar(m.id)}
                      disabled={ocupado}
                      className="px-3 py-1.5 text-xs text-red-500 border border-red-100 rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
                    >
                      Descartar
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    {lead.telefono_whatsapp && (
                      <button
                        onClick={async () => {
                          abrirWhatsApp(lead.telefono_whatsapp!, mensajeActual);
                          await aprobar(m.id);
                        }}
                        disabled={ocupado}
                        className="flex items-center gap-1.5 px-4 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                      >
                        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                        </svg>
                        Enviar por WhatsApp
                      </button>
                    )}
                    <button
                      onClick={() => aprobar(m.id)}
                      disabled={ocupado}
                      className="px-4 py-1.5 text-white text-xs font-medium rounded-lg disabled:opacity-50 transition-colors" style={{ background: "#ea650d" }}
                    >
                      {ocupado ? "..." : "✓ Aprobar"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
