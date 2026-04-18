"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { Cliente } from "@/lib/supabase";

type ClienteConComercial = Cliente & {
  comerciales: { nombre: string; apellidos: string | null } | null;
};

const PRODUCTOS: { value: string; label: string }[] = [
  { value: "contigo_futuro",   label: "Contigo Futuro" },
  { value: "sialp",            label: "SIALP" },
  { value: "contigo_autonomo", label: "Contigo Autónomo" },
  { value: "contigo_familia",  label: "Contigo Familia" },
  { value: "contigo_pyme",     label: "Contigo Pyme" },
  { value: "contigo_senior",   label: "Contigo Senior" },
  { value: "liderplus",        label: "LiderPlus" },
  { value: "sanitas_salud",    label: "Sanitas Salud" },
  { value: "mihogar",          label: "MiHogar" },
  { value: "hipotecas",        label: "Hipoteca" },
  { value: "otro",             label: "Otro" },
];

function productoLabel(value: string | null): string {
  if (!value) return "—";
  const p = PRODUCTOS.find(p => p.value === value);
  return p ? p.label : value;
}

type FormData = {
  nombre: string;
  apellidos: string;
  email: string;
  telefono: string;
  empresa: string;
  producto: string;
  fecha_inicio: string;
  fecha_renovacion: string;
  valor_contrato: string;
  notas: string;
  comercial_asignado: string;
};

const FORM_VACIO: FormData = {
  nombre: "",
  apellidos: "",
  email: "",
  telefono: "",
  empresa: "",
  producto: "",
  fecha_inicio: new Date().toISOString().split("T")[0],
  fecha_renovacion: "",
  valor_contrato: "",
  notas: "",
  comercial_asignado: "",
};

function diasParaRenovacion(fecha: string): number {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const renovacion = new Date(fecha);
  return Math.round((renovacion.getTime() - hoy.getTime()) / 86_400_000);
}

function badgeRenovacion(dias: number) {
  if (dias < 0) return { label: `Vencida hace ${Math.abs(dias)}d`, cls: "bg-red-100 text-red-700 border-red-200" };
  if (dias === 0) return { label: "Vence hoy", cls: "bg-red-100 text-red-700 border-red-200" };
  if (dias <= 7) return { label: `${dias}d para renovar`, cls: "bg-orange-100 text-orange-700 border-orange-200" };
  if (dias <= 30) return { label: `${dias}d para renovar`, cls: "bg-amber-100 text-amber-700 border-amber-200" };
  return { label: `${dias}d para renovar`, cls: "bg-slate-100 text-slate-600 border-slate-200" };
}

export default function ClientesPage() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-slate-400 text-sm">Cargando...</div>}>
      <ClientesContent />
    </Suspense>
  );
}

