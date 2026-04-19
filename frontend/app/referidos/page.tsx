"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { formatDistanceToNow, parseISO } from "date-fns";
import { es } from "date-fns/locale";

// ─── Types ────────────────────────────────────────────────────────────────────

type Referido = {
  id: string;
  cliente_id: string | null;
  lead_referido_id: string | null;
  nombre_referido: string;
  telefono_referido: string | null;
  email_referido: string | null;
  notas: string | null;
  estado: "pendiente" | "contactado" | "en_proceso" | "cerrado_ganado" | "cerrado_perdido";
  recompensa_enviada: boolean;
  comercial_id: string | null;
  created_at: string;
  cliente_nombre?: string;
  lead_nombre?: string;
};

type ClienteBasico = { id: string; nombre: string; apellidos: string | null; telefono: string | null };
type ReferidorStats = { cliente_id: string; nombre: string; total: number; ganados: number };

// ─── Constants ────────────────────────────────────────────────────────────────

const ESTADO_CFG = {
  pendiente:        { label: "Pendiente",       bg: "bg-slate-100",   text: "text-slate-600",   dot: "bg-slate-400" },
  contactado:       { label: "Contactado",      bg: "bg-blue-100",    text: "text-blue-700",    dot: "bg-blue-500"  },
  en_proceso:       { label: "En proceso",      bg: "bg-amber-100",   text: "text-amber-700",   dot: "bg-amber-500" },
  cerrado_ganado:   { label: "Cerrado ✓",       bg: "bg-green-100",   text: "text-green-700",   dot: "bg-green-500" },
  cerrado_perdido:  { label: "Perdido",         bg: "bg-red-100",     text: "text-red-600",     dot: "bg-red-400"   },
};

// ─── Modal: New referral ──────────────────────────────────────────────────────

