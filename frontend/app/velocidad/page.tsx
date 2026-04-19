"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { usePermisos } from "@/components/PermisosProvider";
import { SinAcceso } from "@/components/SinAcceso";

// Pipeline stages in order
const ETAPAS = [
  { estado: "nuevo",            label: "Nuevo",          emoji: "🆕" },
  { estado: "enriquecido",      label: "Enriquecido",    emoji: "🔍" },
  { estado: "segmentado",       label: "Segmentado",     emoji: "🎯" },
  { estado: "mensaje_enviado",  label: "Contactado",     emoji: "📤" },
  { estado: "respondio",        label: "Respondió",      emoji: "💬" },
  { estado: "cita_agendada",    label: "Cita agendada",  emoji: "📅" },
  { estado: "en_negociacion",   label: "Negociación",    emoji: "🤝" },
  { estado: "cerrado_ganado",   label: "Ganado",         emoji: "🏆" },
];

const TRANSICIONES = ETAPAS.slice(0, -1).map((e, i) => ({
  from: e.estado,
  to: ETAPAS[i + 1].estado,
  label: `${e.label} → ${ETAPAS[i + 1].label}`,
}));

type TransicionStats = {
  from: string;
  to: string;
  label: string;
  avgDias: number | null;
  medianaDias: number | null;
  count: number;
  lento: boolean; // > 2x median
};

type AtascoEtapa = {
  etapa: string;
  label: string;
  avgDias: number;
  count: number;
};

