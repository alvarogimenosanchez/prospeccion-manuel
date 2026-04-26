"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { usePermisos } from "@/components/PermisosProvider";
import { format, parseISO, isPast, differenceInDays } from "date-fns";
import { es } from "date-fns/locale";

// ─── Types ────────────────────────────────────────────────────────────────────

type Incidencia = {
  id: string;
  titulo: string;
  descripcion: string | null;
  tipo: "queja_cliente" | "error_agente" | "problema_tecnico" | "fraude" | "datos_incorrectos" | "proceso" | "otro";
  prioridad: "critica" | "alta" | "media" | "baja";
  estado: "abierta" | "en_proceso" | "pendiente_cliente" | "resuelta" | "cerrada";
  cliente_id: string | null;
  lead_id: string | null;
  comercial_responsable_id: string | null;
  reportado_por: string | null;
  resolucion: string | null;
  fecha_limite: string | null;
  resuelta_at: string | null;
  created_at: string;
  cliente_nombre?: string;
  lead_nombre?: string;
  responsable_nombre?: string;
  reportado_nombre?: string;
};

type ComercialBasico = { id: string; nombre: string; apellidos: string | null };
type ClienteBasico = { id: string; nombre: string; apellidos: string | null };

// ─── Constants ────────────────────────────────────────────────────────────────

const TIPO_CFG = {
  queja_cliente:     { label: "Queja cliente",     icon: "😤", bg: "bg-red-50",    text: "text-red-700"    },
  error_agente:      { label: "Error agente",       icon: "⚠️", bg: "bg-amber-50",  text: "text-amber-700"  },
  problema_tecnico:  { label: "Prob. técnico",      icon: "🔧", bg: "bg-blue-50",   text: "text-blue-700"   },
  fraude:            { label: "Fraude",             icon: "🚨", bg: "bg-red-100",   text: "text-red-800"    },
  datos_incorrectos: { label: "Datos incorrectos",  icon: "📊", bg: "bg-purple-50", text: "text-purple-700" },
  proceso:           { label: "Proceso",            icon: "📋", bg: "bg-slate-50",  text: "text-slate-600"  },
  otro:              { label: "Otro",               icon: "❓", bg: "bg-slate-50",  text: "text-slate-600"  },
};

const PRIORIDAD_CFG = {
  critica: { label: "Crítica", bg: "bg-red-600",    text: "text-white",        order: 0 },
  alta:    { label: "Alta",    bg: "bg-red-100",    text: "text-red-700",      order: 1 },
  media:   { label: "Media",   bg: "bg-amber-100",  text: "text-amber-700",    order: 2 },
  baja:    { label: "Baja",    bg: "bg-slate-100",  text: "text-slate-600",    order: 3 },
};

const ESTADO_CFG = {
  abierta:           { label: "Abierta",           dot: "bg-red-500",    bg: "bg-red-50",    text: "text-red-700"   },
  en_proceso:        { label: "En proceso",        dot: "bg-blue-500",   bg: "bg-blue-50",   text: "text-blue-700"  },
  pendiente_cliente: { label: "Pend. cliente",     dot: "bg-amber-500",  bg: "bg-amber-50",  text: "text-amber-700" },
  resuelta:          { label: "Resuelta",          dot: "bg-green-500",  bg: "bg-green-50",  text: "text-green-700" },
  cerrada:           { label: "Cerrada",           dot: "bg-slate-400",  bg: "bg-slate-50",  text: "text-slate-600" },
};

// ─── Modal ────────────────────────────────────────────────────────────────────

