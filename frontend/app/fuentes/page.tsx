"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { usePermisos } from "@/components/PermisosProvider";
import { SinAcceso } from "@/components/SinAcceso";

// ─── Types ─────────────────────────────────────────────────────────────────────

type FuenteStat = {
  fuente: string;
  total: number;
  activos: number;
  ganados: number;
  perdidos: number;
  tasaConversion: number;
  tasaPerdida: number;
  ingresos: number;
  valorPorLead: number;
};

type TendenciaMes = {
  mes: string;
  label: string;
  counts: Record<string, number>;
};

// ─── Constants ─────────────────────────────────────────────────────────────────

const FUENTE_CONFIG: Record<string, { label: string; emoji: string; color: string; bg: string }> = {
  scraping:        { label: "Prospección IA",    emoji: "🤖", color: "#ea650d", bg: "#fff5f0" },
  linkedin:        { label: "LinkedIn",          emoji: "💼", color: "#0077b5", bg: "#e8f4fb" },
  inbound:         { label: "Inbound",           emoji: "📥", color: "#10b981", bg: "#ecfdf5" },
  base_existente:  { label: "Base existente",    emoji: "📚", color: "#8b5cf6", bg: "#f5f3ff" },
  referido:        { label: "Referido",          emoji: "🤝", color: "#f59e0b", bg: "#fffbeb" },
  manual:          { label: "Manual",            emoji: "✍️",  color: "#6366f1", bg: "#eef2ff" },
  formulario_web:  { label: "Formulario web",    emoji: "📋", color: "#14b8a6", bg: "#f0fdfa" },
  sin_fuente:      { label: "Sin fuente",        emoji: "❓", color: "#9ca3af", bg: "#f9fafb" },
};

