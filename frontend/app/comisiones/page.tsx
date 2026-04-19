"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { usePermisos } from "@/components/PermisosProvider";
import { SinAcceso } from "@/components/SinAcceso";

// ─── Types ─────────────────────────────────────────────────────────────────────

type ClienteRow = {
  id: string;
  nombre: string;
  apellidos: string | null;
  empresa: string | null;
  producto: string | null;
  valor_contrato: number | null;
  fecha_inicio: string;
  comercial_asignado: string | null;
  comerciales: { nombre: string; apellidos: string | null } | null;
};

type ComercialComision = {
  id: string;
  nombre: string;
  cierres: number;
  volumen: number;
  comision: number;
  deals: { producto: string; valor: number; comision: number; cliente: string; fecha: string }[];
};

// ─── Constants ─────────────────────────────────────────────────────────────────

const PRODUCTOS_LABEL: Record<string, string> = {
  contigo_futuro: "Contigo Futuro",
  sialp: "SIALP",
  contigo_autonomo: "Contigo Autónomo",
  contigo_familia: "Contigo Familia",
  contigo_pyme: "Contigo Pyme",
  contigo_senior: "Contigo Senior",
  liderplus: "LiderPlus",
  sanitas_salud: "Sanitas Salud",
  mihogar: "MiHogar",
  hipotecas: "Hipoteca",
  otro: "Otro",
};

const COMISION_DEFAULT: Record<string, number> = {
  contigo_futuro: 8,
  sialp: 6,
  contigo_autonomo: 12,
  contigo_familia: 10,
  contigo_pyme: 10,
  contigo_senior: 9,
  liderplus: 7,
  sanitas_salud: 8,
  mihogar: 8,
  hipotecas: 1,
  otro: 8,
};