function ModalIncidencia({
  incidencia,
  comerciales,
  clientes,
  miId,
  onClose,
  onSave,
}: {
  incidencia?: Incidencia | null;
  comerciales: ComercialBasico[];
  clientes: ClienteBasico[];
  miId: string | null;
  onClose: () => void;
  onSave: () => void;
}) {
  const [titulo, setTitulo] = useState(incidencia?.titulo ?? "");
  const [descripcion, setDescripcion] = useState(incidencia?.descripcion ?? "");
  const [tipo, setTipo] = useState<Incidencia["tipo"]>(incidencia?.tipo ?? "queja_cliente");
  const [prioridad, setPrioridad] = useState<Incidencia["prioridad"]>(incidencia?.prioridad ?? "media");
  const [responsableId, setResponsableId] = useState(incidencia?.comercial_responsable_id ?? "");
  const [clienteId, setClienteId] = useState(incidencia?.cliente_id ?? "");
  const [fechaLimite, setFechaLimite] = useState(incidencia?.fecha_limite ? incidencia.fecha_limite.slice(0, 10) : "");
  const [resolucion, setResolucion] = useState(incidencia?.resolucion ?? "");
  const [estado, setEstado] = useState<Incidencia["estado"]>(incidencia?.estado ?? "abierta");
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    if (!titulo.trim()) return;
    setGuardando(true);
    const payload = {
      titulo: titulo.trim(),
      descripcion: descripcion.trim() || null,
      tipo,
      prioridad,
      estado,
      comercial_responsable_id: responsableId || null,
      cliente_id: clienteId || null,
      reportado_por: miId,
      resolucion: resolucion.trim() || null,
      fecha_limite: fechaLimite ? new Date(fechaLimite).toISOString() : null,
      resuelta_at: (estado === "resuelta" || estado === "cerrada") && !incidencia?.resuelta_at ? new Date().toISOString() : incidencia?.resuelta_at ?? null,
      updated_at: new Date().toISOString(),
    };
    if (incidencia) {
      await supabase.from("incidencias").update(payload).eq("id", incidencia.id);
    } else {
      await supabase.from("incidencias").insert(payload);
    }
    setGuardando(false);
    onSave();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.4)" }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-900">
            {incidencia ? "Editar incidencia" : "Nueva incidencia"}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">×</button>
        </div>
        <div className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Título *</label>
            <input value={titulo} onChange={e => setTitulo(e.target.value)}
              placeholder="Describe brevemente el problema..."
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-400" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Descripción detallada</label>
            <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)} rows={3}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-400 resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Tipo</label>
              <select value={tipo} onChange={e => setTipo(e.target.value as Incidencia["tipo"])}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-400">
                {Object.entries(TIPO_CFG).map(([k, v]) => (
                  <option key={k} value={k}>{v.icon} {v.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Prioridad</label>
              <select value={prioridad} onChange={e => setPrioridad(e.target.value as Incidencia["prioridad"])}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-400">
                {Object.entries(PRIORIDAD_CFG).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Estado</label>
              <select value={estado} onChange={e => setEstado(e.target.value as Incidencia["estado"])}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-400">
                {Object.entries(ESTADO_CFG).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Fecha límite</label>
              <input type="date" value={fechaLimite} onChange={e => setFechaLimite(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-400" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Agente responsable</label>
            <select value={responsableId} onChange={e => setResponsableId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-400">
              <option value="">Sin asignar</option>
              {comerciales.map(c => (
                <option key={c.id} value={c.id}>{c.nombre} {c.apellidos ?? ""}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Cliente relacionado</label>
            <select value={clienteId} onChange={e => setClienteId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-400">
              <option value="">Sin cliente</option>
              {clientes.slice(0, 50).map(c => (
                <option key={c.id} value={c.id}>{c.nombre} {c.apellidos ?? ""}</option>
              ))}
            </select>
          </div>
          {(estado === "resuelta" || estado === "cerrada") && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Resolución / Notas finales</label>
              <textarea value={resolucion} onChange={e => setResolucion(e.target.value)} rows={3}
                placeholder="¿Cómo se resolvió? ¿Qué medidas se tomaron?"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-400 resize-none" />
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
            Cancelar
          </button>
          <button onClick={guardar} disabled={!titulo.trim() || guardando}
            className="px-4 py-2 text-sm text-white rounded-lg font-medium disabled:opacity-50"
            style={{ background: "#ea650d" }}>
            {guardando ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function IncidenciasPage() {
  const { puede, cargando: cargandoPermisos } = usePermisos();
  const [incidencias, setIncidencias] = useState<Incidencia[]>([]);
  const [comerciales, setComerciales] = useState<ComercialBasico[]>([]);
  const [clientes, setClientes] = useState<ClienteBasico[]>([]);
  const [cargando, setCargando] = useState(true);
  const [miId, setMiId] = useState<string | null>(null);
  const [modalNueva, setModalNueva] = useState(false);
  const [editando, setEditando] = useState<Incidencia | null>(null);
  const [filtroEstado, setFiltroEstado] = useState<string>("abierta");
  const [filtroTipo, setFiltroTipo] = useState<string>("");
  const [filtroPrioridad, setFiltroPrioridad] = useState<string>("");

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data: { user } } = await supabase.auth.getUser();
    let cId: string | null = null;
    if (user?.email) {
      const { data: com } = await supabase.from("comerciales").select("id").eq("email", user.email).single();
      cId = com?.id ?? null;
    }
    setMiId(cId);

    const [{ data: incs }, { data: coms }, { data: clis }] = await Promise.all([
      supabase.from("incidencias")
        .select("*, clientes(nombre, apellidos), leads(nombre, apellidos), comerciales!comercial_responsable_id(nombre, apellidos)")
        .order("created_at", { ascending: false }),
      supabase.from("comerciales").select("id, nombre, apellidos").eq("activo", true).order("nombre"),
      supabase.from("clientes").select("id, nombre, apellidos").order("nombre").limit(100),
    ]);

    const incsEnriquecidas = (incs ?? []).map(i => {
      const cli = i.clientes as unknown as { nombre: string; apellidos: string | null } | null;
      const lead = i.leads as unknown as { nombre: string; apellidos: string | null } | null;
      const com = i.comerciales as unknown as { nombre: string; apellidos: string | null } | null;
      return {
        ...i,
        cliente_nombre: cli ? [cli.nombre, cli.apellidos].filter(Boolean).join(" ") : undefined,
        lead_nombre: lead ? [lead.nombre, lead.apellidos].filter(Boolean).join(" ") : undefined,
        responsable_nombre: com ? [com.nombre, com.apellidos].filter(Boolean).join(" ") : undefined,
      };
    });

    setIncidencias(incsEnriquecidas);
    setComerciales(coms ?? []);
    setClientes(clis ?? []);
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // ── Stats ──────────────────────────────────────────────────────────────────

  const abiertas = incidencias.filter(i => i.estado === "abierta").length;
  const criticas = incidencias.filter(i => i.prioridad === "critica" && i.estado !== "cerrada").length;
  const enProceso = incidencias.filter(i => i.estado === "en_proceso").length;
  const resueltas = incidencias.filter(i => i.estado === "resuelta" || i.estado === "cerrada").length;

  // ── Filtered ───────────────────────────────────────────────────────────────

  const listaFiltrada = incidencias
    .filter(i => {
      if (filtroEstado && i.estado !== filtroEstado) return false;
      if (filtroTipo && i.tipo !== filtroTipo) return false;
      if (filtroPrioridad && i.prioridad !== filtroPrioridad) return false;
      return true;
    })
    .sort((a, b) => {
      const pa = PRIORIDAD_CFG[a.prioridad].order;
      const pb = PRIORIDAD_CFG[b.prioridad].order;
      return pa - pb || new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Incidencias</h1>
          <p className="text-sm text-slate-500 mt-0.5">Gestión de quejas, errores y problemas internos del equipo</p>
        </div>
        <button onClick={() => setModalNueva(true)}
          className="px-4 py-2 text-sm text-white rounded-xl font-medium"
          style={{ background: "#ea650d" }}>
          + Nueva incidencia
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Abiertas",   value: abiertas,   icon: "🔴", color: "text-red-600" },
          { label: "Críticas",   value: criticas,   icon: "🚨", color: "text-red-700" },
          { label: "En proceso", value: enProceso,  icon: "🔵", color: "text-blue-600" },
          { label: "Resueltas",  value: resueltas,  icon: "✅", color: "text-green-600" },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-xl border border-slate-200 px-4 py-3">
            <div className="flex items-center gap-2 mb-1">
              <span>{k.icon}</span>
              <span className="text-xs text-slate-500">{k.label}</span>
            </div>
            <div className={`text-2xl font-bold ${k.color}`}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}
          className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-orange-400">
          <option value="">Todos los estados</option>
          {Object.entries(ESTADO_CFG).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}
          className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-orange-400">
          <option value="">Todos los tipos</option>
          {Object.entries(TIPO_CFG).map(([k, v]) => (
            <option key={k} value={k}>{v.icon} {v.label}</option>
          ))}
        </select>
        <select value={filtroPrioridad} onChange={e => setFiltroPrioridad(e.target.value)}
          className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-orange-400">
          <option value="">Todas las prioridades</option>
          {Object.entries(PRIORIDAD_CFG).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
      </div>

      {/* List */}
      {cargando ? (
        <div className="py-12 text-center text-sm text-slate-400">Cargando incidencias...</div>
      ) : listaFiltrada.length === 0 ? (
        <div className="py-12 text-center">
          <div className="text-4xl mb-3">✅</div>
          <p className="text-sm text-slate-400">
            {filtroEstado === "abierta" ? "No hay incidencias abiertas. ¡Buen trabajo!" : "No hay incidencias con estos filtros."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {listaFiltrada.map(inc => {
            const tipoCfg = TIPO_CFG[inc.tipo];
            const prioCfg = PRIORIDAD_CFG[inc.prioridad];
            const estadoCfg = ESTADO_CFG[inc.estado];
            const vencida = inc.fecha_limite && isPast(new Date(inc.fecha_limite)) && inc.estado !== "cerrada" && inc.estado !== "resuelta";
            const diasRestantes = inc.fecha_limite && !vencida
              ? differenceInDays(new Date(inc.fecha_limite), new Date())
              : null;
            return (
              <div key={inc.id}
                className={`bg-white rounded-xl border px-4 py-3 ${vencida ? "border-red-300 bg-red-50/30" : "border-slate-200"}`}>
                <div className="flex items-start gap-3">
                  <div className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-lg ${tipoCfg.bg}`}>
                    {tipoCfg.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-900">{inc.titulo}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${prioCfg.bg} ${prioCfg.text}`}>
                        {prioCfg.label}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${estadoCfg.bg} ${estadoCfg.text}`}>
                        <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${estadoCfg.dot}`} />
                        {estadoCfg.label}
                      </span>
                      {vencida && <span className="text-xs text-red-600 font-medium">⚠️ Vencida</span>}
                    </div>
                    {inc.descripcion && (
                      <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{inc.descripcion}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1.5 flex-wrap text-xs text-slate-400">
                      {inc.responsable_nombre && <span>→ {inc.responsable_nombre}</span>}
                      {inc.cliente_nombre && <span>Cliente: {inc.cliente_nombre}</span>}
                      {diasRestantes !== null && (
                        <span className={diasRestantes <= 2 ? "text-amber-500" : ""} suppressHydrationWarning>
                          {diasRestantes === 0 ? "Vence hoy" : `${diasRestantes}d restantes`}
                        </span>
                      )}
                      <span>{format(parseISO(inc.created_at), "d MMM yyyy", { locale: es })}</span>
                    </div>
                    {inc.resolucion && (
                      <p className="text-xs text-green-600 mt-1">✓ {inc.resolucion}</p>
                    )}
                  </div>
                  <button onClick={() => setEditando(inc)}
                    className="shrink-0 px-3 py-1.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600">
                    Editar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      {(modalNueva || editando) && (
        <ModalIncidencia
          incidencia={editando}
          comerciales={comerciales}
          clientes={clientes}
          miId={miId}
          onClose={() => { setModalNueva(false); setEditando(null); }}
          onSave={() => { setModalNueva(false); setEditando(null); cargar(); }}
        />
      )}
    </div>
  );
}
