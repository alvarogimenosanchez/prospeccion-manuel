"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { usePermisos } from "@/components/PermisosProvider";
import { SinAcceso } from "@/components/SinAcceso";

// ─── Types ─────────────────────────────────────────────────────────────────────

type PeriodoKPIs = {
  leads_nuevos: number;
  leads_contactados: number;
  leads_respondieron: number;
  citas_agendadas: number;
  cerrados_ganados: number;
  cerrados_perdidos: number;
  tasa_conversion: number;
  tasa_contacto: number;
  pipeline_total: number;
};

type Comparativa = {
  label: string;
  actual: number;
  anterior: number;
  diferencia: number;
  diferencia_pct: number;
  formato: "numero" | "pct" | "euro";
  inversion: boolean; // true = menor es mejor (como cerrados_perdidos)
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number, formato: "numero" | "pct" | "euro"): string {
  if (formato === "euro") return n.toLocaleString("es-ES", { minimumFractionDigits: 0 }) + " €";
  if (formato === "pct") return n.toFixed(1) + "%";
  return n.toLocaleString("es-ES");
}

function tendenciaColor(dif: number, inversion: boolean): string {
  const positivo = inversion ? dif < 0 : dif > 0;
  const negativo = inversion ? dif > 0 : dif < 0;
  if (positivo) return "text-green-700";
  if (negativo) return "text-red-600";
  return "text-slate-500";
}

