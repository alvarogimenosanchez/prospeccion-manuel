"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { format, differenceInDays } from "date-fns";
import { es } from "date-fns/locale";

// ─── Types ─────────────────────────────────────────────────────────────────────

type Cliente = {
  id: string;
  lead_id: string | null;
  nombre: string;
  apellidos: string | null;
  email: string | null;
  telefono: string | null;
  empresa: string | null;
  comercial_asignado: string | null;
  producto: string | null;
  fecha_inicio: string;
  fecha_renovacion: string | null;
  valor_contrato: number | null;
  notas: string | null;
  estado: "activo" | "pausado" | "cancelado" | "renovado";
  created_at: string;
  updated_at: string;
  comerciales: { nombre: string; apellidos: string | null } | null;
};

type Interaccion = {
  id: string;
  tipo: string;
  mensaje: string | null;
  created_at: string;
  origen: string | null;
};

// ─── Constants ─────────────────────────────────────────────────────────────────

const PRODUCTOS: Record<string, { label: string; emoji: string; color: string; bg: string }> = {
  contigo_futuro:   { label: "Contigo Futuro",  emoji: "🌅", color: "#ea650d", bg: "#fff5f0" },
  sialp:            { label: "SIALP",            emoji: "💰", color: "#8b5cf6", bg: "#f5f3ff" },
  contigo_autonomo: { label: "Contigo Autónomo", emoji: "🏃", color: "#ea650d", bg: "#fff5f0" },
  contigo_familia:  { label: "Contigo Familia",  emoji: "👨‍👩‍👧", color: "#10b981", bg: "#ecfdf5" },
  contigo_pyme:     { label: "Contigo Pyme",     emoji: "🏢", color: "#3b82f6", bg: "#eff6ff" },
  contigo_senior:   { label: "Contigo Senior",   emoji: "🌿", color: "#10b981", bg: "#ecfdf5" },
  liderplus:        { label: "LiderPlus",         emoji: "📈", color: "#f59e0b", bg: "#fffbeb" },
  sanitas_salud:    { label: "Sanitas Salud",     emoji: "🏥", color: "#ef4444", bg: "#fef2f2" },
  mihogar:          { label: "MiHogar",           emoji: "🏠", color: "#14b8a6", bg: "#f0fdfa" },
  hipotecas:        { label: "Hipoteca",          emoji: "🔑", color: "#6366f1", bg: "#eef2ff" },
  otro:             { label: "Otro",              emoji: "📋", color: "#6b7280", bg: "#f9fafb" },
};

const ESTADO_CONFIG = {
  activo:   { label: "Activo",   color: "text-green-700",  bg: "bg-green-100" },
  pausado:  { label: "Pausado",  color: "text-amber-700",  bg: "bg-amber-100" },
  cancelado:{ label: "Cancelado",color: "text-red-700",    bg: "bg-red-100"   },
  renovado: { label: "Renovado", color: "text-blue-700",   bg: "bg-blue-100"  },
};

const TIPO_INTERACCION: Record<string, { emoji: string; label: string }> = {
  llamada:  { emoji: "📞", label: "Llamada" },
  whatsapp: { emoji: "💬", label: "WhatsApp" },
  email:    { emoji: "📧", label: "Email" },
  reunion:  { emoji: "🤝", label: "Reunión" },
  nota:     { emoji: "📝", label: "Nota" },
};

// ─── Cross-sell suggestions ─────────────────────────────────────────────────────