type StateHistoryEntry = {
  lead_id: string;
  estado_nuevo: string;
  estado_anterior: string | null;
  created_at: string;
};

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export default function VelocidadPage() {
  const { puede, cargando: cargandoPermisos } = usePermisos();
  const [periodo, setPeriodo] = useState<"30" | "90" | "180">("90");
  const [transiciones, setTransiciones] = useState<TransicionStats[]>([]);
  const [atascos, setAtascos] = useState<AtascoEtapa[]>([]);
  const [totalLeadsAnalizados, setTotalLeadsAnalizados] = useState(0);
  const [velocidadTotal, setVelocidadTotal] = useState<number | null>(null);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    setCargando(true);

    const desde = new Date(Date.now() - parseInt(periodo) * 86_400_000).toISOString();

    // Fetch all state history entries for the period
    const { data: historial } = await supabase
      .from("lead_state_history")
      .select("lead_id, estado_nuevo, estado_anterior, created_at")
      .gte("created_at", desde)
      .order("lead_id")
      .order("created_at")
      .limit(5000);

    if (!historial || historial.length === 0) {
      setTransiciones([]);
      setAtascos([]);
      setTotalLeadsAnalizados(0);
      setCargando(false);
      return;
    }

    // Group by lead_id
    const byLead: Record<string, StateHistoryEntry[]> = {};
    for (const row of historial as StateHistoryEntry[]) {
      if (!byLead[row.lead_id]) byLead[row.lead_id] = [];
      byLead[row.lead_id].push(row);
    }

    setTotalLeadsAnalizados(Object.keys(byLead).length);

    // For each transition pair, collect time deltas
    const tiempos: Record<string, number[]> = {};
    for (const TRANS of TRANSICIONES) {
      tiempos[`${TRANS.from}→${TRANS.to}`] = [];
    }

    // Time spent in each stage (for atascos)
    const tiempoEnEtapa: Record<string, number[]> = {};
    for (const E of ETAPAS.slice(0, -1)) {
      tiempoEnEtapa[E.estado] = [];
    }

    for (const entries of Object.values(byLead)) {
      // Sort by date
      const sorted = entries.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

      // Compute time between consecutive stage transitions
      for (let i = 0; i < sorted.length - 1; i++) {
        const curr = sorted[i];
        const next = sorted[i + 1];
        const key = `${curr.estado_nuevo}→${next.estado_nuevo}`;
        if (tiempos[key] !== undefined) {
          const dias = (new Date(next.created_at).getTime() - new Date(curr.created_at).getTime()) / 86_400_000;
          if (dias >= 0 && dias <= 365) tiempos[key].push(dias);
        }

        // Time spent in the current state (from reaching it to next state change)
        if (tiempoEnEtapa[curr.estado_nuevo] !== undefined) {
          const dias = (new Date(next.created_at).getTime() - new Date(curr.created_at).getTime()) / 86_400_000;
          if (dias >= 0 && dias <= 365) tiempoEnEtapa[curr.estado_nuevo].push(dias);
        }
      }
    }

    // Build transition stats
    const transStats: TransicionStats[] = TRANSICIONES.map(t => {
      const key = `${t.from}→${t.to}`;
      const vals = tiempos[key] ?? [];
      if (vals.length === 0) return { ...t, avgDias: null, medianaDias: null, count: 0, lento: false };
      const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
      const med = median(vals);
      return { ...t, avgDias: Math.round(avg * 10) / 10, medianaDias: Math.round(med * 10) / 10, count: vals.length, lento: avg > med * 2.5 };
    });
    setTransiciones(transStats);

    // Build atascos
    const atascoArr: AtascoEtapa[] = ETAPAS.slice(0, -1)
      .map(e => {
        const vals = tiempoEnEtapa[e.estado] ?? [];
        if (vals.length === 0) return null;
        const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
        return { etapa: e.estado, label: e.label, avgDias: Math.round(avg * 10) / 10, count: vals.length };
      })
      .filter(Boolean) as AtascoEtapa[];
    atascoArr.sort((a, b) => b.avgDias - a.avgDias);
    setAtascos(atascoArr);

    // Total time nuevo → ganado
    const ganados = Object.values(byLead).filter(entries =>
      entries.some(e => e.estado_nuevo === "cerrado_ganado")
    );
    if (ganados.length > 0) {
      const totalDias = ganados.map(entries => {
        const sorted = entries.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        const primero = new Date(sorted[0].created_at).getTime();
        const ultimo = new Date(sorted[sorted.length - 1].created_at).getTime();
        return (ultimo - primero) / 86_400_000;
      });
      setVelocidadTotal(Math.round(totalDias.reduce((s, v) => s + v, 0) / totalDias.length));
    } else {
      setVelocidadTotal(null);
    }

    setCargando(false);
  }, [periodo]);

  useEffect(() => { if (!cargandoPermisos) cargar(); }, [cargar, cargandoPermisos]);

  if (!cargandoPermisos && !puede("ver_metricas")) return <SinAcceso />;

  const bottleneck = atascos[0];
  const maxAtasco = Math.max(1, ...atascos.map(a => a.avgDias));
  const maxTransicion = Math.max(1, ...transiciones.filter(t => t.avgDias !== null).map(t => t.avgDias!));

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Velocidad del pipeline</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Tiempo entre etapas — detecta cuellos de botella y dónde se pierden los leads
          </p>
        </div>
        <div className="flex gap-2">
          {(["30", "90", "180"] as const).map(p => (
            <button
              key={p}
              onClick={() => setPeriodo(p)}
              className={`text-sm px-3 py-2 rounded-lg border font-medium transition-colors ${periodo === p ? "text-white border-transparent" : "bg-white border-slate-200 text-slate-600"}`}
              style={periodo === p ? { background: "#ea650d", borderColor: "#ea650d" } : undefined}
            >
              {p === "30" ? "30 días" : p === "90" ? "3 meses" : "6 meses"}
            </button>
          ))}
        </div>
      </div>

      {cargando ? (
        <div className="flex justify-center py-16">
          <div className="w-7 h-7 rounded-full border-2 animate-spin" style={{ borderColor: "#ea650d", borderTopColor: "transparent" }} />
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Leads analizados</p>
              <p className="text-2xl font-bold text-slate-800 mt-1">{totalLeadsAnalizados}</p>
              <p className="text-xs text-slate-400 mt-0.5">con historial completo</p>
            </div>
            <div className={`rounded-xl border p-4 ${velocidadTotal !== null && velocidadTotal > 60 ? "bg-red-50 border-red-200" : velocidadTotal !== null && velocidadTotal > 30 ? "bg-amber-50 border-amber-200" : "bg-white border-slate-200"}`}>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Ciclo completo</p>
              <p className={`text-2xl font-bold mt-1 ${velocidadTotal !== null && velocidadTotal > 60 ? "text-red-600" : velocidadTotal !== null && velocidadTotal > 30 ? "text-amber-600" : "text-slate-800"}`}>
                {velocidadTotal !== null ? `${velocidadTotal}d` : "—"}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">nuevo → ganado (media)</p>
            </div>
            <div className={`rounded-xl border p-4 ${bottleneck && bottleneck.avgDias > 14 ? "bg-amber-50 border-amber-200" : "bg-white border-slate-200"}`}>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Cuello de botella</p>
              <p className={`text-base font-bold mt-1 truncate ${bottleneck && bottleneck.avgDias > 14 ? "text-amber-700" : "text-slate-800"}`}>
                {bottleneck ? bottleneck.label : "—"}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">{bottleneck ? `${bottleneck.avgDias}d media en esta etapa` : "Sin datos"}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Transición más lenta</p>
              {(() => {
                const lenta = transiciones.filter(t => t.avgDias !== null).sort((a, b) => (b.avgDias ?? 0) - (a.avgDias ?? 0))[0];
                return lenta ? (
                  <>
                    <p className="text-sm font-bold text-slate-800 mt-1 leading-tight">{lenta.label}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{lenta.avgDias}d media</p>
                  </>
                ) : <p className="text-2xl font-bold text-slate-400 mt-1">—</p>;
              })()}
            </div>
          </div>

          {/* Tiempo en cada etapa */}
          {atascos.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <h2 className="text-sm font-semibold text-slate-700">⏱ Tiempo medio en cada etapa</h2>
                <p className="text-xs text-slate-400 mt-0.5">Cuántos días permanece un lead en cada estado antes de avanzar</p>
              </div>
              <div className="p-5 space-y-3">
                {atascos.map(a => {
                  const pct = Math.round((a.avgDias / maxAtasco) * 100);
                  const color = a.avgDias > 21 ? "#ef4444" : a.avgDias > 10 ? "#f59e0b" : "#10b981";
                  const etapaInfo = ETAPAS.find(e => e.estado === a.etapa);
                  return (
                    <div key={a.etapa}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-slate-700">
                          {etapaInfo?.emoji ?? ""} {a.label}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-400">{a.count} cambios</span>
                          <span className="text-sm font-bold" style={{ color }}>{a.avgDias}d</span>
                        </div>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Transición detalle */}
          {transiciones.filter(t => t.count > 0).length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <h2 className="text-sm font-semibold text-slate-700">🔄 Tiempo entre etapas consecutivas</h2>
                <p className="text-xs text-slate-400 mt-0.5">Media y mediana de días para avanzar de una etapa a la siguiente</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
                      <th className="px-5 py-2.5 text-left font-medium">Transición</th>
                      <th className="px-4 py-2.5 text-right font-medium">Registros</th>
                      <th className="px-4 py-2.5 text-right font-medium">Media</th>
                      <th className="px-4 py-2.5 text-right font-medium">Mediana</th>
                      <th className="px-4 py-2.5 text-left font-medium">Visual</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {transiciones.filter(t => t.count > 0).map(t => {
                      const color = t.avgDias! > 21 ? "#ef4444" : t.avgDias! > 10 ? "#f59e0b" : "#10b981";
                      const pct = Math.round((t.avgDias! / maxTransicion) * 100);
                      return (
                        <tr key={t.label} className={`hover:bg-slate-50 transition-colors ${t.lento ? "bg-red-50" : ""}`}>
                          <td className="px-5 py-3 text-slate-700">
                            {t.label}
                            {t.lento && <span className="ml-2 text-[10px] font-semibold bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">LENTO</span>}
                          </td>
                          <td className="px-4 py-3 text-right text-slate-500">{t.count}</td>
                          <td className="px-4 py-3 text-right font-semibold" style={{ color }}>{t.avgDias}d</td>
                          <td className="px-4 py-3 text-right text-slate-500">{t.medianaDias}d</td>
                          <td className="px-4 py-3 min-w-32">
                            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden w-32">
                              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Recomendaciones */}
          {bottleneck && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-5 py-4">
              <p className="text-sm font-semibold text-blue-800 mb-2">💡 Recomendaciones basadas en los datos</p>
              <ul className="space-y-1.5">
                {bottleneck.avgDias > 14 && (
                  <li className="text-xs text-blue-700 flex items-start gap-2">
                    <span>⏰</span>
                    <span><strong>Cuello de botella en "{bottleneck.label}":</strong> Los leads pasan una media de {bottleneck.avgDias} días en esta etapa. Considera implementar un recordatorio automático para revisar leads estancados aquí después de {Math.round(bottleneck.avgDias / 2)} días.</span>
                  </li>
                )}
                {velocidadTotal !== null && velocidadTotal > 45 && (
                  <li className="text-xs text-blue-700 flex items-start gap-2">
                    <span>📉</span>
                    <span><strong>Ciclo de venta largo ({velocidadTotal} días):</strong> El promedio de industria para seguros es 15-30 días. Revisa el proceso de seguimiento entre cita agendada y negociación.</span>
                  </li>
                )}
                {transiciones.filter(t => t.lento).map(t => (
                  <li key={t.label} className="text-xs text-blue-700 flex items-start gap-2">
                    <span>🔴</span>
                    <span><strong>Transición lenta "{t.label}":</strong> Media de {t.avgDias}d vs mediana de {t.medianaDias}d. Hay outliers alargando el promedio — investiga leads bloqueados específicamente en este paso.</span>
                  </li>
                ))}
                {atascos.length > 0 && atascos[0].avgDias <= 7 && (
                  <li className="text-xs text-blue-700 flex items-start gap-2">
                    <span>✅</span>
                    <span><strong>Pipeline ágil:</strong> La transición más lenta es de {atascos[0].avgDias} días. Tu equipo está moviéndose bien por el funnel.</span>
                  </li>
                )}
              </ul>
            </div>
          )}

          {atascos.length === 0 && (
            <div className="bg-white rounded-xl border border-slate-200 py-14 text-center">
              <p className="text-3xl mb-2">📊</p>
              <p className="text-sm font-semibold text-slate-700">Sin suficientes datos para este período</p>
              <p className="text-xs text-slate-400 mt-1">Necesitas historial de cambios de estado para calcular velocidades. Amplía el período o espera a acumular más datos.</p>
              <Link href="/pipeline" className="inline-block mt-3 text-sm font-medium hover:underline" style={{ color: "#ea650d" }}>
                Ver pipeline actual →
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}