function ClientesContent() {
  const searchParams = useSearchParams();
  const [clientes, setClientes] = useState<ClienteConComercial[]>([]);
  const [comerciales, setComerciales] = useState<{ id: string; nombre: string; apellidos: string | null }[]>([]);
  const [comercialLogueadoId, setComercialLogueadoId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<"todos" | "activo" | "renovacion_proxima" | "vencida">("todos");
  const [busqueda, setBusqueda] = useState(searchParams.get("buscar") ?? "");
  const [modal, setModal] = useState<"nuevo" | "editar" | null>(null);
  const [editando, setEditando] = useState<ClienteConComercial | null>(null);
  const [form, setForm] = useState<FormData>(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    cargar();
    obtenerComercialLogueado();
  }, []);

  async function obtenerComercialLogueado() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) return;
    const { data } = await supabase
      .from("comerciales")
      .select("id")
      .eq("email", user.email)
      .single();
    if (data?.id) setComercialLogueadoId(data.id);
  }

  async function cargar() {
    setLoading(true);
    const [{ data: clientesData }, { data: comercialesData }] = await Promise.all([
      supabase
        .from("clientes")
        .select("*, comerciales(nombre, apellidos)")
        .order("fecha_renovacion", { ascending: true, nullsFirst: false }),
      supabase.from("comerciales").select("id, nombre, apellidos").eq("activo", true),
    ]);
    setClientes((clientesData as ClienteConComercial[]) ?? []);
    setComerciales(comercialesData ?? []);
    setLoading(false);
  }

  function abrirNuevo() {
    setEditando(null);
    setForm({ ...FORM_VACIO, comercial_asignado: comercialLogueadoId ?? "" });
    setModal("nuevo");
  }

  function abrirEditar(c: ClienteConComercial) {
    setEditando(c);
    setForm({
      nombre: c.nombre,
      apellidos: c.apellidos ?? "",
      email: c.email ?? "",
      telefono: c.telefono ?? "",
      empresa: c.empresa ?? "",
      producto: c.producto ?? "",
      fecha_inicio: c.fecha_inicio,
      fecha_renovacion: c.fecha_renovacion ?? "",
      valor_contrato: c.valor_contrato != null ? String(c.valor_contrato) : "",
      notas: c.notas ?? "",
      comercial_asignado: c.comercial_asignado ?? "",
    });
    setModal("editar");
  }

  async function guardar() {
    if (!form.nombre.trim()) return;
    setGuardando(true);

    const payload = {
      nombre: form.nombre.trim(),
      apellidos: form.apellidos.trim() || null,
      email: form.email.trim() || null,
      telefono: form.telefono.trim() || null,
      empresa: form.empresa.trim() || null,
      producto: form.producto.trim() || null,
      fecha_inicio: form.fecha_inicio,
      fecha_renovacion: form.fecha_renovacion || null,
      valor_contrato: form.valor_contrato ? parseFloat(form.valor_contrato) : null,
      notas: form.notas.trim() || null,
      comercial_asignado: form.comercial_asignado || null,
    };

    if (modal === "nuevo") {
      await supabase.from("clientes").insert(payload);
    } else if (editando) {
      await supabase.from("clientes").update(payload).eq("id", editando.id);
    }

    setModal(null);
    setGuardando(false);
    cargar();
  }

  async function cambiarEstado(id: string, estado: Cliente["estado"]) {
    await supabase.from("clientes").update({ estado }).eq("id", id);
    setClientes(prev => prev.map(c => c.id === id ? { ...c, estado } : c));
  }

  // Filtrado
  const clientesFiltrados = clientes.filter(c => {
    if (filtro === "activo" && c.estado !== "activo") return false;
    if (filtro === "renovacion_proxima" && (!c.fecha_renovacion || diasParaRenovacion(c.fecha_renovacion) > 30 || diasParaRenovacion(c.fecha_renovacion) < 0)) return false;
    if (filtro === "vencida" && (!c.fecha_renovacion || diasParaRenovacion(c.fecha_renovacion) >= 0)) return false;
    if (busqueda) {
      const q = busqueda.toLowerCase();
      const texto = [c.nombre, c.apellidos, c.empresa, c.producto].filter(Boolean).join(" ").toLowerCase();
      if (!texto.includes(q)) return false;
    }
    return true;
  });

  // Métricas resumen
  const totalActivos = clientes.filter(c => c.estado === "activo").length;
  const vencenEsteMes = clientes.filter(c => c.fecha_renovacion && diasParaRenovacion(c.fecha_renovacion) >= 0 && diasParaRenovacion(c.fecha_renovacion) <= 30).length;
  const vencidas = clientes.filter(c => c.fecha_renovacion && diasParaRenovacion(c.fecha_renovacion) < 0 && c.estado === "activo").length;
  const valorTotal = clientes.filter(c => c.estado === "activo").reduce((sum, c) => sum + (c.valor_contrato ?? 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Clientes</h1>
          <p className="text-sm text-slate-500 mt-0.5">Cartera activa y seguimiento de renovaciones</p>
        </div>
        <button
          onClick={abrirNuevo}
          className="px-4 py-2 text-white text-sm font-medium rounded-lg transition-colors" style={{ background: "#ea650d" }}
        >
          + Añadir cliente
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KpiCard label="Clientes activos" valor={totalActivos} color="text-slate-900" />
        <KpiCard label="Renovan en 30 días" valor={vencenEsteMes} color={vencenEsteMes > 0 ? "text-amber-600" : "text-slate-900"} />
        <KpiCard label="Renovación vencida" valor={vencidas} color={vencidas > 0 ? "text-red-600" : "text-slate-900"} />
        <KpiCard
          label="Valor cartera activa"
          valor={valorTotal > 0 ? `${valorTotal.toLocaleString("es-ES", { minimumFractionDigits: 0 })} €` : "—"}
          color="text-green-600"
        />
      </div>

      {/* Filtros + búsqueda */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
          {([
            { key: "todos", label: "Todos" },
            { key: "activo", label: "Activos" },
            { key: "renovacion_proxima", label: "Renovan pronto" },
            { key: "vencida", label: "Vencidas" },
          ] as const).map(f => (
            <button
              key={f.key}
              onClick={() => setFiltro(f.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                filtro === f.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Buscar por nombre, empresa o producto..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          className="flex-1 px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-300"
        />
      </div>

      {/* Tabla */}
      {loading ? (
        <div className="py-24 text-center text-sm text-slate-400">Cargando clientes...</div>
      ) : clientesFiltrados.length === 0 ? (
        <div className="py-24 text-center">
          <p className="text-sm text-slate-400">No hay clientes que coincidan</p>
          {clientes.length === 0 && (
            <button onClick={abrirNuevo} className="mt-3 text-sm hover:underline" style={{ color: "#ea650d" }}>
              Añadir el primer cliente
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-xs font-medium text-slate-500 uppercase tracking-wide">
                <th className="px-4 py-3 text-left">Cliente</th>
                <th className="px-4 py-3 text-left hidden md:table-cell">Producto</th>
                <th className="px-4 py-3 text-left hidden lg:table-cell">Comercial</th>
                <th className="px-4 py-3 text-right hidden sm:table-cell">Valor</th>
                <th className="px-4 py-3 text-center">Renovación</th>
                <th className="px-4 py-3 text-center">Estado</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {clientesFiltrados.map(c => {
                const diasRen = c.fecha_renovacion ? diasParaRenovacion(c.fecha_renovacion) : null;
                const badge = diasRen !== null ? badgeRenovacion(diasRen) : null;

                return (
                  <tr key={c.id} className="hover:bg-slate-50 group">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-slate-900">
                          {c.nombre} {c.apellidos ?? ""}
                        </p>
                        {c.empresa && <p className="text-xs text-slate-400">{c.empresa}</p>}
                        {c.lead_id && (
                          <Link href={`/leads/${c.lead_id}`} className="text-xs hover:underline" style={{ color: "#ea650d" }}>
                            Ver lead original
                          </Link>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      {c.producto ? (
                        <span className="text-slate-700">{productoLabel(c.producto)}</span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-slate-600 text-xs">
                      {c.comerciales ? `${c.comerciales.nombre} ${c.comerciales.apellidos ?? ""}`.trim() : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right hidden sm:table-cell">
                      {c.valor_contrato != null ? (
                        <span className="font-medium text-slate-800">{c.valor_contrato.toLocaleString("es-ES")} €</span>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {badge ? (
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${badge.cls}`}>
                          {badge.label}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-300">Sin fecha</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <select
                        value={c.estado}
                        onChange={e => cambiarEstado(c.id, e.target.value as Cliente["estado"])}
                        className={`text-xs font-medium rounded-full px-2 py-0.5 border cursor-pointer focus:outline-none ${
                          c.estado === "activo" ? "bg-green-50 text-green-700 border-green-200" :
                          c.estado === "renovado" ? "bg-orange-50 text-orange-700 border-orange-200" :
                          c.estado === "pausado" ? "bg-amber-50 text-amber-700 border-amber-200" :
                          "bg-slate-100 text-slate-500 border-slate-200"
                        }`}
                      >
                        <option value="activo">Activo</option>
                        <option value="renovado">Renovado</option>
                        <option value="pausado">Pausado</option>
                        <option value="cancelado">Cancelado</option>
                      </select>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => abrirEditar(c)}
                        className="text-xs text-slate-400 opacity-0 group-hover:opacity-100 transition-all hover:underline"
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal nuevo/editar */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">
                {modal === "nuevo" ? "Nuevo cliente" : "Editar cliente"}
              </h2>
              <button onClick={() => setModal(null)} className="text-slate-400 hover:text-slate-700 text-xl leading-none">×</button>
            </div>

            <div className="p-6 space-y-4">
              {/* Nombre */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Nombre *</label>
                  <input
                    type="text"
                    value={form.nombre}
                    onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-300"
                    placeholder="Juan"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Apellidos</label>
                  <input
                    type="text"
                    value={form.apellidos}
                    onChange={e => setForm(f => ({ ...f, apellidos: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-300"
                    placeholder="García López"
                  />
                </div>
              </div>

              {/* Empresa */}
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Empresa</label>
                <input
                  type="text"
                  value={form.empresa}
                  onChange={e => setForm(f => ({ ...f, empresa: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-300"
                  placeholder="Nombre de la empresa"
                />
              </div>

              {/* Contacto */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-300"
                    placeholder="email@ejemplo.com"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Teléfono</label>
                  <input
                    type="tel"
                    value={form.telefono}
                    onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-300"
                    placeholder="600 000 000"
                  />
                </div>
              </div>

              {/* Producto + valor */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Producto / servicio</label>
                  <select
                    value={form.producto}
                    onChange={e => setForm(f => ({ ...f, producto: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white"
                  >
                    <option value="">Seleccionar producto</option>
                    {PRODUCTOS.map(p => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Valor contrato (€)</label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={form.valor_contrato}
                    onChange={e => setForm(f => ({ ...f, valor_contrato: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-300"
                    placeholder="1200"
                  />
                </div>
              </div>

              {/* Fechas */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Fecha inicio</label>
                  <input
                    type="date"
                    value={form.fecha_inicio}
                    onChange={e => setForm(f => ({ ...f, fecha_inicio: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-300"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Fecha renovación</label>
                  <input
                    type="date"
                    value={form.fecha_renovacion}
                    onChange={e => setForm(f => ({ ...f, fecha_renovacion: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-300"
                  />
                </div>
              </div>

              {/* Comercial */}
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Comercial responsable</label>
                <select
                  value={form.comercial_asignado}
                  onChange={e => setForm(f => ({ ...f, comercial_asignado: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-300"
                >
                  <option value="">Sin asignar</option>
                  {comerciales.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.nombre} {c.apellidos ?? ""}
                    </option>
                  ))}
                </select>
              </div>

              {/* Notas */}
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Notas</label>
                <textarea
                  value={form.notas}
                  onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-300 resize-none"
                  placeholder="Condiciones especiales, recordatorios..."
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
              <button
                onClick={() => setModal(null)}
                className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={guardar}
                disabled={guardando || !form.nombre.trim()}
                className="px-5 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors" style={{ background: "#ea650d" }}
              >
                {guardando ? "Guardando..." : modal === "nuevo" ? "Crear cliente" : "Guardar cambios"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({ label, valor, color }: { label: string; valor: string | number; color: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 px-4 py-4">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{valor}</p>
    </div>
  );
}
