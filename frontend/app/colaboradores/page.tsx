"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { usePermisos } from "@/components/PermisosProvider";

// ─── Types ────────────────────────────────────────────────────────────────────

type Colaborador = {
  id: string;
  nombre: string;
  apellidos: string | null;
  empresa: string | null;
  tipo: string;
  telefono: string | null;
  email: string | null;
  ciudad: string | null;
  notas: string | null;
  activo: boolean;
  comision_pct: number | null;
  ultimo_contacto: string | null;
  comercial_asignado: string | null;
};

type Referencia = {
  id: string;
  colaborador_id: string;
  nombre_referido: string;
  estado: "pendiente" | "en_proceso" | "cerrado_ganado" | "cerrado_perdido";
  valor_contrato: number | null;
  comision_pagada: boolean;
  notas: string | null;
  created_at: string;
};

const TIPO_CFG: Record<string, { label: string; color: string; icon: string }> = {
  asesoria:    { label: "Asesoría",     color: "#3b82f6", icon: "📊" },
  inmobiliaria:{ label: "Inmobiliaria", color: "#10b981", icon: "🏡" },
  abogado:     { label: "Abogado",      color: "#8b5cf6", icon: "⚖️" },
  arquitecto:  { label: "Arquitecto",   color: "#f59e0b", icon: "🏛️" },
  contable:    { label: "Contable",     color: "#06b6d4", icon: "🧮" },
  banco:       { label: "Banco",        color: "#64748b", icon: "🏦" },
  otro:        { label: "Otro",         color: "#9ca3af", icon: "🤝" },
};

const ESTADO_REF: Record<string, { label: string; color: string }> = {
  pendiente:       { label: "Pendiente",     color: "#f59e0b" },
  en_proceso:      { label: "En proceso",    color: "#3b82f6" },
  cerrado_ganado:  { label: "Cerrado ✓",     color: "#10b981" },
  cerrado_perdido: { label: "Perdido",       color: "#ef4444" },
};

function SinAcceso() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="text-4xl mb-3">🔒</div>
      <h2 className="text-lg font-semibold text-slate-700">Sin acceso</h2>
      <p className="text-sm text-slate-500 mt-1">No tienes permiso para ver esta sección.</p>
    </div>
  );
}

// ─── Modal colaborador ────────────────────────────────────────────────────────

