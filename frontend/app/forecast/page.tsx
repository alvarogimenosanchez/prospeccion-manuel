"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { usePermisos } from "@/components/PermisosProvider";
import { SinAcceso } from "@/components/SinAcceso";

// Probability by pipeline stage (industry standard for insurance)
const PROB_ETAPA: Record<string, number> = {
  nuevo: 2,
  enriquecido: 5,
  segmentado: 8,
  mensaje_generado: 10,
  mensaje_enviado: 12,
  respondio: 25,
  cita_agendada: 45,
  en_negociacion: 70,
  cerrado_ganado: 100,
};

const ETAPA_LABEL: Record<string, string> = {
  nuevo: "Nuevo",
  enriquecido: "Enriquecido",
  segmentado: "Segmentado",
  mensaje_generado: "Mensaje generado",
  mensaje_enviado: "Mensaje enviado",
  respondio: "Respondió",
  cita_agendada: "Cita agendada",
  en_negociacion: "En negociación",
  cerrado_ganado: "Cerrado ganado",
};

// Default annual premium per product (€) — used when no historical data
const PRIMA_DEFAULT: Record<string, number> = {
  contigo_autonomo: 120,
  contigo_pyme: 480,
  contigo_familia: 360,
  contigo_futuro: 1200,
  liderplus: 960,
  sanitas_salud: 720,
  hipotecas: 3000,
  mihogar: 240,
};
const PRIMA_GENERICA = 300;
const COMISION_PCT_DEFAULT = 0.20;

type EstadoPipeline = {
  estado: string;
  count: number;
  productos: Record<string, number>;
  valor_ponderado: number;
  comision_ponderada: number;
};

type HistoricoMes = {
  mes: string;
  cierres: number;
  valor: number;
};

