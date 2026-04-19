"use client";

import { useEffect, useState, useCallback } from "react";
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
  created_at: string;
  leads: Lead;
};

export default function MensajesPage() {
  const [mensajes, setMensajes] = useState<MensajePendiente[]>([]);
  const [loading, setLoading] = useState(true);
  const [generando, setGenerando] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [textoEditado, setTextoEditado] = useState<Record<string, string>>({});
  const [procesando, setProcesando] = useState<Set<string>>(new Set());
  const [stats, setStats] = useState({ pendientes: 0, aprobados: 0, enviados: 0 });
  const [leadsElegibles, setLeadsElegibles] = useState(0);

  const cargarMensajes = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("mensajes_pendientes")
      .select("*, leads(id, nombre, apellidos, empresa, sector, ciudad, telefono_whatsapp, cargo)")
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
          {mensajes.map(m => {
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
                    <span className="text-xs text-slate-400">{mensajeActual.length} caracteres</span>
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
