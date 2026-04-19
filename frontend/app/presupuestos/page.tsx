"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { usePermisos } from "@/components/PermisosProvider";
import { SinAcceso } from "@/components/SinAcceso";
import { format, differenceInDays, parseISO } from "date-fns";
import { es } from "date-fns/locale";

// ─── Types ──────────────────────────────────────────────────────────────────

type Presupuesto = {
  id: string;
  lead_id: string | null;
  comercial_id: string | null;
  titulo: string;
  descripcion: string | null;
  productos: string[];
  valor_total: number | null;
  fecha_envio: string | null;
  fecha_vencimiento: string | null;
  estado: "borrador" | "enviado" | "aceptado" | "rechazado" | "expirado";
  notas: string | null;
  created_at: string;
  updated_at: string;
  lead_nombre?: string;
  comercial_nombre?: string;
};

type LeadBusqueda = { id: string; nombre: string; apellidos: string | null; empresa: string | null };
type Comercial = { id: string; nombre: string; apellidos: string | null };

// ─── Constants ───────────────────────────────────────────────────────────────

const PRODUCTOS_OPTS = [
  { value: "contigo_autonomo",  label: "Contigo Autónomo" },
  { value: "contigo_pyme",      label: "Contigo Pyme" },
  { value: "contigo_familia",   label: "Contigo Familia" },
  { value: "contigo_futuro",    label: "Contigo Futuro" },
  { value: "contigo_senior",    label: "Contigo Senior" },
  { value: "sialp",             label: "SIALP" },
  { value: "liderplus",         label: "LiderPlus" },
  { value: "sanitas_salud",     label: "Sanitas Salud" },
  { value: "mihogar",           label: "MiHogar" },
  { value: "hipotecas",         label: "Hipoteca" },
];

const PRODUCTOS_LABEL: Record<string, string> = Object.fromEntries(
  PRODUCTOS_OPTS.map(p => [p.value, p.label])
);

const ESTADO_CFG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  borrador:  { label: "Borrador",  bg: "bg-slate-100",  text: "text-slate-600",  dot: "bg-slate-400"   },
  enviado:   { label: "Enviado",   bg: "bg-blue-100",   text: "text-blue-700",   dot: "bg-blue-500"    },
  aceptado:  { label: "Aceptado",  bg: "bg-green-100",  text: "text-green-700",  dot: "bg-green-500"   },
  rechazado: { label: "Rechazado", bg: "bg-red-100",    text: "text-red-700",    dot: "bg-red-500"     },
  expirado:  { label: "Expirado",  bg: "bg-amber-100",  text: "text-amber-700",  dot: "bg-amber-500"   },
};

type EstadoFiltro = "" | "borrador" | "enviado" | "aceptado" | "rechazado" | "expirado";

