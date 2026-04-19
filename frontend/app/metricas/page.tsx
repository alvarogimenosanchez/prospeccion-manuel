"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

// ─── Tipos ────────────────────────────────────────────────────────────────────

type FunnelStep = {
  label: string;
  estado: string;
  count: number;
  color: string;
};

type StatsFilaFuente = {
  fuente: string;
  total: number;
  respondieron: number;
  tasaRespuesta: number;
  calientes: number;
  cerrados: number;
  tasaConversion: number;
};

type StatsFilaSector = {
  sector: string;
  total: number;
  respondieron: number;
  tasaRespuesta: number;
  calientes: number;
  cerrados: number;
  tasaConversion: number;
};

type StatsFilaCiudad = {
  ciudad: string;
  total: number;
  respondieron: number;
  cerrados: number;
  tasaConversion: number;
};

type SeguimientoCounts = {
  recordatorio1: number;
  recordatorio2: number;
  abandonados: number;
};

type Comercial = {
  id: string;
  nombre: string;
  apellidos: string;
};

type Periodo = "semana" | "mes" | "total";

// ─── Constantes ───────────────────────────────────────────────────────────────

const FUENTES = ["scraping", "linkedin", "inbound", "referido", "base_existente", "manual"];

const PRODUCTOS = [
  { key: "contigo_autonomo", label: "Contigo Autónomo" },
  { key: "contigo_pyme",     label: "Contigo Pyme"     },
  { key: "contigo_familia",  label: "Contigo Familia"  },
  { key: "contigo_futuro",   label: "Contigo Futuro"   },
  { key: "contigo_senior",   label: "Contigo Senior"   },
  { key: "sialp",            label: "SIALP"            },
  { key: "liderplus",        label: "LiderPlus"        },
  { key: "sanitas_salud",    label: "Sanitas Salud"    },
  { key: "mihogar",          label: "MiHogar"          },
  { key: "hipotecas",        label: "Hipotecas"        },
];

type StatsFilaProducto = {
  producto: string;
  label: string;
  total: number;
  respondieron: number;
  cerrados: number;
  tasaConversion: number;
};

type StatsFilaFormulario = {
  formulario_id: string;
  nombre: string;
  emoji: string;
  slug: string;
  total: number;
  respondieron: number;
  cerrados: number;
  tasaRespuesta: number;
  tasaConversion: number;
};

const SECTORES = [
  "Inmobiliaria",
  "Hostelería",
  "Asesoría",
  "Clínica / Salud",
  "Taller mecánico",
  "Peluquería / Estética",
  "Otro",
];