const MESES_LABELS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function fmt(n: number): string {
  return n.toLocaleString("es-ES", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " €";
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function ComisionesPage() {
  const { puede, cargando: cargandoPermisos } = usePermisos();
  const [comerciales, setComerciales] = useState<ComercialComision[]>([]);
  const [loading, setLoading] = useState(true);
  const [mes, setMes] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [editandoTasas, setEditandoTasas] = useState(false);
  const [tasas, setTasas] = useState<Record<string, number>>(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("comision_tasas");
        if (stored) return { ...COMISION_DEFAULT, ...JSON.parse(stored) };
      } catch { /* ignore */ }
    }
    return { ...COMISION_DEFAULT };
  });
  const [expandido, setExpandido] = useState<string | null>(null);

  function guardarTasas(nuevas: Record<string, number>) {
    setTasas(nuevas);
    localStorage.setItem("comision_tasas", JSON.stringify(nuevas));
  }

  const cargar = useCallback(async () => {
    setLoading(true);

    const desde = new Date(mes + "-01");
    const hasta = new Date(desde);
    hasta.setMonth(hasta.getMonth() + 1);

    const { data: clientes } = await supabase
      .from("clientes")
      .select("id, nombre, apellidos, empresa, producto, valor_contrato, fecha_inicio, comercial_asignado, comerciales(nombre, apellidos)")
      .gte("fecha_inicio", desde.toISOString())
      .lt("fecha_inicio", hasta.toISOString())
      .order("fecha_inicio", { ascending: false })
      .limit(500);

    if (!clientes) { setLoading(false); return; }

    // Group by comercial
    const map = new Map<string, ComercialComision>();

    for (const c of clientes as unknown as ClienteRow[]) {
      const cId = c.comercial_asignado ?? "__sin_asignar__";
      const com = c.comerciales as unknown as { nombre: string; apellidos: string | null } | null;
      const comNombre = com ? `${com.nombre}${com.apellidos ? " " + com.apellidos : ""}` : "Sin asignar";
      const producto = c.producto ?? "otro";
      const valor = c.valor_contrato ?? 0;
      const tasaPct = tasas[producto] ?? 8;
      const comision = valor * tasaPct / 100;
      const clienteNombre = [c.nombre, c.apellidos].filter(Boolean).join(" ");

      if (!map.has(cId)) {
        map.set(cId, { id: cId, nombre: comNombre, cierres: 0, volumen: 0, comision: 0, deals: [] });
      }
      const e = map.get(cId)!;
      e.cierres++;
      e.volumen += valor;
      e.comision += comision;
      e.deals.push({
        producto: PRODUCTOS_LABEL[producto] ?? producto,
        valor,
        comision,
        cliente: clienteNombre,
        fecha: c.fecha_inicio,
      });
    }

    const sorted = [...map.values()].sort((a, b) => b.comision - a.comision);
    setComerciales(sorted);
    setLoading(false);
  }, [mes, tasas]);

  useEffect(() => {
    if (!cargandoPermisos && puede("ver_metricas")) cargar();
  }, [cargar, cargandoPermisos, puede]);

  if (!cargandoPermisos && !puede("ver_metricas")) return <SinAcceso />;

  const totalVolumen = comerciales.reduce((s, c) => s + c.volumen, 0);
  const totalComision = comerciales.reduce((s, c) => s + c.comision, 0);
  const totalCierres = comerciales.reduce((s, c) => s + c.cierres, 0);
  const maxComision = Math.max(...comerciales.map(c => c.comision), 1);

  // Build month selector (last 12 months)
  const mesesDisponibles: { value: string; label: string }[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    mesesDisponibles.push({ value: val, label: `${MESES_LABELS[d.getMonth()]} ${d.getFullYear()}` });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Comisiones</h1>
          <p className="text-sm text-slate-500 mt-0.5">Estimación de comisiones por ventas cerradas</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setEditandoTasas(!editandoTasas)}
            className={`px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${editandoTasas ? "bg-slate-900 text-white border-slate-900" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
          >
            ⚙️ Tasas de comisión
          </button>
          <select
            value={mes}
            onChange={e => setMes(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:border-orange-300"
          >
            {mesesDisponibles.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Commission rate editor */}
      {editandoTasas && (
        <div className="bg-white rounded-xl border border-slate-200 px-5 py-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-700">Tasas de comisión por producto (%)</h2>
            <p className="text-xs text-slate-400">Se guardan en este dispositivo</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {Object.entries(PRODUCTOS_LABEL).map(([key, label]) => (
              <div key={key}>
                <label className="block text-xs text-slate-500 mb-1">{label}</label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    value={tasas[key] ?? 8}
                    onChange={e => guardarTasas({ ...tasas, [key]: parseFloat(e.target.value) || 0 })}
                    className="w-16 text-sm border border-slate-200 rounded-md px-2 py-1 focus:outline-none focus:border-orange-300 text-center"
                  />
                  <span className="text-xs text-slate-400">%</span>
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={() => guardarTasas({ ...COMISION_DEFAULT })}
            className="mt-3 text-xs text-slate-400 hover:text-slate-600 underline"
          >
            Restaurar valores por defecto
          </button>
        </div>
      )}

      {/* KPIs */}
      {!loading && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-xl border border-slate-200 px-5 py-4">
            <p className="text-xs text-slate-500 mb-1">Cierres en el mes</p>
            <p className="text-2xl font-bold text-slate-900">{totalCierres}</p>
            <p className="text-xs text-slate-400">{comerciales.length} comerciales activos</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 px-5 py-4">
            <p className="text-xs text-slate-500 mb-1">Volumen total</p>
            <p className="text-2xl font-bold text-orange-700">{fmt(totalVolumen)}</p>
            <p className="text-xs text-slate-400">primas anuales</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 px-5 py-4">
            <p className="text-xs text-slate-500 mb-1">Comisiones estimadas</p>
            <p className="text-2xl font-bold text-green-700">{fmt(totalComision)}</p>
            <p className="text-xs text-slate-400">{totalVolumen > 0 ? ((totalComision / totalVolumen) * 100).toFixed(1) : 0}% tasa media</p>
          </div>
        </div>
      )}

      {/* Per-comercial breakdown */}
      {loading ? (
        <div className="py-24 text-center text-sm text-slate-400">Calculando comisiones...</div>
      ) : comerciales.length === 0 ? (
        <div className="py-24 text-center">
          <p className="text-4xl mb-3">📋</p>
          <p className="text-base font-semibold text-slate-700 mb-1">Sin cierres en este período</p>
          <p className="text-sm text-slate-400">No hay clientes registrados en {mesesDisponibles.find(m => m.value === mes)?.label}.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-700">Ranking de comerciales</h2>
          {comerciales.map((com, i) => {
            const barPct = Math.round((com.comision / maxComision) * 100);
            const abierto = expandido === com.id;
            return (
              <div key={com.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <button
                  onClick={() => setExpandido(abierto ? null : com.id)}
                  className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-slate-50 transition-colors"
                >
                  {/* Rank */}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${i === 0 ? "bg-amber-100 text-amber-700" : i === 1 ? "bg-slate-200 text-slate-600" : i === 2 ? "bg-orange-100 text-orange-600" : "bg-slate-100 text-slate-500"}`}>
                    {i + 1}
                  </div>
                  {/* Name + bar */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 mb-1.5">{com.nombre}</p>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${barPct}%` }} />
                    </div>
                  </div>
                  {/* Stats */}
                  <div className="flex items-center gap-6 flex-shrink-0">
                    <div className="text-right">
                      <p className="text-xs text-slate-400">Cierres</p>
                      <p className="text-sm font-semibold text-slate-700">{com.cierres}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-400">Volumen</p>
                      <p className="text-sm font-semibold text-slate-700">{fmt(com.volumen)}</p>
                    </div>
                    <div className="text-right min-w-[80px]">
                      <p className="text-xs text-slate-400">Comisión</p>
                      <p className="text-base font-bold text-green-700">{fmt(com.comision)}</p>
                    </div>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                      className={`text-slate-400 transition-transform flex-shrink-0 ${abierto ? "rotate-180" : ""}`}>
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </div>
                </button>

                {/* Expanded deal list */}
                {abierto && (
                  <div className="border-t border-slate-100">
                    <div className="px-5 py-2 bg-slate-50 text-xs text-slate-500 font-medium border-b border-slate-100">
                      Desglose de operaciones
                    </div>
                    <div className="divide-y divide-slate-50">
                      {com.deals.map((deal, j) => (
                        <div key={j} className="flex items-center gap-4 px-5 py-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-800 truncate">{deal.cliente}</p>
                            <p className="text-xs text-slate-400">{deal.producto} · {new Date(deal.fecha).toLocaleDateString("es-ES", { day: "2-digit", month: "short" })}</p>
                          </div>
                          <div className="flex items-center gap-6 flex-shrink-0 text-right">
                            <div>
                              <p className="text-xs text-slate-400">Prima</p>
                              <p className="text-sm font-medium text-slate-700">{fmt(deal.valor)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-slate-400">Comisión</p>
                              <p className="text-sm font-semibold text-green-700">{fmt(deal.comision)}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="px-5 py-2.5 bg-slate-50 border-t border-slate-100 flex justify-between">
                      <span className="text-xs text-slate-400">Tasa media aplicada: {com.volumen > 0 ? ((com.comision / com.volumen) * 100).toFixed(1) : 0}%</span>
                      <span className="text-xs font-semibold text-green-700">Total: {fmt(com.comision)}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-slate-400 pt-2 border-t border-slate-200">
        Las comisiones son estimaciones basadas en el valor de contrato registrado y las tasas configuradas. No incluye bonificaciones, ajustes de empresa ni comisiones de renovación.
      </p>
    </div>
  );
}