function fmt(n: number): string {
  return n.toLocaleString("es-ES", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " €";
}

function vencimientoLabel(fecha: string | null): { texto: string; color: string } | null {
  if (!fecha) return null;
  const dias = differenceInDays(parseISO(fecha), new Date());
  if (dias < 0) return { texto: `Venció hace ${Math.abs(dias)}d`, color: "text-red-600" };
  if (dias === 0) return { texto: "Vence hoy", color: "text-red-600 font-bold" };
  if (dias <= 7) return { texto: `Vence en ${dias}d`, color: "text-amber-600" };
  return { texto: `Vence en ${dias}d`, color: "text-slate-400" };
}

// ─── Modal form ──────────────────────────────────────────────────────────────

type FormData = {
  titulo: string;
  descripcion: string;
  lead_id: string;
  productos: string[];
  valor_total: string;
  fecha_envio: string;
  fecha_vencimiento: string;
  estado: "borrador" | "enviado" | "aceptado" | "rechazado" | "expirado";
  notas: string;
};

const FORM_VACIO: FormData = {
  titulo: "", descripcion: "", lead_id: "", productos: [],
  valor_total: "", fecha_envio: "", fecha_vencimiento: "", estado: "borrador", notas: "",
};

function ModalPresupuesto({
  inicial, leads, onGuardar, onCerrar, guardando,
}: {
  inicial: FormData;
  leads: LeadBusqueda[];
  onGuardar: (f: FormData) => void;
  onCerrar: () => void;
  guardando: boolean;
}) {
  const [form, setForm] = useState<FormData>(inicial);
  const [busqLead, setBusqLead] = useState("");

  function set(k: keyof FormData, v: string | string[]) {
    setForm(prev => ({ ...prev, [k]: v }));
  }

  function toggleProducto(val: string) {
    const arr = form.productos.includes(val)
      ? form.productos.filter(p => p !== val)
      : [...form.productos, val];
    set("productos", arr);
  }

  const leadsFiltered = busqLead.trim().length >= 2
    ? leads.filter(l => {
        const q = busqLead.toLowerCase();
        return (
          l.nombre?.toLowerCase().includes(q) ||
          l.apellidos?.toLowerCase().includes(q) ||
          l.empresa?.toLowerCase().includes(q)
        );
      }).slice(0, 8)
    : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.45)" }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="px-6 pt-6 pb-4 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-900">{inicial.titulo ? "Editar presupuesto" : "Nuevo presupuesto"}</h2>
        </div>
        <div className="px-6 py-4 space-y-4">

          {/* Título */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Título *</label>
            <input value={form.titulo} onChange={e => set("titulo", e.target.value)}
              placeholder="Ej: Propuesta Contigo Autónomo para Bar El Rincón"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-300" />
          </div>

          {/* Lead */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Lead vinculado</label>
            {form.lead_id ? (
              <div className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2">
                <span className="text-sm text-slate-700 flex-1">
                  {leads.find(l => l.id === form.lead_id)?.nombre ?? "Lead seleccionado"}
                </span>
                <button onClick={() => set("lead_id", "")} className="text-xs text-slate-400 hover:text-red-500">✕</button>
              </div>
            ) : (
              <div className="relative">
                <input value={busqLead} onChange={e => setBusqLead(e.target.value)}
                  placeholder="Buscar lead por nombre o empresa..."
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-300" />
                {leadsFiltered.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
                    {leadsFiltered.map(l => (
                      <button key={l.id} onClick={() => { set("lead_id", l.id); setBusqLead(""); }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-orange-50 border-b border-slate-50 last:border-0">
                        <span className="font-medium text-slate-800">{l.nombre} {l.apellidos}</span>
                        {l.empresa && <span className="text-slate-400 ml-1">— {l.empresa}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Productos */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Productos incluidos</label>
            <div className="flex flex-wrap gap-2">
              {PRODUCTOS_OPTS.map(p => (
                <button key={p.value} onClick={() => toggleProducto(p.value)}
                  className={`px-2.5 py-1 text-xs rounded-full border font-medium transition-colors ${
                    form.productos.includes(p.value)
                      ? "bg-orange-500 text-white border-orange-500"
                      : "bg-white text-slate-600 border-slate-200 hover:border-orange-300"
                  }`}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Valor */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Valor estimado (€)</label>
              <input type="number" value={form.valor_total} onChange={e => set("valor_total", e.target.value)}
                placeholder="0"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-300" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Estado</label>
              <select value={form.estado} onChange={e => set("estado", e.target.value as FormData["estado"])}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-300 bg-white">
                {Object.entries(ESTADO_CFG).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Fechas */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Fecha de envío</label>
              <input type="date" value={form.fecha_envio} onChange={e => set("fecha_envio", e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-300" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Fecha de vencimiento</label>
              <input type="date" value={form.fecha_vencimiento} onChange={e => set("fecha_vencimiento", e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-300" />
            </div>
          </div>

          {/* Descripción */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Descripción / Detalles</label>
            <textarea rows={2} value={form.descripcion} onChange={e => set("descripcion", e.target.value)}
              placeholder="Detalles del presupuesto, condiciones, etc."
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-300 resize-none" />
          </div>

          {/* Notas */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Notas internas</label>
            <textarea rows={2} value={form.notas} onChange={e => set("notas", e.target.value)}
              placeholder="Notas privadas (no visibles para el cliente)"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-300 resize-none" />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onCerrar} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">Cancelar</button>
          <button
            onClick={() => onGuardar(form)}
            disabled={!form.titulo.trim() || guardando}
            className="px-5 py-2 text-sm font-semibold text-white rounded-lg disabled:opacity-50 transition-colors"
            style={{ background: "#ea650d" }}
          >
            {guardando ? "Guardando..." : "Guardar presupuesto"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PresupuestosPage() {
  const { puede, cargando: cargandoPermisos } = usePermisos();
  const [presupuestos, setPresupuestos] = useState<Presupuesto[]>([]);
  const [leads, setLeads] = useState<LeadBusqueda[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState<EstadoFiltro>("");
  const [filtroComercial, setFiltroComercial] = useState("todos");
  const [comerciales, setComerciales] = useState<Comercial[]>([]);
  const [mostrarModal, setMostrarModal] = useState(false);
  const [presupuestoEditando, setPresupuestoEditando] = useState<Presupuesto | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [miId, setMiId] = useState<string | null>(null);
  const [soloMios, setSoloMios] = useState(false);

  useEffect(() => {
    async function cargarMiId() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) return;
      const { data: com } = await supabase.from("comerciales").select("id").eq("email", user.email).single();
      setMiId(com?.id ?? null);
    }
    cargarMiId();
  }, []);

  const cargar = useCallback(async () => {
    setLoading(true);

    let q = supabase.from("presupuestos").select("*").order("created_at", { ascending: false }).limit(200);
    if (filtroEstado) q = q.eq("estado", filtroEstado);
    if (filtroComercial !== "todos") q = q.eq("comercial_id", filtroComercial);

    const { data: rows } = await q;
    const lista = rows ?? [];

    // Enrich with lead names
    const leadIds = [...new Set(lista.map(r => r.lead_id).filter(Boolean))] as string[];
    const comIds  = [...new Set(lista.map(r => r.comercial_id).filter(Boolean))] as string[];

    const [{ data: leadsData }, { data: comsData }] = await Promise.all([
      leadIds.length > 0 ? supabase.from("leads").select("id, nombre, apellidos, empresa").in("id", leadIds) : { data: [] },
      comIds.length > 0  ? supabase.from("comerciales").select("id, nombre, apellidos").in("id", comIds)    : { data: [] },
    ]);

    const leadMap = new Map((leadsData ?? []).map(l => [l.id, l]));
    const comMap  = new Map((comsData ?? []).map(c => [c.id, c]));

    const enriched: Presupuesto[] = lista.map(r => ({
      ...r,
      lead_nombre: r.lead_id ? (() => {
        const l = leadMap.get(r.lead_id!);
        return l ? `${l.nombre}${l.apellidos ? ` ${l.apellidos}` : ""}${l.empresa ? ` (${l.empresa})` : ""}` : undefined;
      })() : undefined,
      comercial_nombre: r.comercial_id ? (() => {
        const c = comMap.get(r.comercial_id!);
        return c ? `${c.nombre}${c.apellidos ? ` ${c.apellidos}` : ""}` : undefined;
      })() : undefined,
    }));

    setPresupuestos(enriched);
    setLoading(false);
  }, [filtroEstado, filtroComercial]);

  useEffect(() => {
    if (!cargandoPermisos) cargar();
  }, [cargar, cargandoPermisos]);

  // Load leads & comerciales for form
  useEffect(() => {
    async function cargarAux() {
      const [{ data: ls }, { data: cs }] = await Promise.all([
        supabase.from("leads").select("id, nombre, apellidos, empresa")
          .not("estado", "in", "(cerrado_perdido,descartado)")
          .order("nombre").limit(500),
        supabase.from("comerciales").select("id, nombre, apellidos").eq("activo", true).order("nombre"),
      ]);
      setLeads(ls ?? []);
      setComerciales(cs ?? []);
    }
    cargarAux();
  }, []);

  async function guardar(form: FormData) {
    setGuardando(true);
    const payload = {
      titulo: form.titulo.trim(),
      descripcion: form.descripcion.trim() || null,
      lead_id: form.lead_id || null,
      comercial_id: miId,
      productos: form.productos,
      valor_total: form.valor_total ? parseFloat(form.valor_total) : null,
      fecha_envio: form.fecha_envio || null,
      fecha_vencimiento: form.fecha_vencimiento || null,
      estado: form.estado,
      notas: form.notas.trim() || null,
      updated_at: new Date().toISOString(),
    };

    if (presupuestoEditando) {
      await supabase.from("presupuestos").update(payload).eq("id", presupuestoEditando.id);
    } else {
      await supabase.from("presupuestos").insert(payload);
    }

    setGuardando(false);
    setMostrarModal(false);
    setPresupuestoEditando(null);
    cargar();
  }

  async function cambiarEstado(id: string, estado: Presupuesto["estado"]) {
    await supabase.from("presupuestos").update({ estado, updated_at: new Date().toISOString() }).eq("id", id);
    cargar();
  }

  async function eliminar(id: string) {
    if (!confirm("¿Eliminar este presupuesto?")) return;
    await supabase.from("presupuestos").delete().eq("id", id);
    cargar();
  }

  function abrirEditar(p: Presupuesto) {
    setPresupuestoEditando(p);
    setMostrarModal(true);
  }

  if (!cargandoPermisos && !puede("gestionar_clientes")) return <SinAcceso />;

  const datos = soloMios && miId ? presupuestos.filter(p => p.comercial_id === miId) : presupuestos;

  // KPIs
  const totalValor = datos.filter(p => p.estado === "aceptado").reduce((s, p) => s + (p.valor_total ?? 0), 0);
  const enviados   = datos.filter(p => p.estado === "enviado").length;
  const aceptados  = datos.filter(p => p.estado === "aceptado").length;
  const tasaExito  = (enviados + aceptados) > 0 ? Math.round((aceptados / (enviados + aceptados)) * 100) : 0;
  const porVencer  = datos.filter(p => {
    if (!p.fecha_vencimiento || p.estado !== "enviado") return false;
    const dias = differenceInDays(parseISO(p.fecha_vencimiento), new Date());
    return dias >= 0 && dias <= 7;
  }).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Presupuestos</h1>
          <p className="text-sm text-slate-500 mt-0.5">Seguimiento de propuestas comerciales enviadas</p>
        </div>
        <button
          onClick={() => { setPresupuestoEditando(null); setMostrarModal(true); }}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white rounded-lg shadow-sm transition-colors hover:opacity-90"
          style={{ background: "#ea650d" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14" /></svg>
          Nuevo presupuesto
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
          <p className="text-xs text-slate-500 mb-1">Valor aceptado</p>
          <p className="text-2xl font-bold text-green-700">{fmt(totalValor)}</p>
          <p className="text-xs text-slate-400">{aceptados} presupuestos</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
          <p className="text-xs text-slate-500 mb-1">En espera respuesta</p>
          <p className="text-2xl font-bold text-blue-700">{enviados}</p>
          <p className="text-xs text-slate-400">enviados sin respuesta</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
          <p className="text-xs text-slate-500 mb-1">Tasa de aceptación</p>
          <p className={`text-2xl font-bold ${tasaExito >= 50 ? "text-green-700" : tasaExito >= 25 ? "text-amber-700" : "text-slate-700"}`}>
            {tasaExito}%
          </p>
          <p className="text-xs text-slate-400">{aceptados} de {aceptados + enviados}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
          <p className="text-xs text-slate-500 mb-1">Vencen esta semana</p>
          <p className={`text-2xl font-bold ${porVencer > 0 ? "text-red-600" : "text-slate-700"}`}>{porVencer}</p>
          <p className="text-xs text-slate-400">urgente seguimiento</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
          {([
            { value: "" as EstadoFiltro, label: "Todos" },
            { value: "borrador" as EstadoFiltro, label: "Borrador" },
            { value: "enviado" as EstadoFiltro, label: "Enviados" },
            { value: "aceptado" as EstadoFiltro, label: "Aceptados" },
            { value: "rechazado" as EstadoFiltro, label: "Rechazados" },
            { value: "expirado" as EstadoFiltro, label: "Expirados" },
          ]).map(o => (
            <button key={o.value} onClick={() => setFiltroEstado(o.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${filtroEstado === o.value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
              {o.label}
            </button>
          ))}
        </div>
        {puede("ver_metricas") && comerciales.length > 1 && (
          <select value={filtroComercial} onChange={e => setFiltroComercial(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:border-orange-300">
            <option value="todos">Todos los comerciales</option>
            {comerciales.map(c => (
              <option key={c.id} value={c.id}>{c.nombre} {c.apellidos}</option>
            ))}
          </select>
        )}
        {miId && (
          <button onClick={() => setSoloMios(!soloMios)}
            className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${soloMios ? "bg-orange-100 border-orange-300 text-orange-700" : "bg-white border-slate-200 text-slate-500 hover:border-orange-200"}`}>
            Solo los míos
          </button>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className="py-24 text-center text-sm text-slate-400">Cargando presupuestos...</div>
      ) : datos.length === 0 ? (
        <div className="py-24 text-center">
          <p className="text-slate-400 text-sm mb-4">No hay presupuestos{filtroEstado ? ` con estado "${ESTADO_CFG[filtroEstado]?.label}"` : ""}.</p>
          <button
            onClick={() => { setPresupuestoEditando(null); setMostrarModal(true); }}
            className="px-4 py-2 text-sm font-semibold text-white rounded-lg"
            style={{ background: "#ea650d" }}
          >
            Crear el primero
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {datos.map(p => {
            const cfg = ESTADO_CFG[p.estado];
            const vc = vencimientoLabel(p.fecha_vencimiento);
            return (
              <div key={p.id} className="bg-white rounded-xl border border-slate-200 px-5 py-4 hover:border-orange-200 transition-colors">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                        {cfg.label}
                      </span>
                      {p.comercial_nombre && (
                        <span className="text-xs text-slate-400">{p.comercial_nombre}</span>
                      )}
                    </div>
                    <h3 className="font-semibold text-slate-900 text-sm leading-tight">{p.titulo}</h3>
                    {p.lead_nombre && (
                      <p className="text-xs text-slate-500 mt-0.5">📍 {p.lead_nombre}</p>
                    )}
                    {p.productos.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {p.productos.map(prod => (
                          <span key={prod} className="px-2 py-0.5 bg-orange-50 text-orange-700 text-xs rounded-full border border-orange-100">
                            {PRODUCTOS_LABEL[prod] ?? prod}
                          </span>
                        ))}
                      </div>
                    )}
                    {p.descripcion && (
                      <p className="text-xs text-slate-400 mt-2 line-clamp-2">{p.descripcion}</p>
                    )}
                  </div>

                  <div className="text-right shrink-0">
                    {p.valor_total != null && p.valor_total > 0 && (
                      <p className="text-lg font-bold text-slate-900">{fmt(p.valor_total)}</p>
                    )}
                    {p.fecha_envio && (
                      <p className="text-xs text-slate-400">
                        Enviado {format(parseISO(p.fecha_envio), "d MMM yyyy", { locale: es })}
                      </p>
                    )}
                    {vc && (
                      <p className={`text-xs mt-0.5 ${vc.color}`}>{vc.texto}</p>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-50">
                  <button onClick={() => abrirEditar(p)}
                    className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1 rounded hover:bg-slate-50 transition-colors">
                    Editar
                  </button>
                  {p.estado === "borrador" && (
                    <button onClick={() => cambiarEstado(p.id, "enviado")}
                      className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1 rounded hover:bg-blue-50 transition-colors font-medium">
                      ✓ Marcar enviado
                    </button>
                  )}
                  {p.estado === "enviado" && (
                    <>
                      <button onClick={() => cambiarEstado(p.id, "aceptado")}
                        className="text-xs text-green-600 hover:text-green-800 px-2 py-1 rounded hover:bg-green-50 transition-colors font-medium">
                        ✓ Aceptado
                      </button>
                      <button onClick={() => cambiarEstado(p.id, "rechazado")}
                        className="text-xs text-red-600 hover:text-red-800 px-2 py-1 rounded hover:bg-red-50 transition-colors font-medium">
                        ✕ Rechazado
                      </button>
                    </>
                  )}
                  {p.estado === "rechazado" && (
                    <button onClick={() => cambiarEstado(p.id, "borrador")}
                      className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1 rounded hover:bg-slate-50 transition-colors">
                      Reabrir
                    </button>
                  )}
                  <span className="flex-1" />
                  {p.notas && (
                    <span title={p.notas} className="text-xs text-slate-400 cursor-help">📝 Nota</span>
                  )}
                  <button onClick={() => eliminar(p.id)}
                    className="text-xs text-slate-300 hover:text-red-500 px-1 py-1 rounded transition-colors">
                    🗑
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {mostrarModal && (
        <ModalPresupuesto
          inicial={presupuestoEditando
            ? {
                titulo: presupuestoEditando.titulo,
                descripcion: presupuestoEditando.descripcion ?? "",
                lead_id: presupuestoEditando.lead_id ?? "",
                productos: presupuestoEditando.productos ?? [],
                valor_total: presupuestoEditando.valor_total?.toString() ?? "",
                fecha_envio: presupuestoEditando.fecha_envio ? presupuestoEditando.fecha_envio.slice(0, 10) : "",
                fecha_vencimiento: presupuestoEditando.fecha_vencimiento ? presupuestoEditando.fecha_vencimiento.slice(0, 10) : "",
                estado: presupuestoEditando.estado,
                notas: presupuestoEditando.notas ?? "",
              }
            : FORM_VACIO
          }
          leads={leads}
          onGuardar={guardar}
          onCerrar={() => { setMostrarModal(false); setPresupuestoEditando(null); }}
          guardando={guardando}
        />
      )}
    </div>
  );
}