function tendenciaIcon(dif: number): string {
  if (dif > 0) return "↑";
  if (dif < 0) return "↓";
  return "→";
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function TendenciasPage() {
  const { puede, cargando: cargandoPermisos } = usePermisos();
  const [actual, setActual] = useState<PeriodoKPIs | null>(null);
  const [anterior, setAnterior] = useState<PeriodoKPIs | null>(null);
  const [loading, setLoading] = useState(true);
  const [modoComparacion, setModoComparacion] = useState<"mes" | "trimestre" | "año">("mes");
  const [semanas, setSemanas] = useState<{ sem: string; label: string; leads: number; cierres: number; citas: number }[]>([]);

  const cargar = useCallback(async () => {
    setLoading(true);
    const now = new Date();

    let periodoActual: { desde: Date; hasta: Date };
    let periodoAnterior: { desde: Date; hasta: Date };

    if (modoComparacion === "mes") {
      const ini = new Date(now.getFullYear(), now.getMonth(), 1);
      const iniAnterior = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const finAnterior = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
      periodoActual = { desde: ini, hasta: now };
      periodoAnterior = { desde: iniAnterior, hasta: finAnterior };
    } else if (modoComparacion === "trimestre") {
      const iniQ = new Date(now); iniQ.setMonth(Math.floor(now.getMonth() / 3) * 3, 1); iniQ.setHours(0,0,0,0);
      const iniQAnt = new Date(iniQ); iniQAnt.setMonth(iniQ.getMonth() - 3);
      const finQAnt = new Date(iniQ); finQAnt.setDate(0); finQAnt.setHours(23,59,59,999);
      periodoActual = { desde: iniQ, hasta: now };
      periodoAnterior = { desde: iniQAnt, hasta: finQAnt };
    } else {
      const iniYear = new Date(now.getFullYear(), 0, 1);
      const iniYearAnt = new Date(now.getFullYear() - 1, 0, 1);
      const finYearAnt = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59);
      periodoActual = { desde: iniYear, hasta: now };
      periodoAnterior = { desde: iniYearAnt, hasta: finYearAnt };
    }

    async function fetchKPIs(desde: Date, hasta: Date): Promise<PeriodoKPIs> {
      const [
        { data: leads },
        { data: citas },
        { count: pipeline },
      ] = await Promise.all([
        supabase.from("leads")
          .select("id, estado, created_at")
          .gte("created_at", desde.toISOString())
          .lte("created_at", hasta.toISOString())
          .limit(5000),
        supabase.from("appointments")
          .select("id, estado, created_at")
          .gte("created_at", desde.toISOString())
          .lte("created_at", hasta.toISOString())
          .limit(2000),
        supabase.from("leads")
          .select("id", { count: "exact", head: true })
          .not("estado", "in", "(cerrado_ganado,cerrado_perdido,descartado)"),
      ]);

      const l = leads ?? [];
      const c = citas ?? [];
      const nuevos = l.length;
      const contactados = l.filter(x => ["mensaje_enviado", "respondio", "cita_agendada", "en_negociacion", "cerrado_ganado", "cerrado_perdido"].includes(x.estado)).length;
      const respondieron = l.filter(x => ["respondio", "cita_agendada", "en_negociacion", "cerrado_ganado", "cerrado_perdido"].includes(x.estado)).length;
      const ganados = l.filter(x => x.estado === "cerrado_ganado").length;
      const perdidos = l.filter(x => x.estado === "cerrado_perdido").length;
      const agendadas = c.length;

      return {
        leads_nuevos: nuevos,
        leads_contactados: contactados,
        leads_respondieron: respondieron,
        citas_agendadas: agendadas,
        cerrados_ganados: ganados,
        cerrados_perdidos: perdidos,
        tasa_conversion: nuevos > 0 ? (ganados / nuevos) * 100 : 0,
        tasa_contacto: nuevos > 0 ? (contactados / nuevos) * 100 : 0,
        pipeline_total: pipeline ?? 0,
      };
    }

    const [kpiActual, kpiAnterior] = await Promise.all([
      fetchKPIs(periodoActual.desde, periodoActual.hasta),
      fetchKPIs(periodoAnterior.desde, periodoAnterior.hasta),
    ]);

    setActual(kpiActual);
    setAnterior(kpiAnterior);

    // Weekly trend (last 8 weeks)
    const semanasData: typeof semanas = [];
    for (let i = 7; i >= 0; i--) {
      const iniSem = new Date(now);
      iniSem.setDate(now.getDate() - i * 7 - now.getDay());
      iniSem.setHours(0,0,0,0);
      const finSem = new Date(iniSem);
      finSem.setDate(iniSem.getDate() + 6);
      finSem.setHours(23,59,59,999);

      const [{ data: leadsW }, { data: cierresW }, { data: citasW }] = await Promise.all([
        supabase.from("leads").select("id").gte("created_at", iniSem.toISOString()).lte("created_at", finSem.toISOString()),
        supabase.from("leads").select("id").eq("estado", "cerrado_ganado").gte("updated_at", iniSem.toISOString()).lte("updated_at", finSem.toISOString()),
        supabase.from("appointments").select("id").gte("created_at", iniSem.toISOString()).lte("created_at", finSem.toISOString()),
      ]);

      const semLabel = `${iniSem.getDate()}/${iniSem.getMonth() + 1}`;
      semanasData.push({
        sem: iniSem.toISOString(),
        label: semLabel,
        leads: leadsW?.length ?? 0,
        cierres: cierresW?.length ?? 0,
        citas: citasW?.length ?? 0,
      });
    }

    setSemanas(semanasData);
    setLoading(false);
  }, [modoComparacion]);

  useEffect(() => {
    if (!cargandoPermisos && puede("ver_metricas")) cargar();
  }, [cargar, cargandoPermisos, puede]);

  if (!cargandoPermisos && !puede("ver_metricas")) return <SinAcceso />;

  const COMPARATIVAS: Comparativa[] = actual && anterior ? [
    { label: "Leads nuevos",      actual: actual.leads_nuevos,      anterior: anterior.leads_nuevos,      diferencia: actual.leads_nuevos - anterior.leads_nuevos,      diferencia_pct: anterior.leads_nuevos > 0 ? (actual.leads_nuevos - anterior.leads_nuevos) / anterior.leads_nuevos * 100 : 0,      formato: "numero", inversion: false },
    { label: "Leads contactados", actual: actual.leads_contactados,  anterior: anterior.leads_contactados,  diferencia: actual.leads_contactados - anterior.leads_contactados,  diferencia_pct: anterior.leads_contactados > 0 ? (actual.leads_contactados - anterior.leads_contactados) / anterior.leads_contactados * 100 : 0,  formato: "numero", inversion: false },
    { label: "Respondieron",      actual: actual.leads_respondieron, anterior: anterior.leads_respondieron, diferencia: actual.leads_respondieron - anterior.leads_respondieron, diferencia_pct: anterior.leads_respondieron > 0 ? (actual.leads_respondieron - anterior.leads_respondieron) / anterior.leads_respondieron * 100 : 0, formato: "numero", inversion: false },
    { label: "Citas agendadas",   actual: actual.citas_agendadas,    anterior: anterior.citas_agendadas,    diferencia: actual.citas_agendadas - anterior.citas_agendadas,    diferencia_pct: anterior.citas_agendadas > 0 ? (actual.citas_agendadas - anterior.citas_agendadas) / anterior.citas_agendadas * 100 : 0,    formato: "numero", inversion: false },
    { label: "Cierres ganados",   actual: actual.cerrados_ganados,   anterior: anterior.cerrados_ganados,   diferencia: actual.cerrados_ganados - anterior.cerrados_ganados,   diferencia_pct: anterior.cerrados_ganados > 0 ? (actual.cerrados_ganados - anterior.cerrados_ganados) / anterior.cerrados_ganados * 100 : 0,   formato: "numero", inversion: false },
    { label: "Cierres perdidos",  actual: actual.cerrados_perdidos,  anterior: anterior.cerrados_perdidos,  diferencia: actual.cerrados_perdidos - anterior.cerrados_perdidos,  diferencia_pct: anterior.cerrados_perdidos > 0 ? (actual.cerrados_perdidos - anterior.cerrados_perdidos) / anterior.cerrados_perdidos * 100 : 0,  formato: "numero", inversion: true },
    { label: "Tasa de contacto",  actual: actual.tasa_contacto,      anterior: anterior.tasa_contacto,      diferencia: actual.tasa_contacto - anterior.tasa_contacto,      diferencia_pct: actual.tasa_contacto - anterior.tasa_contacto,      formato: "pct",    inversion: false },
    { label: "Tasa de conversión",actual: actual.tasa_conversion,    anterior: anterior.tasa_conversion,    diferencia: actual.tasa_conversion - anterior.tasa_conversion,    diferencia_pct: actual.tasa_conversion - anterior.tasa_conversion,    formato: "pct",    inversion: false },
  ] : [];

  const labelActual = modoComparacion === "mes" ? "Este mes" : modoComparacion === "trimestre" ? "Este trimestre" : "Este año";
  const labelAnterior = modoComparacion === "mes" ? "Mes anterior" : modoComparacion === "trimestre" ? "Trimestre anterior" : "Año anterior";

  const maxLeads = Math.max(...semanas.map(s => s.leads), 1);
  const maxCierres = Math.max(...semanas.map(s => s.cierres), 1);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Tendencias</h1>
          <p className="text-sm text-slate-500 mt-0.5">Comparativa de rendimiento periodo a periodo</p>
        </div>
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
          {(["mes", "trimestre", "año"] as const).map(m => (
            <button
              key={m}
              onClick={() => setModoComparacion(m)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md capitalize transition-colors ${modoComparacion === m ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
              {m === "mes" ? "Mensual" : m === "trimestre" ? "Trimestral" : "Anual"}
            </button>
          ))}
        </div>
      </div>

      {/* Period labels */}
      {!loading && actual && (
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-orange-500" />
            <span className="text-slate-700 font-medium">{labelActual}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-slate-300" />
            <span className="text-slate-500">{labelAnterior}</span>
          </div>
        </div>
      )}

      {/* Comparison grid */}
      {loading ? (
        <div className="py-24 text-center text-sm text-slate-400">Calculando tendencias...</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {COMPARATIVAS.map(c => {
              const color = tendenciaColor(c.diferencia, c.inversion);
              const icon = tendenciaIcon(c.diferencia);
              const pctLabel = c.formato === "pct"
                ? `${c.diferencia >= 0 ? "+" : ""}${c.diferencia.toFixed(1)} pp`
                : `${c.diferencia_pct >= 0 ? "+" : ""}${c.diferencia_pct.toFixed(0)}%`;
              return (
                <div key={c.label} className="bg-white rounded-xl border border-slate-200 px-4 py-4">
                  <p className="text-xs text-slate-500 mb-2">{c.label}</p>
                  <p className="text-2xl font-bold text-slate-900 mb-1">{fmt(c.actual, c.formato)}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">{fmt(c.anterior, c.formato)} antes</span>
                    <span className={`text-xs font-semibold ${color}`}>
                      {icon} {pctLabel}
                    </span>
                  </div>
                  {/* Mini bar comparison */}
                  <div className="mt-2 flex gap-1 h-2">
                    <div className="flex-1 bg-orange-500 rounded-full opacity-90" style={{
                      width: `${Math.max(c.anterior, c.actual) > 0 ? (c.actual / Math.max(c.anterior, c.actual)) * 100 : 0}%`,
                      maxWidth: "100%",
                    }} />
                  </div>
                  <div className="mt-0.5 flex gap-1 h-2">
                    <div className="flex-1 bg-slate-200 rounded-full" style={{
                      width: `${Math.max(c.anterior, c.actual) > 0 ? (c.anterior / Math.max(c.anterior, c.actual)) * 100 : 0}%`,
                      maxWidth: "100%",
                    }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Weekly sparklines */}
          {semanas.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 px-5 py-5">
              <h2 className="text-sm font-semibold text-slate-700 mb-4">Evolución semanal (últimas 8 semanas)</h2>
              <div className="space-y-4">
                {[
                  { label: "Leads nuevos", data: semanas.map(s => s.leads), max: maxLeads, color: "#ea650d" },
                  { label: "Cierres ganados", data: semanas.map(s => s.cierres), max: maxCierres, color: "#10b981" },
                ].map(serie => (
                  <div key={serie.label}>
                    <p className="text-xs text-slate-500 mb-2">{serie.label}</p>
                    <div className="flex items-end gap-2 h-16">
                      {serie.data.map((val, i) => {
                        const h = serie.max > 0 ? Math.round((val / serie.max) * 100) : 0;
                        return (
                          <div key={i} className="flex-1 flex flex-col items-center gap-1">
                            <div
                              className="w-full rounded-t-sm transition-all"
                              style={{ height: `${Math.max(h, val > 0 ? 8 : 2)}%`, background: serie.color, minHeight: 2 }}
                              title={`Sem ${semanas[i].label}: ${val}`}
                            />
                            <span className="text-[9px] text-slate-400">{semanas[i].label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Insight cards */}
          {actual && anterior && (
            <div className="bg-white rounded-xl border border-slate-200 px-5 py-5">
              <h2 className="text-sm font-semibold text-slate-700 mb-3">Análisis automático</h2>
              <div className="space-y-3">
                {actual.cerrados_ganados > anterior.cerrados_ganados && (
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-green-50 border border-green-200">
                    <span className="text-lg">📈</span>
                    <div>
                      <p className="text-sm font-semibold text-green-800">Los cierres están creciendo</p>
                      <p className="text-xs text-green-700 mt-0.5">
                        {actual.cerrados_ganados} cierres vs {anterior.cerrados_ganados} en el período anterior (+{actual.cerrados_ganados - anterior.cerrados_ganados}).
                      </p>
                    </div>
                  </div>
                )}
                {actual.cerrados_ganados < anterior.cerrados_ganados && (
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-red-50 border border-red-200">
                    <span className="text-lg">⚠️</span>
                    <div>
                      <p className="text-sm font-semibold text-red-800">Los cierres han caído</p>
                      <p className="text-xs text-red-700 mt-0.5">
                        {actual.cerrados_ganados} cierres vs {anterior.cerrados_ganados} en el período anterior. Revisa el pipeline y las negociaciones activas.
                      </p>
                    </div>
                  </div>
                )}
                {actual.tasa_contacto < anterior.tasa_contacto - 5 && (
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
                    <span className="text-lg">📉</span>
                    <div>
                      <p className="text-sm font-semibold text-amber-800">La tasa de contacto ha bajado</p>
                      <p className="text-xs text-amber-700 mt-0.5">
                        De {anterior.tasa_contacto.toFixed(1)}% a {actual.tasa_contacto.toFixed(1)}%. Más leads sin contactar. Revisa el workflow de mensajes IA.
                      </p>
                    </div>
                  </div>
                )}
                {actual.leads_nuevos < anterior.leads_nuevos * 0.8 && (
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
                    <span className="text-lg">🔍</span>
                    <div>
                      <p className="text-sm font-semibold text-amber-800">Bajo volumen de captación</p>
                      <p className="text-xs text-amber-700 mt-0.5">
                        Solo {actual.leads_nuevos} leads nuevos vs {anterior.leads_nuevos} en el período anterior. Considera aumentar la prospección.
                      </p>
                    </div>
                  </div>
                )}
                {actual.cerrados_ganados === anterior.cerrados_ganados && actual.leads_nuevos >= anterior.leads_nuevos && (
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-50 border border-blue-200">
                    <span className="text-lg">💡</span>
                    <div>
                      <p className="text-sm font-semibold text-blue-800">Rendimiento estable</p>
                      <p className="text-xs text-blue-700 mt-0.5">
                        Los KPIs se mantienen. Mantén el ritmo y focaliza en mejorar la tasa de conversión.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