function ModalColaborador({
  colab,
  onClose,
  onSave,
}: {
  colab?: Colaborador | null;
  onClose: () => void;
  onSave: () => void;
}) {
  const [nombre, setNombre] = useState(colab?.nombre ?? "");
  const [apellidos, setApellidos] = useState(colab?.apellidos ?? "");
  const [empresa, setEmpresa] = useState(colab?.empresa ?? "");
  const [tipo, setTipo] = useState(colab?.tipo ?? "otro");
  const [telefono, setTelefono] = useState(colab?.telefono ?? "");
  const [email, setEmail] = useState(colab?.email ?? "");
  const [ciudad, setCiudad] = useState(colab?.ciudad ?? "");
  const [comision, setComision] = useState(colab?.comision_pct?.toString() ?? "");
  const [notas, setNotas] = useState(colab?.notas ?? "");
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    if (!nombre.trim()) return;
    setGuardando(true);
    const payload = {
      nombre: nombre.trim(),
      apellidos: apellidos.trim() || null,
      empresa: empresa.trim() || null,
      tipo,
      telefono: telefono.trim() || null,
      email: email.trim() || null,
      ciudad: ciudad.trim() || null,
      comision_pct: comision ? parseFloat(comision) : null,
      notas: notas.trim() || null,
      updated_at: new Date().toISOString(),
    };
    if (colab) {
      await supabase.from("colaboradores").update(payload).eq("id", colab.id);
    } else {
      await supabase.from("colaboradores").insert({ ...payload, activo: true });
    }
    setGuardando(false);
    onSave();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.4)" }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-900">
            {colab ? "Editar colaborador" : "Nuevo colaborador"}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">×</button>
        </div>
        <div className="px-6 py-4 space-y-4">
          {/* Tipo selector */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Tipo de colaborador</label>
            <div className="grid grid-cols-4 gap-2">
              {Object.entries(TIPO_CFG).map(([key, cfg]) => (
                <button key={key} onClick={() => setTipo(key)}
                  className="flex flex-col items-center gap-1 p-2 rounded-xl border-2 text-xs font-medium transition-all"
                  style={{
                    borderColor: tipo === key ? cfg.color : "#e2e8f0",
                    background: tipo === key ? cfg.color + "15" : "white",
                    color: tipo === key ? cfg.color : "#64748b",
                  }}>
                  <span className="text-lg">{cfg.icon}</span>
                  {cfg.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Nombre *</label>
              <input value={nombre} onChange={e => setNombre(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Apellidos</label>
              <input value={apellidos} onChange={e => setApellidos(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-400" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Empresa / Despacho</label>
              <input value={empresa} onChange={e => setEmpresa(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Ciudad</label>
              <input value={ciudad} onChange={e => setCiudad(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-400" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Teléfono</label>
              <input value={telefono} onChange={e => setTelefono(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input value={email} onChange={e => setEmail(e.target.value)} type="email"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-400" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Comisión acordada (%)</label>
            <input value={comision} onChange={e => setComision(e.target.value)} type="number" min="0" max="100" step="0.5"
              placeholder="Ej: 5"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-400" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Notas</label>
            <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={3}
              placeholder="Especialidad, productos que recomienda, contexto de la relación..."
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-400 resize-none" />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
            Cancelar
          </button>
          <button onClick={guardar} disabled={!nombre.trim() || guardando}
            className="px-4 py-2 text-sm text-white rounded-lg font-medium disabled:opacity-50"
            style={{ background: "#ea650d" }}>
            {guardando ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal referencia ─────────────────────────────────────────────────────────

function ModalReferencia({
  colaboradorId,
  refData,
  onClose,
  onSave,
}: {
  colaboradorId: string;
  refData?: Referencia | null;
  onClose: () => void;
  onSave: () => void;
}) {
  const [nombre, setNombre] = useState(refData?.nombre_referido ?? "");
  const [estado, setEstado] = useState<string>(refData?.estado ?? "pendiente");
  const [valor, setValor] = useState(refData?.valor_contrato?.toString() ?? "");
  const [pagada, setPagada] = useState(refData?.comision_pagada ?? false);
  const [notas, setNotas] = useState(refData?.notas ?? "");
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    if (!nombre.trim()) return;
    setGuardando(true);
    const payload = {
      colaborador_id: colaboradorId,
      nombre_referido: nombre.trim(),
      estado,
      valor_contrato: valor ? parseFloat(valor) : null,
      comision_pagada: pagada,
      notas: notas.trim() || null,
    };
    if (refData) {
      await supabase.from("referencias_colaborador").update(payload).eq("id", refData.id);
    } else {
      await supabase.from("referencias_colaborador").insert(payload);
    }
    setGuardando(false);
    onSave();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.4)" }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-900">{refData ? "Editar referencia" : "Nueva referencia"}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">×</button>
        </div>
        <div className="px-6 py-4 space-y-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Nombre del referido *</label>
            <input value={nombre} onChange={e => setNombre(e.target.value)}
              placeholder="Empresa o persona referida"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-400" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Estado</label>
            <div className="flex gap-2 flex-wrap">
              {Object.entries(ESTADO_REF).map(([key, cfg]) => (
                <button key={key} onClick={() => setEstado(key)}
                  className="px-3 py-1 text-xs rounded-full border font-medium transition-all"
                  style={{
                    borderColor: estado === key ? cfg.color : "#e2e8f0",
                    background: estado === key ? cfg.color + "20" : "white",
                    color: estado === key ? cfg.color : "#64748b",
                  }}>
                  {cfg.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Valor contrato (€)</label>
            <input value={valor} onChange={e => setValor(e.target.value)} type="number" min="0"
              placeholder="Opcional"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-400" />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="pagada" checked={pagada} onChange={e => setPagada(e.target.checked)}
              className="w-4 h-4 rounded" />
            <label htmlFor="pagada" className="text-sm text-slate-700">Comisión pagada al colaborador</label>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Notas</label>
            <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-400 resize-none" />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
            Cancelar
          </button>
          <button onClick={guardar} disabled={!nombre.trim() || guardando}
            className="px-4 py-2 text-sm text-white rounded-lg font-medium disabled:opacity-50"
            style={{ background: "#ea650d" }}>
            {guardando ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Colaborador detail row ───────────────────────────────────────────────────

function ColaboradorRow({
  colab,
  onEdit,
  onRefrescar,
}: {
  colab: Colaborador;
  onEdit: () => void;
  onRefrescar: () => void;
}) {
  const { puede } = usePermisos();
  const [expandido, setExpandido] = useState(false);
  const [referencias, setReferencias] = useState<Referencia[]>([]);
  const [cargandoRefs, setCargandoRefs] = useState(false);
  const [modalRef, setModalRef] = useState(false);
  const [editandoRef, setEditandoRef] = useState<Referencia | null>(null);
  const cfg = TIPO_CFG[colab.tipo] ?? TIPO_CFG.otro;

  const cargarRefs = useCallback(async () => {
    setCargandoRefs(true);
    const { data } = await supabase
      .from("referencias_colaborador")
      .select("*")
      .eq("colaborador_id", colab.id)
      .order("created_at", { ascending: false });
    setReferencias(data ?? []);
    setCargandoRefs(false);
  }, [colab.id]);

  useEffect(() => {
    if (expandido) cargarRefs();
  }, [expandido, cargarRefs]);

  const totalValor = referencias.filter(r => r.estado === "cerrado_ganado" && r.valor_contrato).reduce((s, r) => s + (r.valor_contrato ?? 0), 0);
  const comisionPendiente = referencias.filter(r => r.estado === "cerrado_ganado" && !r.comision_pagada).reduce((s, r) => s + ((r.valor_contrato ?? 0) * (colab.comision_pct ?? 0) / 100), 0);

  async function marcarContacto() {
    await supabase.from("colaboradores").update({ ultimo_contacto: new Date().toISOString().split("T")[0] }).eq("id", colab.id);
    onRefrescar();
  }

  const diasDesdeContacto = colab.ultimo_contacto
    ? Math.floor((Date.now() - new Date(colab.ultimo_contacto).getTime()) / 86400000)
    : null;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden hover:border-orange-200 transition-colors">
      <button className="w-full px-5 py-4 flex items-center gap-4 text-left" onClick={() => setExpandido(!expandido)}>
        <div className="shrink-0 w-11 h-11 rounded-xl flex items-center justify-center text-xl"
          style={{ background: cfg.color + "15" }}>
          {cfg.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-slate-900">{colab.nombre} {colab.apellidos ?? ""}</span>
            <span className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={{ background: cfg.color + "15", color: cfg.color }}>{cfg.label}</span>
            {colab.empresa && <span className="text-xs text-slate-500">{colab.empresa}</span>}
          </div>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            {colab.ciudad && <span className="text-xs text-slate-400">📍 {colab.ciudad}</span>}
            {colab.comision_pct && <span className="text-xs text-slate-400">💸 {colab.comision_pct}% comisión</span>}
            {diasDesdeContacto !== null && (
              <span className={`text-xs ${diasDesdeContacto > 60 ? "text-red-400" : diasDesdeContacto > 30 ? "text-amber-500" : "text-green-600"}`}>
                {diasDesdeContacto === 0 ? "Contactado hoy" : `Último contacto: hace ${diasDesdeContacto}d`}
              </span>
            )}
            {diasDesdeContacto === null && <span className="text-xs text-slate-400">Sin contacto registrado</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {colab.telefono && (
            <a href={`tel:${colab.telefono}`} onClick={e => e.stopPropagation()}
              className="w-8 h-8 rounded-lg flex items-center justify-center bg-green-50 text-green-600 hover:bg-green-100"
              title={colab.telefono}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.63A2 2 0 012.18 1h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L6.91 8.82a16 16 0 006.27 6.27l1.18-1.42a2 2 0 012.11-.45c.9.35 1.85.56 2.81.7A2 2 0 0122 16.92z"/>
              </svg>
            </a>
          )}
          {puede("gestionar_clientes") && (
            <button onClick={e => { e.stopPropagation(); onEdit(); }}
              className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600">
              Editar
            </button>
          )}
          <svg className={`shrink-0 text-slate-400 transition-transform ${expandido ? "rotate-180" : ""}`}
            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </button>

      {expandido && (
        <div className="border-t border-slate-100 px-5 py-4">
          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-slate-50 rounded-xl p-3 text-center">
              <div className="text-xl font-bold text-slate-800">{referencias.length}</div>
              <div className="text-xs text-slate-500 mt-0.5">Referencias totales</div>
            </div>
            <div className="bg-green-50 rounded-xl p-3 text-center">
              <div className="text-xl font-bold text-green-700">
                {totalValor > 0 ? `${totalValor.toLocaleString("es-ES")}€` : "—"}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">Valor cerrado</div>
            </div>
            <div className={`rounded-xl p-3 text-center ${comisionPendiente > 0 ? "bg-orange-50" : "bg-slate-50"}`}>
              <div className={`text-xl font-bold ${comisionPendiente > 0 ? "text-orange-600" : "text-slate-400"}`}>
                {comisionPendiente > 0 ? `${comisionPendiente.toFixed(0)}€` : "—"}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">Comisión pendiente</div>
            </div>
          </div>

          {/* Contact info */}
          {(colab.telefono || colab.email || colab.notas) && (
            <div className="bg-slate-50 rounded-xl p-3 mb-4 space-y-1.5">
              {colab.telefono && <div className="text-xs text-slate-600">📞 {colab.telefono}</div>}
              {colab.email && <div className="text-xs text-slate-600">✉️ {colab.email}</div>}
              {colab.notas && <div className="text-xs text-slate-500 italic">{colab.notas}</div>}
            </div>
          )}

          {/* References */}
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-semibold text-slate-700">Referencias enviadas</div>
            <div className="flex gap-2">
              <button onClick={marcarContacto}
                className="text-xs px-3 py-1 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600">
                ✓ Marcar contacto hoy
              </button>
              {puede("gestionar_clientes") && (
                <button onClick={() => setModalRef(true)}
                  className="text-xs px-3 py-1 text-white rounded-lg font-medium"
                  style={{ background: "#ea650d" }}>
                  + Referencia
                </button>
              )}
            </div>
          </div>

          {cargandoRefs ? (
            <div className="text-xs text-slate-400 py-4 text-center">Cargando...</div>
          ) : referencias.length === 0 ? (
            <div className="text-xs text-slate-400 py-4 text-center">Sin referencias registradas</div>
          ) : (
            <div className="space-y-2">
              {referencias.map(r => {
                const estCfg = ESTADO_REF[r.estado] ?? ESTADO_REF.pendiente;
                return (
                  <div key={r.id} className="flex items-center gap-3 p-2.5 bg-slate-50 rounded-lg">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-slate-800 truncate">{r.nombre_referido}</div>
                      {r.notas && <div className="text-xs text-slate-400 truncate">{r.notas}</div>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {r.valor_contrato && (
                        <span className="text-xs text-slate-500">{r.valor_contrato.toLocaleString("es-ES")}€</span>
                      )}
                      {r.comision_pagada && (
                        <span className="text-xs text-green-600 font-medium">✓ Com. pagada</span>
                      )}
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{ background: estCfg.color + "20", color: estCfg.color }}>
                        {estCfg.label}
                      </span>
                      {puede("gestionar_clientes") && (
                        <button onClick={() => setEditandoRef(r)}
                          className="text-xs text-slate-400 hover:text-slate-600">Editar</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {(modalRef || editandoRef) && (
        <ModalReferencia
          colaboradorId={colab.id}
          refData={editandoRef}
          onClose={() => { setModalRef(false); setEditandoRef(null); }}
          onSave={() => { setModalRef(false); setEditandoRef(null); cargarRefs(); }}
        />
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ColaboradoresPage() {
  const { puede, cargando: cargandoPermisos } = usePermisos();
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [cargando, setCargando] = useState(true);
  const [modalNuevo, setModalNuevo] = useState(false);
  const [editando, setEditando] = useState<Colaborador | null>(null);
  const [busq, setBusq] = useState("");
  const [filtroTipo, setFiltroTipo] = useState<string>("todos");

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data } = await supabase
      .from("colaboradores")
      .select("*")
      .eq("activo", true)
      .order("nombre");
    setColaboradores(data ?? []);
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  if (!cargandoPermisos && !puede("gestionar_clientes")) return <SinAcceso />;

  const filtrados = colaboradores.filter(c => {
    const matchBusq = !busq || [c.nombre, c.apellidos, c.empresa, c.ciudad].some(f => f?.toLowerCase().includes(busq.toLowerCase()));
    const matchTipo = filtroTipo === "todos" || c.tipo === filtroTipo;
    return matchBusq && matchTipo;
  });

  const tiposPresentes = [...new Set(colaboradores.map(c => c.tipo))];

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Red de colaboradores</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Asesores, inmobiliarias y profesionales que nos mandan referencias
          </p>
        </div>
        {puede("gestionar_clientes") && (
          <button onClick={() => setModalNuevo(true)}
            className="px-4 py-2 text-sm text-white rounded-xl font-medium"
            style={{ background: "#ea650d" }}>
            + Añadir colaborador
          </button>
        )}
      </div>

      {/* Stats banner */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <div className="text-2xl font-bold text-slate-800">{colaboradores.length}</div>
          <div className="text-xs text-slate-500 mt-0.5">Colaboradores activos</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <div className="text-2xl font-bold text-orange-600">
            {colaboradores.filter(c => {
              if (!c.ultimo_contacto) return true;
              return Math.floor((Date.now() - new Date(c.ultimo_contacto).getTime()) / 86400000) > 60;
            }).length}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">Sin contacto +60d</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <div className="text-2xl font-bold text-blue-600">
            {[...new Set(tiposPresentes)].length}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">Tipos de perfil</div>
        </div>
      </div>

      {/* Search + filter */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
          </svg>
          <input value={busq} onChange={e => setBusq(e.target.value)}
            placeholder="Buscar por nombre, empresa, ciudad..."
            className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-orange-400 bg-white" />
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setFiltroTipo("todos")}
            className="px-3 py-2 text-xs rounded-xl border font-medium transition-all"
            style={{
              borderColor: filtroTipo === "todos" ? "#ea650d" : "#e2e8f0",
              background: filtroTipo === "todos" ? "#fff5f0" : "white",
              color: filtroTipo === "todos" ? "#ea650d" : "#64748b",
            }}>
            Todos
          </button>
          {tiposPresentes.map(t => {
            const cfg = TIPO_CFG[t] ?? TIPO_CFG.otro;
            return (
              <button key={t} onClick={() => setFiltroTipo(t)}
                className="px-3 py-2 text-xs rounded-xl border font-medium transition-all"
                style={{
                  borderColor: filtroTipo === t ? cfg.color : "#e2e8f0",
                  background: filtroTipo === t ? cfg.color + "15" : "white",
                  color: filtroTipo === t ? cfg.color : "#64748b",
                }}>
                {cfg.icon} {cfg.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Alerta recontacto */}
      {colaboradores.some(c => {
        if (!c.ultimo_contacto) return true;
        return Math.floor((Date.now() - new Date(c.ultimo_contacto).getTime()) / 86400000) > 60;
      }) && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <span className="text-xl">⏰</span>
          <div>
            <div className="text-sm font-semibold text-amber-800">Colaboradores sin contactar en +60 días</div>
            <div className="text-xs text-amber-700 mt-0.5">
              Mantener la relación activa es clave para recibir referencias constantes. Llama o visita regularmente.
            </div>
          </div>
        </div>
      )}

      {/* List */}
      {cargando ? (
        <div className="py-10 text-center text-sm text-slate-400">Cargando...</div>
      ) : filtrados.length === 0 ? (
        <div className="py-10 text-center text-sm text-slate-400">Sin colaboradores encontrados.</div>
      ) : (
        <div className="space-y-3">
          {filtrados.map(c => (
            <ColaboradorRow
              key={c.id}
              colab={c}
              onEdit={() => setEditando(c)}
              onRefrescar={cargar}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      {(modalNuevo || editando) && (
        <ModalColaborador
          colab={editando}
          onClose={() => { setModalNuevo(false); setEditando(null); }}
          onSave={() => { setModalNuevo(false); setEditando(null); cargar(); }}
        />
      )}
    </div>
  );
}