const MESES_LABELS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function fmt(n: number): string {
  return n.toLocaleString("es-ES", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " €";
}

function pct(n: number): string {
  return n.toFixed(1) + "%";
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

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function FuentesPage() {
  const { puede, cargando: cargandoPermisos } = usePermisos();
  const [stats, setStats] = useState<FuenteStat[]>([]);
  const [tendencia, setTendencia] = useState<TendenciaMes[]>([]);
  const [loading, setLoading] = useState(true);
  const [ordenPor, setOrdenPor] = useState<"total" | "conversion" | "ingresos">("total");
  const [periodo, setPeriodo] = useState<"3m" | "6m" | "12m" | "todo">("12m");

  const cargar = useCallback(async () => {
    setLoading(true);

    const ahora = new Date();
    let desde: Date | null = null;
    if (periodo === "3m") { desde = new Date(ahora); desde.setMonth(ahora.getMonth() - 3); }
    else if (periodo === "6m") { desde = new Date(ahora); desde.setMonth(ahora.getMonth() - 6); }
    else if (periodo === "12m") { desde = new Date(ahora); desde.setFullYear(ahora.getFullYear() - 1); }

    let q = supabase.from("leads").select("id, fuente, estado, created_at");
    if (desde) q = q.gte("created_at", desde.toISOString());
    const { data: leads } = await q.limit(5000);

    // Clientes para ingresos
    let qC = supabase.from("clientes").select("id, fuente_lead_id, valor_contrato, leads(fuente)");
    if (desde) qC = qC.gte("created_at", desde.toISOString());
    const { data: clientes } = await qC.limit(2000);

    if (!leads) { setLoading(false); return; }

    // Aggregate by fuente
    const map = new Map<string, { total: number; activos: number; ganados: number; perdidos: number; ingresos: number }>();

    for (const l of leads) {
      const f = l.fuente ?? "sin_fuente";
      if (!map.has(f)) map.set(f, { total: 0, activos: 0, ganados: 0, perdidos: 0, ingresos: 0 });
      const e = map.get(f)!;
      e.total++;
      if (l.estado === "cerrado_ganado") e.ganados++;
      else if (l.estado === "cerrado_perdido" || l.estado === "descartado") e.perdidos++;
      else e.activos++;
    }

    // Add revenue from clientes
    for (const c of clientes ?? []) {
      const fuente = (c.leads as unknown as { fuente: string | null } | null)?.fuente ?? "sin_fuente";
      if (map.has(fuente)) {
        map.get(fuente)!.ingresos += c.valor_contrato ?? 0;
      }
    }

    const fuenteStats: FuenteStat[] = [...map.entries()].map(([fuente, data]) => ({
      fuente,
      total: data.total,
      activos: data.activos,
      ganados: data.ganados,
      perdidos: data.perdidos,
      tasaConversion: data.total > 0 ? (data.ganados / data.total) * 100 : 0,
      tasaPerdida: (data.ganados + data.perdidos) > 0 ? (data.perdidos / (data.ganados + data.perdidos)) * 100 : 0,
      ingresos: data.ingresos,
      valorPorLead: data.ganados > 0 ? data.ingresos / data.ganados : 0,
    }));

    // Sort
    fuenteStats.sort((a, b) => {
      if (ordenPor === "total") return b.total - a.total;
      if (ordenPor === "conversion") return b.tasaConversion - a.tasaConversion;
      return b.ingresos - a.ingresos;
    });

    setStats(fuenteStats);

    // Tendencia últimos 6 meses
    const meses: TendenciaMes[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(ahora);
      d.setMonth(ahora.getMonth() - i);
      const mesKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      meses.push({
        mes: mesKey,
        label: MESES_LABELS[d.getMonth()],
        counts: {},
      });
    }

    for (const l of leads) {
      const mesKey = l.created_at.slice(0, 7);
      const mes = meses.find(m => m.mes === mesKey);
      if (mes) {
        const f = l.fuente ?? "sin_fuente";
        mes.counts[f] = (mes.counts[f] ?? 0) + 1;
      }
    }

    setTendencia(meses);
    setLoading(false);
  }, [periodo, ordenPor]);

  useEffect(() => {
    if (!cargandoPermisos && puede("ver_metricas")) cargar();
  }, [cargar, cargandoPermisos, puede]);

  if (!cargandoPermisos && !puede("ver_metricas")) return <SinAcceso />;

  const totalLeads = stats.reduce((s, f) => s + f.total, 0);
  const totalGanados = stats.reduce((s, f) => s + f.ganados, 0);
  const totalIngresos = stats.reduce((s, f) => s + f.ingresos, 0);
  const mejorFuente = stats.reduce((best, f) => f.tasaConversion > (best?.tasaConversion ?? 0) ? f : best, stats[0]);
  const maxTotal = Math.max(...stats.map(s => s.total), 1);

  // Top fuentes for trend chart
  const topFuentesTrend = stats.slice(0, 5).map(s => s.fuente);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Análisis de fuentes</h1>
          <p className="text-sm text-slate-500 mt-0.5">¿De dónde vienen los mejores leads?</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={periodo}
            onChange={e => setPeriodo(e.target.value as typeof periodo)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:border-orange-300"
          >
            <option value="3m">Últimos 3 meses</option>
            <option value="6m">Últimos 6 meses</option>
            <option value="12m">Último año</option>
            <option value="todo">Todo el tiempo</option>
          </select>
        </div>
      </div>

      {/* KPIs */}
      {!loading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label="Leads totales" valor={totalLeads.toLocaleString("es-ES")} sub={`${stats.length} fuentes`} />
          <KpiCard label="Leads ganados" valor={totalGanados.toLocaleString("es-ES")} sub={`${totalLeads > 0 ? pct(totalGanados / totalLeads * 100) : "0%"} tasa global`} color="text-green-700" />
          <KpiCard label="Ingresos totales" valor={fmt(totalIngresos)} sub="de leads con fuente" color="text-orange-700" />
          <div className="bg-white rounded-xl border border-slate-200 px-5 py-4">
            <p className="text-xs text-slate-500 mb-1">Mejor fuente (conversión)</p>
            {mejorFuente ? (
              <>
                <p className="text-lg font-bold text-slate-900">
                  {FUENTE_CONFIG[mejorFuente.fuente]?.emoji ?? "📌"} {FUENTE_CONFIG[mejorFuente.fuente]?.label ?? mejorFuente.fuente}
                </p>
                <p className="text-xs text-slate-400">{pct(mejorFuente.tasaConversion)} conversión</p>
              </>
            ) : <p className="text-sm text-slate-400">—</p>}
          </div>
        </div>
      )}

      {/* Sort control */}
      {!loading && stats.length > 0 && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-500">Ordenar por:</span>
          {(["total", "conversion", "ingresos"] as const).map(o => (
            <button
              key={o}
              onClick={() => setOrdenPor(o)}
              className={`px-3 py-1 rounded-full font-medium transition-colors ${ordenPor === o ? "bg-slate-900 text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-50"}`}
            >
              {{ total: "Volumen", conversion: "Conversión", ingresos: "Ingresos" }[o]}
            </button>
          ))}
        </div>
      )}

      {/* Per-source cards */}
      {loading ? (
        <div className="py-24 text-center text-sm text-slate-400">Analizando fuentes...</div>
      ) : stats.length === 0 ? (
        <div className="py-24 text-center text-sm text-slate-400">Sin datos de fuentes en el período seleccionado.</div>
      ) : (
        <div className="space-y-3">
          {stats.map(s => {
            const cfg = FUENTE_CONFIG[s.fuente] ?? { label: s.fuente, emoji: "📌", color: "#6b7280", bg: "#f9fafb" };
            const barPct = Math.round((s.total / maxTotal) * 100);
            const convPct = Math.round(s.tasaConversion);
            return (
              <div key={s.fuente} className="bg-white rounded-xl border border-slate-200 px-5 py-4">
                <div className="flex items-start gap-4">
                  {/* Emoji + label */}
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                    style={{ background: cfg.bg }}
                  >
                    {cfg.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-semibold text-slate-800">{cfg.label}</p>
                      <span className="text-xs text-slate-400">{pct(s.total / totalLeads * 100)} del total</span>
                    </div>
                    {/* Volume bar */}
                    <div className="flex items-center gap-2 mb-3">
                      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${barPct}%`, background: cfg.color }} />
                      </div>
                      <span className="text-xs font-semibold text-slate-700 tabular-nums w-8 text-right">{s.total}</span>
                    </div>
                    {/* Stats row */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div>
                        <p className="text-xs text-slate-400">Activos</p>
                        <p className="text-sm font-semibold text-slate-700">{s.activos}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400">Ganados</p>
                        <p className="text-sm font-semibold text-green-700">{s.ganados}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400">Conversión</p>
                        <p className={`text-sm font-semibold ${convPct >= 10 ? "text-green-700" : convPct >= 5 ? "text-amber-700" : "text-slate-700"}`}>
                          {pct(s.tasaConversion)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400">Ingresos</p>
                        <p className="text-sm font-semibold text-orange-700">{s.ingresos > 0 ? fmt(s.ingresos) : "—"}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Trend chart (monthly) */}
      {!loading && tendencia.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 px-5 py-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Tendencia mensual de nuevos leads</h2>
          <div className="space-y-2">
            {topFuentesTrend.map(fuente => {
              const cfg = FUENTE_CONFIG[fuente] ?? { label: fuente, emoji: "📌", color: "#6b7280", bg: "#f9fafb" };
              const maxVal = Math.max(...tendencia.map(m => m.counts[fuente] ?? 0), 1);
              return (
                <div key={fuente} className="flex items-center gap-3">
                  <span className="text-xs text-slate-500 w-28 flex-shrink-0 truncate">{cfg.emoji} {cfg.label}</span>
                  <div className="flex-1 flex items-end gap-1 h-10">
                    {tendencia.map(mes => {
                      const val = mes.counts[fuente] ?? 0;
                      const h = Math.round((val / maxVal) * 100);
                      return (
                        <div key={mes.mes} className="flex-1 flex flex-col items-center gap-0.5" title={`${mes.label}: ${val} leads`}>
                          <div className="w-full rounded-t-sm" style={{ height: `${Math.max(h, val > 0 ? 8 : 0)}%`, background: cfg.color, opacity: 0.85 }} />
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex gap-1.5 w-32 flex-shrink-0">
                    {tendencia.map(mes => (
                      <span key={mes.mes} className="flex-1 text-center text-[9px] text-slate-400">{mes.label}</span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Strategic recommendations */}
      {!loading && stats.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 px-5 py-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Recomendaciones estratégicas</h2>
          <div className="space-y-3">
            {mejorFuente && mejorFuente.total >= 3 && (
              <div className="flex items-start gap-3 p-3 rounded-lg bg-green-50 border border-green-200">
                <span className="text-lg">🏆</span>
                <div>
                  <p className="text-sm font-semibold text-green-800">
                    Potencia {FUENTE_CONFIG[mejorFuente.fuente]?.label ?? mejorFuente.fuente} — mayor tasa de conversión
                  </p>
                  <p className="text-xs text-green-700 mt-0.5">
                    Con {pct(mejorFuente.tasaConversion)} de conversión es tu canal más eficiente. Considera dedicarle más tiempo y recursos.
                  </p>
                </div>
              </div>
            )}
            {stats.find(s => s.fuente === "referido") && (stats.find(s => s.fuente === "referido")?.total ?? 0) < 10 && (
              <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
                <span className="text-lg">🤝</span>
                <div>
                  <p className="text-sm font-semibold text-amber-800">Activa el canal de referidos</p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    Los referidos suelen tener la mayor tasa de conversión y menor coste. Pide referencias activamente a clientes satisfechos.
                  </p>
                </div>
              </div>
            )}
            {stats.find(s => s.fuente === "formulario_web") && (stats.find(s => s.fuente === "formulario_web")?.total ?? 0) < 20 && (
              <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-50 border border-blue-200">
                <span className="text-lg">📋</span>
                <div>
                  <p className="text-sm font-semibold text-blue-800">El formulario web tiene bajo volumen</p>
                  <p className="text-xs text-blue-700 mt-0.5">
                    Comparte más el formulario en redes sociales y eventos para captar leads inbound de alta intención.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
