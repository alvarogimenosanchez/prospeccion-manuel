"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { format, formatDistanceToNow, addDays, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { supabase } from "@/lib/supabase";
import { usePermisos } from "@/components/PermisosProvider";

// ─── Types ────────────────────────────────────────────────────────────────────

type LeadRow = {
  id: string;
  nombre: string;
  apellidos: string | null;
  empresa: string | null;
  ciudad: string | null;
  sector: string | null;
  telefono: string | null;
  telefono_whatsapp: string | null;
  nivel_interes: number;
  prioridad: string | null;
  estado: string;
  proxima_accion: string | null;
  proxima_accion_fecha: string | null;
  proxima_accion_nota: string | null;
  comercial_asignado: string | null;
  updated_at?: string;
};

type CitaRow = {
  id: string;
  tipo: string;
  estado: string;
  fecha_hora: string;
  lead_id: string;
  notas_previas: string | null;
  leads: {
    nombre: string;
    apellidos: string | null;
    empresa: string | null;
    telefono_whatsapp: string | null;
  } | null;
};

type SeccionesData = {
  accionesVencidas: LeadRow[];
  accionesHoy: LeadRow[];
  altaPrioridadSinTocar: LeadRow[];
  respondieronSinSeguimiento: LeadRow[];
  mensajeEnviadoSinRespuesta: LeadRow[];
  enNegociacionSinActividad: LeadRow[];
  citasHoy: CitaRow[];
};

// ─── Constants ────────────────────────────────────────────────────────────────

const ACCIONES_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  llamar:            { label: "Llamar",   icon: "📞", color: "bg-blue-100 text-blue-700 hover:bg-blue-200"   },
  whatsapp:          { label: "WhatsApp", icon: "💬", color: "bg-green-100 text-green-700 hover:bg-green-200" },
  email:             { label: "Email",    icon: "📧", color: "bg-sky-100 text-sky-700 hover:bg-sky-200"       },
  esperar_respuesta: { label: "Esperar",  icon: "⏳", color: "bg-slate-100 text-slate-700"                    },
  enviar_info:       { label: "Enviar info", icon: "📎", color: "bg-orange-100 text-orange-700 hover:bg-orange-200" },
  reunion:           { label: "Reunión",  icon: "📅", color: "bg-orange-100 text-orange-700 hover:bg-orange-200" },
};

const ESTADOS_CERRADOS = ["cerrado_ganado", "cerrado_perdido", "descartado"];

const TEMP_POR_ESTADO: Record<string, string> = {
  nuevo: "frio", mensaje_enviado: "frio", segmentado: "frio",
  respondio: "templado",
  cita_agendada: "caliente", en_negociacion: "caliente",
  cerrado_ganado: "caliente", cerrado_perdido: "frio",
};

const TIPO_CITA_LABEL: Record<string, string> = {
  llamada: "Llamada",
  reunion_presencial: "Reunión presencial",
  videollamada: "Videollamada",
};

const ESTADO_CITA_STYLE: Record<string, string> = {
  pendiente:         "bg-amber-100 text-amber-700",
  confirmada:        "bg-green-100 text-green-700",
  solicitud_pendiente: "bg-slate-100 text-slate-600",
};

const SELECT_LEAD =
  "id, nombre, apellidos, empresa, ciudad, sector, telefono, telefono_whatsapp, nivel_interes, prioridad, estado, proxima_accion, proxima_accion_fecha, proxima_accion_nota, comercial_asignado, updated_at";

const RESULTADOS_CITA = [
  { value: "interesado",       label: "✅ Interesado — quiere seguir" },
  { value: "necesita_mas_info",label: "🤔 Necesita más información"   },
  { value: "no_interesado",    label: "❌ No interesado"              },
  { value: "cerrado_ganado",   label: "🏆 Cerrado — contratado"       },
  { value: "aplazado",         label: "⏳ Aplazado — más adelante"    },
];

