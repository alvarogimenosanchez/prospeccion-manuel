"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { usePermisos } from "@/components/PermisosProvider";
import { SinAcceso } from "@/components/SinAcceso";

// Pipeline stages in order
const ETAPAS = [
  { key: "nuevo",             label: "Nuevo",             color: "#94a3b8" },
  { key: "enriquecido",       label: "Enriquecido",       color: "#60a5fa" },
  { key: "segmentado",        label: "Segmentado",        color: "#818cf8" },
  { key: "mensaje_generado",  label: "Mensaje generado",  color: "#f59e0b" },
  { key: "mensaje_enviado",   label: "Mensaje enviado",   color: "#fb923c" },
  { key: "respondio",         label: "Respondió",         color: "#f97316" },
  { key: "cita_agendada",     label: "Cita agendada",     color: "#a78bfa" },
  { key: "en_negociacion",    label: "En negociación",    color: "#34d399" },
  { key: "cerrado_ganado",    label: "Cerrado ganado",    color: "#10b981" },
];

const PERDIDOS = ["cerrado_perdido", "descartado"];

type ConteoEstado = Record<string, number>;

type AvgDias = Record<string, number | null>;

type Comercial = { id: string; nombre: string; apellidos: string | null };

export default function FunnelPage() {
  const { puede, cargando: cargandoPermisos } = usePermisos();
  const [conteos, setConteos] = useState<ConteoEstado>({});
  const [perdidos, setPerdidos] = useState(0);
  const [avgDias, setAvgDias] = useState<AvgDias>({});
  const [comerciales, setComerciales] = useState<Comercial[]>([]);
  const [filtroComercial, setFiltroComercial] = useState<string>("todos");
  const [filtroPeriodo, setFiltroPeriodo] = useState<string>("90");
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    supabase.from("comerciales").select("id, nombre, apellidos").eq("activo", true)
      .then(({ data }) => setComerciales(data ?? []));
  }, []);

  useEffect(() => {
    cargar();
  }, [filtroComercial, filtroPeriodo]);

  async function cargar() {
    setCargando(true);

    const desde = filtroPeriodo !== "todos"
      ? new Date(Date.now() - parseInt(filtroPeriodo) * 24 * 3600_000).toISOString()
      : null;

    // Build base query
    let q = supabase.from("leads").select("estado");
    if (filtroComercial !== "todos") q = q.eq("comercial_asignado", filtroComercial);
    if (desde) q = q.gte("fecha_captacion", desde);

    const { data: leads } = await q;

    // Count per state
    const map: ConteoEstado = {};
    let totalPerdidos = 0;
    for (const l of leads ?? []) {
      if (PERDIDOS.includes(l.estado)) { totalPerdidos++; continue; }
      map[l.estado] = (map[l.estado] ?? 0) + 1;
    }
    setConteos(map);
    setPerdidos(totalPerdidos);

    // Avg days in each stage from state history
    const etapaKeys = ETAPAS.map(e => e.key);
    let hq = supabase.from("lead_state_history").select("estado_anterior, estado_nuevo, created_at, lead_id");
    if (filtroComercial !== "todos") hq = hq.eq("comercial_id", filtroComercial);
    if (desde) hq = hq.gte("created_at", desde);
    const { data: historia } = await hq;

    // For each lead, compute time spent in each stage
    const tiemposPorEtapa: Record<string, number[]> = {};
    const entradaPorLead: Record<string, Record<string, string>> = {};

    for (const row of historia ?? []) {
      if (!entradaPorLead[row.lead_id]) entradaPorLead[row.lead_id] = {};
      const entrada = entradaPorLead[row.lead_id];

      if (!entrada[row.estado_anterior]) {
        entrada[row.estado_anterior] = row.created_at;
      }
      if (etapaKeys.includes(row.estado_anterior) && entrada[row.estado_anterior]) {
        const inicio = new Date(entrada[row.estado_anterior]).getTime();
        const fin = new Date(row.created_at).getTime();
        const dias = (fin - inicio) / 86400_000;
        if (dias >= 0 && dias < 365) {
          if (!tiemposPorEtapa[row.estado_anterior]) tiemposPorEtapa[row.estado_anterior] = [];
          tiemposPorEtapa[row.estado_anterior].push(dias);
        }
      }
      entrada[row.estado_nuevo] = row.created_at;
    }

    const avg: AvgDias = {};
    for (const etapa of etapaKeys) {
      const tiempos = tiemposPorEtapa[etapa];
      avg[etapa] = tiempos && tiempos.length > 0
        ? tiempos.reduce((a, b) => a + b, 0) / tiempos.length
        : null;
    }
    setAvgDias(avg);
    setCargando(false);
  }

  const totalEntrada = conteos["nuevo"] ?? 0;
  const totalConvertidos = conteos["cerrado_ganado"] ?? 0;
  const totalActivos = Object.values(conteos).reduce((a, b) => a + b, 0);
  const tasaConversion = totalEntrada > 0 ? ((totalConvertidos / totalEntrada) * 100).toFixed(1) : "0.0";

  const maxConteo = Math.max(1, ...ETAPAS.map(e => conteos[e.key] ?? 0));

  if (!cargandoPermisos && !puede("ver_metricas")) return <SinAcceso />;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Funnel de conversión</h1>
          <p className="text-sm text-slate-500 mt-0.5">Análisis de las etapas del pipeline y tasas de paso</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={filtroComercial}
            onChange={e => setFiltroComercial(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:border-orange-300"
          >
            <option value="todos">Todos los comerciales</option>
            {comerciales.map(c => (
              <option key={c.id} value={c.id}>
                {c.nombre} {c.apellidos ?? ""}
              </option>
            ))}
          </select>
          <select
            value={filtroPeriodo}
            onChange={e => setFiltroPeriodo(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:border-orange-300"
          >
            <option value="30">Últimos 30 días</option>
            <option value="60">Últimos 60 días</option>
            <option value="90">Últimos 90 días</option>
            <option value="180">Últimos 6 meses</option>
            <option value="365">Último año</option>
            <option value="todos">Todo el tiempo</option>
          </select>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Leads totales</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{totalActivos + perdidos}</p>
          <p className="text-xs text-slate-400 mt-0.5">en el periodo</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Activos</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{totalActivos}</p>
          <p className="text-xs text-slate-400 mt-0.5">en pipeline</p>
        </div>
        <div className="bg-white rounded-xl border border-green-200 p-4 bg-green-50">
          <p className="text-xs text-green-600 font-medium uppercase tracking-wide">Cerrados ganados</p>
          <p className="text-2xl font-bold text-green-700 mt-1">{totalConvertidos}</p>
          <p className="text-xs text-green-600 mt-0.5">tasa: {tasaConversion}%</p>
        </div>
        <div className="bg-white rounded-xl border border-red-200 p-4 bg-red-50">
          <p className="text-xs text-red-500 font-medium uppercase tracking-wide">Perdidos</p>
          <p className="text-2xl font-bold text-red-600 mt-1">{perdidos}</p>
          <p className="text-xs text-red-400 mt-0.5">descartados + perdidos</p>
        </div>
      </div>

      {/* Funnel visual */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-5">Etapas del pipeline</h2>

        {cargando ? (
          <div className="flex justify-center py-10">
            <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "#ea650d", borderTopColor: "transparent" }} />
          </div>
        ) : (
          <div className="space-y-2">
            {ETAPAS.map((etapa, i) => {
              const count = conteos[etapa.key] ?? 0;
              const prev = i > 0 ? (conteos[ETAPAS[i - 1].key] ?? 0) : null;
              const tasa = prev !== null && prev > 0 ? ((count / prev) * 100).toFixed(0) : null;
              const barWidth = maxConteo > 0 ? Math.max(2, Math.round((count / maxConteo) * 100)) : 2;
              const dias = avgDias[etapa.key];

              return (
                <div key={etapa.key} className="group">
                  {/* Conversion arrow between stages */}
                  {i > 0 && tasa !== null && (
                    <div className="flex items-center gap-2 my-1 pl-2">
                      <div className="text-slate-300 text-sm">↓</div>
                      <span className="text-xs text-slate-400">
                        {tasa}% conversión desde etapa anterior
                      </span>
                    </div>
                  )}

                  <div className="flex items-center gap-3">
                    {/* Stage label */}
                    <div className="w-36 shrink-0 text-right">
                      <span className="text-xs font-medium text-slate-600">{etapa.label}</span>
                    </div>

                    {/* Bar */}
                    <div className="flex-1 relative h-8 bg-slate-50 rounded-lg overflow-hidden">
                      <div
                        className="h-full rounded-lg transition-all duration-500 flex items-center px-2"
                        style={{ width: `${barWidth}%`, background: etapa.color, opacity: count === 0 ? 0.2 : 1 }}
                      />
                      <div className="absolute inset-0 flex items-center px-3">
                        <span className="text-xs font-semibold" style={{ color: barWidth > 30 ? "#fff" : "#475569" }}>
                          {count > 0 ? count : "—"}
                        </span>
                      </div>
                    </div>

                    {/* Avg days */}
                    <div className="w-20 shrink-0 text-xs text-slate-400">
                      {dias !== null ? (
                        <span title="Tiempo promedio en esta etapa">
                          ~{dias < 1 ? "<1" : Math.round(dias)}d
                        </span>
                      ) : "—"}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Lost leads */}
            <div className="mt-4 pt-4 border-t border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-36 shrink-0 text-right">
                  <span className="text-xs font-medium text-red-400">Perdidos / Desc.</span>
                </div>
                <div className="flex-1 relative h-8 bg-slate-50 rounded-lg overflow-hidden">
                  <div
                    className="h-full rounded-lg"
                    style={{ width: `${Math.max(2, Math.round((perdidos / maxConteo) * 100))}%`, background: "#f87171", opacity: perdidos === 0 ? 0.2 : 1 }}
                  />
                  <div className="absolute inset-0 flex items-center px-3">
                    <span className="text-xs font-semibold text-slate-600">{perdidos > 0 ? perdidos : "—"}</span>
                  </div>
                </div>
                <div className="w-20 shrink-0" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Stage breakdown table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-700">Desglose por etapa</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Etapa</th>
              <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Leads</th>
              <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">% del total</th>
              <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Días prom.</th>
              <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Tasa de paso</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {ETAPAS.map((etapa, i) => {
              const count = conteos[etapa.key] ?? 0;
              const prev = i > 0 ? (conteos[ETAPAS[i - 1].key] ?? 0) : null;
              const tasa = prev !== null && prev > 0 ? `${((count / prev) * 100).toFixed(0)}%` : "—";
              const pct = totalActivos > 0 ? `${((count / totalActivos) * 100).toFixed(1)}%` : "—";
              const dias = avgDias[etapa.key];
              return (
                <tr key={etapa.key} className="hover:bg-slate-50">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: etapa.color }} />
                      <span className="font-medium text-slate-700">{etapa.label}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-right font-semibold text-slate-800">{count}</td>
                  <td className="px-5 py-3 text-right text-slate-500">{pct}</td>
                  <td className="px-5 py-3 text-right text-slate-500">
                    {dias !== null ? `~${dias < 1 ? "<1" : Math.round(dias)}d` : "—"}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {tasa !== "—" ? (
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${parseInt(tasa) >= 50 ? "bg-green-100 text-green-700" : parseInt(tasa) >= 20 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-600"}`}>
                        {tasa}
                      </span>
                    ) : <span className="text-slate-300 text-xs">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-400 pb-6">
        Los tiempos promedio se calculan a partir del historial de cambios de estado registrado.
        Leads sin historial no se incluyen en el promedio.
      </p>
    </div>
  );
}
