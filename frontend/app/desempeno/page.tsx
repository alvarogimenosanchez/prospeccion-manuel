"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Comercial = {
  id: string;
  nombre: string;
  apellidos: string | null;
};

type StatsComercial = {
  comercial: Comercial;
  totalLeads: number;
  leadsCalientes: number;
  leadsContactados: number;
  respondieron: number;
  citasAgendadas: number;
  cerradosGanados: number;
  tasaRespuesta: number;
  tasaConversion: number;
  leadsHoy: number;
  interaccionesTotal: number;
};

export default function DesempenoPage() {
  const [stats, setStats] = useState<StatsComercial[]>([]);
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState<"todo" | "mes" | "semana">("todo");

  useEffect(() => {
    cargarDatos();
  }, [periodo]);

  async function cargarDatos() {
    setLoading(true);

    // Cargar comerciales
    const { data: comerciales } = await supabase
      .from("comerciales")
      .select("id, nombre, apellidos")
      .eq("activo", true);

    if (!comerciales || comerciales.length === 0) {
      setStats([]);
      setLoading(false);
      return;
    }

    const ahora = new Date();
    let fechaDesde: string | null = null;
    if (periodo === "semana") {
      fechaDesde = new Date(ahora.getTime() - 7 * 86_400_000).toISOString();
    } else if (periodo === "mes") {
      fechaDesde = new Date(ahora.getFullYear(), ahora.getMonth(), 1).toISOString();
    }

    const hoyInicio = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()).toISOString();

    const resultado: StatsComercial[] = [];

    for (const comercial of comerciales) {
      let query = supabase.from("leads").select("*", { count: "exact", head: true }).eq("comercial_asignado", comercial.id);
      if (fechaDesde) query = query.gte("fecha_captacion", fechaDesde);
      const { count: totalLeads } = await query;

      let qCalientes = supabase.from("leads").select("*", { count: "exact", head: true }).eq("comercial_asignado", comercial.id).eq("temperatura", "caliente");
      if (fechaDesde) qCalientes = qCalientes.gte("fecha_captacion", fechaDesde);
      const { count: leadsCalientes } = await qCalientes;

      let qContactados = supabase.from("leads").select("*", { count: "exact", head: true }).eq("comercial_asignado", comercial.id).in("estado", ["mensaje_enviado", "respondio", "cita_agendada", "en_negociacion", "cerrado_ganado", "cerrado_perdido"]);
      if (fechaDesde) qContactados = qContactados.gte("fecha_captacion", fechaDesde);
      const { count: leadsContactados } = await qContactados;

      let qRespondieron = supabase.from("leads").select("*", { count: "exact", head: true }).eq("comercial_asignado", comercial.id).in("estado", ["respondio", "cita_agendada", "en_negociacion", "cerrado_ganado"]);
      if (fechaDesde) qRespondieron = qRespondieron.gte("fecha_captacion", fechaDesde);
      const { count: respondieron } = await qRespondieron;

      let qCitas = supabase.from("leads").select("*", { count: "exact", head: true }).eq("comercial_asignado", comercial.id).in("estado", ["cita_agendada", "en_negociacion", "cerrado_ganado"]);
      if (fechaDesde) qCitas = qCitas.gte("fecha_captacion", fechaDesde);
      const { count: citasAgendadas } = await qCitas;

      let qGanados = supabase.from("leads").select("*", { count: "exact", head: true }).eq("comercial_asignado", comercial.id).eq("estado", "cerrado_ganado");
      if (fechaDesde) qGanados = qGanados.gte("fecha_captacion", fechaDesde);
      const { count: cerradosGanados } = await qGanados;

      const { count: leadsHoy } = await supabase.from("leads").select("*", { count: "exact", head: true }).eq("comercial_asignado", comercial.id).gte("fecha_captacion", hoyInicio);

      const { count: interaccionesTotal } = await supabase.from("interactions").select("*", { count: "exact", head: true }).eq("comercial_id", comercial.id);

      const t = totalLeads ?? 0;
      const c = leadsContactados ?? 0;
      const r = respondieron ?? 0;

      resultado.push({
        comercial,
        totalLeads: t,
        leadsCalientes: leadsCalientes ?? 0,
        leadsContactados: c,
        respondieron: r,
        citasAgendadas: citasAgendadas ?? 0,
        cerradosGanados: cerradosGanados ?? 0,
        tasaRespuesta: c > 0 ? Math.round((r / c) * 100) : 0,
        tasaConversion: t > 0 ? Math.round(((cerradosGanados ?? 0) / t) * 100) : 0,
        leadsHoy: leadsHoy ?? 0,
        interaccionesTotal: interaccionesTotal ?? 0,
      });
    }

    setStats(resultado.sort((a, b) => b.totalLeads - a.totalLeads));
    setLoading(false);
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Desempeño comercial</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Métricas de actividad y conversión por comercial
          </p>
        </div>

        {/* Selector de periodo */}
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
          {(["semana", "mes", "todo"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriodo(p)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                periodo === p
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {p === "semana" ? "Esta semana" : p === "mes" ? "Este mes" : "Todo"}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="py-24 text-center text-sm text-slate-400">Cargando datos...</div>
      ) : stats.length === 0 ? (
        <div className="py-24 text-center text-sm text-slate-400">No hay comerciales activos</div>
      ) : (
        <>
          {/* Tarjetas por comercial */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {stats.map((s) => (
              <TarjetaComercial key={s.comercial.id} stats={s} />
            ))}
          </div>

          {/* Tabla comparativa */}
          {stats.length > 1 && (
            <section>
              <h2 className="text-base font-semibold text-slate-800 mb-4">Comparativa</h2>
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100 text-xs font-medium text-slate-500 uppercase tracking-wide">
                      <th className="px-4 py-3 text-left">Comercial</th>
                      <th className="px-4 py-3 text-right">Leads</th>
                      <th className="px-4 py-3 text-right">Contactados</th>
                      <th className="px-4 py-3 text-right">Respondieron</th>
                      <th className="px-4 py-3 text-right">Citas</th>
                      <th className="px-4 py-3 text-right">Ganados</th>
                      <th className="px-4 py-3 text-right">Tasa resp.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {stats.map((s) => (
                      <tr key={s.comercial.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-slate-800">
                          {s.comercial.nombre} {s.comercial.apellidos ?? ""}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600">{s.totalLeads}</td>
                        <td className="px-4 py-3 text-right text-slate-600">{s.leadsContactados}</td>
                        <td className="px-4 py-3 text-right text-slate-600">{s.respondieron}</td>
                        <td className="px-4 py-3 text-right text-slate-600">{s.citasAgendadas}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={`font-semibold ${s.cerradosGanados > 0 ? "text-green-600" : "text-slate-400"}`}>
                            {s.cerradosGanados}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <TasaBadge valor={s.tasaRespuesta} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function TarjetaComercial({ stats: s }: { stats: StatsComercial }) {
  const nombre = `${s.comercial.nombre} ${s.comercial.apellidos ?? ""}`.trim();
  const iniciales = nombre.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();

  const funnel = [
    { label: "Leads totales", value: s.totalLeads, color: "bg-slate-200" },
    { label: "Contactados", value: s.leadsContactados, color: "bg-indigo-200" },
    { label: "Respondieron", value: s.respondieron, color: "bg-indigo-400" },
    { label: "Citas agendadas", value: s.citasAgendadas, color: "bg-indigo-600" },
    { label: "Cerrados ganados", value: s.cerradosGanados, color: "bg-green-500" },
  ];

  const maxVal = s.totalLeads || 1;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-sm">
          {iniciales}
        </div>
        <div>
          <p className="font-semibold text-slate-900">{nombre}</p>
          <p className="text-xs text-slate-400">Comercial activo</p>
        </div>
        <div className="ml-auto text-right">
          <p className="text-xs text-slate-400">Hoy</p>
          <p className="text-lg font-bold text-indigo-600">+{s.leadsHoy}</p>
        </div>
      </div>

      {/* Stats rápidas */}
      <div className="grid grid-cols-3 gap-3">
        <StatItem label="Leads calientes" value={s.leadsCalientes} color="text-orange-600" />
        <StatItem label="Tasa respuesta" value={`${s.tasaRespuesta}%`} color={s.tasaRespuesta >= 15 ? "text-green-600" : "text-slate-600"} />
        <StatItem label="Conversión" value={`${s.tasaConversion}%`} color={s.tasaConversion > 0 ? "text-green-600" : "text-slate-400"} />
      </div>

      {/* Mini funnel */}
      <div className="space-y-2">
        {funnel.map((step) => (
          <div key={step.label} className="flex items-center gap-3">
            <span className="text-xs text-slate-500 w-32 text-right shrink-0">{step.label}</span>
            <div className="flex-1 h-5 bg-slate-50 rounded overflow-hidden">
              <div
                className={`h-full rounded ${step.color} transition-all duration-500 flex items-center px-2`}
                style={{ width: `${Math.max(4, Math.round((step.value / maxVal) * 100))}%` }}
              >
                <span className="text-xs font-semibold text-white whitespace-nowrap drop-shadow">
                  {step.value}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatItem({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="bg-slate-50 rounded-lg p-3 text-center">
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-slate-400 mt-0.5">{label}</p>
    </div>
  );
}

function TasaBadge({ valor }: { valor: number }) {
  if (valor === 0) return <span className="text-slate-300">0%</span>;
  const color =
    valor >= 20 ? "text-green-600 bg-green-50" :
    valor >= 10 ? "text-amber-600 bg-amber-50" :
    "text-red-600 bg-red-50";
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${color}`}>
      {valor}%
    </span>
  );
}