const FUNNEL_STEPS: Pick<FunnelStep, "label" | "estado" | "color">[] = [
  { label: "Total leads",    estado: "",               color: "bg-orange-100" },
  { label: "Contactados",    estado: "mensaje_enviado", color: "bg-orange-200" },
  { label: "Respondieron",   estado: "respondio",       color: "bg-orange-300" },
  { label: "Cita agendada",  estado: "cita_agendada",   color: "bg-orange-400" },
  { label: "Cerrado ganado", estado: "cerrado_ganado",  color: "bg-orange-600" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pct(a: number, b: number): string {
  if (b === 0) return "—";
  return `${Math.round((a / b) * 100)}%`;
}

function inicioPeriodo(periodo: Periodo): string | null {
  if (periodo === "total") return null;
  const now = new Date();
  if (periodo === "semana") {
    const d = new Date(now.getTime() - 7 * 86_400_000);
    return d.toISOString();
  }
  // mes: primer día del mes actual
  const d = new Date(now.getFullYear(), now.getMonth(), 1);
  return d.toISOString();
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function MetricasPage() {
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [comercialId, setComercialId] = useState<string>("todos");
  const [comerciales, setComercialesState] = useState<Comercial[]>([]);

  const [funnel, setFunnel] = useState<FunnelStep[]>([]);
  const [statsFuente, setStatsFuente] = useState<StatsFilaFuente[]>([]);
  const [statsSector, setStatsSector] = useState<StatsFilaSector[]>([]);
  const [statsProducto, setStatsProducto] = useState<StatsFilaProducto[]>([]);
  const [seguimiento, setSeguimiento] = useState<SeguimientoCounts>({
    recordatorio1: 0,
    recordatorio2: 0,
    abandonados: 0,
  });
  const [diasHastaCierre, setDiasHastaCierre] = useState<number | null>(null);
  const [statsCiudad, setStatsCiudad] = useState<StatsFilaCiudad[]>([]);
  const [statsFormulario, setStatsFormulario] = useState<StatsFilaFormulario[]>([]);
  const [loading, setLoading] = useState(true);
  const [ejecutandoSeguimiento, setEjecutandoSeguimiento] = useState<string | null>(null);
  const [mensajeSeguimiento, setMensajeSeguimiento] = useState<string | null>(null);
  const [soloTrabajados, setSoloTrabajados] = useState(false);
  const [leadsSinTocar, setLeadsSinTocar] = useState(0);
  const [funnelTrabajados, setFunnelTrabajados] = useState<FunnelStep[]>([]);
  const [autoSwitched, setAutoSwitched] = useState(false);

  // Cargar comerciales una sola vez
  useEffect(() => {
    async function cargarComerciales() {
      const { data } = await supabase
        .from("comerciales")
        .select("id, nombre, apellidos")
        .order("nombre");
      if (data) setComercialesState(data);
    }
    cargarComerciales();
  }, []);

  // Recargar métricas cuando cambian los filtros
  useEffect(() => {
    async function cargarDatos() {
      setLoading(true);
      setAutoSwitched(false);
      const fechaInicio = inicioPeriodo(periodo);

      // Detectar rápido si hay datos en el período antes de cargar todo
      if (periodo !== "total" && fechaInicio) {
        let qCheck = supabase.from("leads").select("*", { count: "exact", head: true }).gte("fecha_captacion", fechaInicio);
        if (comercialId !== "todos") qCheck = qCheck.eq("comercial_asignado", comercialId);
        const { count } = await qCheck;
        if ((count ?? 0) === 0) {
          setPeriodo("total");
          setAutoSwitched(true);
          setLoading(false);
          return;
        }
      }

      await Promise.all([
        cargarFunnel(fechaInicio, comercialId),
        cargarStatsFuente(fechaInicio, comercialId),
        cargarStatsSector(fechaInicio, comercialId),
        cargarSeguimiento(comercialId),
        cargarDiasHastaCierre(fechaInicio, comercialId),
        cargarStatsCiudad(fechaInicio, comercialId),
        cargarLeadsSinTocar(comercialId),
        cargarStatsProducto(fechaInicio, comercialId),
        cargarStatsFormulario(fechaInicio, comercialId),
      ]);
      setLoading(false);
    }
    cargarDatos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodo, comercialId]);

  // ── Builder de query base ────────────────────────────────────────────────────

  function baseQuery(fechaInicio: string | null, cid: string) {
    let q = supabase.from("leads").select("*", { count: "exact", head: true });
    if (fechaInicio) q = q.gte("fecha_captacion", fechaInicio);
    if (cid !== "todos") q = q.eq("comercial_asignado", cid);
    return q;
  }

  // ── Leads sin tocar ──────────────────────────────────────────────────────────
  async function cargarLeadsSinTocar(cid: string) {
    const hace7dias = new Date(Date.now() - 7 * 86_400_000).toISOString();
    let q = supabase.from("leads").select("*", { count: "exact", head: true })
      .in("estado", ["nuevo", "enriquecido"])
      .lt("fecha_captacion", hace7dias);
    if (cid !== "todos") q = q.eq("comercial_asignado", cid);
    const { count } = await q;
    setLeadsSinTocar(count ?? 0);
  }

  // ── Funnel ──────────────────────────────────────────────────────────────────
  // El funnel muestra cuántos leads están ACTUALMENTE en cada estado (o pasaron por ella)
  // "Total leads" = todos; etapas siguientes = estado actual exacto de esa etapa
  // Para dar sentido al funnel acumulativo, "Contactados" incluye los estados desde mensaje_enviado en adelante.

  async function cargarFunnel(fechaInicio: string | null, cid: string) {
    const steps: FunnelStep[] = [];

    // Total leads
    const { count: total } = await baseQuery(fechaInicio, cid);
    steps.push({ ...FUNNEL_STEPS[0], count: total ?? 0 });

    // Contactados: mensaje_enviado O estados más avanzados (acumulativo)
    const estadosContactados = [
      "mensaje_enviado",
      "respondio",
      "cita_agendada",
      "en_negociacion",
      "cerrado_ganado",
      "cerrado_perdido",
    ];
    let qContactados = supabase.from("leads").select("*", { count: "exact", head: true });
    if (fechaInicio) qContactados = qContactados.gte("fecha_captacion", fechaInicio);
    if (cid !== "todos") qContactados = qContactados.eq("comercial_asignado", cid);
    qContactados = qContactados.in("estado", estadosContactados);
    const { count: contactados } = await qContactados;
    steps.push({ ...FUNNEL_STEPS[1], count: contactados ?? 0 });

    // Respondieron: respondio + estados más avanzados
    const estadosRespondieron = [
      "respondio",
      "cita_agendada",
      "en_negociacion",
      "cerrado_ganado",
      "cerrado_perdido",
    ];
    let qRespondieron = supabase.from("leads").select("*", { count: "exact", head: true });
    if (fechaInicio) qRespondieron = qRespondieron.gte("fecha_captacion", fechaInicio);
    if (cid !== "todos") qRespondieron = qRespondieron.eq("comercial_asignado", cid);
    qRespondieron = qRespondieron.in("estado", estadosRespondieron);
    const { count: respondieron } = await qRespondieron;
    steps.push({ ...FUNNEL_STEPS[2], count: respondieron ?? 0 });

    // Cita agendada: cita_agendada + en_negociacion + cerrados
    const estadosCita = ["cita_agendada", "en_negociacion", "cerrado_ganado", "cerrado_perdido"];
    let qCita = supabase.from("leads").select("*", { count: "exact", head: true });
    if (fechaInicio) qCita = qCita.gte("fecha_captacion", fechaInicio);
    if (cid !== "todos") qCita = qCita.eq("comercial_asignado", cid);
    qCita = qCita.in("estado", estadosCita);
    const { count: citaAgendada } = await qCita;
    steps.push({ ...FUNNEL_STEPS[3], count: citaAgendada ?? 0 });

    // Cerrado ganado: exactamente cerrado_ganado
    let qCerrado = supabase.from("leads").select("*", { count: "exact", head: true });
    if (fechaInicio) qCerrado = qCerrado.gte("fecha_captacion", fechaInicio);
    if (cid !== "todos") qCerrado = qCerrado.eq("comercial_asignado", cid);
    qCerrado = qCerrado.eq("estado", "cerrado_ganado");
    const { count: cerrado } = await qCerrado;
    steps.push({ ...FUNNEL_STEPS[4], count: cerrado ?? 0 });

    setFunnel(steps);

    // Funnel de "leads trabajados" (excluye nuevo/enriquecido/descartado) —
    // para mostrar conversión real de pipeline activo
    const stepsT: FunnelStep[] = [];
    const EXCLUIDOS = ["nuevo", "enriquecido", "descartado"];
    let qTotT = supabase.from("leads").select("*", { count: "exact", head: true })
      .not("estado", "in", `(${EXCLUIDOS.join(",")})`);
    if (fechaInicio) qTotT = qTotT.gte("fecha_captacion", fechaInicio);
    if (cid !== "todos") qTotT = qTotT.eq("comercial_asignado", cid);
    const { count: totalT } = await qTotT;
    stepsT.push({ ...FUNNEL_STEPS[0], label: "En pipeline", count: totalT ?? 0 });
    // Reutilizar los steps de contactados/respondieron/cita/cerrado que ya calculamos
    stepsT.push(...steps.slice(1));
    setFunnelTrabajados(stepsT);
  }

  // ── Stats por fuente ─────────────────────────────────────────────────────────

  async function cargarStatsFuente(fechaInicio: string | null, cid: string) {
    const rows: StatsFilaFuente[] = [];

    for (const fuente of FUENTES) {
      const makeQ = () => {
        let q = supabase.from("leads").select("*", { count: "exact", head: true }).eq("fuente", fuente);
        if (fechaInicio) q = q.gte("fecha_captacion", fechaInicio);
        if (cid !== "todos") q = q.eq("comercial_asignado", cid);
        return q;
      };

      const [{ count: total }, { count: respondieron }, { count: calientes }, { count: cerrados }] = await Promise.all([
        makeQ(),
        makeQ().in("estado", ["respondio", "cita_agendada", "en_negociacion", "cerrado_ganado"]),
        makeQ().gte("nivel_interes", 7),
        makeQ().eq("estado", "cerrado_ganado"),
      ]);
      const t = total ?? 0;
      const r = respondieron ?? 0;
      const c = cerrados ?? 0;
      rows.push({
        fuente,
        total: t,
        respondieron: r,
        tasaRespuesta: t > 0 ? Math.round((r / t) * 100) : 0,
        calientes: calientes ?? 0,
        cerrados: c,
        tasaConversion: t > 0 ? Math.round((c / t) * 100) : 0,
      });
    }

    setStatsFuente(rows);
  }

  // ── Stats por sector ─────────────────────────────────────────────────────────

  async function cargarStatsSector(fechaInicio: string | null, cid: string) {
    const rows: StatsFilaSector[] = [];

    for (const sector of SECTORES) {
      const makeQ = () => {
        let q = sector === "Otro"
          ? supabase.from("leads").select("*", { count: "exact", head: true }).is("sector", null)
          : supabase.from("leads").select("*", { count: "exact", head: true }).ilike("sector", `%${sector}%`);
        if (fechaInicio) q = q.gte("fecha_captacion", fechaInicio);
        if (cid !== "todos") q = q.eq("comercial_asignado", cid);
        return q;
      };

      const [{ count: total }, { count: respondieron }, { count: calientes }, { count: cerrados }] = await Promise.all([
        makeQ(),
        makeQ().in("estado", ["respondio", "cita_agendada", "en_negociacion", "cerrado_ganado"]),
        makeQ().gte("nivel_interes", 7),
        makeQ().eq("estado", "cerrado_ganado"),
      ]);
      const t = total ?? 0;
      const r = respondieron ?? 0;
      const c = cerrados ?? 0;
      rows.push({
        sector,
        total: t,
        respondieron: r,
        tasaRespuesta: t > 0 ? Math.round((r / t) * 100) : 0,
        calientes: calientes ?? 0,
        cerrados: c,
        tasaConversion: t > 0 ? Math.round((c / t) * 100) : 0,
      });
    }

    setStatsSector(rows.filter((r) => r.total > 0));
  }

  // ── Stats por ciudad ─────────────────────────────────────────────────────────

  async function cargarStatsCiudad(fechaInicio: string | null, cid: string) {
    let q = supabase
      .from("leads")
      .select("ciudad, estado")
      .not("ciudad", "is", null)
      .limit(2000);
    if (fechaInicio) q = q.gte("fecha_captacion", fechaInicio);
    if (cid !== "todos") q = q.eq("comercial_asignado", cid);

    const { data } = await q;
    if (!data) return;

    const mapa: Record<string, { total: number; respondieron: number; cerrados: number }> = {};
    for (const l of data) {
      const c = (l.ciudad as string).trim();
      if (!c) continue;
      if (!mapa[c]) mapa[c] = { total: 0, respondieron: 0, cerrados: 0 };
      mapa[c].total++;
      if (["respondio", "cita_agendada", "en_negociacion", "cerrado_ganado"].includes(l.estado)) mapa[c].respondieron++;
      if (l.estado === "cerrado_ganado") mapa[c].cerrados++;
    }
    const rows: StatsFilaCiudad[] = Object.entries(mapa)
      .map(([ciudad, s]) => ({
        ciudad,
        ...s,
        tasaConversion: s.total > 0 ? Math.round((s.cerrados / s.total) * 100) : 0,
      }))
      .filter((r) => r.total >= 3)
      .sort((a, b) => b.total - a.total)
      .slice(0, 20);
    setStatsCiudad(rows);
  }

  // ── Seguimiento pendiente ────────────────────────────────────────────────────

  async function cargarSeguimiento(cid: string) {
    const ahora = new Date();
    const hace3dias = new Date(ahora.getTime() - 3 * 86_400_000).toISOString();
    const hace7dias = new Date(ahora.getTime() - 7 * 86_400_000).toISOString();
    const hace14dias = new Date(ahora.getTime() - 14 * 86_400_000).toISOString();

    const makeQ = () => {
      let q = supabase.from("leads").select("*", { count: "exact", head: true }).eq("estado", "mensaje_enviado");
      if (cid !== "todos") q = q.eq("comercial_asignado", cid);
      return q;
    };

    const [{ count: r1 }, { count: r2 }, { count: ab }] = await Promise.all([
      makeQ().lte("updated_at", hace3dias).gte("updated_at", hace7dias),
      makeQ().lte("updated_at", hace7dias).gte("updated_at", hace14dias),
      makeQ().lte("updated_at", hace14dias),
    ]);

    setSeguimiento({
      recordatorio1: r1 ?? 0,
      recordatorio2: r2 ?? 0,
      abandonados: ab ?? 0,
    });
  }

  // ── Stats por producto ───────────────────────────────────────────────────────

  async function cargarStatsProducto(fechaInicio: string | null, cid: string) {
    const rows: StatsFilaProducto[] = [];
    for (const { key, label } of PRODUCTOS) {
      const makeQ = () => {
        let q = supabase.from("leads").select("*", { count: "exact", head: true }).eq("producto_interes_principal", key);
        if (fechaInicio) q = q.gte("fecha_captacion", fechaInicio);
        if (cid !== "todos") q = q.eq("comercial_asignado", cid);
        return q;
      };
      const [{ count: total }, { count: respondieron }, { count: cerrados }] = await Promise.all([
        makeQ(),
        makeQ().in("estado", ["respondio", "cita_agendada", "en_negociacion", "cerrado_ganado"]),
        makeQ().eq("estado", "cerrado_ganado"),
      ]);
      const t = total ?? 0;
      if (t === 0) continue;
      rows.push({ producto: key, label, total: t, respondieron: respondieron ?? 0, cerrados: cerrados ?? 0, tasaConversion: t > 0 ? Math.round(((cerrados ?? 0) / t) * 100) : 0 });
    }
    setStatsProducto(rows.sort((a, b) => b.total - a.total));
  }

  // ── Stats por formulario de captación ───────────────────────────────────────

  async function cargarStatsFormulario(fechaInicio: string | null, cid: string) {
    const { data: forms } = await supabase
      .from("formularios_captacion")
      .select("id, nombre, emoji, slug");
    if (!forms || forms.length === 0) return;

    let q = supabase.from("leads").select("formulario_id, estado").not("formulario_id", "is", null).limit(5000);
    if (fechaInicio) q = q.gte("fecha_captacion", fechaInicio);
    if (cid !== "todos") q = q.eq("comercial_asignado", cid);
    const { data: leads } = await q;
    if (!leads) return;

    const mapa: Record<string, { total: number; respondieron: number; cerrados: number }> = {};
    for (const l of leads) {
      const fid = l.formulario_id as string;
      if (!mapa[fid]) mapa[fid] = { total: 0, respondieron: 0, cerrados: 0 };
      mapa[fid].total++;
      if (["respondio", "cita_agendada", "en_negociacion", "cerrado_ganado"].includes(l.estado)) mapa[fid].respondieron++;
      if (l.estado === "cerrado_ganado") mapa[fid].cerrados++;
    }

    const rows: StatsFilaFormulario[] = forms
      .map((f) => {
        const s = mapa[f.id] ?? { total: 0, respondieron: 0, cerrados: 0 };
        return {
          formulario_id: f.id,
          nombre: f.nombre,
          emoji: f.emoji,
          slug: f.slug,
          total: s.total,
          respondieron: s.respondieron,
          cerrados: s.cerrados,
          tasaRespuesta: s.total > 0 ? Math.round((s.respondieron / s.total) * 100) : 0,
          tasaConversion: s.total > 0 ? Math.round((s.cerrados / s.total) * 100) : 0,
        };
      })
      .filter((r) => r.total > 0)
      .sort((a, b) => b.total - a.total);

    setStatsFormulario(rows);
  }

  // ── Días promedio hasta cierre ────────────────────────────────────────────────

  async function cargarDiasHastaCierre(fechaInicio: string | null, cid: string) {
    let q = supabase
      .from("leads")
      .select("fecha_captacion, updated_at")
      .eq("estado", "cerrado_ganado")
      .not("fecha_captacion", "is", null)
      .limit(500);
    if (fechaInicio) q = q.gte("fecha_captacion", fechaInicio);
    if (cid !== "todos") q = q.eq("comercial_asignado", cid);

    const { data } = await q;
    if (!data || data.length === 0) {
      setDiasHastaCierre(null);
      return;
    }

    const dias = data
      .map((l) => {
        const d1 = new Date(l.fecha_captacion).getTime();
        const d2 = new Date(l.updated_at).getTime();
        return Math.max(0, Math.round((d2 - d1) / 86_400_000));
      })
      .filter((d) => d >= 0);

    const media = dias.length > 0
      ? Math.round(dias.reduce((a, b) => a + b, 0) / dias.length)
      : null;

    setDiasHastaCierre(media);
  }

  // ── Ejecutar seguimiento ─────────────────────────────────────────────────────

  async function ejecutarSeguimiento(tipo: "recordatorio1" | "recordatorio2" | "abandonados") {
    setEjecutandoSeguimiento(tipo);
    setMensajeSeguimiento(null);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "";
      const resp = await fetch(`${apiUrl}/api/seguimiento/ejecutar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo }),
      });
      if (resp.ok) {
        const data = await resp.json();
        setMensajeSeguimiento(data.mensaje ?? "Seguimiento ejecutado correctamente.");
      } else {
        setMensajeSeguimiento("Error al ejecutar el seguimiento. Revisa el backend.");
      }
    } catch {
      setMensajeSeguimiento("Backend no disponible. Conecta el backend para usar esta función.");
    } finally {
      setEjecutandoSeguimiento(null);
      await cargarSeguimiento(comercialId);
    }
  }

  // ─── Cálculos derivados ──────────────────────────────────────────────────────

  const maxFunnel = funnel[0]?.count ?? 1;
  const totalLeads = funnel[0]?.count ?? 0;
  const hayDatos = totalLeads > 0;

  const periodoLabel: Record<Periodo, string> = {
    semana: "últimos 7 días",
    mes: "este mes",
    total: "todos los tiempos",
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8">
      {/* Header + Filtros */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Métricas de conversión</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Análisis del pipeline, fuentes y seguimiento pendiente
          </p>
          {autoSwitched && (
            <p className="text-xs mt-1" style={{ color: "#ea650d" }}>
              Sin leads en ese período — mostrando historial total
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Filtro período */}
          <div className="flex items-center rounded-lg border border-slate-200 bg-white overflow-hidden text-sm">
            {(["semana", "mes", "total"] as Periodo[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriodo(p)}
                className={`px-3 py-1.5 font-medium transition-colors ${
                  periodo === p
                    ? "text-white"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
                style={periodo === p ? { background: "#ea650d" } : undefined}
              >
                {p === "semana" ? "7 días" : p === "mes" ? "Este mes" : "Total"}
              </button>
            ))}
          </div>

          {/* Filtro comercial */}
          {comerciales.length > 0 && (
            <select
              value={comercialId}
              onChange={(e) => setComercialId(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-300"
            >
              <option value="todos">Todos los comerciales</option>
              {comerciales.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre} {c.apellidos}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {loading ? (
        <div className="py-24 text-center text-sm text-slate-400">Cargando métricas...</div>
      ) : !hayDatos ? (
        /* ── Empty state ────────────────────────────────────────────────────── */
        <div className="py-24 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4" style={{ background: "#fff5f0" }}>
            <svg className="w-8 h-8" style={{ color: "#ea650d" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
            </svg>
          </div>
          <h3 className="text-base font-semibold text-slate-700 mb-1">Sin datos para este período</h3>
          <p className="text-sm text-slate-400 max-w-xs mx-auto">
            No hay leads captados en &ldquo;{periodoLabel[periodo]}&rdquo;
            {comercialId !== "todos" ? " para este comercial" : ""}.
            Prueba con &ldquo;Total&rdquo; o cambia el filtro de comercial.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button
              onClick={() => setPeriodo("total")}
              className="px-4 py-2 text-white text-sm font-medium rounded-lg transition-colors" style={{ background: "#ea650d" }}
            >
              Ver datos totales
            </button>
            {comercialId !== "todos" && (
              <button
                onClick={() => setComercialId("todos")}
                className="px-4 py-2 border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors"
              >
                Ver todos los comerciales
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* ── Stat: leads sin tocar ──────────────────────────────────────────── */}
          {leadsSinTocar > 0 && (
            <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 8, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 20 }}>⚠️</span>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: "#9a3412", margin: 0 }}>
                  {leadsSinTocar} lead{leadsSinTocar !== 1 ? "s" : ""} sin contacto en más de 7 días
                </p>
                <p style={{ fontSize: 12, color: "#c2410c", margin: "2px 0 0" }}>
                  Están en estado &quot;Nuevo&quot; y nadie los ha trabajado todavía. Cada día que pasan sin contacto reduce la conversión.
                </p>
              </div>
              <a href="/leads?estado=nuevo" style={{ fontSize: 12, fontWeight: 600, color: "#ea650d", textDecoration: "none", whiteSpace: "nowrap", padding: "4px 12px", border: "1px solid #ea650d", borderRadius: 6 }}>
                Ver leads →
              </a>
            </div>
          )}

          {/* ── Sección 1: Funnel de ventas ─────────────────────────────────────── */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-slate-800">Funnel de ventas</h2>
              <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 text-xs">
                <button
                  onClick={() => setSoloTrabajados(false)}
                  className={`px-3 py-1 rounded-md font-medium transition-colors ${!soloTrabajados ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                >
                  Todos los leads
                </button>
                <button
                  onClick={() => setSoloTrabajados(true)}
                  className={`px-3 py-1 rounded-md font-medium transition-colors ${soloTrabajados ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                >
                  Solo pipeline activo
                </button>
              </div>
            </div>
            {soloTrabajados && (
              <p className="text-xs text-slate-400 mb-3 -mt-2">
                Excluye leads en estado &quot;Nuevo&quot; o &quot;Enriquecido&quot; — muestra la conversión real del pipeline trabajado
              </p>
            )}
            <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-3">
              {(soloTrabajados ? funnelTrabajados : funnel).map((step, i) => {
                const funnelActual = soloTrabajados ? funnelTrabajados : funnel;
                const maxF = funnelActual[0]?.count ?? 1;
                const anchoPct = maxF > 0 ? Math.max(4, Math.round((step.count / maxF) * 100)) : 4;
                const conversionAnterior = i > 0 ? funnelActual[i - 1].count : null;

                return (
                  <div key={step.estado || "total"} className="flex items-center gap-4">
                    {/* Label */}
                    <div className="w-36 shrink-0 text-sm text-slate-600 text-right">
                      {step.label}
                    </div>

                    {/* Barra */}
                    <div className="flex-1 flex items-center gap-3">
                      <div className="flex-1 h-8 bg-slate-50 rounded-lg overflow-hidden">
                        <div
                          className={`h-full rounded-lg transition-all duration-500 flex items-center px-3 ${step.color}`}
                          style={{ width: `${anchoPct}%` }}
                        >
                          <span className="text-xs font-semibold text-slate-700 whitespace-nowrap">
                            {step.count.toLocaleString("es-ES")}
                          </span>
                        </div>
                      </div>

                      {/* Conversión respecto al paso anterior */}
                      <div className="w-16 text-right">
                        {conversionAnterior !== null && (
                          <span className="text-xs font-medium text-orange-600">
                            {pct(step.count, conversionAnterior)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Leyenda inferior */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
                {(() => {
                  const f = soloTrabajados ? funnelTrabajados : funnel;
                  if (f.length < 2) return null;
                  const total = f[0].count;
                  const cerrado = f[f.length - 1].count;
                  return (
                    <p className="text-xs text-slate-400">
                      {soloTrabajados ? "Conversión de pipeline activo:" : "Conversión total:"}{" "}
                      <span className={`font-semibold ${cerrado === 0 ? "text-slate-400" : "text-orange-600"}`}>
                        {pct(cerrado, total)}
                      </span>{" "}
                      {soloTrabajados ? "de leads trabajados a cerrado ganado" : "de todos los leads a cerrado ganado"}
                      {!soloTrabajados && leadsSinTocar > 0 && (
                        <span className="text-amber-500 ml-2">
                          ({leadsSinTocar} sin tocar aún — prueba &quot;Solo pipeline activo&quot; para ver la conversión real)
                        </span>
                      )}
                    </p>
                  );
                })()}
                {diasHastaCierre !== null && (
                  <p className="text-xs text-slate-400">
                    Tiempo medio hasta cierre:{" "}
                    <span className="font-semibold text-orange-600">
                      {diasHastaCierre} {diasHastaCierre === 1 ? "día" : "días"}
                    </span>{" "}
                    desde captación
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* ── Sección 2: Stats por fuente ─────────────────────────────────────── */}
          <section>
            <h2 className="text-base font-semibold text-slate-800 mb-4">ROI por fuente</h2>
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-xs font-medium text-slate-500 uppercase tracking-wide">
                    <th className="px-4 py-3 text-left">Fuente</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3 text-right">Respondieron</th>
                    <th className="px-4 py-3 text-right">T. respuesta</th>
                    <th className="px-4 py-3 text-right">Calientes</th>
                    <th className="px-4 py-3 text-right">Cierres</th>
                    <th className="px-4 py-3 text-right">T. conversión</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {statsFuente.filter((r) => r.total > 0).sort((a, b) => b.cerrados - a.cerrados || b.total - a.total).map((row) => {
                    const esProblemática = row.total >= 20 && row.respondieron === 0;
                    return (
                    <tr key={row.fuente} className={`transition-colors ${esProblemática ? "bg-red-50 hover:bg-red-100" : "hover:bg-slate-50"}`}>
                      <td className="px-4 py-3 font-medium capitalize" style={{ color: esProblemática ? "#991b1b" : "#334155" }}>
                        {esProblemática && <span className="mr-1.5 text-red-500">⚠</span>}
                        {row.fuente.replace(/_/g, " ")}
                        {esProblemática && <span className="ml-2 text-xs font-normal text-red-400">sin respuestas — ¿se están trabajando?</span>}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600">{row.total.toLocaleString("es-ES")}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{row.respondieron}</td>
                      <td className="px-4 py-3 text-right"><TasaBadge valor={row.tasaRespuesta} /></td>
                      <td className="px-4 py-3 text-right">
                        {row.calientes > 0
                          ? <span className="text-orange-600 font-medium">{row.calientes}</span>
                          : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-emerald-700">
                        {row.cerrados > 0 ? row.cerrados : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right"><TasaBadge valor={row.tasaConversion} /></td>
                    </tr>
                  );})}
                  {statsFuente.every((r) => r.total === 0) && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-slate-400 text-sm">Sin datos para este período</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* ── Sección 3: Stats por sector ─────────────────────────────────────── */}
          <section>
            <h2 className="text-base font-semibold text-slate-800 mb-1">Conversión por sector</h2>
            <p className="text-xs text-slate-400 mb-4">Qué sectores convierten mejor — úsalo para decidir dónde prospectar</p>
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-xs font-medium text-slate-500 uppercase tracking-wide">
                    <th className="px-4 py-3 text-left">Sector</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3 text-right">Respondieron</th>
                    <th className="px-4 py-3 text-right">Calientes</th>
                    <th className="px-4 py-3 text-right">Cierres</th>
                    <th className="px-4 py-3 text-right">T. conversión</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {statsSector.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-400 text-sm">Sin datos para este período</td>
                    </tr>
                  ) : (
                    statsSector.sort((a, b) => b.tasaConversion - a.tasaConversion || b.total - a.total).map((row) => (
                      <tr key={row.sector} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-slate-700">{row.sector}</td>
                        <td className="px-4 py-3 text-right text-slate-600">{row.total.toLocaleString("es-ES")}</td>
                        <td className="px-4 py-3 text-right text-slate-600">{row.respondieron}</td>
                        <td className="px-4 py-3 text-right">
                          {row.calientes > 0
                            ? <span className="text-orange-600 font-medium">{row.calientes}</span>
                            : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-emerald-700">
                          {row.cerrados > 0 ? row.cerrados : <span className="text-slate-300 font-normal">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right"><TasaBadge valor={row.tasaConversion} /></td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* ── Sección 3b: Stats por ciudad ─────────────────────────────────────── */}
          {statsCiudad.length > 0 && (
            <section>
              <h2 className="text-base font-semibold text-slate-800 mb-1">Conversión por ciudad</h2>
              <p className="text-xs text-slate-400 mb-4">Ciudades con ≥3 leads — ordenadas por volumen</p>
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100 text-xs font-medium text-slate-500 uppercase tracking-wide">
                      <th className="px-4 py-3 text-left">#</th>
                      <th className="px-4 py-3 text-left">Ciudad</th>
                      <th className="px-4 py-3 text-right">Total</th>
                      <th className="px-4 py-3 text-right">Respondieron</th>
                      <th className="px-4 py-3 text-right">Cierres</th>
                      <th className="px-4 py-3 text-right">T. conversión</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {statsCiudad
                      .sort((a, b) => b.tasaConversion - a.tasaConversion || b.total - a.total)
                      .map((row, i) => (
                        <tr key={row.ciudad} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 text-slate-400 text-xs">{i + 1}</td>
                          <td className="px-4 py-3 font-medium text-slate-700">{row.ciudad}</td>
                          <td className="px-4 py-3 text-right text-slate-600">{row.total}</td>
                          <td className="px-4 py-3 text-right text-slate-600">{row.respondieron}</td>
                          <td className="px-4 py-3 text-right font-semibold text-emerald-700">
                            {row.cerrados > 0 ? row.cerrados : <span className="text-slate-300 font-normal">—</span>}
                          </td>
                          <td className="px-4 py-3 text-right"><TasaBadge valor={row.tasaConversion} /></td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* ── Sección 3c: Stats por producto ───────────────────────────────────── */}
          {statsProducto.length > 0 && (
            <section>
              <h2 className="text-base font-semibold text-slate-800 mb-1">Conversión por producto</h2>
              <p className="text-xs text-slate-400 mb-4">Basado en el producto de interés principal del lead</p>
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100 text-xs font-medium text-slate-500 uppercase tracking-wide">
                      <th className="px-4 py-3 text-left">Producto</th>
                      <th className="px-4 py-3 text-right">Leads</th>
                      <th className="px-4 py-3 text-right">Respondieron</th>
                      <th className="px-4 py-3 text-right">Cierres</th>
                      <th className="px-4 py-3 text-right">T. conversión</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {statsProducto.map(row => (
                      <tr key={row.producto} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-slate-700">{row.label}</td>
                        <td className="px-4 py-3 text-right text-slate-600">{row.total}</td>
                        <td className="px-4 py-3 text-right text-slate-600">{row.respondieron}</td>
                        <td className="px-4 py-3 text-right font-semibold text-emerald-700">
                          {row.cerrados > 0 ? row.cerrados : <span className="text-slate-300 font-normal">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right"><TasaBadge valor={row.tasaConversion} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* ── Sección 3d: Stats por formulario de captación ───────────────────── */}
          {statsFormulario.length > 0 && (
            <section>
              <h2 className="text-base font-semibold text-slate-800 mb-1">Rendimiento por formulario</h2>
              <p className="text-xs text-slate-400 mb-4">Leads captados desde cada formulario de anuncio — ordenados por volumen</p>
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100 text-xs font-medium text-slate-500 uppercase tracking-wide">
                      <th className="px-4 py-3 text-left">Formulario</th>
                      <th className="px-4 py-3 text-right">Leads</th>
                      <th className="px-4 py-3 text-right">Respondieron</th>
                      <th className="px-4 py-3 text-right">T. respuesta</th>
                      <th className="px-4 py-3 text-right">Cierres</th>
                      <th className="px-4 py-3 text-right">T. conversión</th>
                      <th className="px-4 py-3 text-right">Enlace</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {statsFormulario.map((row) => (
                      <tr key={row.formulario_id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-slate-700">
                          <span className="mr-2">{row.emoji}</span>{row.nombre}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600">{row.total}</td>
                        <td className="px-4 py-3 text-right text-slate-600">{row.respondieron}</td>
                        <td className="px-4 py-3 text-right"><TasaBadge valor={row.tasaRespuesta} /></td>
                        <td className="px-4 py-3 text-right font-semibold text-emerald-700">
                          {row.cerrados > 0 ? row.cerrados : <span className="text-slate-300 font-normal">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right"><TasaBadge valor={row.tasaConversion} /></td>
                        <td className="px-4 py-3 text-right">
                          <a
                            href={`/f/${row.slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-orange-500 hover:text-orange-700 hover:underline"
                          >
                            /f/{row.slug}
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* ── Sección 4: Seguimiento pendiente ────────────────────────────────── */}
          <section>
            <h2 className="text-base font-semibold text-slate-800 mb-1">Seguimiento pendiente</h2>
            <p className="text-sm text-slate-500 mb-4">
              Leads que necesitan acción según días sin actividad desde último contacto
            </p>

            {mensajeSeguimiento && (
              <div className="mb-4 px-4 py-3 bg-orange-50 border border-orange-200 rounded-lg text-sm text-orange-700">
                {mensajeSeguimiento}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <SeguimientoCard
                titulo="Recordatorio 1"
                descripcion="Contactados hace 3-7 días sin respuesta"
                count={seguimiento.recordatorio1}
                color="amber"
                tipo="recordatorio1"
                ejecutando={ejecutandoSeguimiento === "recordatorio1"}
                onEjecutar={() => ejecutarSeguimiento("recordatorio1")}
              />
              <SeguimientoCard
                titulo="Recordatorio 2"
                descripcion="Contactados hace 7-14 días sin respuesta"
                count={seguimiento.recordatorio2}
                color="orange"
                tipo="recordatorio2"
                ejecutando={ejecutandoSeguimiento === "recordatorio2"}
                onEjecutar={() => ejecutarSeguimiento("recordatorio2")}
              />
              <SeguimientoCard
                titulo="Abandonados"
                descripcion="Más de 14 días sin actividad — marcar frío"
                count={seguimiento.abandonados}
                color="red"
                tipo="abandonados"
                ejecutando={ejecutandoSeguimiento === "abandonados"}
                onEjecutar={() => ejecutarSeguimiento("abandonados")}
              />
            </div>
          </section>
        </>
      )}
    </div>
  );
}

// ─── Subcomponentes ───────────────────────────────────────────────────────────

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

type ColorVariant = "amber" | "orange" | "red";

const colorMap: Record<ColorVariant, {
  border: string;
  bg: string;
  count: string;
  desc: string;
  btn: string;
}> = {
  amber: {
    border: "border-amber-200",
    bg: "bg-amber-50",
    count: "text-amber-700",
    desc: "text-amber-600",
    btn: "bg-amber-600 hover:bg-amber-700",
  },
  orange: {
    border: "border-orange-200",
    bg: "bg-orange-50",
    count: "text-orange-700",
    desc: "text-orange-600",
    btn: "bg-orange-600 hover:bg-orange-700",
  },
  red: {
    border: "border-red-200",
    bg: "bg-red-50",
    count: "text-red-700",
    desc: "text-red-600",
    btn: "bg-red-600 hover:bg-red-700",
  },
};

function SeguimientoCard({
  titulo,
  descripcion,
  count,
  color,
  ejecutando,
  onEjecutar,
}: {
  titulo: string;
  descripcion: string;
  count: number;
  color: ColorVariant;
  tipo: string;
  ejecutando: boolean;
  onEjecutar: () => void;
}) {
  const c = colorMap[color];
  return (
    <div className={`rounded-xl border ${c.border} ${c.bg} p-5 flex flex-col gap-3`}>
      <div>
        <p className={`text-sm font-semibold ${c.count}`}>{titulo}</p>
        <p className={`text-xs mt-0.5 ${c.desc}`}>{descripcion}</p>
      </div>
      <p className={`text-4xl font-bold ${c.count}`}>{count}</p>
      <button
        onClick={onEjecutar}
        disabled={ejecutando || count === 0}
        className={`mt-auto px-4 py-2 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${c.btn}`}
      >
        {ejecutando ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Ejecutando...
          </span>
        ) : (
          "Ejecutar seguimiento"
        )}
      </button>
    </div>
  );
}
