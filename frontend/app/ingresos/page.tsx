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
  producto: string | null;
  valor_contrato: number | null;
  fecha_inicio: string;
  estado: string;
  comercial_asignado: string | null;
  comerciales: { nombre: string; apellidos: string | null } | null;
};

type RevenueComercial = {
  comercial_id: string | null;
  nombre: string;
  total: number;
  contratos: number;
  promedio: number;
  activos: number;
};

type RevenueMes = {
  mes: string;
  label: string;
  total: number;
  contratos: number;
};

type RevenueProducto = {
  producto: string;
  label: string;
  total: number;
  contratos: number;
};

// ─── Constants ─────────────────────────────────────────────────────────────────

const PRODUCTOS: Record<string, string> = {
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

// ─── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toLocaleString("es-ES", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " €";
}

function KpiCard({ label, valor, sub, color = "text-slate-900" }: { label: string; valor: string; sub?: string; color?: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 px-5 py-4">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{valor}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function BarraHorizontal({ pct, color = "bg-orange-500" }: { pct: number; color?: string }) {
  return (
    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

const PIPELINE_STAGES = [
  { estado: "respondio",      label: "Respondió",      prob: 0.15 },
  { estado: "cita_agendada",  label: "Cita agendada",  prob: 0.35 },
  { estado: "en_negociacion", label: "En negociación", prob: 0.65 },
] as const;

type PipelineStage = {
  estado: string;
  label: string;
  count: number;
  prob: number;
};

export default function IngresosPage() {
  const { puede, cargando: cargandoPermisos } = usePermisos();
  const [clientes, setClientes] = useState<ClienteRow[]>([]);
  const [pipeline, setPipeline] = useState<PipelineStage[]>([]);
  const [comisionesPct, setComisionesPct] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [periodoMeses, setPeriodoMeses] = useState(6);

  const cargar = useCallback(async () => {
    setLoading(true);
    const [{ data: clientesData }, { data: productsData }, ...pipelineCounts] = await Promise.all([
      supabase
        .from("clientes")
        .select("id, nombre, apellidos, producto, valor_contrato, fecha_inicio, estado, comercial_asignado, comerciales(nombre, apellidos)")
        .order("fecha_inicio", { ascending: false }),
      supabase.from("products").select("id, comision_pct"),
      ...PIPELINE_STAGES.map(s =>
        supabase.from("leads").select("id", { count: "exact", head: true })
          .eq("estado", s.estado)
      ),
    ]);
    setClientes((clientesData as ClienteRow[]) ?? []);
    const pctMap: Record<string, number> = {};
    for (const p of (productsData ?? []) as { id: string; comision_pct: number | null }[]) {
      pctMap[p.id] = p.comision_pct ?? 20;
    }
    setComisionesPct(pctMap);
    setPipeline(PIPELINE_STAGES.map((s, i) => ({
      ...s,
      count: (pipelineCounts[i] as { count: number | null }).count ?? 0,
    })));
    setLoading(false);
  }, []);

  useEffect(() => {
    if (cargandoPermisos) return;
    cargar();
  }, [cargar, cargandoPermisos]);

  if (!cargandoPermisos && !puede("ver_metricas")) return <SinAcceso />;

  // ── Derived data ──────────────────────────────────────────────────────────────

  const activos = clientes.filter(c => c.estado === "activo");
  const conValor = activos.filter(c => c.valor_contrato != null && c.valor_contrato > 0);

  const totalCartera = conValor.reduce((s, c) => s + (c.valor_contrato ?? 0), 0);
  const promedioContrato = conValor.length > 0 ? totalCartera / conValor.length : 0;

  // Last N months
  const ahora = new Date();
  const mesesLabels: RevenueMes[] = [];
  for (let i = periodoMeses - 1; i >= 0; i--) {
    const d = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("es-ES", { month: "short", year: "2-digit" });
    const enMes = conValor.filter(c => c.fecha_inicio.startsWith(key));
    mesesLabels.push({ mes: key, label, total: enMes.reduce((s, c) => s + (c.valor_contrato ?? 0), 0), contratos: enMes.length });
  }

  const mesActual = mesesLabels[mesesLabels.length - 1];
  const mesAnterior = mesesLabels[mesesLabels.length - 2];
  const crecimiento = mesAnterior?.total > 0
    ? Math.round(((mesActual.total - mesAnterior.total) / mesAnterior.total) * 100)
    : null;

  // Revenue por comercial
  const porComercial: RevenueComercial[] = [];
  for (const c of conValor) {
    const key = c.comercial_asignado ?? "__sin__";
    const nombre = c.comerciales ? `${c.comerciales.nombre} ${c.comerciales.apellidos ?? ""}`.trim() : "Sin asignar";
    const existing = porComercial.find(p => p.comercial_id === key);
    if (existing) {
      existing.total += c.valor_contrato ?? 0;
      existing.contratos++;
      existing.activos++;
    } else {
      porComercial.push({ comercial_id: key, nombre, total: c.valor_contrato ?? 0, contratos: 1, promedio: 0, activos: 1 });
    }
  }
  for (const p of porComercial) p.promedio = p.contratos > 0 ? p.total / p.contratos : 0;
  porComercial.sort((a, b) => b.total - a.total);

  // Comisiones por comercial
  const comisionesPorComercial: { nombre: string; comercial_id: string | null; comision: number; contratos: number }[] = [];
  for (const c of conValor) {
    const pct = (comisionesPct[c.producto ?? ""] ?? 20) / 100;
    const comision = (c.valor_contrato ?? 0) * pct;
    const key = c.comercial_asignado ?? "__sin__";
    const nombre = c.comerciales ? `${c.comerciales.nombre} ${c.comerciales.apellidos ?? ""}`.trim() : "Sin asignar";
    const ex = comisionesPorComercial.find(x => x.comercial_id === key);
    if (ex) { ex.comision += comision; ex.contratos++; }
    else comisionesPorComercial.push({ nombre, comercial_id: key, comision, contratos: 1 });
  }
  comisionesPorComercial.sort((a, b) => b.comision - a.comision);
  const totalComision = comisionesPorComercial.reduce((s, x) => s + x.comision, 0);

  // Revenue por producto
  const porProducto: RevenueProducto[] = [];
  for (const c of conValor) {
    const key = c.producto ?? "otro";
    const existing = porProducto.find(p => p.producto === key);
    if (existing) {
      existing.total += c.valor_contrato ?? 0;
      existing.contratos++;
    } else {
      porProducto.push({ producto: key, label: PRODUCTOS[key] ?? key, total: c.valor_contrato ?? 0, contratos: 1 });
    }
  }
  porProducto.sort((a, b) => b.total - a.total);

  const maxMes = Math.max(...mesesLabels.map(m => m.total), 1);
  const maxComercial = porComercial[0]?.total ?? 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Ingresos y cartera</h1>
          <p className="text-sm text-slate-500 mt-0.5">Valor de contratos activos por comercial y producto</p>
        </div>
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
          {([3, 6, 12] as const).map(n => (
            <button
              key={n}
              onClick={() => setPeriodoMeses(n)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                periodoMeses === n ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {n} meses
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="py-24 text-center text-sm text-slate-400">Cargando datos...</div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <KpiCard
              label="Cartera activa total"
              valor={fmt(totalCartera)}
              sub={`${conValor.length} contratos con valor`}
              color="text-green-700"
            />
            <KpiCard
              label={`Nuevos este mes`}
              valor={fmt(mesActual.total)}
              sub={`${mesActual.contratos} contratos`}
              color={mesActual.total > 0 ? "text-slate-900" : "text-slate-400"}
            />
            <KpiCard
              label="vs mes anterior"
              valor={crecimiento != null ? `${crecimiento > 0 ? "+" : ""}${crecimiento}%` : "—"}
              sub={mesAnterior ? fmt(mesAnterior.total) + " mes anterior" : undefined}
              color={crecimiento == null ? "text-slate-400" : crecimiento >= 0 ? "text-green-600" : "text-red-600"}
            />
            <KpiCard
              label="Ticket medio"
              valor={promedioContrato > 0 ? fmt(promedioContrato) : "—"}
              sub={`${activos.length} clientes activos`}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Tendencia mensual */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h2 className="text-sm font-semibold text-slate-700 mb-4">Nuevos contratos por mes</h2>
              {mesesLabels.every(m => m.total === 0) ? (
                <p className="text-sm text-slate-400 py-8 text-center">Sin datos de contratos con valor</p>
              ) : (
                <div className="space-y-3">
                  {mesesLabels.map(m => (
                    <div key={m.mes}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-slate-500 capitalize">{m.label}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-slate-400">{m.contratos} contrato{m.contratos !== 1 ? "s" : ""}</span>
                          <span className="text-xs font-semibold text-slate-700 w-24 text-right">{m.total > 0 ? fmt(m.total) : "—"}</span>
                        </div>
                      </div>
                      <BarraHorizontal pct={(m.total / maxMes) * 100} color="bg-orange-400" />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Revenue por producto */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h2 className="text-sm font-semibold text-slate-700 mb-4">Cartera por producto</h2>
              {porProducto.length === 0 ? (
                <p className="text-sm text-slate-400 py-8 text-center">Sin datos</p>
              ) : (
                <div className="space-y-3">
                  {porProducto.map(p => (
                    <div key={p.producto}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-slate-700 truncate max-w-[140px]">{p.label}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-slate-400">{p.contratos}</span>
                          <span className="text-xs font-semibold text-slate-700 w-24 text-right">{fmt(p.total)}</span>
                        </div>
                      </div>
                      <BarraHorizontal pct={(p.total / totalCartera) * 100} color="bg-blue-400" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Pipeline forecast */}
          {pipeline.some(s => s.count > 0) && (
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-sm font-semibold text-slate-700">Previsión de pipeline</h2>
                <span className="text-xs text-slate-400">Basado en ticket medio {promedioContrato > 0 ? fmt(promedioContrato) : "—"}</span>
              </div>
              <p className="text-xs text-slate-400 mb-4">Estimación ponderada por probabilidad de cierre por etapa</p>
              <div className="space-y-3">
                {pipeline.map(s => {
                  const estimado = s.count * (promedioContrato || 0) * s.prob;
                  return (
                    <div key={s.estado} className="flex items-center gap-4">
                      <div className="w-28 flex-shrink-0">
                        <p className="text-xs font-medium text-slate-700">{s.label}</p>
                        <p className="text-xs text-slate-400">{Math.round(s.prob * 100)}% prob.</p>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-slate-500">{s.count} lead{s.count !== 1 ? "s" : ""}</span>
                          <span className="text-xs font-semibold text-slate-700">
                            {promedioContrato > 0 ? `~${fmt(estimado)}` : `${s.count} leads`}
                          </span>
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-emerald-400 transition-all"
                            style={{ width: `${Math.min(100, s.count * 4)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
                {promedioContrato > 0 && (
                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                    <p className="text-xs font-semibold text-slate-600">Total pipeline estimado</p>
                    <p className="text-base font-bold text-emerald-700">
                      {fmt(pipeline.reduce((s, st) => s + st.count * promedioContrato * st.prob, 0))}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Revenue por comercial */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-700">Cartera por comercial</h2>
            </div>
            {porComercial.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-400">Sin datos de contratos asignados</div>
            ) : (
              <div className="divide-y divide-slate-50">
                {porComercial.map((p, idx) => (
                  <div key={p.comercial_id ?? "__sin__"} className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                      idx === 0 ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"
                    }`}>
                      {idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-sm font-medium text-slate-800">{p.nombre}</p>
                        <div className="flex items-center gap-4">
                          <span className="text-xs text-slate-400">{p.contratos} contrato{p.contratos !== 1 ? "s" : ""}</span>
                          <span className="text-xs text-slate-400">media {fmt(p.promedio)}</span>
                          <span className="text-sm font-bold text-slate-900 w-28 text-right">{fmt(p.total)}</span>
                        </div>
                      </div>
                      <BarraHorizontal pct={(p.total / maxComercial) * 100} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Comisiones estimadas */}
          {comisionesPorComercial.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-slate-700">Comisiones estimadas</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Calculadas según tasa de comisión por producto</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-emerald-700">{fmt(totalComision)}</p>
                  <p className="text-xs text-slate-400">total estimado</p>
                </div>
              </div>
              <div className="divide-y divide-slate-50">
                {comisionesPorComercial.map((p, idx) => (
                  <div key={p.comercial_id ?? idx} className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 transition-colors">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                      idx === 0 ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"
                    }`}>
                      {idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-medium text-slate-800">{p.nombre}</p>
                        <div className="flex items-center gap-4">
                          <span className="text-xs text-slate-400">{p.contratos} contrato{p.contratos !== 1 ? "s" : ""}</span>
                          <span className="text-sm font-bold text-emerald-700 w-24 text-right">{fmt(p.comision)}</span>
                        </div>
                      </div>
                      <BarraHorizontal pct={(p.comision / (comisionesPorComercial[0]?.comision || 1)) * 100} color="bg-emerald-400" />
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-5 py-3 bg-slate-50 border-t border-slate-100">
                <p className="text-xs text-slate-400">
                  Tasas por producto en ajustes. Las comisiones son estimaciones — consultar con dirección para valores exactos.
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