function ModalReferido({
  clientes,
  miId,
  onClose,
  onSave,
}: {
  clientes: ClienteBasico[];
  miId: string | null;
  onClose: () => void;
  onSave: () => void;
}) {
  const [clienteId, setClienteId] = useState("");
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");
  const [notas, setNotas] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [busqCliente, setBusqCliente] = useState("");

  const clientesFiltrados = clientes.filter(c => {
    const n = `${c.nombre} ${c.apellidos ?? ""}`.toLowerCase();
    return !busqCliente || n.includes(busqCliente.toLowerCase()) || (c.telefono ?? "").includes(busqCliente);
  }).slice(0, 8);

  async function guardar() {
    if (!nombre.trim()) return;
    setGuardando(true);
    await supabase.from("referidos").insert({
      cliente_id: clienteId || null,
      nombre_referido: nombre.trim(),
      telefono_referido: telefono.trim() || null,
      email_referido: email.trim() || null,
      notas: notas.trim() || null,
      comercial_id: miId,
      estado: "pendiente",
    });
    setGuardando(false);
    onSave();
  }

  const clienteSeleccionado = clientes.find(c => c.id === clienteId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.4)" }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-900">Nuevo referido</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">×</button>
        </div>
        <div className="px-6 py-4 space-y-4">
          {/* Client who refers */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Cliente que refiere *</label>
            {clienteSeleccionado ? (
              <div className="flex items-center justify-between p-2.5 bg-green-50 border border-green-200 rounded-lg">
                <span className="text-sm font-medium text-green-800">
                  {clienteSeleccionado.nombre} {clienteSeleccionado.apellidos ?? ""}
                </span>
                <button onClick={() => setClienteId("")} className="text-green-500 text-xs hover:text-green-700">✕</button>
              </div>
            ) : (
              <>
                <input value={busqCliente} onChange={e => setBusqCliente(e.target.value)}
                  placeholder="Buscar cliente por nombre o teléfono..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-400" />
                {busqCliente && clientesFiltrados.length > 0 && (
                  <div className="border border-slate-200 rounded-lg mt-1 overflow-hidden shadow-sm">
                    {clientesFiltrados.map(c => (
                      <button key={c.id} onClick={() => { setClienteId(c.id); setBusqCliente(""); }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-orange-50 border-b border-slate-50 last:border-0">
                        <span className="font-medium text-slate-800">{c.nombre} {c.apellidos ?? ""}</span>
                        {c.telefono && <span className="text-slate-400 ml-2 text-xs">{c.telefono}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Referred person data */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Nombre del referido *</label>
            <input value={nombre} onChange={e => setNombre(e.target.value)}
              placeholder="Nombre completo..."
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-400" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Teléfono</label>
              <input value={telefono} onChange={e => setTelefono(e.target.value)} placeholder="6XX XXX XXX"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input value={email} onChange={e => setEmail(e.target.value)} placeholder="email@..."
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-400" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Notas (contexto del referido)</label>
            <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2}
              placeholder="Ej: amigo autónomo del sector hostelería, interesado en baja laboral..."
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
            {guardando ? "Guardando..." : "Registrar referido"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ReferidosPage() {
  const [referidos, setReferidos] = useState<Referido[]>([]);
  const [clientes, setClientes] = useState<ClienteBasico[]>([]);
  const [cargando, setCargando] = useState(true);
  const [miId, setMiId] = useState<string | null>(null);
  const [modalNuevo, setModalNuevo] = useState(false);
  const [filtroEstado, setFiltroEstado] = useState<string>("");
  const [vistaActual, setVistaActual] = useState<"lista" | "ranking">("lista");

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data: { user } } = await supabase.auth.getUser();
    let cId: string | null = null;
    if (user?.email) {
      const { data: com } = await supabase.from("comerciales").select("id").eq("email", user.email).single();
      cId = com?.id ?? null;
    }
    setMiId(cId);

    const [{ data: refs }, { data: clis }] = await Promise.all([
      supabase.from("referidos")
        .select("*, clientes(nombre, apellidos), leads(nombre, apellidos)")
        .order("created_at", { ascending: false }),
      supabase.from("clientes")
        .select("id, nombre, apellidos, telefono")
        .eq("estado", "activo")
        .order("nombre"),
    ]);

    const refsConNombres = (refs ?? []).map(r => {
      const cli = r.clientes as unknown as { nombre: string; apellidos: string | null } | null;
      const lead = r.leads as unknown as { nombre: string; apellidos: string | null } | null;
      return {
        ...r,
        cliente_nombre: cli ? [cli.nombre, cli.apellidos].filter(Boolean).join(" ") : undefined,
        lead_nombre: lead ? [lead.nombre, lead.apellidos].filter(Boolean).join(" ") : undefined,
      };
    });

    setReferidos(refsConNombres);
    setClientes(clis ?? []);
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  async function cambiarEstado(id: string, estado: Referido["estado"]) {
    await supabase.from("referidos").update({ estado, updated_at: new Date().toISOString() }).eq("id", id);
    setReferidos(prev => prev.map(r => r.id === id ? { ...r, estado } : r));
  }

  async function toggleRecompensa(id: string, actual: boolean) {
    await supabase.from("referidos").update({ recompensa_enviada: !actual }).eq("id", id);
    setReferidos(prev => prev.map(r => r.id === id ? { ...r, recompensa_enviada: !actual } : r));
  }

  // ── Stats ──────────────────────────────────────────────────────────────────

  const total = referidos.length;
  const ganados = referidos.filter(r => r.estado === "cerrado_ganado").length;
  const pendientes = referidos.filter(r => r.estado === "pendiente").length;
  const tasaConversion = total > 0 ? Math.round((ganados / total) * 100) : 0;

  // ── Ranking de referidores ─────────────────────────────────────────────────

  const rankingMap: Record<string, ReferidorStats> = {};
  for (const r of referidos) {
    if (!r.cliente_id) continue;
    if (!rankingMap[r.cliente_id]) {
      rankingMap[r.cliente_id] = {
        cliente_id: r.cliente_id,
        nombre: r.cliente_nombre ?? "Cliente",
        total: 0,
        ganados: 0,
      };
    }
    rankingMap[r.cliente_id].total++;
    if (r.estado === "cerrado_ganado") rankingMap[r.cliente_id].ganados++;
  }
  const ranking = Object.values(rankingMap).sort((a, b) => b.ganados - a.ganados || b.total - a.total);

  // ── Filtered list ──────────────────────────────────────────────────────────

  const listaFiltrada = referidos.filter(r => !filtroEstado || r.estado === filtroEstado);

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Programa de referidos</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Gestiona los clientes referidos por tu cartera. Un referido es 10x más fácil de cerrar.
          </p>
        </div>
        <button onClick={() => setModalNuevo(true)}
          className="px-4 py-2 text-sm text-white rounded-xl font-medium"
          style={{ background: "#ea650d" }}>
          + Registrar referido
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total referidos",    value: total,           icon: "🤝", color: "text-slate-900" },
          { label: "Cerrados ganados",   value: ganados,         icon: "✅", color: "text-green-600" },
          { label: "Pendientes",         value: pendientes,      icon: "⏳", color: "text-amber-600" },
          { label: "Tasa conversión",    value: `${tasaConversion}%`, icon: "📈", color: "text-blue-600" },
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

      {/* View tabs */}
      <div className="flex gap-2">
        <button onClick={() => setVistaActual("lista")}
          className={`px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${vistaActual === "lista" ? "border-orange-400 text-white" : "border-slate-200 text-slate-600 hover:border-orange-200 bg-white"}`}
          style={vistaActual === "lista" ? { background: "#ea650d" } : undefined}>
          Lista de referidos
        </button>
        <button onClick={() => setVistaActual("ranking")}
          className={`px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${vistaActual === "ranking" ? "border-orange-400 text-white" : "border-slate-200 text-slate-600 hover:border-orange-200 bg-white"}`}
          style={vistaActual === "ranking" ? { background: "#ea650d" } : undefined}>
          🏆 Ranking referidores
        </button>
      </div>

      {/* ── LISTA view ── */}
      {vistaActual === "lista" && (
        <>
          {/* Filter */}
          <div className="flex gap-2 flex-wrap">
            <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}
              className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-orange-400">
              <option value="">Todos los estados</option>
              {Object.entries(ESTADO_CFG).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>

          {cargando ? (
            <div className="py-12 text-center text-sm text-slate-400">Cargando referidos...</div>
          ) : listaFiltrada.length === 0 ? (
            <div className="py-12 text-center">
              <div className="text-4xl mb-3">🤝</div>
              <p className="text-sm text-slate-400">No hay referidos registrados aún.</p>
              <p className="text-xs text-slate-300 mt-1">Los clientes satisfechos son tu mejor fuente de nuevos leads.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {listaFiltrada.map(r => {
                const estadoCfg = ESTADO_CFG[r.estado];
                return (
                  <div key={r.id} className="bg-white rounded-xl border border-slate-200 px-4 py-3">
                    <div className="flex items-start gap-3">
                      <div className="shrink-0 w-9 h-9 rounded-full bg-orange-50 flex items-center justify-center text-base">
                        🤝
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-slate-900">{r.nombre_referido}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${estadoCfg.bg} ${estadoCfg.text}`}>
                            {estadoCfg.label}
                          </span>
                          {r.recompensa_enviada && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-50 text-yellow-700 font-medium">
                              🎁 Recompensa enviada
                            </span>
                          )}
                        </div>
                        {r.cliente_nombre && (
                          <p className="text-xs text-slate-500 mt-0.5">
                            Referido por: <span className="font-medium text-slate-700">{r.cliente_nombre}</span>
                          </p>
                        )}
                        {r.notas && <p className="text-xs text-slate-400 mt-0.5 italic">{r.notas}</p>}
                        <div className="flex items-center gap-3 mt-1.5">
                          {r.telefono_referido && (
                            <a href={`https://wa.me/34${r.telefono_referido.replace(/\D/g, "")}`}
                              target="_blank" rel="noopener noreferrer"
                              className="text-xs text-green-600 hover:text-green-700 font-medium">
                              📱 {r.telefono_referido}
                            </a>
                          )}
                          {r.lead_referido_id && (
                            <Link href={`/leads/${r.lead_referido_id}`} className="text-xs text-blue-600 hover:underline">
                              → Ver lead
                            </Link>
                          )}
                          <span className="text-xs text-slate-300">
                            {formatDistanceToNow(parseISO(r.created_at), { addSuffix: true, locale: es })}
                          </span>
                        </div>
                      </div>
                      {/* Actions */}
                      <div className="shrink-0 flex flex-col gap-1.5">
                        <select value={r.estado} onChange={e => cambiarEstado(r.id, e.target.value as Referido["estado"])}
                          className="text-xs px-2 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-orange-400">
                          {Object.entries(ESTADO_CFG).map(([k, v]) => (
                            <option key={k} value={k}>{v.label}</option>
                          ))}
                        </select>
                        {r.estado === "cerrado_ganado" && !r.recompensa_enviada && (
                          <button onClick={() => toggleRecompensa(r.id, r.recompensa_enviada)}
                            className="text-xs px-2 py-1 rounded-lg bg-yellow-50 text-yellow-700 border border-yellow-200 hover:bg-yellow-100">
                            🎁 Marcar recompensa
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── RANKING view ── */}
      {vistaActual === "ranking" && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-700">Top clientes referidores</h3>
              <p className="text-xs text-slate-400 mt-0.5">Clientes que más referidos han traído</p>
            </div>
            {ranking.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-400">
                Sin datos de referidores aún.
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {ranking.map((r, idx) => {
                  const pctGanados = r.total > 0 ? Math.round((r.ganados / r.total) * 100) : 0;
                  return (
                    <div key={r.cliente_id} className="px-4 py-3 flex items-center gap-4">
                      <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white ${
                        idx === 0 ? "bg-yellow-400" : idx === 1 ? "bg-slate-400" : idx === 2 ? "bg-amber-600" : "bg-slate-200"
                      }`}>
                        {idx < 3 ? ["🥇","🥈","🥉"][idx] : idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-slate-900">{r.nombre}</div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          {r.total} referido{r.total !== 1 ? "s" : ""} · {r.ganados} cerrado{r.ganados !== 1 ? "s" : ""} · {pctGanados}% conversión
                        </div>
                        <div className="mt-1.5 h-1.5 bg-slate-100 rounded-full w-32 overflow-hidden">
                          <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${pctGanados}%` }} />
                        </div>
                      </div>
                      <div className="text-2xl font-bold text-green-600">{r.ganados}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Tip */}
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <span className="text-2xl">💡</span>
              <div>
                <div className="text-sm font-semibold text-orange-800">Consejo de referidos</div>
                <p className="text-xs text-orange-700 mt-1 leading-relaxed">
                  Los mejores momentos para pedir un referido son: justo después de firmar el contrato (cliente en el pico de satisfacción),
                  al renovar (cliente fidelizado), o cuando el cliente menciona espontáneamente que está contento.
                  Un mensaje simple: "¿Conoces a alguien que también pueda beneficiarse de esto?"
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal */}
      {modalNuevo && (
        <ModalReferido
          clientes={clientes}
          miId={miId}
          onClose={() => setModalNuevo(false)}
          onSave={() => { setModalNuevo(false); cargar(); }}
        />
      )}
    </div>
  );
}