export default function ForecastPage() {
  const { puede, cargando: cargandoPermisos } = usePermisos();
  const [etapas, setEtapas] = useState<EstadoPipeline[]>([]);
  const [historico, setHistorico] = useState<HistoricoMes[]>([]);
  const [avgValorReal, setAvgValorReal] = useState<number | null>(null);
  const [avgComisionReal, setAvgComisionReal] = useState<number | null>(null);
  const [cargando, setCargando] = useState(true);
  const [valorManual, setValorManual] = useState<number | null>(null);
  const [comisionPct, setComisionPct] = useState<number | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);

    const inicioHoy = new Date();
    const hace6Meses = new Date(inicioHoy.getFullYear(), inicioHoy.getMonth() - 5, 1).toISOString();

    const [{ data: leads }, { data: clientes }, { data: histData }, { data: products }] = await Promise.all([
      supabase.from("leads").select("estado, productos_recomendados")
        .not("estado", "in", "(cerrado_perdido,descartado)"),
      supabase.from("clientes").select("valor_contrato, producto")
        .eq("estado", "activo").not("valor_contrato", "is", null),
      supabase.from("clientes").select("fecha_inicio, valor_contrato")
        .eq("estado", "activo").gte("fecha_inicio", hace6Meses).not("valor_contrato", "is", null),
      supabase.from("products").select("nombre, comision_pct").not("comision_pct", "is", null),
    ]);

    // Real avg valor from clients DB
    const valoresReales = (clientes ?? []).map(c => c.valor_contrato as number).filter(v => v > 0);
    const avgReal = valoresReales.length > 0
      ? valoresReales.reduce((a, b) => a + b, 0) / valoresReales.length
      : null;
    setAvgValorReal(avgReal);

    // Products commission map
    const commMap: Record<string, number> = {};
    for (const p of products ?? []) {
      const key = p.nombre?.toLowerCase().replace(/\s+/g, "_") ?? "";
      commMap[key] = (p.comision_pct as number) / 100;
    }
    const avgComPct = Object.values(commMap).length > 0
      ? Object.values(commMap).reduce((a, b) => a + b, 0) / Object.values(commMap).length
      : COMISION_PCT_DEFAULT;
    setAvgComisionReal(avgComPct * (avgReal ?? PRIMA_GENERICA));

    // Historical monthly closes
    const byMes: Record<string, { count: number; valor: number }> = {};
    for (const c of histData ?? []) {
      const mes = c.fecha_inicio?.slice(0, 7) ?? "";
      if (!byMes[mes]) byMes[mes] = { count: 0, valor: 0 };
      byMes[mes].count++;
      byMes[mes].valor += (c.valor_contrato as number) ?? 0;
    }
    const histArray: HistoricoMes[] = Object.entries(byMes)
      .map(([mes, v]) => ({ mes, cierres: v.count, valor: v.valor }))
      .sort((a, b) => a.mes.localeCompare(b.mes));
    setHistorico(histArray);

    // Pipeline by stage
    const stageMap: Record<string, { count: number; prods: Record<string, number> }> = {};
    for (const l of leads ?? []) {
      if (!stageMap[l.estado]) stageMap[l.estado] = { count: 0, prods: {} };
      stageMap[l.estado].count++;
      for (const p of (l.productos_recomendados as string[] | null) ?? []) {
        const key = p.toLowerCase().replace(/\s+/g, "_");
        stageMap[l.estado].prods[key] = (stageMap[l.estado].prods[key] ?? 0) + 1;
      }
    }

    const useAvgValor = avgReal ?? PRIMA_GENERICA;
    const useComPct = avgComPct;

    const etapasArr: EstadoPipeline[] = Object.entries(stageMap)
      .filter(([estado]) => PROB_ETAPA[estado] !== undefined)
      .map(([estado, data]) => {
        const prob = (PROB_ETAPA[estado] ?? 0) / 100;
        const valor_ponderado = data.count * useAvgValor * prob;
        const comision_ponderada = valor_ponderado * useComPct;
        return {
          estado,
          count: data.count,
          productos: data.prods,
          valor_ponderado,
          comision_ponderada,
        };
      })
      .sort((a, b) => (PROB_ETAPA[b.estado] ?? 0) - (PROB_ETAPA[a.estado] ?? 0));

    setEtapas(etapasArr);
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const useValor = valorManual ?? avgValorReal ?? PRIMA_GENERICA;
  const useComPct = (comisionPct ?? (avgComisionReal != null && avgValorReal != null ? (avgComisionReal / avgValorReal) * 100 : COMISION_PCT_DEFAULT * 100)) / 100;

  const totalPonderado = etapas.reduce((a, e) => a + e.count * useValor * (PROB_ETAPA[e.estado] ?? 0) / 100, 0);
  const totalComision = totalPonderado * useComPct;

  const totalAlto = etapas
    .filter(e => (PROB_ETAPA[e.estado] ?? 0) >= 45)
    .reduce((a, e) => a + e.count * useValor * (PROB_ETAPA[e.estado] ?? 0) / 100, 0);

  // Projected monthly closes based on historical velocity
  const avgMensualCierres = historico.length > 0
    ? historico.reduce((a, h) => a + h.cierres, 0) / historico.length
    : null;

  if (!cargandoPermisos && !puede("ver_metricas")) return <SinAcceso />;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Forecast de ventas</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Proyección de ingresos basada en el pipeline activo y probabilidades por etapa
        </p>
      </div>

      {/* Configuration */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">Parámetros del cálculo</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">
              Prima media (€/año)
            </label>
            <input
              type="number"
              value={valorManual ?? useValor}
              onChange={e => setValorManual(parseFloat(e.target.value) || null)}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-orange-300"
              placeholder={String(Math.round(useValor))}
            />
            {avgValorReal && (
              <p className="text-xs text-green-600 mt-1">
                Media real de cartera: {Math.round(avgValorReal)}€
              </p>
            )}
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">
              Comisión media (%)
            </label>
            <input
              type="number"
              value={comisionPct ?? Math.round(useComPct * 100)}
              onChange={e => setComisionPct(parseFloat(e.target.value) || null)}
              min={0}
              max={100}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-orange-300"
            />
          </div>
          <div className="flex items-end">
            <p className="text-xs text-slate-400">
              Probabilidades basadas en estándares del sector seguros. Ajusta prima y comisión a tu cartera real.
            </p>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Pipeline total</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">
            {Math.round(totalPonderado).toLocaleString("es-ES")}€
          </p>
          <p className="text-xs text-slate-400 mt-0.5">valor ponderado</p>
        </div>
        <div className="bg-white rounded-xl border border-green-200 bg-green-50 p-4">
          <p className="text-xs text-green-600 font-medium uppercase tracking-wide">Comisión estimada</p>
          <p className="text-2xl font-bold text-green-700 mt-1">
            {Math.round(totalComision).toLocaleString("es-ES")}€
          </p>
          <p className="text-xs text-green-500 mt-0.5">al {Math.round(useComPct * 100)}% comisión</p>
        </div>
        <div className="bg-white rounded-xl border border-orange-200 bg-orange-50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide" style={{ color: "#ea650d" }}>Leads avanzados</p>
          <p className="text-2xl font-bold mt-1" style={{ color: "#ea650d" }}>
            {Math.round(totalAlto).toLocaleString("es-ES")}€
          </p>
          <p className="text-xs mt-0.5" style={{ color: "#f97316" }}>cita agendada o negociación</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Velocidad histórica</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">
            {avgMensualCierres !== null ? `~${avgMensualCierres.toFixed(1)}` : "—"}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">cierres/mes (últimos 6m)</p>
        </div>
      </div>

      {/* Pipeline by stage */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-700">Pipeline por etapa</h2>
          <p className="text-xs text-slate-400 mt-0.5">Valor ponderado = leads × prima media × probabilidad de cierre</p>
        </div>

        {cargando ? (
          <div className="flex justify-center py-10">
            <div className="w-6 h-6 rounded-full border-2 animate-spin" style={{ borderColor: "#ea650d", borderTopColor: "transparent" }} />
          </div>
        ) : etapas.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">Sin leads en el pipeline</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Etapa</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Leads</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Probabilidad</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Valor ponderado</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Comisión est.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {etapas.map(e => {
                const prob = PROB_ETAPA[e.estado] ?? 0;
                const vpond = e.count * useValor * prob / 100;
                const cpond = vpond * useComPct;
                const isHot = prob >= 45;
                return (
                  <tr key={e.estado} className={isHot ? "bg-orange-50/30" : "hover:bg-slate-50"}>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        {isHot && <span className="text-xs">🔥</span>}
                        <span className={`font-medium ${isHot ? "" : "text-slate-700"}`} style={isHot ? { color: "#ea650d" } : undefined}>
                          {ETAPA_LABEL[e.estado] ?? e.estado}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right font-semibold text-slate-800">{e.count}</td>
                    <td className="px-5 py-3 text-right">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        prob >= 70 ? "bg-green-100 text-green-700" :
                        prob >= 45 ? "bg-orange-100 text-orange-700" :
                        prob >= 20 ? "bg-amber-100 text-amber-700" :
                        "bg-slate-100 text-slate-500"
                      }`}>
                        {prob}%
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right font-semibold text-slate-800">
                      {Math.round(vpond).toLocaleString("es-ES")}€
                    </td>
                    <td className="px-5 py-3 text-right text-green-700 font-medium">
                      {Math.round(cpond).toLocaleString("es-ES")}€
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 border-t border-slate-200 font-semibold">
                <td className="px-5 py-3 text-sm text-slate-700">Total ponderado</td>
                <td className="px-5 py-3 text-right text-sm text-slate-800">{etapas.reduce((a, e) => a + e.count, 0)}</td>
                <td />
                <td className="px-5 py-3 text-right text-sm text-slate-800">{Math.round(totalPonderado).toLocaleString("es-ES")}€</td>
                <td className="px-5 py-3 text-right text-sm text-green-700">{Math.round(totalComision).toLocaleString("es-ES")}€</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* Historical */}
      {historico.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Histórico de cierres (últimos 6 meses)</h2>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            {historico.map(h => (
              <div key={h.mes} className="text-center">
                <p className="text-xs text-slate-400">{new Date(h.mes + "-01").toLocaleDateString("es-ES", { month: "short" })}</p>
                <p className="text-lg font-bold text-slate-800 mt-1">{h.cierres}</p>
                <p className="text-xs text-slate-500">{h.valor > 0 ? `${Math.round(h.valor / 1000)}k€` : "—"}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-slate-400 pb-6">
        El forecast es una estimación basada en probabilidades por etapa del sector seguros y la prima media configurada.
        Actualiza los parámetros con tus datos reales para mayor precisión.
      </p>
    </div>
  );
}
