"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

function vaAtrasado(valorActual: number, objetivo: number): boolean {
  if (objetivo === 0) return false;
  const ahora = new Date();
  const diasEnMes = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0).getDate();
  const diaActual = ahora.getDate();
  const ritmoEsperado = (diaActual / diasEnMes) * objetivo;
  return valorActual < ritmoEsperado * 0.8;
}

type Comercial = {
  id: string;
  nombre: string;
  apellidos: string | null;
  rol: string;
  objetivo_cierres_mes: number;
  objetivo_citas_mes: number;
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
  accionesVencidas: number;
  sinActividad7d: number;
  objetivoCierres: number;
  objetivoCitas: number;
  ultimaActividad: string | null;
  cerradosPeriodoAnterior: number;
  citasPeriodoAnterior: number;
  topProducto: string | null;
  tiempoMedioEstados: { de: string; a: string; dias: number }[];
};

type AlertaDecision = {
  tipo: "sin_atencion" | "pipeline_estancado" | "accion_vencida";
  lead_id: string;
  nombre: string;
  empresa: string | null;
  horas: number;
  comercial: string;
};

const PRODUCTOS_NOMBRE: Record<string, string> = {
  contigo_futuro: "C. Futuro",
  sialp: "SIALP",
  contigo_autonomo: "C. Autónomo",
  contigo_familia: "C. Familia",
  contigo_pyme: "C. Pyme",
  contigo_senior: "C. Senior",
  liderplus: "LiderPlus",
  sanitas_salud: "Sanitas",
  mihogar: "MiHogar",
  hipotecas: "Hipoteca",
};