const PROXIMAS_ACCIONES_POST = [
  { value: "llamar",      label: "📞 Llamar"             },
  { value: "whatsapp",    label: "💬 Enviar WhatsApp"    },
  { value: "enviar_info", label: "📎 Enviar información" },
  { value: "reunion",     label: "📅 Nueva reunión"      },
  { value: "ninguna",     label: "— Ninguna (cerrado)"   },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function nombreCompleto(lead: { nombre: string; apellidos: string | null }) {
  return [lead.nombre, lead.apellidos].filter(Boolean).join(" ");
}

function diasDesde(fechaStr: string): number {
  return Math.floor((Date.now() - new Date(fechaStr).getTime()) / 86400000);
}

function horasDesde(fechaStr: string): number {
  return Math.floor((Date.now() - new Date(fechaStr).getTime()) / 3600000);
}

function telLimpio(tel: string | null): string | null {
  return tel ? tel.replace(/\D/g, "") : null;
}

function waUrl(tel: string, mensaje: string): string {
  return `https://wa.me/${tel}?text=${encodeURIComponent(mensaje)}`;
}

function mensajeWA(lead: LeadRow, tipo: "primer_contacto" | "seguimiento" | "recordatorio" | "negociacion"): string {
  const n = lead.nombre;
  const emp = lead.empresa ? ` en ${lead.empresa}` : "";
  const ciu = lead.ciudad || "tu zona";
  const sec = (lead.sector || "").toLowerCase();

  const esAutonomo = sec.includes("hostel") || sec.includes("restaur") || sec.includes("bar") || sec.includes("taller") || sec.includes("peluq") || sec.includes("belleza") || sec.includes("clinica") || sec.includes("clínica") || sec.includes("medic") || sec.includes("dental");
  const esInmobiliaria = sec.includes("inmobil");
  const esAsesoria = sec.includes("asesor") || sec.includes("gestor") || sec.includes("contab");

  switch (tipo) {
    case "primer_contacto":
      if (esInmobiliaria)
        return `Hola ${n}, soy Manuel de Nationale-Nederlanden en ${ciu}. Trabajo con inmobiliarias en acuerdos de derivación hipotecaria — cuando tu cliente necesita hipoteca, vosotros generáis comisión sin trabajo extra. El mes pasado la media fue 900€/operación. ¿15 minutos esta semana?`;
      if (esAsesoria)
        return `Hola ${n}, soy Manuel de Nationale-Nederlanden. Muchos de vuestros clientes autónomos no tienen cubierta la baja desde el primer día. Tenemos un seguro desde 5€/mes — ¿os interesaría ofrecerlo como valor añadido? Hablaríamos de comisión.`;
      if (esAutonomo)
        return `Hola ${n}, soy Manuel, asesor en ${ciu}. Vi que tienes negocio${emp}. Si un día te pones enfermo y no puedes trabajar, ¿cuánto cobrarías? Contigo Autónomo cubre desde el primer día de baja desde ~5€/mes. ¿Tienes 5 minutos?`;
      return `Hola ${n}, soy Manuel de Nationale-Nederlanden en ${ciu}. Quería presentarte opciones de protección financiera adaptadas a tu situación${emp}. ¿Tienes 10 minutos esta semana?`;

    case "seguimiento":
      return `Hola ${n}, soy Manuel de nuevo. ¿Has podido revisar lo que te comenté sobre proteger tus ingresos${emp ? ` en ${lead.empresa}` : ""}? Quedo a tu disposición para cualquier duda o para prepararte una propuesta sin compromiso.`;

    case "recordatorio":
      return `Hola ${n}, te escribo de nuevo por si no viste mi mensaje anterior. Entiendo que igual no era buen momento — cuando quieras que te cuente cómo funciona, aquí estoy. ¿Hay algún momento mejor para hablar?`;

    case "negociacion":
      return `Hola ${n}, ¿has podido pensar en lo que hablamos? Si tienes alguna duda sobre coberturas o precio, con gusto te lo aclaro. Mi objetivo es que la solución se adapte exactamente a lo que necesitas.`;
  }
}

function badgeAccion(tipo: string | null) {
  if (!tipo || tipo === "ninguna") return null;
  const cfg = ACCIONES_CONFIG[tipo];
  if (!cfg) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
      {cfg.icon} {cfg.label}
    </span>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type TeamPulseItem = {
  id: string;
  nombre: string;
  accionesVencidas: number;
  accionesHoy: number;
  negociacionSinActividad: number;
  respondieronSinSeguimiento: number;
};

export default function HoyPage() {
  const { puede, cargando: cargandoPermisos } = usePermisos();
  const [comercialId,  setComercialId ] = useState<string | null>(null);
  const [comercialNombre, setComercialNombre] = useState("Manuel");
  const [comercialCargado, setComercialCargado] = useState(false);
  const [teamPulse, setTeamPulse] = useState<TeamPulseItem[]>([]);

  const [accionesGestionadas, setAccionesGestionadas] = useState(0);

  const [seccionesData, setSeccionesData] = useState<SeccionesData>({
    accionesVencidas:           [],
    accionesHoy:                [],
    altaPrioridadSinTocar:      [],
    respondieronSinSeguimiento: [],
    mensajeEnviadoSinRespuesta: [],
    enNegociacionSinActividad:  [],
    citasHoy:                   [],
  });
  const [loading,        setLoading       ] = useState(true);
  const [guardandoAccion, setGuardandoAccion] = useState<string | null>(null);
  const [citaParaRegistrar, setCitaParaRegistrar] = useState<CitaRow | null>(null);
  const [objetivos, setObjetivos] = useState<{ cierres: number; citas: number; cierresMes: number; citasMes: number } | null>(null);

  // ─── Get logged comercial ──────────────────────────────────────────────────
  useEffect(() => {
    async function obtenerComercial() {
      const { data: { session } } = await supabase.auth.getSession();
      const email = session?.user?.email;
      if (!email) { setComercialCargado(true); return; }
      const { data } = await supabase
        .from("comerciales")
        .select("id, nombre, objetivo_cierres_mes, objetivo_citas_mes")
        .eq("email", email)
        .single();
      setComercialId(data?.id ?? null);
      if (data?.nombre) setComercialNombre(data.nombre);
      setComercialCargado(true);

      if (data?.id) {
        const inicioMes = new Date(); inicioMes.setDate(1); inicioMes.setHours(0,0,0,0);
        const [{ count: cierresMes }, { count: citasMes }] = await Promise.all([
          supabase.from("leads").select("id", { count: "exact", head: true }).eq("comercial_asignado", data.id).eq("estado", "cerrado_ganado").gte("updated_at", inicioMes.toISOString()),
          supabase.from("appointments").select("id", { count: "exact", head: true }).eq("estado", "realizada").gte("fecha_hora", inicioMes.toISOString()),
        ]);
        if ((data.objetivo_cierres_mes ?? 0) > 0 || (data.objetivo_citas_mes ?? 0) > 0) {
          setObjetivos({ cierres: data.objetivo_cierres_mes ?? 0, citas: data.objetivo_citas_mes ?? 0, cierresMes: cierresMes ?? 0, citasMes: citasMes ?? 0 });
        }
      }
    }
    obtenerComercial();
  }, []);

  // ─── Load data ────────────────────────────────────────────────────────────
  const cargarDatos = useCallback(async () => {
    if (!comercialCargado) return;
    setLoading(true);
    try {
      const ahora = new Date();
      const hoyStr  = ahora.toISOString().split("T")[0];
      const mananaStr = addDays(ahora, 1).toISOString().split("T")[0];
      const hace3dias = new Date(ahora.getTime() - 3 * 86400000).toISOString();
      const hace4dias = new Date(ahora.getTime() - 4 * 86400000).toISOString();
      const hace24h   = new Date(ahora.getTime() - 86400000).toISOString();

      // Construir queries con filtro de comercial aplicado inline
      let qVencidas = supabase.from("leads").select(SELECT_LEAD)
        .lt("proxima_accion_fecha", ahora.toISOString())
        .not("proxima_accion", "is", null)
        .not("proxima_accion", "eq", "ninguna")
        .not("estado", "in", `(${ESTADOS_CERRADOS.join(",")})`)
        .order("proxima_accion_fecha", { ascending: true })
        .limit(20);
      if (comercialId) qVencidas = qVencidas.eq("comercial_asignado", comercialId);

      let qHoy = supabase.from("leads").select(SELECT_LEAD)
        .gte("proxima_accion_fecha", `${hoyStr}T00:00:00`)
        .lt("proxima_accion_fecha", `${mananaStr}T00:00:00`)
        .not("proxima_accion", "is", null)
        .not("proxima_accion", "eq", "ninguna")
        .not("estado", "in", `(${ESTADOS_CERRADOS.join(",")})`)
        .order("proxima_accion_fecha", { ascending: true })
        .limit(20);
      if (comercialId) qHoy = qHoy.eq("comercial_asignado", comercialId);

      // Sección 3: Alta prioridad o alto interés sin tocar en 24h
      // Reemplaza el antiguo "calientes sin tocar" que filtraba por temperatura
      let qAltaPrioridad = supabase.from("leads").select(SELECT_LEAD)
        .or("prioridad.eq.alta,nivel_interes.gte.7")
        .lt("updated_at", hace24h)
        .not("estado", "in", `(${ESTADOS_CERRADOS.join(",")})`)
        .not("estado", "eq", "cita_agendada")
        .is("proxima_accion", null)
        .order("nivel_interes", { ascending: false })
        .order("updated_at", { ascending: true })
        .limit(15);
      if (comercialId) qAltaPrioridad = qAltaPrioridad.eq("comercial_asignado", comercialId);

      let qRespondieron = supabase.from("leads").select(SELECT_LEAD)
        .eq("estado", "respondio")
        .lt("updated_at", hace3dias)
        .order("updated_at", { ascending: true })
        .limit(10);
      if (comercialId) qRespondieron = qRespondieron.eq("comercial_asignado", comercialId);

      let qMensajeEnviado = supabase.from("leads").select(SELECT_LEAD)
        .eq("estado", "mensaje_enviado")
        .lt("updated_at", hace4dias)
        .order("updated_at", { ascending: true })
        .limit(10);
      if (comercialId) qMensajeEnviado = qMensajeEnviado.eq("comercial_asignado", comercialId);

      // Leads en negociación sin actividad en 2+ días — los más cercanos al cierre
      const hace2dias = new Date(ahora.getTime() - 2 * 86400000).toISOString();
      let qNegociacion = supabase.from("leads").select(SELECT_LEAD)
        .eq("estado", "en_negociacion")
        .lt("updated_at", hace2dias)
        .order("nivel_interes", { ascending: false })
        .order("updated_at", { ascending: true })
        .limit(10);
      if (comercialId) qNegociacion = qNegociacion.eq("comercial_asignado", comercialId);

      const baseVencidas     = qVencidas;
      const baseHoy          = qHoy;
      const baseAltaPrioridad = qAltaPrioridad;
      const baseRespondieron = qRespondieron;
      const baseMensajeEnviado = qMensajeEnviado;

      // Citas: no filtramos por comercial aquí (puede que el lead no esté asignado todavía)
      const citasQuery = supabase
        .from("appointments")
        .select("id, tipo, estado, fecha_hora, lead_id, notas_previas, leads(nombre, apellidos, empresa, telefono_whatsapp)")
        .gte("fecha_hora", `${hoyStr}T00:00:00`)
        .lt("fecha_hora", `${hoyStr}T23:59:59`)
        .not("estado", "eq", "cancelada")
        .not("estado", "eq", "realizada")
        .order("fecha_hora", { ascending: true })
        .limit(10);

      const [r1, r2, r3, r4, r5, r6, r7] = await Promise.all([
        baseVencidas, baseHoy, baseAltaPrioridad,
        baseRespondieron, baseMensajeEnviado, citasQuery, qNegociacion,
      ]);

      setSeccionesData({
        accionesVencidas:           (r1.data as unknown as LeadRow[]) ?? [],
        accionesHoy:                (r2.data as unknown as LeadRow[]) ?? [],
        altaPrioridadSinTocar:      (r3.data as unknown as LeadRow[]) ?? [],
        respondieronSinSeguimiento: (r4.data as unknown as LeadRow[]) ?? [],
        mensajeEnviadoSinRespuesta: (r5.data as unknown as LeadRow[]) ?? [],
        citasHoy:                   (r6.data as unknown as CitaRow[]) ?? [],
        enNegociacionSinActividad:  (r7.data as unknown as LeadRow[]) ?? [],
      });
    } finally {
      setLoading(false);
    }
  }, [comercialCargado, comercialId]);

  useEffect(() => { cargarDatos(); }, [cargarDatos]);

  // ─── Team pulse (solo para gestores) ─────────────────────────────────────
  useEffect(() => {
    if (cargandoPermisos || !puede("gestionar_equipo")) return;
    async function cargarTeamPulse() {
      const ahora = new Date();
      const hoyStr = ahora.toISOString().split("T")[0];
      const hace2dias = new Date(ahora.getTime() - 2 * 86400000).toISOString();
      const hace3dias = new Date(ahora.getTime() - 3 * 86400000).toISOString();

      const { data: comerciales } = await supabase
        .from("comerciales")
        .select("id, nombre")
        .eq("activo", true)
        .order("nombre");
      if (!comerciales?.length) return;

      const items = await Promise.all(comerciales.map(async (c) => {
        const [vencidas, hoyQ, negoc, resp] = await Promise.all([
          supabase.from("leads").select("id", { count: "exact", head: true })
            .eq("comercial_asignado", c.id)
            .lt("proxima_accion_fecha", ahora.toISOString())
            .not("proxima_accion", "is", null)
            .not("proxima_accion", "eq", "ninguna")
            .not("estado", "in", "(cerrado_ganado,cerrado_perdido,descartado)"),
          supabase.from("leads").select("id", { count: "exact", head: true })
            .eq("comercial_asignado", c.id)
            .gte("proxima_accion_fecha", `${hoyStr}T00:00:00`)
            .lte("proxima_accion_fecha", `${hoyStr}T23:59:59`)
            .not("proxima_accion", "is", null),
          supabase.from("leads").select("id", { count: "exact", head: true })
            .eq("comercial_asignado", c.id)
            .eq("estado", "en_negociacion")
            .lt("updated_at", hace2dias),
          supabase.from("leads").select("id", { count: "exact", head: true })
            .eq("comercial_asignado", c.id)
            .eq("estado", "respondio")
            .lt("updated_at", hace3dias),
        ]);
        return {
          id: c.id,
          nombre: c.nombre,
          accionesVencidas: vencidas.count ?? 0,
          accionesHoy: hoyQ.count ?? 0,
          negociacionSinActividad: negoc.count ?? 0,
          respondieronSinSeguimiento: resp.count ?? 0,
        };
      }));
      setTeamPulse(items);
    }
    cargarTeamPulse();
  }, [cargandoPermisos, puede]);

  // ─── Actions ──────────────────────────────────────────────────────────────

  const accionRapida = useCallback(async (
    leadId: string,
    seccion: keyof SeccionesData,
    tipo: string,
    mensaje: string,
    nuevoEstado?: string,
    clearAccion?: boolean
  ) => {
    const key = `${leadId}-${tipo}`;
    setGuardandoAccion(key);
    try {
      await supabase.from("interactions").insert({
        lead_id: leadId, tipo: "nota_manual", mensaje, origen: "comercial",
      });
      if (nuevoEstado || clearAccion) {
        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (nuevoEstado) {
          updates.estado = nuevoEstado;
          if (TEMP_POR_ESTADO[nuevoEstado]) updates.temperatura = TEMP_POR_ESTADO[nuevoEstado];
        }
        if (clearAccion) { updates.proxima_accion = null; updates.proxima_accion_fecha = null; }
        await supabase.from("leads").update(updates).eq("id", leadId);
      }
      setAccionesGestionadas(n => n + 1);
      setSeccionesData(prev => {
        const updated = { ...prev };
        if (seccion !== "citasHoy") {
          (updated[seccion] as LeadRow[]) = (prev[seccion] as LeadRow[]).filter(l => l.id !== leadId);
        }
        return updated;
      });
    } finally {
      setGuardandoAccion(null);
    }
  }, []);

  const posponerAccion = useCallback(async (leadId: string, seccion: keyof SeccionesData, dias: number) => {
    const key = `${leadId}-posponer`;
    setGuardandoAccion(key);
    try {
      const nuevaFecha = addDays(new Date(), dias).toISOString();
      await Promise.all([
        supabase.from("leads").update({
          proxima_accion_fecha: nuevaFecha,
          updated_at: new Date().toISOString(),
        }).eq("id", leadId),
        supabase.from("interactions").insert({
          lead_id: leadId,
          tipo: "nota_manual",
          mensaje: `Acción pospuesta ${dias === 1 ? "1 día" : `${dias} días`}`,
          origen: "comercial",
        }),
      ]);
      setAccionesGestionadas(n => n + 1);
      setSeccionesData(prev => {
        const updated = { ...prev };
        if (seccion !== "citasHoy") {
          (updated[seccion] as LeadRow[]) = (prev[seccion] as LeadRow[]).filter(l => l.id !== leadId);
        }
        return updated;
      });
    } finally {
      setGuardandoAccion(null);
    }
  }, []);

  const accionCita = useCallback(async (citaId: string, leadId: string, nuevoEstado: string, mensaje: string) => {
    setGuardandoAccion(`cita-${citaId}`);
    try {
      await Promise.all([
        supabase.from("appointments").update({ estado: nuevoEstado, updated_at: new Date().toISOString() }).eq("id", citaId),
        supabase.from("interactions").insert({ lead_id: leadId, tipo: "nota_manual", mensaje, origen: "comercial" }),
      ]);
      setSeccionesData(prev => ({ ...prev, citasHoy: prev.citasHoy.filter(c => c.id !== citaId) }));
    } finally {
      setGuardandoAccion(null);
    }
  }, []);

  // ─── Guardar resultado de cita ───────────────────────────────────────────
  async function guardarResultadoCita(citaId: string, datos: {
    notas_post: string; resultado: string; proxima_accion: string;
    proxima_accion_nota: string; proxima_accion_fecha: string;
  }) {
    const cita = seccionesData.citasHoy.find(c => c.id === citaId);

    await supabase.from("appointments").update({
      estado: "realizada", notas_post: datos.notas_post, resultado: datos.resultado,
    }).eq("id", citaId);

    if (cita) {
      const leadUpdates: Record<string, string | null> = {
        proxima_accion: datos.proxima_accion !== "ninguna" ? datos.proxima_accion : null,
        proxima_accion_nota: datos.proxima_accion_nota || null,
        proxima_accion_fecha: datos.proxima_accion_fecha || null,
        updated_at: new Date().toISOString(),
        ...(datos.resultado === "cerrado_ganado" && { estado: "cerrado_ganado" }),
        ...(datos.resultado === "no_interesado" && { estado: "cerrado_perdido" }),
        ...(["interesado", "necesita_mas_info"].includes(datos.resultado) && { estado: "en_negociacion" }),
      };
      await Promise.all([
        supabase.from("interactions").insert({
          lead_id: cita.lead_id, tipo: "nota_manual",
          mensaje: `📋 Post-cita: ${datos.notas_post}`, origen: "comercial",
        }),
        supabase.from("leads").update(leadUpdates).eq("id", cita.lead_id),
      ]);
    }

    setAccionesGestionadas(n => n + 1);
    setSeccionesData(prev => ({ ...prev, citasHoy: prev.citasHoy.filter(c => c.id !== citaId) }));
    setCitaParaRegistrar(null);
  }

  // ─── Total tasks ─────────────────────────────────────────────────────────
  const totalTareas =
    seccionesData.accionesVencidas.length +
    seccionesData.accionesHoy.length +
    seccionesData.altaPrioridadSinTocar.length +
    seccionesData.respondieronSinSeguimiento.length +
    seccionesData.enNegociacionSinActividad.length +
    seccionesData.mensajeEnviadoSinRespuesta.length +
    seccionesData.citasHoy.length;

  // ─── Render ───────────────────────────────────────────────────────────────
  const hoy = new Date();
  const hora = hoy.getHours();
  const saludo = hora < 13 ? "Buenos días" : hora < 20 ? "Buenas tardes" : "Buenas noches";
  const emojiSaludo = hora < 13 ? "☀️" : hora < 20 ? "🌤" : "🌙";

  const FRASES_EXITO = [
    "Buen trabajo — tienes todo bajo control.",
    "Todo despejado. Hora de generar nuevas oportunidades.",
    "Sin pendientes. ¿A por nuevos leads?",
    "Impecable. El pipeline está en tus manos.",
  ];
  const fraseExito = FRASES_EXITO[hoy.getDay() % FRASES_EXITO.length];

  const resumenItems = [
    { label: "Vencidas",    count: seccionesData.accionesVencidas.length,           color: "#ef4444" },
    { label: "Hoy",         count: seccionesData.accionesHoy.length,                color: "#ea650d" },
    { label: "Alta prio",   count: seccionesData.altaPrioridadSinTocar.length,      color: "#d97706" },
    { label: "Respondieron",count: seccionesData.respondieronSinSeguimiento.length, color: "#16a34a" },
    { label: "Negociación", count: seccionesData.enNegociacionSinActividad.length,  color: "#7c3aed" },
    { label: "Sin resp.",   count: seccionesData.mensajeEnviadoSinRespuesta.length, color: "#2563eb" },
    { label: "Citas",       count: seccionesData.citasHoy.length,                   color: "#0d9488" },
  ].filter(i => i.count > 0);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-t-transparent" style={{ borderColor: "#ea650d", borderTopColor: "transparent" }} />
          <p className="text-sm text-slate-500">Cargando tareas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      {/* ── Header ── */}
      <div className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="mx-auto max-w-4xl">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-slate-900">
                {emojiSaludo} {saludo}, {comercialNombre}
              </h1>
              {totalTareas > 0 ? (
                <p className="mt-0.5 text-sm text-slate-500">
                  Tienes <span className="font-semibold text-slate-700">{totalTareas}</span> tareas pendientes para hoy
                  {!comercialId && (
                    <span className="ml-2 text-xs text-amber-600">(todos los comerciales)</span>
                  )}
                </p>
              ) : (
                <p className="mt-0.5 text-sm text-green-600 font-medium">Todo al día ✓ {fraseExito}</p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={cargarDatos}
                className="text-sm text-slate-400 hover:text-slate-700 transition-colors"
              >
                ↺
              </button>
              <div className="text-right">
                <p className="text-sm font-medium text-slate-700">{format(hoy, "EEEE d 'de' MMMM", { locale: es })}</p>
                <p className="text-xs text-slate-400">{format(hoy, "yyyy")}</p>
              </div>
            </div>
          </div>
          {/* ── Mini resumen por sección ── */}
          {(resumenItems.length > 0 || accionesGestionadas > 0) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {accionesGestionadas > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
                  style={{ background: "#dcfce7", color: "#16a34a" }}>
                  ✓ <span className="font-bold">{accionesGestionadas}</span> gestionada{accionesGestionadas !== 1 ? "s" : ""}
                </span>
              )}
              {resumenItems.map(item => (
                <span key={item.label}
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
                  style={{ background: item.color + "18", color: item.color }}>
                  <span className="font-bold">{item.count}</span>
                  {item.label}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-4xl space-y-4 px-4 pt-4">

        {/* ── Team Pulse (solo gestores) ── */}
        {!cargandoPermisos && puede("gestionar_equipo") && teamPulse.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700">Pulso del equipo hoy</h2>
              <Link href="/desempeno" className="text-xs text-slate-400 hover:text-orange-500 transition-colors">Ver desempeño →</Link>
            </div>
            <div className="divide-y divide-slate-50">
              {teamPulse.map(m => {
                const urgentes = m.accionesVencidas + m.negociacionSinActividad + m.respondieronSinSeguimiento;
                const sinProblemas = urgentes === 0 && m.accionesHoy === 0;
                return (
                  <div key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${urgentes > 0 ? "bg-red-400" : m.accionesHoy > 0 ? "bg-amber-400" : "bg-green-400"}`} />
                    <span className="text-sm font-medium text-slate-700 w-32 truncate">{m.nombre}</span>
                    <div className="flex gap-2 flex-wrap">
                      {m.accionesVencidas > 0 && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "#fee2e2", color: "#ef4444" }}>
                          {m.accionesVencidas} vencida{m.accionesVencidas !== 1 ? "s" : ""}
                        </span>
                      )}
                      {m.accionesHoy > 0 && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "#fff7ed", color: "#ea650d" }}>
                          {m.accionesHoy} para hoy
                        </span>
                      )}
                      {m.negociacionSinActividad > 0 && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "#ede9fe", color: "#7c3aed" }}>
                          {m.negociacionSinActividad} negoc. parada{m.negociacionSinActividad !== 1 ? "s" : ""}
                        </span>
                      )}
                      {m.respondieronSinSeguimiento > 0 && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "#dcfce7", color: "#16a34a" }}>
                          {m.respondieronSinSeguimiento} resp. sin seguimiento
                        </span>
                      )}
                      {sinProblemas && (
                        <span className="text-xs text-slate-400">Al día ✓</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Objetivos del mes ── */}
        {objetivos && (objetivos.cierres > 0 || objetivos.citas > 0) && (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-700">Objetivos del mes</h2>
              <span className="text-xs text-slate-400">{new Date().toLocaleString("es-ES", { month: "long" })}</span>
            </div>
            <div className="space-y-3">
              {objetivos.cierres > 0 && (() => {
                const pct = Math.min(100, Math.round((objetivos.cierresMes / objetivos.cierres) * 100));
                const atrasado = (() => { const ahora = new Date(); const dias = new Date(ahora.getFullYear(), ahora.getMonth()+1, 0).getDate(); const esperado = (ahora.getDate()/dias)*objetivos.cierres; return objetivos.cierresMes < esperado*0.8; })();
                return (
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-slate-600">Cierres</span>
                      <span className={`font-medium ${atrasado ? "text-red-500" : pct >= 100 ? "text-green-600" : "text-slate-700"}`}>{objetivos.cierresMes} / {objetivos.cierres}</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: pct >= 100 ? "#16a34a" : atrasado ? "#ef4444" : "#ea650d" }} />
                    </div>
                  </div>
                );
              })()}
              {objetivos.citas > 0 && (() => {
                const pct = Math.min(100, Math.round((objetivos.citasMes / objetivos.citas) * 100));
                const atrasado = (() => { const ahora = new Date(); const dias = new Date(ahora.getFullYear(), ahora.getMonth()+1, 0).getDate(); const esperado = (ahora.getDate()/dias)*objetivos.citas; return objetivos.citasMes < esperado*0.8; })();
                return (
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-slate-600">Citas realizadas</span>
                      <span className={`font-medium ${atrasado ? "text-red-500" : pct >= 100 ? "text-green-600" : "text-slate-700"}`}>{objetivos.citasMes} / {objetivos.citas}</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: pct >= 100 ? "#16a34a" : atrasado ? "#ef4444" : "#3b82f6" }} />
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* ── Empty state ── */}
        {totalTareas === 0 && (
          <div className="flex flex-col items-center justify-center rounded-xl border border-green-200 bg-green-50 py-14 px-8 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-3xl">🏆</div>
            <p className="text-lg font-semibold text-green-800">Todo al día</p>
            <p className="mt-1 text-sm text-green-600 max-w-sm">{fraseExito}</p>
            <div className="mt-6 flex flex-wrap gap-3 justify-center">
              <Link href="/leads?estado=nuevo"
                className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors"
                style={{ background: "#ea650d" }}>
                Ver leads nuevos →
              </Link>
              <Link href="/mensajes"
                className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium border border-slate-200 text-slate-600 hover:bg-white transition-colors">
                Revisar mensajes pendientes
              </Link>
              <Link href="/agenda"
                className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium border border-slate-200 text-slate-600 hover:bg-white transition-colors">
                Ver agenda
              </Link>
            </div>
          </div>
        )}

        {/* ── Sección 1: Acciones vencidas ── */}
        {seccionesData.accionesVencidas.length > 0 && (
          <SeccionCard color="red" titulo="Acciones vencidas" emoji="🔴" count={seccionesData.accionesVencidas.length}>
            {seccionesData.accionesVencidas.map(lead => {
              const diasVencido = lead.proxima_accion_fecha
                ? Math.floor((Date.now() - new Date(lead.proxima_accion_fecha).getTime()) / 86400000)
                : 0;
              const tel = telLimpio(lead.telefono_whatsapp ?? lead.telefono);
              return (
                <FilaLead key={lead.id}>
                  <div className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
                    <Link href={`/leads/${lead.id}`} className="lead-link font-medium truncate">
                      {nombreCompleto(lead)}
                      {lead.empresa && <span className="ml-1 font-normal text-slate-500">· {lead.empresa}</span>}
                    </Link>
                    {badgeAccion(lead.proxima_accion)}
                    <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                      venció hace {diasVencido === 0 ? "hoy" : `${diasVencido}d`}
                    </span>
                    {lead.proxima_accion_nota && (
                      <span className="truncate text-xs text-slate-400 max-w-[160px]">{lead.proxima_accion_nota}</span>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1.5">
                    {/* Botón contextual según tipo de acción */}
                    {lead.proxima_accion === "whatsapp" && tel && (
                      <a href={waUrl(tel, mensajeWA(lead, "seguimiento"))} target="_blank" rel="noopener noreferrer"
                        className="rounded px-2 py-1 text-xs font-medium bg-green-100 text-green-700 hover:bg-green-200 transition-colors"
                        onClick={() => accionRapida(lead.id, "accionesVencidas", "hecha", "WhatsApp enviado", undefined, true)}>
                        💬 WhatsApp
                      </a>
                    )}
                    {lead.proxima_accion === "llamar" && tel && (
                      <a href={`tel:+${tel.replace(/^\+/, "")}`}
                        className="rounded px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors"
                        onClick={() => accionRapida(lead.id, "accionesVencidas", "hecha", "Llamada realizada", undefined, true)}>
                        📞 Llamar
                      </a>
                    )}
                    <BtnAccion loading={guardandoAccion === `${lead.id}-hecha`}
                      onClick={() => accionRapida(lead.id, "accionesVencidas", "hecha", "Acción marcada como hecha", undefined, true)}
                      className="bg-green-100 text-green-700 hover:bg-green-200">
                      ✓ Hecha
                    </BtnAccion>
                    <BtnAccion loading={guardandoAccion === `${lead.id}-posponer`}
                      onClick={() => posponerAccion(lead.id, "accionesVencidas", 1)}
                      className="bg-slate-100 text-slate-600 hover:bg-slate-200">
                      ↻ +1 día
                    </BtnAccion>
                    <BtnAccion loading={guardandoAccion === `${lead.id}-no_cogio`}
                      onClick={() => accionRapida(lead.id, "accionesVencidas", "no_cogio", "Llamada: no cogió el teléfono")}
                      className="bg-slate-100 text-slate-600 hover:bg-slate-200">
                      📞 No cogió
                    </BtnAccion>
                  </div>
                </FilaLead>
              );
            })}
          </SeccionCard>
        )}

        {/* ── Sección 2: Hacer hoy ── */}
        {seccionesData.accionesHoy.length > 0 && (
          <SeccionCard color="orange" titulo="Hacer hoy" emoji="🟠" count={seccionesData.accionesHoy.length}>
            {seccionesData.accionesHoy.map(lead => {
              const horaAccion = lead.proxima_accion_fecha
                ? format(new Date(lead.proxima_accion_fecha), "HH:mm")
                : null;
              const tel = telLimpio(lead.telefono_whatsapp ?? lead.telefono);
              const cfgAccion = lead.proxima_accion ? ACCIONES_CONFIG[lead.proxima_accion] : null;
              return (
                <FilaLead key={lead.id}>
                  <div className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
                    <Link href={`/leads/${lead.id}`} className="lead-link font-medium truncate">
                      {nombreCompleto(lead)}
                      {lead.empresa && <span className="ml-1 font-normal text-slate-500">· {lead.empresa}</span>}
                    </Link>
                    {badgeAccion(lead.proxima_accion)}
                    {horaAccion && <span className="text-xs text-slate-500 font-mono">{horaAccion}</span>}
                    {lead.proxima_accion_nota && (
                      <span className="truncate text-xs text-slate-400 max-w-[160px]">{lead.proxima_accion_nota}</span>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1.5">
                    {/* Botón de acción principal según tipo */}
                    {lead.proxima_accion === "whatsapp" && tel && (
                      <a href={waUrl(tel, mensajeWA(lead, "seguimiento"))} target="_blank" rel="noopener noreferrer"
                        className={`rounded px-2 py-1 text-xs font-medium transition-colors ${cfgAccion?.color ?? ""}`}
                        onClick={() => accionRapida(lead.id, "accionesHoy", "hecha", "WhatsApp enviado", undefined, true)}>
                        💬 Enviar WA
                      </a>
                    )}
                    {lead.proxima_accion === "llamar" && tel && (
                      <a href={`tel:+${tel.replace(/^\+/, "")}`}
                        className={`rounded px-2 py-1 text-xs font-medium transition-colors ${cfgAccion?.color ?? ""}`}
                        onClick={() => accionRapida(lead.id, "accionesHoy", "hecha", "Llamada realizada", undefined, true)}>
                        📞 Llamar
                      </a>
                    )}
                    {lead.proxima_accion === "enviar_info" && (
                      <Link href={`/mensajes?lead=${lead.id}`}
                        className={`rounded px-2 py-1 text-xs font-medium transition-colors ${cfgAccion?.color ?? ""}`}>
                        📎 Generar mensaje
                      </Link>
                    )}
                    <BtnAccion loading={guardandoAccion === `${lead.id}-hecha`}
                      onClick={() => accionRapida(lead.id, "accionesHoy", "hecha", "Acción del día marcada como hecha", undefined, true)}
                      className="bg-green-100 text-green-700 hover:bg-green-200">
                      ✓ Hecha
                    </BtnAccion>
                  </div>
                </FilaLead>
              );
            })}
          </SeccionCard>
        )}

        {/* ── Sección 3: Alta prioridad sin tocar ── */}
        {/* Antes filtraba por temperatura='caliente' que siempre estaba vacío.
            Ahora usa nivel_interes >= 7 o prioridad = 'alta' sin proxima_accion asignada */}
        {seccionesData.altaPrioridadSinTocar.length > 0 && (
          <SeccionCard color="amber" titulo="Alta prioridad sin acción programada" emoji="⚡" count={seccionesData.altaPrioridadSinTocar.length}>
            {seccionesData.altaPrioridadSinTocar.map(lead => {
              const horas = lead.updated_at ? horasDesde(lead.updated_at) : 0;
              const tiempoLabel = horas < 24 ? `${horas}h` : `${Math.floor(horas / 24)}d`;
              const tel = telLimpio(lead.telefono_whatsapp ?? lead.telefono);
              return (
                <FilaLead key={lead.id}>
                  <div className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
                    <Link href={`/leads/${lead.id}`} className="lead-link font-medium truncate">
                      {nombreCompleto(lead)}
                      {lead.empresa && <span className="ml-1 font-normal text-slate-500">· {lead.empresa}</span>}
                    </Link>
                    {lead.sector && <span className="text-xs text-slate-400">{lead.sector}</span>}
                    <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                      sin acción · {tiempoLabel}
                    </span>
                    <span className="rounded px-2 py-0.5 text-xs" style={{ background: "#fff5f0", color: "#ea650d" }}>
                      {lead.nivel_interes}/10
                    </span>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1.5">
                    {tel && (
                      <a href={waUrl(tel, mensajeWA(lead, "primer_contacto"))} target="_blank" rel="noopener noreferrer"
                        className="rounded px-2 py-1 text-xs font-medium bg-green-100 text-green-700 hover:bg-green-200 transition-colors"
                        onClick={() => accionRapida(lead.id, "altaPrioridadSinTocar", "whatsapp", "WhatsApp enviado a lead alta prioridad")}>
                        💬 WhatsApp
                      </a>
                    )}
                    {tel && (
                      <a href={`tel:+${tel.replace(/^\+/, "")}`}
                        className="rounded px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors"
                        onClick={() => accionRapida(lead.id, "altaPrioridadSinTocar", "llamar", "Llamada realizada a lead alta prioridad")}>
                        📞 Llamar
                      </a>
                    )}
                    <Link href={`/leads/${lead.id}`}
                      className="rounded px-2 py-1 text-xs font-medium transition-colors hover:underline"
                      style={{ color: "#ea650d" }}>
                      → Ver
                    </Link>
                  </div>
                </FilaLead>
              );
            })}
          </SeccionCard>
        )}

        {/* ── Sección 4: Respondieron — seguir ── */}
        {seccionesData.respondieronSinSeguimiento.length > 0 && (
          <SeccionCard color="green" titulo="Respondieron — dar seguimiento" emoji="✅" count={seccionesData.respondieronSinSeguimiento.length}>
            {seccionesData.respondieronSinSeguimiento.map(lead => {
              const dias = lead.updated_at ? diasDesde(lead.updated_at) : 0;
              const tel = telLimpio(lead.telefono_whatsapp ?? lead.telefono);
              return (
                <FilaLead key={lead.id}>
                  <div className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
                    <Link href={`/leads/${lead.id}`} className="lead-link font-medium truncate">
                      {nombreCompleto(lead)}
                      {lead.empresa && <span className="ml-1 font-normal text-slate-500">· {lead.empresa}</span>}
                    </Link>
                    <span className="text-xs text-slate-500">respondió hace {dias === 0 ? "hoy" : `${dias}d`}</span>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1.5">
                    {tel && (
                      <a href={waUrl(tel, mensajeWA(lead, "seguimiento"))} target="_blank" rel="noopener noreferrer"
                        className="rounded px-2 py-1 text-xs font-medium bg-green-100 text-green-700 hover:bg-green-200 transition-colors"
                        onClick={() => accionRapida(lead.id, "respondieronSinSeguimiento", "whatsapp", "WhatsApp de seguimiento enviado")}>
                        💬 Responder
                      </a>
                    )}
                    <Link href={`/leads/${lead.id}`}
                      className="rounded px-2 py-1 text-xs font-medium transition-colors"
                      style={{ background: "#fff5f0", color: "#ea650d" }}>
                      📅 Agendar cita
                    </Link>
                    <Link href={`/leads/${lead.id}`}
                      className="rounded px-2 py-1 text-xs font-medium transition-colors hover:underline"
                      style={{ color: "#ea650d" }}>
                      → Ver
                    </Link>
                  </div>
                </FilaLead>
              );
            })}
          </SeccionCard>
        )}

        {/* ── Sección 5: En negociación sin actividad ── */}
        {seccionesData.enNegociacionSinActividad.length > 0 && (
          <SeccionCard color="violet" titulo="En negociación — revisar hoy" emoji="🤝" count={seccionesData.enNegociacionSinActividad.length}>
            {seccionesData.enNegociacionSinActividad.map(lead => {
              const dias = lead.updated_at ? diasDesde(lead.updated_at) : 0;
              const tel = telLimpio(lead.telefono_whatsapp ?? lead.telefono);
              return (
                <FilaLead key={lead.id}>
                  <div className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
                    <Link href={`/leads/${lead.id}`} className="lead-link font-medium truncate">
                      {nombreCompleto(lead)}
                      {lead.empresa && <span className="ml-1 font-normal text-slate-500">· {lead.empresa}</span>}
                    </Link>
                    {lead.sector && <span className="text-xs text-slate-400">{lead.sector}</span>}
                    <span className="rounded bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-700">
                      sin contacto · {dias}d
                    </span>
                    <span className="rounded px-2 py-0.5 text-xs" style={{ background: "#fff5f0", color: "#ea650d" }}>
                      {lead.nivel_interes}/10
                    </span>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1.5">
                    {tel && (
                      <a href={`tel:+${tel.replace(/^\+/, "")}`}
                        className="rounded px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors"
                        onClick={() => accionRapida(lead.id, "enNegociacionSinActividad", "llamar", "Llamada de seguimiento negociación")}>
                        📞 Llamar
                      </a>
                    )}
                    {tel && (
                      <a href={waUrl(tel, mensajeWA(lead, "negociacion"))} target="_blank" rel="noopener noreferrer"
                        className="rounded px-2 py-1 text-xs font-medium bg-green-100 text-green-700 hover:bg-green-200 transition-colors"
                        onClick={() => accionRapida(lead.id, "enNegociacionSinActividad", "whatsapp", "WhatsApp de seguimiento negociación")}>
                        💬 WhatsApp
                      </a>
                    )}
                    <Link href={`/leads/${lead.id}`}
                      className="rounded px-2 py-1 text-xs font-medium transition-colors hover:underline"
                      style={{ color: "#ea650d" }}>
                      → Ver
                    </Link>
                  </div>
                </FilaLead>
              );
            })}
          </SeccionCard>
        )}

        {/* ── Sección 6: Mensaje enviado sin respuesta ── */}
        {seccionesData.mensajeEnviadoSinRespuesta.length > 0 && (
          <SeccionCard color="blue" titulo="Enviado, sin respuesta" emoji="📩" count={seccionesData.mensajeEnviadoSinRespuesta.length}>
            {seccionesData.mensajeEnviadoSinRespuesta.map(lead => {
              const dias = lead.updated_at ? diasDesde(lead.updated_at) : 0;
              const tel = telLimpio(lead.telefono_whatsapp ?? lead.telefono);
              return (
                <FilaLead key={lead.id}>
                  <div className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
                    <Link href={`/leads/${lead.id}`} className="lead-link font-medium truncate">
                      {nombreCompleto(lead)}
                      {lead.empresa && <span className="ml-1 font-normal text-slate-500">· {lead.empresa}</span>}
                    </Link>
                    <span className="text-xs text-slate-500">hace {dias}d sin respuesta</span>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1.5">
                    {tel && (
                      <a href={waUrl(tel, mensajeWA(lead, "recordatorio"))} target="_blank" rel="noopener noreferrer"
                        className="rounded px-2 py-1 text-xs font-medium bg-green-100 text-green-700 hover:bg-green-200 transition-colors"
                        onClick={() => accionRapida(lead.id, "mensajeEnviadoSinRespuesta", "whatsapp", "Recordatorio enviado por WhatsApp")}>
                        💬 Recordatorio
                      </a>
                    )}
                    <BtnAccion loading={guardandoAccion === `${lead.id}-descartado`}
                      onClick={() => {
                        if (!confirm("¿Archivar este lead? Se marcará como descartado.")) return;
                        accionRapida(lead.id, "mensajeEnviadoSinRespuesta", "descartado", "Sin respuesta — marcado para revisión posterior");
                      }}
                      className="bg-slate-100 text-slate-500 hover:bg-slate-200">
                      Archivar
                    </BtnAccion>
                    <Link href={`/leads/${lead.id}`}
                      className="rounded px-2 py-1 text-xs font-medium transition-colors hover:underline"
                      style={{ color: "#ea650d" }}>
                      → Ver
                    </Link>
                  </div>
                </FilaLead>
              );
            })}
          </SeccionCard>
        )}

        {/* ── Sección 6: Citas de hoy ── */}
        {seccionesData.citasHoy.length > 0 && (
          <SeccionCard color="teal" titulo="Citas de hoy" emoji="📅" count={seccionesData.citasHoy.length}>
            {seccionesData.citasHoy.map(cita => {
              const lead = cita.leads;
              const hora = format(new Date(cita.fecha_hora), "HH:mm");
              const estadoStyle = ESTADO_CITA_STYLE[cita.estado] ?? "bg-slate-100 text-slate-600";
              const tel = lead ? telLimpio(lead.telefono_whatsapp) : null;
              return (
                <FilaLead key={cita.id}>
                  <div className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
                    <span className="font-mono text-sm font-semibold text-slate-700 bg-slate-100 rounded px-2 py-0.5">
                      {hora}
                    </span>
                    <span className="text-xs text-slate-500">{TIPO_CITA_LABEL[cita.tipo] ?? cita.tipo}</span>
                    {lead && (
                      <Link href={`/leads/${cita.lead_id}`} className="lead-link font-medium truncate">
                        {nombreCompleto(lead)}
                        {lead.empresa && <span className="ml-1 font-normal text-slate-500">· {lead.empresa}</span>}
                      </Link>
                    )}
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${estadoStyle}`}>
                      {cita.estado.replace(/_/g, " ")}
                    </span>
                    {cita.notas_previas && (
                      <span className="text-xs text-slate-400 italic truncate max-w-[200px]">{cita.notas_previas}</span>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1.5">
                    {tel && (
                      <a href={`https://wa.me/${tel}?text=${encodeURIComponent(`Hola${cita.leads?.nombre ? ` ${cita.leads.nombre}` : ""}, te recuerdo que tenemos cita hoy. ¿Confirmas?`)}`} target="_blank" rel="noopener noreferrer"
                        className="rounded px-2 py-1 text-xs font-medium bg-green-100 text-green-700 hover:bg-green-200 transition-colors">
                        💬 WA
                      </a>
                    )}
                    <BtnAccion loading={guardandoAccion === `cita-${cita.id}`}
                      onClick={() => setCitaParaRegistrar(cita)}
                      className="bg-green-100 text-green-700 hover:bg-green-200">
                      ✓ Registrar resultado
                    </BtnAccion>
                    <BtnAccion loading={guardandoAccion === `cita-noshow-${cita.id}`}
                      onClick={() => accionCita(cita.id, cita.lead_id, "no_show", "Cita: no show")}
                      className="bg-red-100 text-red-700 hover:bg-red-200">
                      ✗ No show
                    </BtnAccion>
                    <Link href={`/leads/${cita.lead_id}`}
                      className="rounded px-2 py-1 text-xs font-medium transition-colors hover:underline"
                      style={{ color: "#ea650d" }}>
                      → Ver ficha
                    </Link>
                  </div>
                </FilaLead>
              );
            })}
          </SeccionCard>
        )}

      </div>

      {/* ─── Modal post-cita ──────────────────────────────────────────────── */}
      {citaParaRegistrar && (
        <ModalPostCitaHoy
          cita={citaParaRegistrar}
          onGuardar={guardarResultadoCita}
          onCerrar={() => setCitaParaRegistrar(null)}
        />
      )}
    </div>
  );
}

// ─── ModalPostCitaHoy ─────────────────────────────────────────────────────────

function ModalPostCitaHoy({ cita, onGuardar, onCerrar }: {
  cita: CitaRow;
  onGuardar: (citaId: string, datos: { notas_post: string; resultado: string; proxima_accion: string; proxima_accion_nota: string; proxima_accion_fecha: string }) => Promise<void>;
  onCerrar: () => void;
}) {
  const nombre = [cita.leads?.nombre, cita.leads?.apellidos].filter(Boolean).join(" ") || "Lead";
  const [resultado, setResultado] = useState("interesado");
  const [notasPost, setNotasPost] = useState("");
  const [proximaAccion, setProximaAccion] = useState("llamar");
  const [proximaNota, setProximaNota] = useState("");
  const [proximaFecha, setProximaFecha] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  async function handleGuardar() {
    if (!notasPost.trim()) { setError("Escribe al menos una nota sobre cómo fue la cita."); return; }
    setGuardando(true);
    await onGuardar(cita.id, { notas_post: notasPost, resultado, proxima_accion: proximaAccion, proxima_accion_nota: proximaNota, proxima_accion_fecha: proximaFecha });
    setGuardando(false);
  }

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "rgba(0,0,0,0.5)", zIndex: 9999 }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-800">Resultado de la cita</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {nombre}{cita.leads?.empresa ? ` · ${cita.leads.empresa}` : ""} · {format(parseISO(cita.fecha_hora), "d MMM · HH:mm", { locale: es })}
          </p>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 block">¿Cómo fue?</label>
            <div className="space-y-1.5">
              {RESULTADOS_CITA.map(r => (
                <button key={r.value} onClick={() => setResultado(r.value)}
                  className={`w-full text-left text-sm px-3 py-2 rounded-lg border transition-colors ${resultado === r.value ? "font-medium" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                  style={resultado === r.value ? { background: "#fff5f0", borderColor: "#f5a677", color: "#c2530b" } : undefined}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">
              Nota post-cita <span className="text-red-400">*</span>
            </label>
            <textarea value={notasPost} onChange={e => { setNotasPost(e.target.value); setError(""); }} rows={3}
              placeholder="¿Qué se habló? ¿Qué le interesó? ¿Qué objeciones hubo?..."
              className={`w-full text-sm border rounded-lg px-3 py-2 resize-none focus:outline-none ${error ? "border-red-300 focus:border-red-400" : "border-slate-200 focus:border-orange-300"}`} />
            {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Próxima acción</label>
            <select value={proximaAccion} onChange={e => setProximaAccion(e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-orange-300">
              {PROXIMAS_ACCIONES_POST.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
            {proximaAccion !== "ninguna" && (
              <div className="space-y-1.5 mt-1.5">
                <input type="datetime-local" value={proximaFecha} onChange={e => setProximaFecha(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-orange-300" />
                <input type="text" value={proximaNota} onChange={e => setProximaNota(e.target.value)}
                  placeholder="Nota opcional"
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-orange-300" />
              </div>
            )}
          </div>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex gap-3">
          <button onClick={handleGuardar} disabled={guardando}
            className="flex-1 py-2.5 text-white text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors" style={{ background: "#ea650d" }}>
            {guardando ? "Guardando..." : "Guardar resultado"}
          </button>
          <button onClick={onCerrar} className="px-4 py-2.5 border border-slate-200 text-slate-600 text-sm rounded-xl hover:bg-slate-50">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const SECTION_COLORS: Record<string, { header: string; border: string; badge: string }> = {
  red:    { header: "bg-red-50 border-red-200",       border: "border-red-200",    badge: "bg-red-100 text-red-700"    },
  orange: { header: "bg-orange-50 border-orange-200", border: "border-orange-200", badge: "bg-orange-100 text-orange-700" },
  amber:  { header: "bg-amber-50 border-amber-200",   border: "border-amber-200",  badge: "bg-amber-100 text-amber-700"  },
  green:  { header: "bg-green-50 border-green-200",   border: "border-green-200",  badge: "bg-green-100 text-green-700"  },
  blue:   { header: "bg-blue-50 border-blue-200",     border: "border-blue-200",   badge: "bg-blue-100 text-blue-700"    },
  teal:   { header: "bg-teal-50 border-teal-200",     border: "border-teal-200",   badge: "bg-teal-100 text-teal-700"    },
  violet: { header: "bg-violet-50 border-violet-200", border: "border-violet-200", badge: "bg-violet-100 text-violet-700" },
};

function SeccionCard({ color, titulo, emoji, count, children }: {
  color: string; titulo: string; emoji: string; count: number; children: React.ReactNode;
}) {
  const c = SECTION_COLORS[color] ?? SECTION_COLORS.blue;
  return (
    <div className={`overflow-hidden rounded-xl border ${c.border} bg-white shadow-sm`}>
      <div className={`flex items-center justify-between px-4 py-3 border-b ${c.header}`}>
        <h2 className="text-sm font-semibold text-slate-800">{emoji} {titulo}</h2>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${c.badge}`}>{count}</span>
      </div>
      <div className="divide-y divide-slate-100">{children}</div>
    </div>
  );
}

function FilaLead({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors">
      {children}
    </div>
  );
}

function BtnAccion({ children, onClick, className, loading }: {
  children: React.ReactNode; onClick: () => void; className: string; loading: boolean;
}) {
  return (
    <button onClick={onClick} disabled={loading}
      className={`rounded px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${className}`}>
      {loading ? (
        <span className="inline-flex items-center gap-1">
          <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          ...
        </span>
      ) : children}
    </button>
  );
}