const CROSS_SELL_SUGERENCIAS: Record<string, string[]> = {
  contigo_autonomo: ["contigo_familia", "contigo_futuro", "sialp"],
  contigo_familia:  ["contigo_futuro", "sialp", "mihogar"],
  contigo_pyme:     ["contigo_futuro", "sialp", "liderplus"],
  contigo_senior:   ["contigo_familia", "mihogar", "sanitas_salud"],
  sialp:            ["contigo_futuro", "liderplus", "contigo_autonomo"],
  contigo_futuro:   ["sialp", "liderplus", "contigo_familia"],
  liderplus:        ["contigo_futuro", "sialp"],
  sanitas_salud:    ["contigo_familia", "mihogar"],
  mihogar:          ["contigo_familia", "sanitas_salud"],
  hipotecas:        ["mihogar", "contigo_familia"],
  otro:             ["contigo_futuro", "contigo_autonomo"],
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toLocaleString("es-ES", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " €";
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function ClienteDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [interacciones, setInteracciones] = useState<Interaccion[]>([]);
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState(false);
  const [edits, setEdits] = useState<Partial<Cliente>>({});
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    async function cargar() {
      setLoading(true);
      const [{ data: c }, { data: ints }] = await Promise.all([
        supabase.from("clientes")
          .select("*, comerciales(nombre, apellidos)")
          .eq("id", id).single(),
        supabase.from("interactions")
          .select("id, tipo, mensaje, created_at, origen")
          .eq("lead_id", (await supabase.from("clientes").select("lead_id").eq("id", id).single()).data?.lead_id ?? "")
          .order("created_at", { ascending: false })
          .limit(30),
      ]);

      if (!c) { router.push("/clientes"); return; }
      setCliente({ ...c, comerciales: c.comerciales as unknown as Cliente["comerciales"] });
      setEdits(c);
      if (ints) setInteracciones(ints);
      setLoading(false);
    }
    cargar();
  }, [id, router]);

  async function guardar() {
    if (!cliente) return;
    setGuardando(true);
    const { data, error } = await supabase.from("clientes").update({
      ...edits,
      updated_at: new Date().toISOString(),
    }).eq("id", id).select("*, comerciales(nombre, apellidos)").single();
    if (!error && data) {
      setCliente({ ...data, comerciales: data.comerciales as unknown as Cliente["comerciales"] });
    }
    setEditando(false);
    setGuardando(false);
  }

  if (loading) {
    return <div className="py-32 text-center text-sm text-slate-400">Cargando ficha de cliente...</div>;
  }

  if (!cliente) return null;

  const prod = PRODUCTOS[cliente.producto ?? "otro"] ?? PRODUCTOS["otro"];
  const estadoCfg = ESTADO_CONFIG[cliente.estado] ?? ESTADO_CONFIG["activo"];
  const com = cliente.comerciales;
  const comNombre = com ? `${com.nombre}${com.apellidos ? " " + com.apellidos : ""}` : "Sin asignar";

  // Renewal info
  const diasHastaRenovacion = cliente.fecha_renovacion
    ? differenceInDays(new Date(cliente.fecha_renovacion), new Date())
    : null;
  const renovacionAlerta = diasHastaRenovacion !== null && diasHastaRenovacion <= 30 && diasHastaRenovacion >= 0;
  const renovacionVencida = diasHastaRenovacion !== null && diasHastaRenovacion < 0;

  // Cross-sell suggestions
  const sugerencias = CROSS_SELL_SUGERENCIAS[cliente.producto ?? "otro"] ?? [];

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Link href="/clientes" className="hover:text-orange-500 transition-colors">Clientes</Link>
        <span>/</span>
        <span className="text-slate-800 font-medium">{cliente.nombre} {cliente.apellidos ?? ""}</span>
      </div>

      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-5 flex items-start gap-5 flex-wrap">
          {/* Product avatar */}
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl flex-shrink-0"
            style={{ background: prod.bg }}
          >
            {prod.emoji}
          </div>

          {/* Main info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold text-slate-900">
                {cliente.nombre} {cliente.apellidos ?? ""}
              </h1>
              <span className={`text-xs font-semibold rounded-full px-2.5 py-1 ${estadoCfg.bg} ${estadoCfg.color}`}>
                {estadoCfg.label}
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-0.5">
              {[cliente.empresa, cliente.email, cliente.telefono].filter(Boolean).join(" · ")}
            </p>
            <div className="flex items-center gap-4 mt-3 flex-wrap">
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-4 rounded text-xs flex items-center justify-center" style={{ background: prod.bg }}>
                  {prod.emoji}
                </div>
                <span className="text-sm font-medium text-slate-700">{prod.label}</span>
              </div>
              {cliente.valor_contrato && (
                <span className="text-sm font-semibold text-orange-700">{fmt(cliente.valor_contrato)}</span>
              )}
              <span className="text-sm text-slate-500">Asesor: {comNombre}</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {cliente.lead_id && (
              <Link
                href={`/leads/${cliente.lead_id}`}
                className="text-sm font-medium text-slate-600 border border-slate-200 rounded-xl px-3 py-2 hover:bg-slate-50 transition-colors"
              >
                Ver lead original
              </Link>
            )}
            <button
              onClick={() => setEditando(!editando)}
              className="text-sm font-medium text-white rounded-xl px-3 py-2 transition-colors"
              style={{ background: "#ea650d" }}
            >
              {editando ? "Cancelar" : "Editar"}
            </button>
          </div>
        </div>

        {/* Renewal alert */}
        {(renovacionAlerta || renovacionVencida) && (
          <div className={`px-6 py-3 border-t ${renovacionVencida ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200"}`}>
            <p className={`text-sm font-medium ${renovacionVencida ? "text-red-700" : "text-amber-700"}`}>
              {renovacionVencida
                ? `⚠️ Renovación vencida hace ${Math.abs(diasHastaRenovacion!)} días (${format(new Date(cliente.fecha_renovacion!), "d MMM yyyy", { locale: es })})`
                : `🔔 Renovación en ${diasHastaRenovacion} días (${format(new Date(cliente.fecha_renovacion!), "d MMM yyyy", { locale: es })})`}
            </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* KPI cards */}
        <div className="bg-white rounded-xl border border-slate-200 px-5 py-4">
          <p className="text-xs text-slate-500 mb-1">Inicio de póliza</p>
          <p className="text-lg font-bold text-slate-900">{format(new Date(cliente.fecha_inicio), "d MMM yyyy", { locale: es })}</p>
          <p className="text-xs text-slate-400">{Math.floor((Date.now() - new Date(cliente.fecha_inicio).getTime()) / (1000 * 60 * 60 * 24 * 365))} año(s) cliente</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 px-5 py-4">
          <p className="text-xs text-slate-500 mb-1">Prima anual</p>
          <p className="text-lg font-bold text-orange-700">{cliente.valor_contrato ? fmt(cliente.valor_contrato) : "—"}</p>
          <p className="text-xs text-slate-400">valor de contrato</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 px-5 py-4">
          <p className="text-xs text-slate-500 mb-1">Próxima renovación</p>
          {cliente.fecha_renovacion ? (
            <>
              <p className={`text-lg font-bold ${renovacionVencida ? "text-red-600" : renovacionAlerta ? "text-amber-600" : "text-slate-900"}`}>
                {format(new Date(cliente.fecha_renovacion), "d MMM yyyy", { locale: es })}
              </p>
              <p className="text-xs text-slate-400">
                {diasHastaRenovacion !== null
                  ? diasHastaRenovacion >= 0 ? `En ${diasHastaRenovacion} días` : `Hace ${Math.abs(diasHastaRenovacion)} días`
                  : ""}
              </p>
            </>
          ) : (
            <p className="text-lg font-bold text-slate-400">—</p>
          )}
        </div>
      </div>

      {/* Edit form */}
      {editando && (
        <div className="bg-white rounded-xl border border-slate-200 px-5 py-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-700">Editar datos</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { key: "nombre", label: "Nombre", type: "text" },
              { key: "apellidos", label: "Apellidos", type: "text" },
              { key: "email", label: "Email", type: "email" },
              { key: "telefono", label: "Teléfono", type: "text" },
              { key: "empresa", label: "Empresa", type: "text" },
              { key: "valor_contrato", label: "Prima anual (€)", type: "number" },
              { key: "fecha_inicio", label: "Fecha inicio", type: "date" },
              { key: "fecha_renovacion", label: "Fecha renovación", type: "date" },
            ].map(({ key, label, type }) => (
              <div key={key}>
                <label className="block text-xs text-slate-500 mb-1">{label}</label>
                <input
                  type={type}
                  value={(edits as Record<string, unknown>)[key] as string ?? ""}
                  onChange={e => setEdits(prev => ({ ...prev, [key]: e.target.value || null }))}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-orange-300"
                />
              </div>
            ))}
            <div>
              <label className="block text-xs text-slate-500 mb-1">Estado</label>
              <select
                value={edits.estado ?? "activo"}
                onChange={e => setEdits(prev => ({ ...prev, estado: e.target.value as Cliente["estado"] }))}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-orange-300 bg-white"
              >
                <option value="activo">Activo</option>
                <option value="pausado">Pausado</option>
                <option value="cancelado">Cancelado</option>
                <option value="renovado">Renovado</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Notas</label>
            <textarea
              value={edits.notas ?? ""}
              onChange={e => setEdits(prev => ({ ...prev, notas: e.target.value || null }))}
              rows={3}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-orange-300 resize-none"
            />
          </div>
          <div className="flex gap-3">
            <button onClick={() => setEditando(false)} className="flex-1 px-4 py-2 text-sm border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors">
              Cancelar
            </button>
            <button
              onClick={guardar}
              disabled={guardando}
              className="flex-1 px-4 py-2 text-sm font-semibold text-white rounded-xl transition-colors disabled:opacity-50"
              style={{ background: "#ea650d" }}
            >
              {guardando ? "Guardando..." : "Guardar cambios"}
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Notes */}
        {cliente.notas && (
          <div className="bg-white rounded-xl border border-slate-200 px-5 py-4">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Notas</h2>
            <p className="text-sm text-slate-700 whitespace-pre-line">{cliente.notas}</p>
          </div>
        )}

        {/* Cross-sell opportunities */}
        <div className="bg-white rounded-xl border border-slate-200 px-5 py-4">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Oportunidades cross-sell</h2>
          <div className="space-y-2">
            {sugerencias.slice(0, 3).map(s => {
              const p = PRODUCTOS[s] ?? PRODUCTOS["otro"];
              return (
                <div key={s} className="flex items-center gap-3 p-2.5 rounded-lg" style={{ background: p.bg }}>
                  <span>{p.emoji}</span>
                  <span className="text-sm font-medium" style={{ color: p.color }}>{p.label}</span>
                  <Link
                    href={`/leads/${cliente.lead_id}?tab=oferta`}
                    className="ml-auto text-xs font-medium border rounded-md px-2 py-0.5 transition-colors"
                    style={{ borderColor: p.color, color: p.color }}
                  >
                    Proponer
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Interaction history */}
      {interacciones.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200">
            <h2 className="text-sm font-semibold text-slate-700">Historial de interacciones</h2>
          </div>
          <div className="divide-y divide-slate-50">
            {interacciones.map(i => {
              const tipoConf = TIPO_INTERACCION[i.tipo] ?? { emoji: "📋", label: i.tipo };
              return (
                <div key={i.id} className="flex items-start gap-3 px-5 py-3">
                  <span className="text-lg flex-shrink-0 mt-0.5">{tipoConf.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-semibold text-slate-600">{tipoConf.label}</span>
                      {i.origen && i.origen !== "comercial" && (
                        <span className="text-xs text-slate-400 bg-slate-100 rounded-full px-1.5 py-0.5">{i.origen}</span>
                      )}
                    </div>
                    {i.mensaje && (
                      <p className="text-sm text-slate-600 line-clamp-2">{i.mensaje}</p>
                    )}
                  </div>
                  <span className="text-xs text-slate-400 flex-shrink-0 mt-0.5">
                    {format(new Date(i.created_at), "d MMM, HH:mm", { locale: es })}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