export default function DesempenoPage() {
  const [stats, setStats] = useState<StatsComercial[]>([]);
  const [alertas, setAlertas] = useState<AlertaDecision[]>([]);
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState<"todo" | "mes" | "semana">("todo");
  const [filtroEquipo, setFiltroEquipo] = useState("");
  const [filtroRol, setFiltroRol] = useState<"todos" | "director" | "comercial">("todos");
  const [equipos, setEquipos] = useState<{ id: string; nombre: string }[]>([]);
  const [teamMembers, setTeamMembers] = useState<{ comercial_id: string; team_id: string }[]>([]);

  useEffect(() => {
    supabase.from("teams").select("id, nombre").eq("activo", true).order("nombre")
      .then(({ data }) => setEquipos(data ?? []));
    supabase.from("team_members").select("comercial_id, team_id")
      .then(({ data }) => setTeamMembers(data ?? []));
  }, []);

  useEffect(() => {
    cargarDatos();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodo]);

  async function cargarDatos() {
    setLoading(true);

    const ahora = new Date();
    let fechaDesde: string | null = null;
    let fechaAnteriorDesde: string | null = null;
    let fechaAnteriorHasta: string | null = null;

    if (periodo === "semana") {
      fechaDesde = new Date(ahora.getTime() - 7 * 86_400_000).toISOString();
      fechaAnteriorDesde = new Date(ahora.getTime() - 14 * 86_400_000).toISOString();
      fechaAnteriorHasta = fechaDesde;
    } else if (periodo === "mes") {
      fechaDesde = new Date(ahora.getFullYear(), ahora.getMonth(), 1).toISOString();
      fechaAnteriorDesde = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1).toISOString();
      fechaAnteriorHasta = fechaDesde;
    }

    const [{ data: comerciales }, alertasSinAtencion, alertasVencidas, alertasEstancados] = await Promise.all([
      supabase.from("comerciales").select("id, nombre, apellidos, rol, objetivo_cierres_mes, objetivo_citas_mes").eq("activo", true),
      supabase.from("leads")
        .select("id, nombre, apellidos, empresa, comercial_asignado, comerciales(nombre, apellidos), updated_at")
        .eq("temperatura", "caliente")
        .not("estado", "in", "(cerrado_ganado,cerrado_perdido,descartado)")
        .lt("updated_at", new Date(ahora.getTime() - 48 * 3_600_000).toISOString())
        .order("updated_at", { ascending: true }).limit(10),
      supabase.from("leads")
        .select("id, nombre, apellidos, empresa, comercial_asignado, comerciales(nombre, apellidos), proxima_accion_fecha")
        .not("proxima_accion", "is", null).neq("proxima_accion", "ninguna")
        .lt("proxima_accion_fecha", ahora.toISOString())
        .not("estado", "in", "(cerrado_ganado,cerrado_perdido,descartado)")
        .order("proxima_accion_fecha", { ascending: true }).limit(10),
      supabase.from("leads")
        .select("id, nombre, apellidos, empresa, comercial_asignado, comerciales(nombre, apellidos), updated_at")
        .eq("estado", "en_negociacion")
        .lt("updated_at", new Date(ahora.getTime() - 7 * 86_400_000).toISOString())
        .order("updated_at", { ascending: true }).limit(10),
    ]);

    const nuevasAlertas: AlertaDecision[] = [];
    for (const l of (alertasSinAtencion.data ?? [])) {
      const horas = Math.round((ahora.getTime() - new Date(l.updated_at).getTime()) / 3_600_000);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const com = (l as any).comerciales;
      nuevasAlertas.push({ tipo: "sin_atencion", lead_id: l.id, nombre: [l.nombre, l.apellidos].filter(Boolean).join(" ") || "Sin nombre", empresa: l.empresa, horas, comercial: com ? `${com.nombre} ${com.apellidos ?? ""}`.trim() : "Sin asignar" });
    }
    for (const l of (alertasVencidas.data ?? [])) {
      const horas = Math.round((ahora.getTime() - new Date(l.proxima_accion_fecha).getTime()) / 3_600_000);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const com = (l as any).comerciales;
      nuevasAlertas.push({ tipo: "accion_vencida", lead_id: l.id, nombre: [l.nombre, l.apellidos].filter(Boolean).join(" ") || "Sin nombre", empresa: l.empresa, horas, comercial: com ? `${com.nombre} ${com.apellidos ?? ""}`.trim() : "Sin asignar" });
    }
    for (const l of (alertasEstancados.data ?? [])) {
      const dias = Math.round((ahora.getTime() - new Date(l.updated_at).getTime()) / 86_400_000);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const com = (l as any).comerciales;
      nuevasAlertas.push({ tipo: "pipeline_estancado", lead_id: l.id, nombre: [l.nombre, l.apellidos].filter(Boolean).join(" ") || "Sin nombre", empresa: l.empresa, horas: dias * 24, comercial: com ? `${com.nombre} ${com.apellidos ?? ""}`.trim() : "Sin asignar" });
    }
    setAlertas(nuevasAlertas);

    if (!comerciales || comerciales.length === 0) {
      setStats([]);
      setLoading(false);
      return;
    }

    const resultado: StatsComercial[] = [];

    for (const comercial of comerciales) {
      const base = supabase.from("leads").select("*", { count: "exact", head: true }).eq("comercial_asignado", comercial.id);

      const [
        { count: totalLeads },
        { count: leadsCalientes },
        { count: leadsContactados },
        { count: respondieron },
        { count: citasAgendadas },
        { count: cerradosGanados },
        { count: accionesVencidas },
        { count: sinActividad7d },
        // Periodo anterior para tendencia
        { count: cierresAnteriores },
        { count: citasAnteriores },
        // Última actividad (interacción más reciente)
        { data: ultimaInteraccion },
        // Top producto
        { data: leadsGanados },
        // Historial de estados
        historialRes,
      ] = await Promise.all([
        fechaDesde ? base.gte("fecha_captacion", fechaDesde) : base,
        (() => { let q = supabase.from("leads").select("*", { count: "exact", head: true }).eq("comercial_asignado", comercial.id).eq("temperatura", "caliente"); if (fechaDesde) q = q.gte("fecha_captacion", fechaDesde); return q; })(),
        (() => { let q = supabase.from("leads").select("*", { count: "exact", head: true }).eq("comercial_asignado", comercial.id).in("estado", ["mensaje_enviado", "respondio", "cita_agendada", "en_negociacion", "cerrado_ganado", "cerrado_perdido"]); if (fechaDesde) q = q.gte("fecha_captacion", fechaDesde); return q; })(),
        (() => { let q = supabase.from("leads").select("*", { count: "exact", head: true }).eq("comercial_asignado", comercial.id).in("estado", ["respondio", "cita_agendada", "en_negociacion", "cerrado_ganado"]); if (fechaDesde) q = q.gte("fecha_captacion", fechaDesde); return q; })(),
        (() => { let q = supabase.from("leads").select("*", { count: "exact", head: true }).eq("comercial_asignado", comercial.id).in("estado", ["cita_agendada", "en_negociacion", "cerrado_ganado"]); if (fechaDesde) q = q.gte("fecha_captacion", fechaDesde); return q; })(),
        (() => { let q = supabase.from("leads").select("*", { count: "exact", head: true }).eq("comercial_asignado", comercial.id).eq("estado", "cerrado_ganado"); if (fechaDesde) q = q.gte("fecha_captacion", fechaDesde); return q; })(),
        supabase.from("leads").select("*", { count: "exact", head: true }).eq("comercial_asignado", comercial.id).not("proxima_accion", "is", null).neq("proxima_accion", "ninguna").lt("proxima_accion_fecha", ahora.toISOString()).not("estado", "in", "(cerrado_ganado,cerrado_perdido,descartado)"),
        supabase.from("leads").select("*", { count: "exact", head: true }).eq("comercial_asignado", comercial.id).eq("estado", "en_negociacion").lt("updated_at", new Date(ahora.getTime() - 7 * 86_400_000).toISOString()),
        // Cierres periodo anterior
        (() => {
          let q = supabase.from("leads").select("*", { count: "exact", head: true }).eq("comercial_asignado", comercial.id).eq("estado", "cerrado_ganado");
          if (fechaAnteriorDesde) q = q.gte("fecha_captacion", fechaAnteriorDesde);
          if (fechaAnteriorHasta) q = q.lt("fecha_captacion", fechaAnteriorHasta);
          return q;
        })(),
        // Citas periodo anterior
        (() => {
          let q = supabase.from("leads").select("*", { count: "exact", head: true }).eq("comercial_asignado", comercial.id).in("estado", ["cita_agendada", "en_negociacion", "cerrado_ganado"]);
          if (fechaAnteriorDesde) q = q.gte("fecha_captacion", fechaAnteriorDesde);
          if (fechaAnteriorHasta) q = q.lt("fecha_captacion", fechaAnteriorHasta);
          return q;
        })(),
        // Última interacción de este comercial
        supabase.from("interactions").select("created_at").eq("origen", "comercial")
          .in("lead_id",
            supabase.from("leads").select("id").eq("comercial_asignado", comercial.id) as unknown as string[]
          )
          .order("created_at", { ascending: false }).limit(1),
        // Leads ganados con producto para calcular top
        supabase.from("leads").select("producto_interes_principal").eq("comercial_asignado", comercial.id).eq("estado", "cerrado_ganado").not("producto_interes_principal", "is", null).limit(100),
        // Historial de estados para tiempos medios
        supabase.from("lead_state_history").select("estado_anterior, estado_nuevo, created_at").eq("comercial_id", comercial.id).order("created_at", { ascending: true }).limit(500),
      ]);

      // Calcular top producto
      let topProducto: string | null = null;
      if (leadsGanados && leadsGanados.length > 0) {
        const conteo: Record<string, number> = {};
        for (const l of leadsGanados) {
          const p = l.producto_interes_principal as string;
          conteo[p] = (conteo[p] ?? 0) + 1;
        }
        topProducto = Object.entries(conteo).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      }

      // Última actividad — fallback a updated_at del lead más reciente
      let ultimaActividad: string | null = null;
      if (ultimaInteraccion && ultimaInteraccion.length > 0) {
        ultimaActividad = (ultimaInteraccion[0] as { created_at: string }).created_at;
      }

      // Calcular tiempos medios entre estados
      const transicionesInteres = [
        { de: "nuevo", a: "mensaje_enviado" },
        { de: "mensaje_enviado", a: "respondio" },
        { de: "respondio", a: "cita_agendada" },
        { de: "cita_agendada", a: "cerrado_ganado" },
      ];
      type HistRow = { estado_anterior: string; estado_nuevo: string; created_at: string };
      const historial = (historialRes?.data ?? []) as HistRow[];
      const tiempoMedioEstados: { de: string; a: string; dias: number }[] = [];
      for (const trans of transicionesInteres) {
        const pares: number[] = [];
        // Para cada transición, buscar pares de registros consecutivos del mismo lead
        // Agrupamos por lead implícitamente usando timestamps consecutivos
        const salidas = historial.filter(h => h.estado_anterior === trans.de && h.estado_nuevo === trans.a);
        // Buscamos el registro de entrada al estado "de" más cercano anterior para cada salida
        for (const salida of salidas) {
          const entradas = historial.filter(h =>
            h.estado_nuevo === trans.de &&
            new Date(h.created_at) < new Date(salida.created_at)
          );
          if (entradas.length > 0) {
            const entrada = entradas[entradas.length - 1];
            const diasEnEstado = (new Date(salida.created_at).getTime() - new Date(entrada.created_at).getTime()) / 86_400_000;
            if (diasEnEstado >= 0 && diasEnEstado < 365) pares.push(diasEnEstado);
          }
        }
        if (pares.length > 0) {
          const media = pares.reduce((a, b) => a + b, 0) / pares.length;
          tiempoMedioEstados.push({ de: trans.de, a: trans.a, dias: Math.round(media * 10) / 10 });
        }
      }

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
        leadsHoy: 0,
        accionesVencidas: accionesVencidas ?? 0,
        sinActividad7d: sinActividad7d ?? 0,
        objetivoCierres: comercial.objetivo_cierres_mes ?? 5,
        objetivoCitas: comercial.objetivo_citas_mes ?? 20,
        ultimaActividad,
        cerradosPeriodoAnterior: cierresAnteriores ?? 0,
        citasPeriodoAnterior: citasAnteriores ?? 0,
        topProducto,
        tiempoMedioEstados,
      });
    }

    setStats(resultado.sort((a, b) => b.cerradosGanados - a.cerradosGanados || b.totalLeads - a.totalLeads));
    setLoading(false);
  }

  const alertasSinAtencion = alertas.filter(a => a.tipo === "sin_atencion");
  const alertasVencidas = alertas.filter(a => a.tipo === "accion_vencida");
  const alertasEstancados = alertas.filter(a => a.tipo === "pipeline_estancado");

  const statsFiltrados = stats.filter(s => {
    if (filtroRol !== "todos" && s.comercial.rol !== filtroRol) return false;
    if (filtroEquipo) {
      const enEquipo = teamMembers.some(m => m.comercial_id === s.comercial.id && m.team_id === filtroEquipo);
      if (!enEquipo) return false;
    }
    return true;
  });

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Desempeño comercial</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {equipos.length > 0 && (
            <select value={filtroEquipo} onChange={e => setFiltroEquipo(e.target.value)}
              className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-slate-400 text-slate-600">
              <option value="">Todos los equipos</option>
              {equipos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </select>
          )}
          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
            {(["todos", "director", "comercial"] as const).map(r => (
              <button key={r} onClick={() => setFiltroRol(r)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${filtroRol === r ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                {r === "todos" ? "Todos" : r === "director" ? "Directores" : "Comerciales"}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
            {(["semana", "mes", "todo"] as const).map(p => (
              <button key={p} onClick={() => setPeriodo(p)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${periodo === p ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                {p === "semana" ? "Semana" : p === "mes" ? "Mes" : "Todo"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Alertas de decisión */}
      {!loading && alertas.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Alertas que requieren acción ahora</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <AlertaBloque titulo="Calientes sin atender" descripcion="+48h sin actividad" items={alertasSinAtencion}
              colorBorde="border-red-300" colorFondo="bg-red-50" colorTitulo="text-red-700" colorBadge="bg-red-100 text-red-700"
              formatHoras={h => `${h}h sin actividad`} />
            <AlertaBloque titulo="Acciones vencidas" descripcion="Compromisos incumplidos" items={alertasVencidas}
              colorBorde="border-orange-300" colorFondo="bg-orange-50" colorTitulo="text-orange-700" colorBadge="bg-orange-100 text-orange-700"
              formatHoras={h => h < 24 ? `${h}h de retraso` : `${Math.round(h / 24)}d de retraso`} />
            <AlertaBloque titulo="Pipeline estancado" descripcion="En negociación +7 días sin movimiento" items={alertasEstancados}
              colorBorde="border-amber-300" colorFondo="bg-amber-50" colorTitulo="text-amber-700" colorBadge="bg-amber-100 text-amber-700"
              formatHoras={h => `${Math.round(h / 24)} días parado`} />
          </div>
        </section>
      )}

      {loading ? (
        <div className="py-24 text-center text-sm text-slate-400">Cargando datos...</div>
      ) : statsFiltrados.length === 0 ? (
        <div className="py-24 text-center text-sm text-slate-400">No hay comerciales con los filtros seleccionados</div>
      ) : (
        <>
          {/* Ranking */}
          {statsFiltrados.length > 1 && (
            <section>
              <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-4">Ranking del periodo</h2>
              <div className="flex gap-3 overflow-x-auto pb-1">
                {statsFiltrados.slice(0, 3).map((s, i) => {
                  const nombre = `${s.comercial.nombre} ${s.comercial.apellidos ?? ""}`.trim();
                  const iniciales = nombre.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase();
                  const medallas = ["🥇", "🥈", "🥉"];
                  const bgPodio = ["bg-yellow-50 border-yellow-200", "bg-slate-50 border-slate-200", "bg-orange-50 border-orange-200"];
                  return (
                    <Link key={s.comercial.id} href={`/desempeno/${s.comercial.id}`}
                      className={`flex-shrink-0 flex flex-col items-center gap-2 px-6 py-4 rounded-xl border ${bgPodio[i]} hover:shadow-md transition-shadow min-w-[130px]`}>
                      <span className="text-2xl">{medallas[i]}</span>
                      <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-sm">
                        {iniciales}
                      </div>
                      <p className="text-xs font-semibold text-slate-800 text-center leading-tight">{s.comercial.nombre}</p>
                      <p className="text-lg font-bold text-green-600">{s.cerradosGanados}</p>
                      <p className="text-xs text-slate-400">cierres</p>
                    </Link>
                  );
                })}
                {statsFiltrados.slice(3).map((s, i) => {
                  const nombre = `${s.comercial.nombre} ${s.comercial.apellidos ?? ""}`.trim();
                  return (
                    <Link key={s.comercial.id} href={`/desempeno/${s.comercial.id}`}
                      className="flex-shrink-0 flex flex-col items-center gap-1.5 px-4 py-3 rounded-xl border border-slate-200 bg-white hover:shadow-md transition-shadow min-w-[110px]">
                      <span className="text-sm font-bold text-slate-400">#{i + 4}</span>
                      <p className="text-xs font-medium text-slate-700 text-center">{nombre}</p>
                      <p className="text-base font-bold text-slate-600">{s.cerradosGanados}</p>
                      <p className="text-xs text-slate-400">cierres</p>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          {/* Tarjetas por comercial */}
          <section>
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-4">Rendimiento por comercial</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {statsFiltrados.map((s, i) => (
                <TarjetaComercial key={s.comercial.id} stats={s} posicion={i + 1} periodo={periodo}
                  onUpdateObjetivo={async (campo, valor) => {
                    await supabase.from("comerciales").update({ [campo]: valor }).eq("id", s.comercial.id);
                    setStats(prev => prev.map(x => x.comercial.id === s.comercial.id
                      ? { ...x, [campo === "objetivo_cierres_mes" ? "objetivoCierres" : "objetivoCitas"]: valor }
                      : x
                    ));
                  }} />
              ))}
            </div>
          </section>

          {/* Tabla comparativa */}
          {statsFiltrados.length > 1 && (
            <section>
              <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-4">Comparativa</h2>
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100 text-xs font-medium text-slate-500 uppercase tracking-wide">
                      <th className="px-4 py-3 text-left">#</th>
                      <th className="px-4 py-3 text-left">Comercial</th>
                      <th className="px-4 py-3 text-right">Leads</th>
                      <th className="px-4 py-3 text-right">Citas</th>
                      <th className="px-4 py-3 text-right">Ganados</th>
                      <th className="px-4 py-3 text-right">% obj.</th>
                      <th className="px-4 py-3 text-right">Conversión</th>
                      <th className="px-4 py-3 text-right">Vencidas</th>
                      <th className="px-4 py-3 text-right">Top producto</th>
                      <th className="px-4 py-3 text-right">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {statsFiltrados.map((s, i) => {
                      const semaforo =
                        s.cerradosGanados > 0 && s.accionesVencidas === 0 && !vaAtrasado(s.cerradosGanados, s.objetivoCierres) ? "verde" :
                        s.accionesVencidas > 2 || s.sinActividad7d > 3 || (vaAtrasado(s.cerradosGanados, s.objetivoCierres) && s.cerradosGanados === 0) ? "rojo" : "naranja";
                      return (
                        <tr key={s.comercial.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 text-xs font-bold text-slate-400">#{i + 1}</td>
                          <td className="px-4 py-3 font-medium text-slate-800">
                            <div className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${semaforo === "verde" ? "bg-green-500" : semaforo === "rojo" ? "bg-red-500" : "bg-amber-400"}`} />
                              <Link href={`/desempeno/${s.comercial.id}`} className="hover:text-indigo-600 hover:underline">
                                {s.comercial.nombre} {s.comercial.apellidos ?? ""}
                              </Link>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right text-slate-600">{s.totalLeads}</td>
                          <td className="px-4 py-3 text-right text-slate-600">{s.citasAgendadas}</td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <span className={`font-semibold ${s.cerradosGanados > 0 ? "text-green-600" : "text-slate-400"}`}>{s.cerradosGanados}</span>
                              {periodo !== "todo" && <TendenciaBadge actual={s.cerradosGanados} anterior={s.cerradosPeriodoAnterior} />}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            {s.objetivoCierres > 0 ? (
                              <span className={`text-xs font-semibold ${vaAtrasado(s.cerradosGanados, s.objetivoCierres) ? "text-red-600" : s.cerradosGanados >= s.objetivoCierres ? "text-green-600" : "text-slate-600"}`}>
                                {Math.round((s.cerradosGanados / s.objetivoCierres) * 100)}%
                              </span>
                            ) : <span className="text-slate-300 text-xs">—</span>}
                          </td>
                          <td className="px-4 py-3 text-right"><TasaBadge valor={s.tasaConversion} /></td>
                          <td className="px-4 py-3 text-right">
                            {s.accionesVencidas > 0
                              ? <span className="text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">{s.accionesVencidas}</span>
                              : <span className="text-xs text-slate-300">—</span>}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {s.topProducto
                              ? <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-medium">{PRODUCTOS_NOMBRE[s.topProducto] ?? s.topProducto}</span>
                              : <span className="text-slate-300 text-xs">—</span>}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${semaforo === "verde" ? "bg-green-50 text-green-700" : semaforo === "rojo" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>
                              {semaforo === "verde" ? "OK" : semaforo === "rojo" ? "Atención" : "Revisar"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
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

function AlertaBloque({ titulo, descripcion, items, colorBorde, colorFondo, colorTitulo, colorBadge, formatHoras }: {
  titulo: string; descripcion: string; items: AlertaDecision[];
  colorBorde: string; colorFondo: string; colorTitulo: string; colorBadge: string;
  formatHoras: (h: number) => string;
}) {
  return (
    <div className={`rounded-xl border ${colorBorde} ${colorFondo} p-4`}>
      <div className="flex items-center justify-between mb-1">
        <p className={`text-xs font-semibold uppercase tracking-wide ${colorTitulo}`}>{titulo}</p>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colorBadge}`}>{items.length}</span>
      </div>
      <p className="text-xs text-slate-400 mb-3">{descripcion}</p>
      {items.length === 0 ? (
        <p className="text-xs text-slate-400 italic">Sin alertas activas</p>
      ) : (
        <div className="space-y-2">
          {items.slice(0, 4).map(a => (
            <Link key={a.lead_id} href={`/leads/${a.lead_id}`} className="flex items-center justify-between gap-2 group">
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-800 truncate group-hover:text-indigo-600">{a.nombre}</p>
                {a.empresa && <p className="text-xs text-slate-400 truncate">{a.empresa}</p>}
                <p className="text-xs text-slate-400">{a.comercial}</p>
              </div>
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium whitespace-nowrap flex-shrink-0 ${colorBadge}`}>
                {formatHoras(a.horas)}
              </span>
            </Link>
          ))}
          {items.length > 4 && <p className="text-xs text-slate-400 text-center pt-1">+{items.length - 4} más</p>}
        </div>
      )}
    </div>
  );
}

function TendenciaBadge({ actual, anterior }: { actual: number; anterior: number }) {
  if (anterior === 0 && actual === 0) return null;
  if (anterior === 0) return <span className="text-xs text-green-600 font-medium">nuevo</span>;
  const diff = actual - anterior;
  if (diff === 0) return <span className="text-xs text-slate-400">→</span>;
  return (
    <span className={`text-xs font-semibold ${diff > 0 ? "text-green-600" : "text-red-500"}`}>
      {diff > 0 ? "▲" : "▼"}{Math.abs(diff)}
    </span>
  );
}

function TarjetaComercial({ stats: s, posicion, periodo, onUpdateObjetivo }: {
  stats: StatsComercial;
  posicion: number;
  periodo: string;
  onUpdateObjetivo: (campo: string, valor: number) => Promise<void>;
}) {
  const nombre = `${s.comercial.nombre} ${s.comercial.apellidos ?? ""}`.trim();
  const iniciales = nombre.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase();
  const [editandoCierres, setEditandoCierres] = useState(false);
  const [editandoCitas, setEditandoCitas] = useState(false);
  const [tempCierres, setTempCierres] = useState(String(s.objetivoCierres));
  const [tempCitas, setTempCitas] = useState(String(s.objetivoCitas));

  const pctCierres = s.objetivoCierres > 0 ? Math.min(100, Math.round((s.cerradosGanados / s.objetivoCierres) * 100)) : 0;
  const pctCitas = s.objetivoCitas > 0 ? Math.min(100, Math.round((s.citasAgendadas / s.objetivoCitas) * 100)) : 0;
  const cierresAtrasado = vaAtrasado(s.cerradosGanados, s.objetivoCierres);
  const citasAtrasado = vaAtrasado(s.citasAgendadas, s.objetivoCitas);

  const semaforo =
    s.cerradosGanados > 0 && s.accionesVencidas === 0 && !cierresAtrasado ? "verde" :
    s.accionesVencidas > 2 || s.sinActividad7d > 3 || (cierresAtrasado && s.cerradosGanados === 0) ? "rojo" : "naranja";

  const funnel = [
    { label: "Leads totales", value: s.totalLeads, color: "bg-slate-300" },
    { label: "Contactados", value: s.leadsContactados, color: "bg-indigo-200" },
    { label: "Respondieron", value: s.respondieron, color: "bg-indigo-400" },
    { label: "Citas agendadas", value: s.citasAgendadas, color: "bg-indigo-600" },
    { label: "Cerrados ganados", value: s.cerradosGanados, color: "bg-green-500" },
  ];
  const maxVal = s.totalLeads || 1;

  // Última actividad
  function actividadLabel(fecha: string | null): { texto: string; color: string } {
    if (!fecha) return { texto: "Sin actividad registrada", color: "text-slate-400" };
    const horas = (Date.now() - new Date(fecha).getTime()) / 3_600_000;
    if (horas < 24) return { texto: "Activo hoy", color: "text-green-600" };
    if (horas < 48) return { texto: "Activo ayer", color: "text-green-500" };
    const dias = Math.floor(horas / 24);
    if (dias <= 3) return { texto: `Hace ${dias} días`, color: "text-amber-600" };
    return { texto: `Sin actividad hace ${dias} días`, color: "text-red-500" };
  }
  const actividad = actividadLabel(s.ultimaActividad);

  async function guardarObjetivo(campo: string, val: string, cerrar: () => void) {
    const n = parseInt(val);
    if (!isNaN(n) && n >= 0) await onUpdateObjetivo(campo, n);
    cerrar();
  }

  return (
    <div className={`bg-white rounded-xl border p-6 space-y-5 ${semaforo === "rojo" ? "border-red-200" : semaforo === "naranja" ? "border-amber-200" : "border-slate-200"}`}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="relative">
          <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-sm">
            {iniciales}
          </div>
          {posicion <= 3 && (
            <span className="absolute -top-1 -right-1 text-sm">{["🥇", "🥈", "🥉"][posicion - 1]}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link href={`/desempeno/${s.comercial.id}`} className="font-semibold text-slate-900 hover:text-indigo-600 hover:underline">
              {nombre}
            </Link>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${semaforo === "verde" ? "bg-green-50 text-green-700" : semaforo === "rojo" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>
              {semaforo === "verde" ? "OK" : semaforo === "rojo" ? "Atención" : "Revisar"}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <p className="text-xs text-slate-400">{s.comercial.rol === "director" ? "Director comercial" : "Comercial activo"}</p>
            <span className={`text-xs font-medium ${actividad.color}`}>● {actividad.texto}</span>
          </div>
        </div>
        {s.cerradosGanados > 0 && (
          <div className="text-right flex-shrink-0">
            <div className="flex items-center gap-1 justify-end">
              <p className="text-lg font-bold text-green-600">{s.cerradosGanados}</p>
              {periodo !== "todo" && <TendenciaBadge actual={s.cerradosGanados} anterior={s.cerradosPeriodoAnterior} />}
            </div>
            <p className="text-xs text-slate-400">Ganados</p>
          </div>
        )}
      </div>

      {/* Alertas del comercial */}
      {(s.accionesVencidas > 0 || s.sinActividad7d > 0 || s.leadsCalientes > 0) && (
        <div className="flex gap-2 flex-wrap">
          {s.accionesVencidas > 0 && (
            <span className="text-xs px-2 py-1 bg-red-50 text-red-600 border border-red-200 rounded-lg font-medium">
              ⚠ {s.accionesVencidas} {s.accionesVencidas === 1 ? "acción vencida" : "acciones vencidas"}
            </span>
          )}
          {s.sinActividad7d > 0 && (
            <span className="text-xs px-2 py-1 bg-amber-50 text-amber-600 border border-amber-200 rounded-lg font-medium">
              ⏳ {s.sinActividad7d} {s.sinActividad7d === 1 ? "lead estancado" : "leads estancados"}
            </span>
          )}
          {s.leadsCalientes > 0 && (
            <span className="text-xs px-2 py-1 bg-orange-50 text-orange-600 border border-orange-200 rounded-lg font-medium">
              🔥 {s.leadsCalientes} {s.leadsCalientes === 1 ? "lead caliente" : "leads calientes"}
            </span>
          )}
          {s.topProducto && (
            <span className="text-xs px-2 py-1 bg-indigo-50 text-indigo-600 border border-indigo-200 rounded-lg font-medium">
              ★ {PRODUCTOS_NOMBRE[s.topProducto] ?? s.topProducto}
            </span>
          )}
        </div>
      )}

      {/* Stats rápidas */}
      <div className="grid grid-cols-3 gap-3">
        <StatItem label="Tasa respuesta" value={`${s.tasaRespuesta}%`} color={s.tasaRespuesta >= 15 ? "text-green-600" : "text-slate-600"} />
        <StatItem label="Conversión" value={`${s.tasaConversion}%`} color={s.tasaConversion > 0 ? "text-green-600" : "text-slate-400"} />
        <StatItem label="Sin tocar 7d" value={s.sinActividad7d} color={s.sinActividad7d > 3 ? "text-red-600" : s.sinActividad7d > 0 ? "text-amber-600" : "text-green-600"} />
      </div>

      {/* Mini funnel */}
      <div className="space-y-2">
        {funnel.map(step => (
          <div key={step.label} className="flex items-center gap-3">
            <span className="text-xs text-slate-500 w-32 text-right shrink-0">{step.label}</span>
            <div className="flex-1 h-5 bg-slate-50 rounded overflow-hidden">
              <div className={`h-full rounded ${step.color} transition-all duration-500 flex items-center px-2`}
                style={{ width: `${Math.max(4, Math.round((step.value / maxVal) * 100))}%` }}>
                <span className="text-xs font-semibold text-white whitespace-nowrap drop-shadow">{step.value}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Tiempos medios entre estados */}
      {s.tiempoMedioEstados.length > 0 && (
        <div className="border-t border-slate-100 pt-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Velocidad del pipeline</p>
          <div className="grid grid-cols-2 gap-2">
            {s.tiempoMedioEstados.map(t => {
              const ETIQUETAS: Record<string, string> = {
                nuevo: "Nuevo", mensaje_enviado: "Contactado", respondio: "Respondió",
                cita_agendada: "Cita", cerrado_ganado: "Ganado",
              };
              const color = t.dias <= 3 ? "text-green-600" : t.dias <= 7 ? "text-amber-600" : "text-red-500";
              return (
                <div key={`${t.de}-${t.a}`} className="bg-slate-50 rounded-lg p-2.5 text-center">
                  <p className={`text-sm font-bold ${color}`}>{t.dias}d</p>
                  <p className="text-xs text-slate-400 leading-tight mt-0.5">
                    {ETIQUETAS[t.de] ?? t.de} → {ETIQUETAS[t.a] ?? t.a}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Objetivos del mes */}
      <div className="border-t border-slate-100 pt-4 space-y-3">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Objetivos del mes</p>
        {/* Cierres */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-slate-600">Cierres ganados</span>
            <div className="flex items-center gap-1.5">
              <span className={`text-xs font-semibold ${cierresAtrasado ? "text-red-600" : pctCierres >= 100 ? "text-green-600" : "text-slate-700"}`}>{s.cerradosGanados}</span>
              <span className="text-xs text-slate-400">de</span>
              {editandoCierres ? (
                <input type="number" min={0} className="w-10 text-xs border border-indigo-300 rounded px-1 py-0.5 text-center focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  value={tempCierres} onChange={e => setTempCierres(e.target.value)}
                  onBlur={() => guardarObjetivo("objetivo_cierres_mes", tempCierres, () => setEditandoCierres(false))}
                  onKeyDown={e => { if (e.key === "Enter") guardarObjetivo("objetivo_cierres_mes", tempCierres, () => setEditandoCierres(false)); if (e.key === "Escape") setEditandoCierres(false); }}
                  autoFocus />
              ) : (
                <button onClick={() => { setTempCierres(String(s.objetivoCierres)); setEditandoCierres(true); }}
                  className="text-xs text-slate-500 hover:text-indigo-600 hover:underline" title="Editar objetivo">
                  {s.objetivoCierres}
                </button>
              )}
              {cierresAtrasado && <span className="text-xs text-red-500 font-medium">↓ ritmo bajo</span>}
            </div>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-500 ${pctCierres >= 100 ? "bg-green-500" : cierresAtrasado ? "bg-red-400" : "bg-indigo-500"}`}
              style={{ width: `${pctCierres}%` }} />
          </div>
          <p className="text-xs text-slate-400 mt-0.5 text-right">{pctCierres}%</p>
        </div>
        {/* Citas */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-slate-600">Citas agendadas</span>
            <div className="flex items-center gap-1.5">
              <span className={`text-xs font-semibold ${citasAtrasado ? "text-red-600" : pctCitas >= 100 ? "text-green-600" : "text-slate-700"}`}>{s.citasAgendadas}</span>
              <span className="text-xs text-slate-400">de</span>
              {editandoCitas ? (
                <input type="number" min={0} className="w-10 text-xs border border-indigo-300 rounded px-1 py-0.5 text-center focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  value={tempCitas} onChange={e => setTempCitas(e.target.value)}
                  onBlur={() => guardarObjetivo("objetivo_citas_mes", tempCitas, () => setEditandoCitas(false))}
                  onKeyDown={e => { if (e.key === "Enter") guardarObjetivo("objetivo_citas_mes", tempCitas, () => setEditandoCitas(false)); if (e.key === "Escape") setEditandoCitas(false); }}
                  autoFocus />
              ) : (
                <button onClick={() => { setTempCitas(String(s.objetivoCitas)); setEditandoCitas(true); }}
                  className="text-xs text-slate-500 hover:text-indigo-600 hover:underline" title="Editar objetivo">
                  {s.objetivoCitas}
                </button>
              )}
              {citasAtrasado && <span className="text-xs text-red-500 font-medium">↓ ritmo bajo</span>}
            </div>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-500 ${pctCitas >= 100 ? "bg-green-500" : citasAtrasado ? "bg-red-400" : "bg-indigo-500"}`}
              style={{ width: `${pctCitas}%` }} />
          </div>
          <p className="text-xs text-slate-400 mt-0.5 text-right">{pctCitas}%</p>
        </div>
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
  const color = valor >= 20 ? "text-green-600 bg-green-50" : valor >= 10 ? "text-amber-600 bg-amber-50" : "text-red-600 bg-red-50";
  return <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${color}`}>{valor}%</span>;
}
