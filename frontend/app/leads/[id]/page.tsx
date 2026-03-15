"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { supabase } from "@/lib/supabase";
import type { Lead, Interaction, Appointment } from "@/lib/supabase";
import { TemperaturaBadge } from "@/components/TemperaturaBadge";
import { PrioridadBadge } from "@/components/PrioridadBadge";
import { NivelInteresBar } from "@/components/NivelInteresBar";
import { FuenteBadge } from "@/components/FuenteBadge";

const PRODUCTOS_NOMBRE: Record<string, string> = {
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
};

const ESTADOS = [
  { value: "nuevo", label: "Nuevo", class: "bg-slate-100 text-slate-600" },
  { value: "enriquecido", label: "Enriquecido", class: "bg-blue-100 text-blue-600" },
  { value: "segmentado", label: "Segmentado", class: "bg-indigo-100 text-indigo-600" },
  { value: "mensaje_enviado", label: "Msg. Enviado", class: "bg-violet-100 text-violet-600" },
  { value: "respondio", label: "Respondió", class: "bg-amber-100 text-amber-700" },
  { value: "cita_agendada", label: "Cita Agendada", class: "bg-green-100 text-green-700" },
  { value: "en_negociacion", label: "En Negociación", class: "bg-emerald-100 text-emerald-700" },
  { value: "cerrado_ganado", label: "Cerrado Ganado", class: "bg-green-600 text-white" },
  { value: "cerrado_perdido", label: "Cerrado Perdido", class: "bg-red-100 text-red-600" },
  { value: "descartado", label: "Descartado", class: "bg-slate-100 text-slate-400" },
];

const TEMPERATURA_POR_ESTADO: Record<string, string> = {
  nuevo:           "frio",
  enriquecido:     "frio",
  segmentado:      "frio",
  mensaje_enviado: "frio",
  respondio:       "templado",
  cita_agendada:   "caliente",
  en_negociacion:  "caliente",
};

function prioridadDeNivel(nivel: number): "alta" | "media" | "baja" {
  if (nivel >= 8) return "alta";
  if (nivel >= 5) return "media";
  return "baja";
}

const ACCIONES_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  llamar:           { label: "Llamar",          icon: "📞", color: "text-blue-700 bg-blue-50 border-blue-200" },
  whatsapp:         { label: "WhatsApp",         icon: "💬", color: "text-green-700 bg-green-50 border-green-200" },
  email:            { label: "Email",            icon: "📧", color: "text-violet-700 bg-violet-50 border-violet-200" },
  esperar_respuesta:{ label: "Esperar respuesta",icon: "⏳", color: "text-amber-700 bg-amber-50 border-amber-200" },
  enviar_info:      { label: "Enviar info",      icon: "📎", color: "text-slate-700 bg-slate-50 border-slate-200" },
  reunion:          { label: "Reunión",          icon: "📅", color: "text-indigo-700 bg-indigo-50 border-indigo-200" },
};

// ── Inteligencia de sector ──────────────────────────────────────────────────
type SectorIntel = {
  horario: string;
  ticketMin: number;
  ticketMax: number;
  scriptApertura: string;
  objeciones: { obj: string; respuesta: string }[];
  templatesMensaje: { label: string; texto: (nombre: string, empresa: string, ciudad: string) => string }[];
};

const INTEL_POR_SECTOR: Record<string, SectorIntel> = {
  hosteleria: {
    horario: "10:00–12:00 (antes del servicio de comidas)",
    ticketMin: 180, ticketMax: 420,
    scriptApertura: "Hola [nombre], soy Manuel, trabajo con autónomos de hostelería en [ciudad]. Muchos no saben que existe un seguro desde 5€/mes que te cubre el día que no puedes trabajar — porque si tú no trabajas, el negocio para. ¿Tienes 5 minutos?",
    objeciones: [
      { obj: "No tengo tiempo ahora", respuesta: "Entiendo, ¿cuándo te va mejor? No me lleva más de 10 minutos explicarte cómo funciona." },
      { obj: "Ya tengo seguro / no me interesa", respuesta: "¿Es un seguro de baja laboral desde el primer día? Muchos autónomos tienen seguro de local pero no de su propia baja — que es el riesgo más real." },
    ],
    templatesMensaje: [
      { label: "Baja autónomo", texto: (n, e, c) => `Hola ${n}, soy Manuel, asesor en ${c}. Trabajas en hostelería y seguramente no tienes cubierto el día que te pongas enfermo. Contigo Autónomo cubre desde el primer día de baja desde ~5€/mes. ¿Te cuento en 5 minutos cómo funciona?` },
      { label: "SIALP ahorro", texto: (n, e, c) => `Hola ${n}! Soy Manuel, asesor financiero en ${c}. Para autónomos de hostelería hay un plan de ahorro con ventaja fiscal que te permite deducirte hasta 24.250€/año. ¿Lo conoces? Vale la pena que lo veamos.` },
    ],
  },
  inmobiliaria: {
    horario: "10:00–13:00 (mañanas entre visitas)",
    ticketMin: 600, ticketMax: 2000,
    scriptApertura: "Hola [nombre], soy Manuel, asesor financiero en [ciudad]. Trabajo con inmobiliarias en acuerdos de derivación hipotecaria — cuando tu cliente necesita hipoteca, vosotros generáis una comisión sin hacer nada extra. El mes pasado la media fue 900€ por operación. ¿15 minutos esta semana?",
    objeciones: [
      { obj: "Ya tenemos acuerdo con otra entidad", respuesta: "Perfecto, esto no interfiere con ningún banco. Es un acuerdo independiente de derivación — cuantos más canales, más comisiones. ¿Lo comparamos?" },
      { obj: "No me interesa / no tenemos tiempo", respuesta: "Entiendo. Solo te pido 15 minutos para explicarte las condiciones. Si no encaja, no hay ningún problema. ¿La semana que viene?" },
    ],
    templatesMensaje: [
      { label: "Derivación hipotecaria", texto: (n, e, c) => `Hola ${n}, soy Manuel, asesor financiero en ${c}. Vi que ${e || "vuestra inmobiliaria"} trabaja en la zona y quería comentarte algo sobre generar ingresos adicionales derivando clientes hipotecarios. Sin trabajo extra para vosotros. ¿Tiene sentido que hablemos 15 min?` },
      { label: "Seguimiento", texto: (n, e, c) => `Hola ${n}, soy Manuel de nuevo. Te escribí sobre comisiones por derivación hipotecaria para ${e || "tu inmobiliaria"}. Entiendo que estáis ocupados — ¿me dices si no es el momento y lo cerramos?` },
    ],
  },
  asesoria: {
    horario: "09:00–11:00 o 16:00–18:00",
    ticketMin: 300, ticketMax: 1500,
    scriptApertura: "Hola [nombre], soy Manuel. Trabajo con asesorías para ofrecer a sus clientes autónomos una cobertura de baja desde el primer día — algo que muchos autónomos necesitan y que la mayoría de asesorías no ofrecen. ¿Podríamos explorar si encaja en vuestra cartera de servicios?",
    objeciones: [
      { obj: "Ya ofrecemos seguros", respuesta: "¿Tenéis específicamente el seguro de baja laboral para autónomos desde el primer día? Es diferente al RETA — cubre desde la primera hora de baja. Muchos autónomos no lo tienen." },
      { obj: "No tenemos tiempo para esto", respuesta: "Entiendo. Una reunión de 20 minutos para ver si encaja — si no, no te molesto más. ¿Cuándo tienes un hueco?" },
    ],
    templatesMensaje: [
      { label: "Servicio para clientes", texto: (n, e, c) => `Hola ${n}, soy Manuel. Trabajo con asesorías como ${e || "la vuestra"} para añadir a su cartera un seguro de baja para autónomos desde el 1er día. Es algo que la mayoría de vuestros clientes autónomos necesitan y no tienen. ¿Podemos hablar 20 minutos?` },
    ],
  },
  clinica: {
    horario: "08:30–10:00 o 14:00–16:00 (antes/después de consultas)",
    ticketMin: 400, ticketMax: 2500,
    scriptApertura: "Hola [nombre], soy Manuel. Para profesionales sanitarios autónomos hay coberturas específicas de incapacidad temporal desde el primer día — especialmente relevante si sois dueños de la clínica. ¿Tenéis eso cubierto?",
    objeciones: [
      { obj: "Ya tenemos seguro del colegio", respuesta: "El del colegio cubre responsabilidad civil, no tu baja laboral personal. Si mañana te pones enfermo y no puedes trabajar, ¿quién cubre los gastos fijos de la clínica?" },
    ],
    templatesMensaje: [
      { label: "Protección propietario", texto: (n, e, c) => `Hola ${n}, soy Manuel, asesor financiero. Para propietarios de clínicas hay una cobertura específica que protege los ingresos de la clínica si tú no puedes trabajar. ¿Lo tenéis cubierto en ${e || "vuestra clínica"}?` },
    ],
  },
  taller: {
    horario: "08:00–10:00 (antes de abrir o a primera hora)",
    ticketMin: 150, ticketMax: 400,
    scriptApertura: "Hola [nombre], soy Manuel. Para autónomos de talleres hay un seguro desde 4€/mes que cubre la baja desde el primer día. Si tú paras, el taller para — ¿tienes eso cubierto?",
    objeciones: [
      { obj: "Es muy caro / no puedo permitírmelo", respuesta: "Desde 4€ al mes. Si un día de baja te cuesta 200€ en ingresos perdidos + gastos fijos, ¿no merece la pena asegurarlo por 4€?" },
    ],
    templatesMensaje: [
      { label: "Baja desde 4€/mes", texto: (n, e, c) => `Hola ${n}! Soy Manuel, asesor en ${c}. Para mecánicos autónomos hay un seguro desde 4€/mes que cubre la baja desde el primer día. Si no trabajas, no cobras — ¿lo tienes cubierto? Te cuento en 5 minutos.` },
    ],
  },
  peluqueria: {
    horario: "09:00–10:30 (antes de las primeras citas)",
    ticketMin: 120, ticketMax: 350,
    scriptApertura: "Hola [nombre], soy Manuel. Para autónomos del sector belleza hay un seguro muy económico que cubre si un día no puedes trabajar — porque si estás de baja y no cortas el pelo, no cobras. ¿Tienes eso cubierto?",
    objeciones: [
      { obj: "Ahora no puedo / estoy con clientes", respuesta: "Ningún problema, ¿a qué hora te viene bien? Solo son 10 minutos." },
    ],
    templatesMensaje: [
      { label: "Cobertura baja", texto: (n, e, c) => `Hola ${n}, soy Manuel. Trabajo con autónomos de peluquería y estética en ${c}. Muchos no tienen cubierto qué pasa si se ponen enfermos — hay una opción desde 4€/mes. ¿Te lo cuento?` },
    ],
  },
};

function getSectorIntel(sector: string | null, tipoLead: string | null): SectorIntel | null {
  if (!sector) return null;
  const s = sector.toLowerCase();
  if (s.includes("hostel") || s.includes("restaur") || s.includes("bar") || s.includes("café") || s.includes("cafe")) return INTEL_POR_SECTOR.hosteleria;
  if (s.includes("inmobil")) return INTEL_POR_SECTOR.inmobiliaria;
  if (s.includes("asesor") || s.includes("gestor") || s.includes("contab")) return INTEL_POR_SECTOR.asesoria;
  if (s.includes("clínica") || s.includes("clinica") || s.includes("médic") || s.includes("medic") || s.includes("salud") || s.includes("dental")) return INTEL_POR_SECTOR.clinica;
  if (s.includes("taller") || s.includes("mecán") || s.includes("mecan")) return INTEL_POR_SECTOR.taller;
  if (s.includes("peluq") || s.includes("estétic") || s.includes("estetic") || s.includes("belleza")) return INTEL_POR_SECTOR.peluqueria;
  return null;
}

function getTicketEstimado(tipoLead: string | null, numEmpleados: number | null, intel: SectorIntel): { min: number; max: number } {
  let mul = 1;
  if (tipoLead === "pyme" || (numEmpleados && numEmpleados > 5)) mul = 2.5;
  else if (tipoLead === "empresa" || (numEmpleados && numEmpleados > 20)) mul = 5;
  return { min: Math.round(intel.ticketMin * mul), max: Math.round(intel.ticketMax * mul) };
}

const MOTIVOS_PERDIDA = [
  { value: "precio", label: "Precio — no encaja con su presupuesto" },
  { value: "competencia", label: "Competencia — contrató con otro" },
  { value: "no_interesado", label: "No interesado — no necesita el producto" },
  { value: "timing", label: "Timing — no es el momento" },
  { value: "sin_contacto", label: "Sin contacto — no ha respondido" },
  { value: "otro", label: "Otro" },
];

function getUrgenciaAccion(fecha: string | null): { label: string; colorClass: string } | null {
  if (!fecha) return null;
  const diff = new Date(fecha).getTime() - Date.now();
  const horas = diff / (1000 * 60 * 60);
  if (horas < 0) {
    const dias = Math.abs(Math.ceil(horas / 24));
    return { label: dias === 1 ? "Venció ayer" : `Venció hace ${dias} días`, colorClass: "text-red-600 bg-red-50 border-red-200" };
  }
  if (horas < 24) return { label: `Hoy a las ${new Date(fecha).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}`, colorClass: "text-orange-600 bg-orange-50 border-orange-200" };
  return { label: new Date(fecha).toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }), colorClass: "text-emerald-700 bg-emerald-50 border-emerald-200" };
}

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [lead, setLead] = useState<Lead | null>(null);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mensajeWhatsapp, setMensajeWhatsapp] = useState("");
  const [mostrarEnvio, setMostrarEnvio] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [editando, setEditando] = useState(false);
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Lead>>({});
  const [guardadoOk, setGuardadoOk] = useState(false);
  const [comerciales, setComerciales] = useState<{ id: string; nombre: string; apellidos: string | null }[]>([]);
  const [mostrarNuevaCita, setMostrarNuevaCita] = useState(false);
  const [citaForm, setCitaForm] = useState({
    tipo: "llamada" as "llamada" | "videollamada" | "reunion_presencial",
    fecha_hora: "",
    duracion_minutos: 30,
    notas_previas: "",
    comercial_id: "",
  });
  const [guardandoCita, setGuardandoCita] = useState(false);

  // Post-cita
  const [citaParaRegistrar, setCitaParaRegistrar] = useState<Appointment | null>(null);
  const [postCitaForm, setPostCitaForm] = useState({ resultado: "interesado", notas_post: "", proxima_accion: "llamar", proxima_accion_nota: "" });
  const [errorPostCita, setErrorPostCita] = useState("");
  const [guardandoPostCita, setGuardandoPostCita] = useState(false);

  // Motivo de pérdida
  const [estadoPendiente, setEstadoPendiente] = useState<string | null>(null);
  const [motivoForm, setMotivoForm] = useState({ motivo: "precio", nota: "" });
  const [guardandoMotivo, setGuardandoMotivo] = useState(false);

  // Cliente
  const [clienteExistente, setClienteExistente] = useState<{ id: string } | null | undefined>(undefined);
  const [creandoCliente, setCreandoCliente] = useState(false);

  // Próxima acción
  const [editandoAccion, setEditandoAccion] = useState(false);
  const [accionForm, setAccionForm] = useState<{
    proxima_accion: string;
    proxima_accion_fecha: string;
    proxima_accion_nota: string;
  }>({ proxima_accion: "llamar", proxima_accion_fecha: "", proxima_accion_nota: "" });
  const [guardandoAccion, setGuardandoAccion] = useState(false);

  // Estado history + IA
  const [stateHistory, setStateHistory] = useState<{ id: string; estado_anterior: string; estado_nuevo: string; created_at: string }[]>([]);
  const [generandoMensajeIA, setGenerandoMensajeIA] = useState(false);

  const cargarComerciales = useCallback(async () => {
    const { data } = await supabase.from("comerciales").select("id, nombre, apellidos").eq("activo", true).order("nombre");
    setComerciales((data as { id: string; nombre: string; apellidos: string | null }[]) ?? []);
  }, []);

  useEffect(() => {
    async function cargar() {
      const [leadRes, interRes, apptRes, clienteRes, historyRes] = await Promise.all([
        supabase.from("leads").select("*").eq("id", id).single(),
        supabase.from("interactions").select("*").eq("lead_id", id).order("created_at"),
        supabase.from("appointments").select("*").eq("lead_id", id).order("fecha_hora"),
        supabase.from("clientes").select("id").eq("lead_id", id).maybeSingle(),
        supabase.from("lead_state_history").select("id, estado_anterior, estado_nuevo, created_at").eq("lead_id", id).order("created_at"),
      ]);
      setLead(leadRes.data as Lead);
      setInteractions((interRes.data as Interaction[]) ?? []);
      setAppointments((apptRes.data as Appointment[]) ?? []);
      setClienteExistente(clienteRes.data as { id: string } | null);
      setStateHistory((historyRes.data as { id: string; estado_anterior: string; estado_nuevo: string; created_at: string }[]) ?? []);
      setLoading(false);
    }
    cargar();
    cargarComerciales();
  }, [id, cargarComerciales]);

  function abrirEdicion() {
    if (!lead) return;
    setEditForm({
      nombre: lead.nombre ?? "",
      apellidos: lead.apellidos ?? "",
      email: lead.email ?? "",
      telefono: lead.telefono ?? "",
      telefono_whatsapp: lead.telefono_whatsapp ?? "",
      empresa: lead.empresa ?? "",
      cargo: lead.cargo ?? "",
      sector: lead.sector ?? "",
      ciudad: lead.ciudad ?? "",
      estado: lead.estado,
      temperatura: lead.temperatura,
      nivel_interes: lead.nivel_interes,
      prioridad: lead.prioridad,
      notas: lead.notas ?? "",
      comercial_asignado: lead.comercial_asignado ?? "",
    });
    setEditando(true);
  }

  async function guardarEdicion() {
    if (!lead) return;
    setGuardandoEdicion(true);
    await supabase.from("leads").update({
      ...editForm,
      updated_at: new Date().toISOString(),
    }).eq("id", lead.id);
    setLead(prev => prev ? { ...prev, ...editForm } : prev);
    setEditando(false);
    setGuardandoEdicion(false);
    setGuardadoOk(true);
    setTimeout(() => setGuardadoOk(false), 2500);
  }

  async function cambiarEstado(nuevoEstado: string) {
    if (!lead) return;
    if (nuevoEstado === "cerrado_perdido" || nuevoEstado === "descartado") {
      setEstadoPendiente(nuevoEstado);
      setMotivoForm({ motivo: "precio", nota: "" });
      return;
    }
    const temperatura = TEMPERATURA_POR_ESTADO[nuevoEstado] as Lead["temperatura"] | undefined;
    const updates: Partial<Lead> & { updated_at: string } = { estado: nuevoEstado as Lead["estado"], updated_at: new Date().toISOString() };
    if (temperatura) updates.temperatura = temperatura;
    await supabase.from("leads").update(updates).eq("id", lead.id);
    supabase.from("lead_state_history").insert({ lead_id: lead.id, estado_anterior: lead.estado, estado_nuevo: nuevoEstado, comercial_id: lead.comercial_asignado });
    setLead(prev => prev ? { ...prev, ...updates } : prev);
    setGuardadoOk(true);
    setTimeout(() => setGuardadoOk(false), 2000);
  }

  async function confirmarMotivoPerdida() {
    if (!lead || !estadoPendiente) return;
    setGuardandoMotivo(true);
    await supabase.from("leads").update({
      estado: estadoPendiente,
      motivo_perdida: motivoForm.motivo as Lead["motivo_perdida"],
      motivo_perdida_nota: motivoForm.nota.trim() || null,
      updated_at: new Date().toISOString(),
    }).eq("id", lead.id);
    supabase.from("lead_state_history").insert({ lead_id: lead.id, estado_anterior: lead.estado, estado_nuevo: estadoPendiente, comercial_id: lead.comercial_asignado });
    if (motivoForm.nota.trim()) {
      await supabase.from("interactions").insert({
        lead_id: lead.id,
        tipo: "nota_manual",
        mensaje: `❌ Motivo de ${estadoPendiente === "descartado" ? "descarte" : "pérdida"}: ${MOTIVOS_PERDIDA.find(m => m.value === motivoForm.motivo)?.label}${motivoForm.nota.trim() ? ` — ${motivoForm.nota.trim()}` : ""}`,
        origen: "comercial",
        sentimiento: "negativo",
        señal_escalado: false,
        created_at: new Date().toISOString(),
      });
    }
    setLead(prev => prev ? { ...prev, estado: estadoPendiente as Lead["estado"], motivo_perdida: motivoForm.motivo as Lead["motivo_perdida"], motivo_perdida_nota: motivoForm.nota.trim() || null } : prev);
    setEstadoPendiente(null);
    setGuardandoMotivo(false);
    setGuardadoOk(true);
    setTimeout(() => setGuardadoOk(false), 2000);
  }

  async function crearClienteDesdeGanado() {
    if (!lead) return;
    setCreandoCliente(true);
    const { data } = await supabase.from("clientes").insert({
      lead_id: lead.id,
      nombre: lead.nombre,
      apellidos: lead.apellidos,
      email: lead.email,
      telefono: lead.telefono ?? lead.telefono_whatsapp,
      empresa: lead.empresa,
      comercial_asignado: lead.comercial_asignado,
      producto: lead.producto_interes_principal ?? (lead.productos_recomendados?.[0] ?? null),
      fecha_inicio: new Date().toISOString().split("T")[0],
    }).select("id").single();
    if (data) setClienteExistente(data as { id: string });
    setCreandoCliente(false);
  }

  async function guardarNota() {
    if (!nota.trim() || !lead) return;
    setGuardando(true);
    await supabase.from("interactions").insert({
      lead_id: lead.id,
      tipo: "nota_manual",
      mensaje: nota,
      origen: "comercial",
    });
    setInteractions((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        lead_id: lead.id,
        tipo: "nota_manual",
        mensaje: nota,
        origen: "comercial",
        sentimiento: null,
        señal_escalado: false,
        created_at: new Date().toISOString(),
      } as Interaction,
    ]);
    setNota("");
    setGuardando(false);
  }

  async function crearCita() {
    if (!lead || !citaForm.fecha_hora) return;
    setGuardandoCita(true);
    const { data } = await supabase.from("appointments").insert({
      lead_id: lead.id,
      comercial_id: citaForm.comercial_id || lead.comercial_asignado || null,
      tipo: citaForm.tipo,
      estado: "pendiente",
      fecha_hora: citaForm.fecha_hora,
      duracion_minutos: citaForm.duracion_minutos,
      notas_previas: citaForm.notas_previas || null,
      solicitado_por: "comercial",
    }).select().single();
    if (data) {
      setAppointments(prev => [...prev, data as Appointment].sort((a, b) => new Date(a.fecha_hora).getTime() - new Date(b.fecha_hora).getTime()));
      await supabase.from("leads").update({ estado: "cita_agendada", updated_at: new Date().toISOString() }).eq("id", lead.id);
      setLead(prev => prev ? { ...prev, estado: "cita_agendada" } : prev);
    }
    setCitaForm({ tipo: "llamada", fecha_hora: "", duracion_minutos: 30, notas_previas: "", comercial_id: "" });
    setMostrarNuevaCita(false);
    setGuardandoCita(false);
    setGuardadoOk(true);
    setTimeout(() => setGuardadoOk(false), 2000);
  }

  async function actualizarEstadoCita(citaId: string, nuevoEstado: Appointment["estado"]) {
    if (nuevoEstado === "realizada") {
      const cita = appointments.find(a => a.id === citaId);
      if (cita) {
        setCitaParaRegistrar(cita);
        setPostCitaForm({ resultado: "interesado", notas_post: "", proxima_accion: "llamar", proxima_accion_nota: "" });
        return;
      }
    }
    await supabase.from("appointments").update({ estado: nuevoEstado }).eq("id", citaId);
    setAppointments(prev => prev.map(a => a.id === citaId ? { ...a, estado: nuevoEstado } : a));
  }

  async function guardarPostCita() {
    if (!postCitaForm.notas_post.trim()) { setErrorPostCita("Escribe al menos una nota sobre cómo fue la cita."); return; }
    if (!lead || !citaParaRegistrar) return;
    setGuardandoPostCita(true);
    await supabase.from("appointments").update({
      estado: "realizada",
      notas_post: postCitaForm.notas_post,
      resultado: postCitaForm.resultado,
    }).eq("id", citaParaRegistrar.id);
    await supabase.from("interactions").insert({
      lead_id: lead.id,
      tipo: "nota_manual",
      mensaje: `📋 Post-cita: ${postCitaForm.notas_post}`,
      origen: "comercial",
    });
    const leadUpdates: Record<string, string | null> = {
      proxima_accion: postCitaForm.proxima_accion !== "ninguna" ? postCitaForm.proxima_accion : null,
      proxima_accion_nota: postCitaForm.proxima_accion_nota || null,
      proxima_accion_fecha: null,
      updated_at: new Date().toISOString(),
    };
    if (postCitaForm.resultado === "cerrado_ganado") leadUpdates.estado = "cerrado_ganado";
    else if (postCitaForm.resultado === "no_interesado") leadUpdates.estado = "cerrado_perdido";
    else if (postCitaForm.resultado === "interesado" || postCitaForm.resultado === "necesita_mas_info") leadUpdates.estado = "en_negociacion";
    await supabase.from("leads").update(leadUpdates).eq("id", lead.id);
    if (leadUpdates.estado) supabase.from("lead_state_history").insert({ lead_id: lead.id, estado_anterior: lead.estado, estado_nuevo: leadUpdates.estado, comercial_id: lead.comercial_asignado });
    setLead(prev => prev ? { ...prev, ...leadUpdates } as Lead : prev);
    setAppointments(prev => prev.map(a => a.id === citaParaRegistrar.id ? { ...a, estado: "realizada", notas_post: postCitaForm.notas_post } : a));
    setInteractions(prev => [...prev, { id: Date.now().toString(), lead_id: lead.id, tipo: "nota_manual", mensaje: `📋 Post-cita: ${postCitaForm.notas_post}`, origen: "comercial", sentimiento: null, señal_escalado: false, created_at: new Date().toISOString() } as Interaction]);
    setCitaParaRegistrar(null);
    setGuardandoPostCita(false);
    setGuardadoOk(true);
    setTimeout(() => setGuardadoOk(false), 2000);
  }

  function abrirEdicionAccion() {
    if (!lead) return;
    setAccionForm({
      proxima_accion: lead.proxima_accion ?? "llamar",
      proxima_accion_fecha: lead.proxima_accion_fecha
        ? new Date(lead.proxima_accion_fecha).toISOString().slice(0, 16)
        : "",
      proxima_accion_nota: lead.proxima_accion_nota ?? "",
    });
    setEditandoAccion(true);
  }

  async function guardarAccion() {
    if (!lead) return;
    setGuardandoAccion(true);
    const updates = {
      proxima_accion: accionForm.proxima_accion || null,
      proxima_accion_fecha: accionForm.proxima_accion_fecha || null,
      proxima_accion_nota: accionForm.proxima_accion_nota || null,
      updated_at: new Date().toISOString(),
    };
    await supabase.from("leads").update(updates).eq("id", lead.id);
    setLead(prev => prev ? { ...prev, ...updates } as Lead : prev);
    setEditandoAccion(false);
    setGuardandoAccion(false);
    setGuardadoOk(true);
    setTimeout(() => setGuardadoOk(false), 2000);
  }

  async function marcarAccionHecha() {
    if (!lead) return;
    const updates = {
      proxima_accion: null as null,
      proxima_accion_fecha: null as null,
      proxima_accion_nota: null as null,
      updated_at: new Date().toISOString(),
    };
    await supabase.from("leads").update(updates).eq("id", lead.id);
    setLead(prev => prev ? { ...prev, ...updates } as Lead : prev);
    setGuardadoOk(true);
    setTimeout(() => setGuardadoOk(false), 2000);
    // Abrir directamente el formulario para definir la siguiente acción
    setAccionForm({ proxima_accion: "llamar", proxima_accion_fecha: "", proxima_accion_nota: "" });
    setEditandoAccion(true);
  }

  async function actualizarNivel(delta: number) {
    if (!lead) return;
    const nuevo = Math.min(10, Math.max(1, lead.nivel_interes + delta));
    if (nuevo === lead.nivel_interes) return;
    await supabase.from("leads").update({ nivel_interes: nuevo, updated_at: new Date().toISOString() }).eq("id", lead.id);
    setLead(prev => prev ? { ...prev, nivel_interes: nuevo } : prev);
    setGuardadoOk(true);
    setTimeout(() => setGuardadoOk(false), 1500);
  }

  async function generarMensajeIA() {
    if (!lead) return;
    setGenerandoMensajeIA(true);
    setMostrarEnvio(true);
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://prospeccion-manuel-production.up.railway.app";
      const res = await fetch(`${API_URL}/mensajes/generar-uno`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: lead.id }),
      });
      const data = await res.json();
      setMensajeWhatsapp(data.mensaje ?? "");
    } catch {
      setMensajeWhatsapp(generarMensaje("primer_contacto"));
    } finally {
      setGenerandoMensajeIA(false);
    }
  }

  async function accionRapida(tipo: string, mensaje: string, nuevoEstado?: string) {
    if (!lead) return;
    await supabase.from("interactions").insert({
      lead_id: lead.id,
      tipo: "nota_manual",
      mensaje,
      origen: "comercial",
    });
    const nuevaInteraccion = { id: Date.now().toString(), lead_id: lead.id, tipo: "nota_manual", mensaje, origen: "comercial" as const, sentimiento: null, señal_escalado: false, created_at: new Date().toISOString() } as Interaction;
    setInteractions(prev => [...prev, nuevaInteraccion]);
    if (nuevoEstado) {
      await supabase.from("leads").update({ estado: nuevoEstado, updated_at: new Date().toISOString() }).eq("id", lead.id);
      supabase.from("lead_state_history").insert({ lead_id: lead.id, estado_anterior: lead.estado, estado_nuevo: nuevoEstado, comercial_id: lead.comercial_asignado });
      setStateHistory(prev => [...prev, { id: Date.now().toString(), estado_anterior: lead.estado, estado_nuevo: nuevoEstado, created_at: new Date().toISOString() }]);
      setLead(prev => prev ? { ...prev, estado: nuevoEstado as Lead["estado"] } : prev);
    }
    setGuardadoOk(true);
    setTimeout(() => setGuardadoOk(false), 1500);
  }

  if (loading) return <div className="text-center py-20 text-slate-400 text-sm">Cargando...</div>;
  if (!lead) return <div className="text-center py-20 text-slate-400 text-sm">Lead no encontrado.</div>;

  const nombreCompleto = [lead.nombre, lead.apellidos].filter(Boolean).join(" ");
  const estadoActual = ESTADOS.find(e => e.value === lead.estado) ?? { label: lead.estado, class: "bg-slate-100 text-slate-500" };

  const ultimaInteraccionFecha = interactions.length > 0
    ? new Date(interactions[interactions.length - 1].created_at)
    : null;
  const diasSinContacto = ultimaInteraccionFecha
    ? Math.floor((Date.now() - ultimaInteraccionFecha.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  function generarMensaje(tipo: "primer_contacto" | "recordatorio_1" | "recordatorio_2") {
    const nombre = lead!.nombre || "Hola";
    const empresa = lead!.empresa || "";
    const ciudad = lead!.ciudad || "tu ciudad";
    const sector = (lead!.sector || "").toLowerCase();
    const tipoLead = lead!.tipo_lead;
    const esInmobiliaria = sector.includes("inmobili");
    const esAsesoria = sector.includes("asesor") || sector.includes("gestor");
    const esHosteleria = sector.includes("hostel") || sector.includes("restaur") || sector.includes("bar") || sector.includes("café");
    const esAutonomo = tipoLead === "autonomo";
    const esPyme = tipoLead === "pyme";

    if (tipo === "primer_contacto") {
      if (esInmobiliaria) return `Hola ${nombre}, soy Manuel, asesor financiero en ${ciudad}. Vi que diriges ${empresa} y trabajo con varias inmobiliarias de la zona en acuerdos de derivación hipotecaria — cuando un cliente tuyo necesita hipoteca, os generáis una comisión sin hacer nada extra. ¿Tiene sentido que hablemos 15 minutos?`;
      if (esAsesoria) return `Hola ${nombre}, soy Manuel. Trabajo con asesorías como ${empresa} para ofrecer a sus clientes autónomos un seguro que cubre desde el primer día de baja. Algo que muchos autónomos necesitan y que puede ser un servicio más para vuestra cartera. ¿Podríamos explorar si encaja?`;
      if (esHosteleria || esAutonomo) return `Hola ${nombre}, vi que tienes ${empresa || "tu negocio"} en ${ciudad}. Trabajo con autónomos del sector y muchos no saben que existe un seguro desde 5€/mes que te cubre el día que te pones enfermo — porque si no trabajas, no cobras. ¿Te cuento en 5 minutos?`;
      if (esPyme) return `Hola ${nombre}, soy Manuel, asesor en ${ciudad}. ¿${empresa} tiene seguro de vida colectivo para el equipo? Es el beneficio laboral más valorado y no requiere reconocimiento médico. ¿Lo vemos?`;
      return `Hola ${nombre}, soy Manuel, asesor financiero en ${ciudad}. Me gustaría presentarte algo que puede ser útil para tu situación. ¿Tienes 5 minutos esta semana?`;
    }
    if (tipo === "recordatorio_1") {
      if (esInmobiliaria) return `Hola ${nombre}, soy Manuel de nuevo. Te escribí hace unos días sobre generar comisiones adicionales para ${empresa} derivando clientes hipotecarios. Sé que estás ocupado. ¿Tienes 10 minutos esta semana?`;
      if (esAutonomo || esHosteleria) return `Hola ${nombre}, soy Manuel de nuevo. Te hablé del seguro para autónomos que cubre desde el primer día si te pones enfermo. ¿Sigue siendo algo que te interesa explorar?`;
      return `Hola ${nombre}, soy Manuel. Te contacté hace unos días sobre protección financiera para tu situación. ¿Tienes un momento esta semana para hablarlo?`;
    }
    if (esInmobiliaria) return `${nombre}, última vez que te escribo, lo prometo 😄 Trabajamos con inmobiliarias en ${ciudad} y el mes pasado generamos comisiones medias de 800-1.200€ por operación para sus directores. Si no es para ti, sin problema. ¿Lo descartamos?`;
    if (esAutonomo || esHosteleria) return `${nombre}, por si se perdió mi mensaje: con Contigo Autónomo cobrarías entre 10€ y 200€/día desde el primer día de baja. Desde 5€/mes. Si tienes 5 minutos, te explico cuánto te saldría exactamente.`;
    return `${nombre}, última vez. Si en algún momento quieres explorar opciones de protección financiera, aquí me tienes. Sin presión.`;
  }

  async function enviarViaWhatsApp() {
    if (!lead?.telefono_whatsapp || !mensajeWhatsapp.trim()) return;
    const tel = lead.telefono_whatsapp.replace("+", "");
    window.open(`https://wa.me/${tel}?text=${encodeURIComponent(mensajeWhatsapp)}`, "_blank");
    await supabase.from("interactions").insert({ lead_id: lead.id, tipo: "whatsapp_enviado", mensaje: mensajeWhatsapp, origen: "comercial" });
    await supabase.from("leads").update({ estado: "mensaje_enviado", updated_at: new Date().toISOString() }).eq("id", lead.id);
    setInteractions(prev => [...prev, { id: Date.now().toString(), lead_id: lead!.id, tipo: "whatsapp_enviado", mensaje: mensajeWhatsapp, origen: "comercial", sentimiento: null, señal_escalado: false, created_at: new Date().toISOString() } as Interaction]);
    setLead(prev => prev ? { ...prev, estado: "mensaje_enviado" } : prev);
    setMostrarEnvio(false);
  }

  async function copiarMensaje() {
    await navigator.clipboard.writeText(mensajeWhatsapp);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  const RESULTADOS_CITA_LEAD = [
    { value: "interesado", label: "✅ Interesado — quiere seguir" },
    { value: "necesita_mas_info", label: "🤔 Necesita más información" },
    { value: "no_interesado", label: "❌ No interesado" },
    { value: "cerrado_ganado", label: "🏆 Cerrado — contratado" },
    { value: "aplazado", label: "⏳ Aplazado — contactar más adelante" },
  ];

  return (
    <div className="space-y-6">
      {/* Modal post-cita */}
      {citaParaRegistrar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-800">Resultado de la cita</h2>
              <p className="text-sm text-slate-500 mt-0.5">
                {citaParaRegistrar.tipo === "llamada" ? "📞" : citaParaRegistrar.tipo === "videollamada" ? "💻" : "🤝"} {format(new Date(citaParaRegistrar.fecha_hora), "d MMM · HH:mm", { locale: es })}
              </p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 block">¿Cómo fue?</label>
                <div className="space-y-1.5">
                  {RESULTADOS_CITA_LEAD.map(r => (
                    <button key={r.value} onClick={() => setPostCitaForm(p => ({ ...p, resultado: r.value }))}
                      className={`w-full text-left text-sm px-3 py-2 rounded-lg border transition-colors ${postCitaForm.resultado === r.value ? "bg-indigo-50 border-indigo-300 text-indigo-700 font-medium" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">
                  Nota post-cita <span className="text-red-400">*</span>
                </label>
                <textarea value={postCitaForm.notas_post}
                  onChange={e => { setPostCitaForm(p => ({ ...p, notas_post: e.target.value })); setErrorPostCita(""); }}
                  rows={3} placeholder="¿Qué se habló? ¿Qué le interesó? ¿Qué objeciones hubo?..."
                  className={`w-full text-sm border rounded-lg px-3 py-2 resize-none focus:outline-none ${errorPostCita ? "border-red-300" : "border-slate-200 focus:border-indigo-300"}`} />
                {errorPostCita && <p className="text-xs text-red-500 mt-1">{errorPostCita}</p>}
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Próxima acción</label>
                <select value={postCitaForm.proxima_accion}
                  onChange={e => setPostCitaForm(p => ({ ...p, proxima_accion: e.target.value }))}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-indigo-300">
                  <option value="llamar">📞 Llamar</option>
                  <option value="whatsapp">💬 Enviar WhatsApp</option>
                  <option value="enviar_info">📎 Enviar información</option>
                  <option value="reunion">📅 Nueva reunión</option>
                  <option value="ninguna">— Ninguna (cerrado)</option>
                </select>
                {postCitaForm.proxima_accion !== "ninguna" && (
                  <input type="text" value={postCitaForm.proxima_accion_nota}
                    onChange={e => setPostCitaForm(p => ({ ...p, proxima_accion_nota: e.target.value }))}
                    placeholder="Nota para la próxima acción (opcional)"
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 mt-1.5 focus:outline-none focus:border-indigo-300" />
                )}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex gap-3">
              <button onClick={guardarPostCita} disabled={guardandoPostCita}
                className="flex-1 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                {guardandoPostCita ? "Guardando..." : "Guardar resultado"}
              </button>
              <button onClick={() => setCitaParaRegistrar(null)}
                className="px-4 py-2.5 border border-slate-200 text-slate-600 text-sm rounded-xl hover:bg-slate-50">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal motivo de pérdida */}
      {estadoPendiente && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-5 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-800">
                {estadoPendiente === "descartado" ? "¿Por qué se descarta este lead?" : "¿Por qué se pierde esta venta?"}
              </h2>
              <p className="text-sm text-slate-500 mt-0.5">
                Registrar el motivo ayuda a mejorar el proceso comercial.
              </p>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Motivo principal *</label>
                <div className="space-y-2">
                  {MOTIVOS_PERDIDA.map(m => (
                    <label key={m.value} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${motivoForm.motivo === m.value ? "border-red-400 bg-red-50" : "border-slate-200 hover:border-slate-300"}`}>
                      <input
                        type="radio"
                        name="motivo_perdida"
                        value={m.value}
                        checked={motivoForm.motivo === m.value}
                        onChange={() => setMotivoForm(p => ({ ...p, motivo: m.value }))}
                        className="text-red-500"
                      />
                      <span className="text-sm text-slate-700">{m.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Nota adicional (opcional)</label>
                <textarea
                  value={motivoForm.nota}
                  onChange={e => setMotivoForm(p => ({ ...p, nota: e.target.value }))}
                  rows={2}
                  placeholder="Contexto específico del cierre..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-red-300 resize-none"
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex gap-3">
              <button onClick={confirmarMotivoPerdida} disabled={guardandoMotivo}
                className="flex-1 py-2.5 bg-red-600 text-white text-sm font-semibold rounded-xl hover:bg-red-700 disabled:opacity-50 transition-colors">
                {guardandoMotivo ? "Guardando..." : estadoPendiente === "descartado" ? "Descartar lead" : "Marcar como perdido"}
              </button>
              <button onClick={() => setEstadoPendiente(null)}
                className="px-4 py-2.5 border border-slate-200 text-slate-600 text-sm rounded-xl hover:bg-slate-50">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Back + feedback guardado */}
      <div className="flex items-center justify-between">
        <button onClick={() => router.back()} className="text-sm text-slate-500 hover:text-slate-800 flex items-center gap-1">
          ← Volver
        </button>
        {guardadoOk && (
          <span className="text-xs text-emerald-600 font-medium bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full">
            ✓ Guardado
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Columna izquierda ── */}
        <div className="space-y-4">

          {/* Cabecera del lead */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="flex-1 min-w-0">
                <h1 className="text-xl font-bold text-slate-900 truncate">{nombreCompleto || "Sin nombre"}</h1>
                {(lead.cargo || lead.empresa) && (
                  <p className="text-sm text-slate-500 mt-0.5 truncate">
                    {[lead.cargo, lead.empresa].filter(Boolean).join(" · ")}
                  </p>
                )}
                {/* Contexto del negocio inline */}
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5">
                  {lead.sector && (
                    <span className="text-xs text-slate-400">{lead.sector}</span>
                  )}
                  {lead.num_empleados && (
                    <span className="text-xs text-slate-400">{lead.num_empleados} empleados</span>
                  )}
                  {lead.tipo_lead && (
                    <span className="text-xs text-slate-400 capitalize">{lead.tipo_lead}</span>
                  )}
                </div>
              </div>
              <button
                onClick={abrirEdicion}
                className="flex-shrink-0 text-xs text-slate-500 hover:text-indigo-600 border border-slate-200 hover:border-indigo-300 px-2.5 py-1.5 rounded-lg transition-colors"
              >
                Editar
              </button>
            </div>

            <div className="flex flex-wrap gap-2 mb-4">
              <TemperaturaBadge temperatura={(TEMPERATURA_POR_ESTADO[lead.estado] ?? lead.temperatura) as "caliente" | "templado" | "frio"} />
              <PrioridadBadge prioridad={prioridadDeNivel(lead.nivel_interes)} />
              <FuenteBadge fuente={lead.fuente ?? null} />
              {diasSinContacto !== null && (
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${
                  diasSinContacto === 0 ? "bg-green-50 text-green-700 border-green-200" :
                  diasSinContacto <= 3 ? "bg-blue-50 text-blue-600 border-blue-200" :
                  diasSinContacto <= 7 ? "bg-amber-50 text-amber-600 border-amber-200" :
                  "bg-red-50 text-red-600 border-red-200"
                }`}>
                  {diasSinContacto === 0 ? "Hoy" : `${diasSinContacto}d sin contacto`}
                </span>
              )}
            </div>

            {/* Nivel de interés editable */}
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <NivelInteresBar nivel={lead.nivel_interes} />
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => actualizarNivel(-1)}
                  className="w-6 h-6 rounded-md border border-slate-200 text-slate-500 hover:border-red-300 hover:text-red-600 text-sm font-bold flex items-center justify-center transition-colors"
                >−</button>
                <span className="text-sm font-semibold text-slate-700 w-5 text-center">{lead.nivel_interes}</span>
                <button
                  onClick={() => actualizarNivel(1)}
                  className="w-6 h-6 rounded-md border border-slate-200 text-slate-500 hover:border-green-300 hover:text-green-600 text-sm font-bold flex items-center justify-center transition-colors"
                >+</button>
              </div>
            </div>
          </div>

          {/* Cambiar estado rápido */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Estado del lead</h3>
            <div className="grid grid-cols-2 gap-1.5">
              {ESTADOS.map(e => (
                <button
                  key={e.value}
                  onClick={() => cambiarEstado(e.value)}
                  className={`text-xs px-2 py-2 rounded-lg font-medium text-left transition-all border ${
                    lead.estado === e.value
                      ? `${e.class} border-current ring-2 ring-offset-1 ring-current/30`
                      : "border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  {e.label}
                </button>
              ))}
            </div>
          </div>

          {/* Motivo de pérdida (solo si está cerrado/descartado) */}
          {(lead.estado === "cerrado_perdido" || lead.estado === "descartado") && (
            <div className="bg-red-50 rounded-xl border border-red-200 p-5">
              <h3 className="text-xs font-semibold text-red-500 uppercase tracking-wide mb-2">
                {lead.estado === "descartado" ? "Motivo de descarte" : "Motivo de pérdida"}
              </h3>
              {lead.motivo_perdida ? (
                <div className="space-y-1">
                  <p className="text-sm font-medium text-red-700">
                    {MOTIVOS_PERDIDA.find(m => m.value === lead.motivo_perdida)?.label ?? lead.motivo_perdida}
                  </p>
                  {lead.motivo_perdida_nota && (
                    <p className="text-xs text-red-500">{lead.motivo_perdida_nota}</p>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <p className="text-xs text-red-400">Sin motivo registrado</p>
                  <button
                    onClick={() => { setEstadoPendiente(lead.estado); setMotivoForm({ motivo: "precio", nota: "" }); }}
                    className="text-xs text-red-600 hover:text-red-800 font-medium underline"
                  >
                    Añadir motivo
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Panel cliente (solo si cerrado_ganado) */}
          {lead.estado === "cerrado_ganado" && (
            <div className={`rounded-xl border p-5 ${clienteExistente ? "bg-green-50 border-green-200" : "bg-white border-slate-200"}`}>
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Cliente</h3>
              {clienteExistente ? (
                <div className="flex items-center justify-between">
                  <p className="text-sm text-green-700 font-medium">Registrado como cliente</p>
                  <Link href="/clientes" className="text-xs text-green-700 underline hover:text-green-900">
                    Ver ficha de cliente →
                  </Link>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-slate-600">Este lead ganado aún no está en la cartera</p>
                  <button
                    onClick={crearClienteDesdeGanado}
                    disabled={creandoCliente}
                    className="text-xs font-medium px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 whitespace-nowrap transition-colors"
                  >
                    {creandoCliente ? "Creando..." : "Crear cliente"}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Próxima acción */}
          {(() => {
            const accion = lead.proxima_accion && lead.proxima_accion !== "ninguna" ? ACCIONES_CONFIG[lead.proxima_accion] : null;
            const urgencia = getUrgenciaAccion(lead.proxima_accion_fecha ?? null);
            return (
              <div className={`bg-white rounded-xl border p-5 ${accion && urgencia && urgencia.colorClass.includes("red") ? "border-red-300" : accion && urgencia && urgencia.colorClass.includes("orange") ? "border-orange-300" : "border-slate-200"}`}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Próxima acción</h3>
                  {accion && !editandoAccion && (
                    <div className="flex gap-2">
                      <button onClick={abrirEdicionAccion} className="text-xs text-slate-400 hover:text-slate-700">Editar</button>
                      <button onClick={marcarAccionHecha} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">✓ Hecha</button>
                    </div>
                  )}
                </div>

                {!editandoAccion && !accion && (
                  <div className="flex items-center justify-between gap-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-3">
                    <p className="text-sm text-amber-700">Sin próxima acción definida</p>
                    <button
                      onClick={abrirEdicionAccion}
                      className="text-xs font-medium text-amber-700 border border-amber-300 bg-white hover:bg-amber-50 px-3 py-1.5 rounded-lg whitespace-nowrap"
                    >
                      Definir
                    </button>
                  </div>
                )}

                {!editandoAccion && accion && (
                  <div className="space-y-2">
                    <div className={`inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border ${accion.color}`}>
                      <span>{accion.icon}</span>
                      <span>{accion.label}</span>
                    </div>
                    {urgencia && (
                      <p className={`text-sm font-semibold px-2 py-1 rounded border ${urgencia.colorClass}`}>{urgencia.label}</p>
                    )}
                    {lead.proxima_accion_nota && (
                      <p className="text-xs text-slate-500 italic">{lead.proxima_accion_nota}</p>
                    )}
                  </div>
                )}

                {editandoAccion && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">Tipo de acción</label>
                      <select
                        value={accionForm.proxima_accion}
                        onChange={e => setAccionForm(p => ({ ...p, proxima_accion: e.target.value }))}
                        className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white"
                      >
                        <option value="llamar">📞 Llamar</option>
                        <option value="whatsapp">💬 Enviar WhatsApp</option>
                        <option value="email">📧 Enviar email</option>
                        <option value="esperar_respuesta">⏳ Esperar respuesta</option>
                        <option value="enviar_info">📎 Enviar información</option>
                        <option value="reunion">📅 Agendar reunión</option>
                        <option value="ninguna">— Sin acción</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">Fecha y hora</label>
                      <input
                        type="datetime-local"
                        value={accionForm.proxima_accion_fecha}
                        onChange={e => setAccionForm(p => ({ ...p, proxima_accion_fecha: e.target.value }))}
                        className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">Nota (opcional)</label>
                      <input
                        type="text"
                        value={accionForm.proxima_accion_nota}
                        onChange={e => setAccionForm(p => ({ ...p, proxima_accion_nota: e.target.value }))}
                        placeholder="ej. Llamar después de las 17h"
                        className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={guardarAccion}
                        disabled={guardandoAccion}
                        className="flex-1 text-sm bg-indigo-600 text-white rounded-lg py-2 hover:bg-indigo-700 disabled:opacity-50"
                      >
                        {guardandoAccion ? "Guardando..." : "Guardar"}
                      </button>
                      <button
                        onClick={() => setEditandoAccion(false)}
                        className="text-sm border border-slate-200 text-slate-600 rounded-lg px-4 py-2 hover:bg-slate-50"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Contacto */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-2">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Contacto</h3>
            {lead.telefono_whatsapp && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 w-20 flex-shrink-0">WhatsApp</span>
                <a href={`https://wa.me/${lead.telefono_whatsapp.replace("+","")}`} target="_blank" rel="noopener noreferrer" className="text-sm text-green-600 hover:underline font-medium truncate">
                  {lead.telefono_whatsapp}
                </a>
              </div>
            )}
            {lead.telefono && lead.telefono !== lead.telefono_whatsapp && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 w-20 flex-shrink-0">Teléfono</span>
                <a href={`tel:${lead.telefono}`} className="text-sm text-slate-700 truncate">{lead.telefono}</a>
              </div>
            )}
            {lead.email && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 w-20 flex-shrink-0">Email</span>
                <a href={`mailto:${lead.email}`} className="text-sm text-slate-700 hover:underline truncate">{lead.email}</a>
              </div>
            )}
            {lead.ciudad && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 w-20 flex-shrink-0">Ciudad</span>
                <span className="text-sm text-slate-700">{lead.ciudad}</span>
              </div>
            )}
            {lead.fuente_detalle && lead.fuente_detalle.startsWith("http") && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 w-20 flex-shrink-0">Web</span>
                <a href={lead.fuente_detalle} target="_blank" rel="noopener noreferrer"
                  className="text-sm text-indigo-600 hover:underline truncate">
                  {lead.fuente_detalle.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                </a>
              </div>
            )}
          </div>

          {/* Productos */}
          {lead.productos_recomendados && lead.productos_recomendados.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Productos recomendados</h3>
              <div className="space-y-2">
                {lead.productos_recomendados.map((p) => (
                  <div key={p} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`text-sm truncate ${p === lead.producto_interes_principal ? "font-semibold text-indigo-700" : "text-slate-600"}`}>
                        {PRODUCTOS_NOMBRE[p] ?? p}
                      </span>
                      {p === lead.producto_interes_principal && (
                        <span className="text-xs bg-indigo-50 text-indigo-500 px-1.5 py-0.5 rounded flex-shrink-0">Principal</span>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        const msg = `Hola ${lead.nombre}, te escribo sobre ${PRODUCTOS_NOMBRE[p] ?? p}. `;
                        setMensajeWhatsapp(msg);
                        setMostrarEnvio(true);
                        document.querySelector("[data-mensaje-panel]")?.scrollIntoView({ behavior: "smooth" });
                      }}
                      className="text-xs text-indigo-500 hover:text-indigo-700 border border-indigo-200 hover:border-indigo-400 px-2 py-0.5 rounded-lg flex-shrink-0 transition-colors"
                    >
                      → Msg
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Panel de inteligencia de sector */}
          {(() => {
            const intel = getSectorIntel(lead.sector, lead.tipo_lead);
            if (!intel) return null;
            const ticket = getTicketEstimado(lead.tipo_lead, lead.num_empleados, intel);
            return (
              <div className="bg-indigo-50 rounded-xl border border-indigo-200 p-5 space-y-4">
                <h3 className="text-xs font-semibold text-indigo-600 uppercase tracking-wide">Inteligencia de sector</h3>

                {/* Ticket y horario */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white rounded-lg p-3 border border-indigo-100">
                    <p className="text-xs text-slate-400 mb-0.5">Ticket estimado</p>
                    <p className="text-sm font-bold text-indigo-700">€{ticket.min}–{ticket.max}</p>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-indigo-100">
                    <p className="text-xs text-slate-400 mb-0.5">Mejor hora</p>
                    <p className="text-xs font-semibold text-indigo-700">{intel.horario}</p>
                  </div>
                </div>

                {/* Script de apertura */}
                <div>
                  <p className="text-xs font-semibold text-indigo-600 mb-1.5">Script de llamada</p>
                  <div className="bg-white rounded-lg p-3 border border-indigo-100">
                    <p className="text-xs text-slate-600 leading-relaxed italic">
                      {intel.scriptApertura
                        .replace("[nombre]", lead.nombre || "...")
                        .replace("[ciudad]", lead.ciudad || "tu zona")}
                    </p>
                  </div>
                </div>

                {/* Objeciones */}
                <div>
                  <p className="text-xs font-semibold text-indigo-600 mb-1.5">Objeciones frecuentes</p>
                  <div className="space-y-2">
                    {intel.objeciones.map((o, i) => (
                      <div key={i} className="bg-white rounded-lg p-2.5 border border-indigo-100">
                        <p className="text-xs font-medium text-slate-700 mb-1">"{o.obj}"</p>
                        <p className="text-xs text-slate-500 leading-relaxed">→ {o.respuesta}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Citas */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Citas</h3>
              <button
                onClick={() => setMostrarNuevaCita(true)}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-medium hover:underline"
              >
                + Nueva cita
              </button>
            </div>

            {/* Formulario nueva cita inline */}
            {mostrarNuevaCita && (
              <div className="mb-3 p-3 bg-indigo-50 rounded-xl border border-indigo-100 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Tipo</label>
                    <select
                      value={citaForm.tipo}
                      onChange={e => setCitaForm(p => ({ ...p, tipo: e.target.value as typeof p.tipo }))}
                      className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-indigo-300"
                    >
                      <option value="llamada">Llamada</option>
                      <option value="videollamada">Videollamada</option>
                      <option value="reunion_presencial">Reunión presencial</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Duración (min)</label>
                    <select
                      value={citaForm.duracion_minutos}
                      onChange={e => setCitaForm(p => ({ ...p, duracion_minutos: parseInt(e.target.value) }))}
                      className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-indigo-300"
                    >
                      <option value={15}>15 min</option>
                      <option value={30}>30 min</option>
                      <option value={45}>45 min</option>
                      <option value={60}>1 hora</option>
                      <option value={90}>1.5 h</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Fecha y hora</label>
                  <input
                    type="datetime-local"
                    value={citaForm.fecha_hora}
                    onChange={e => setCitaForm(p => ({ ...p, fecha_hora: e.target.value }))}
                    className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-indigo-300"
                  />
                </div>
                {comerciales.length > 0 && (
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Comercial</label>
                    <select
                      value={citaForm.comercial_id}
                      onChange={e => setCitaForm(p => ({ ...p, comercial_id: e.target.value }))}
                      className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-indigo-300"
                    >
                      <option value="">Asignado al lead</option>
                      {comerciales.map(c => (
                        <option key={c.id} value={c.id}>{c.nombre} {c.apellidos ?? ""}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Notas previas</label>
                  <input
                    type="text"
                    value={citaForm.notas_previas}
                    onChange={e => setCitaForm(p => ({ ...p, notas_previas: e.target.value }))}
                    placeholder="Qué tratar, contexto..."
                    className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-indigo-300"
                  />
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={crearCita}
                    disabled={!citaForm.fecha_hora || guardandoCita}
                    className="flex-1 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors"
                  >
                    {guardandoCita ? "Guardando..." : "Agendar cita"}
                  </button>
                  <button
                    onClick={() => setMostrarNuevaCita(false)}
                    className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-600"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {appointments.length === 0 && !mostrarNuevaCita ? (
              <p className="text-xs text-slate-400 text-center py-3">Sin citas agendadas</p>
            ) : (
              <div className="space-y-2">
                {appointments.map((a) => {
                  const esPasada = new Date(a.fecha_hora) < new Date();
                  const estado = a.estado as string;
                  const estadoColor =
                    a.estado === "confirmada" ? "bg-green-100 text-green-700" :
                    a.estado === "realizada" ? "bg-slate-100 text-slate-500" :
                    a.estado === "cancelada" ? "bg-red-100 text-red-500" :
                    a.estado === "no_show" ? "bg-orange-100 text-orange-600" :
                    "bg-amber-100 text-amber-600";
                  const tipoLabel = a.tipo === "llamada" ? "📞 Llamada" : a.tipo === "videollamada" ? "💻 Videollamada" : "🤝 Reunión";
                  return (
                    <div key={a.id} className="rounded-lg border border-slate-100 bg-slate-50 p-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-slate-700">{tipoLabel}</p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {format(new Date(a.fecha_hora), "EEEE d MMM · HH:mm", { locale: es })}
                            {" · "}{a.duracion_minutos} min
                          </p>
                          {a.notas_previas && (
                            <p className="text-xs text-slate-400 mt-0.5 truncate">{a.notas_previas}</p>
                          )}
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${estadoColor}`}>
                          {a.estado === "solicitud_pendiente" ? "Solicitud" : a.estado}
                        </span>
                      </div>
                      {/* Acciones rápidas */}
                      {estado !== "realizada" && estado !== "cancelada" && (
                        <div className="flex gap-1.5 mt-2 pt-2 border-t border-slate-100">
                          {!esPasada && estado !== "confirmada" && (
                            <button
                              onClick={() => actualizarEstadoCita(a.id, "confirmada")}
                              className="text-xs text-green-600 hover:text-green-800 font-medium"
                            >
                              ✓ Confirmar
                            </button>
                          )}
                          {esPasada && estado !== "realizada" && (
                            <button
                              onClick={() => actualizarEstadoCita(a.id, "realizada")}
                              className="text-xs text-slate-600 hover:text-slate-800 font-medium"
                            >
                              ✓ Marcar realizada
                            </button>
                          )}
                          {esPasada && estado !== "no_show" && estado !== "realizada" && (
                            <button
                              onClick={() => actualizarEstadoCita(a.id, "no_show")}
                              className="text-xs text-orange-500 hover:text-orange-700 ml-2"
                            >
                              No asistió
                            </button>
                          )}
                          <button
                            onClick={() => actualizarEstadoCita(a.id, "cancelada")}
                            className="text-xs text-red-400 hover:text-red-600 ml-auto"
                          >
                            Cancelar
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Notas */}
          {lead.notas && (
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Notas</h3>
              <p className="text-sm text-slate-600">{lead.notas}</p>
            </div>
          )}
        </div>

        {/* ── Columna derecha ── */}
        <div className="lg:col-span-2 space-y-4">

          {/* Panel de envío de mensaje */}
          {lead.telefono_whatsapp && (
            <div data-mensaje-panel className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-800">Enviar mensaje</h2>
                {!mostrarEnvio && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={generarMensajeIA}
                      disabled={generandoMensajeIA}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                    >
                      {generandoMensajeIA ? "Generando..." : "✨ IA"}
                    </button>
                    <button
                      onClick={() => { setMensajeWhatsapp(generarMensaje("primer_contacto")); setMostrarEnvio(true); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 transition-colors"
                    >
                    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                      Escribir a {lead.nombre}
                    </button>
                  </div>
                )}
              </div>

              {mostrarEnvio && (
                <div className="p-4 space-y-3">
                  <div className="flex gap-2 flex-wrap">
                    {[
                      { key: "primer_contacto", label: "Primer contacto" },
                      { key: "recordatorio_1", label: "Recordatorio 1" },
                      { key: "recordatorio_2", label: "Recordatorio 2" },
                    ].map(({ key, label }) => (
                      <button key={key} onClick={() => setMensajeWhatsapp(generarMensaje(key as "primer_contacto" | "recordatorio_1" | "recordatorio_2"))}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-600 transition-colors">
                        {label}
                      </button>
                    ))}
                    {/* Templates específicos de sector */}
                    {getSectorIntel(lead.sector, lead.tipo_lead)?.templatesMensaje.map((t) => (
                      <button key={t.label}
                        onClick={() => setMensajeWhatsapp(t.texto(lead.nombre || "", lead.empresa || "", lead.ciudad || "tu zona"))}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg border border-indigo-200 text-indigo-600 bg-indigo-50 hover:border-indigo-400 transition-colors">
                        ✦ {t.label}
                      </button>
                    ))}
                  </div>
                  <textarea value={mensajeWhatsapp} onChange={e => setMensajeWhatsapp(e.target.value)} rows={5}
                    className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-indigo-300 resize-none text-slate-700 leading-relaxed"
                    placeholder="Escribe o edita el mensaje..." />
                  <p className="text-xs text-slate-400">Puedes editar el mensaje antes de enviarlo. Se abrirá WhatsApp con el texto pre-cargado.</p>
                  <div className="flex items-center gap-2">
                    <button onClick={enviarViaWhatsApp} disabled={!mensajeWhatsapp.trim()}
                      className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-40 transition-colors">
                      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                      Abrir en WhatsApp
                    </button>
                    <button onClick={copiarMensaje} className="px-4 py-2 text-sm font-medium border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">
                      {copiado ? "✓ Copiado" : "Copiar texto"}
                    </button>
                    <button onClick={() => setMostrarEnvio(false)} className="ml-auto px-3 py-2 text-xs text-slate-400 hover:text-slate-600 transition-colors">
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Historial de interacciones */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">Historial de contacto</h2>
              <span className="text-xs text-slate-400">{interactions.length + stateHistory.length} eventos</span>
            </div>
            <div className="overflow-y-auto max-h-[480px] p-4 space-y-3">
              {interactions.length === 0 && stateHistory.length === 0 ? (
                <p className="text-center text-sm text-slate-400 py-8">Sin interacciones todavía.</p>
              ) : (
                [...interactions.map(i => ({ type: "interaction" as const, ts: i.created_at, data: i })),
                 ...stateHistory.map(h => ({ type: "state" as const, ts: h.created_at, data: h }))]
                  .sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime())
                  .map(item =>
                    item.type === "interaction"
                      ? <ChatBubble key={`i-${item.data.id}`} interaction={item.data} />
                      : <StateChangeBubble key={`s-${item.data.id}`} change={item.data} />
                  )
              )}
            </div>
            {/* Acciones rápidas */}
            <div className="border-t border-slate-100 px-3 pt-3 pb-1">
              <p className="text-xs text-slate-400 mb-2">Acción rápida</p>
              <div className="flex flex-wrap gap-1.5 mb-2">
                <button onClick={() => accionRapida("llamada", "📞 Llamé, no cogió")}
                  className="text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-200 text-slate-600 rounded-lg hover:border-slate-400 transition-colors">
                  📞 No cogió
                </button>
                <button onClick={() => accionRapida("mensaje_voz", "🎙 Dejé mensaje de voz")}
                  className="text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-200 text-slate-600 rounded-lg hover:border-slate-400 transition-colors">
                  🎙 Dejé voz
                </button>
                <button onClick={() => accionRapida("respondio", "✅ Respondió", "respondio")}
                  className="text-xs px-2.5 py-1.5 bg-green-50 border border-green-200 text-green-700 rounded-lg hover:border-green-400 transition-colors">
                  ✅ Respondió
                </button>
                <button onClick={() => accionRapida("no_responde", "❌ No contesta (3+ intentos)")}
                  className="text-xs px-2.5 py-1.5 bg-red-50 border border-red-200 text-red-600 rounded-lg hover:border-red-400 transition-colors">
                  ❌ No contesta
                </button>
                <button onClick={() => accionRapida("reunion", "🤝 Reunión realizada")}
                  className="text-xs px-2.5 py-1.5 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-lg hover:border-indigo-400 transition-colors">
                  🤝 Reunión hecha
                </button>
              </div>
            </div>
            <div className="px-3 pb-3 flex gap-2">
              <input type="text" value={nota} onChange={(e) => setNota(e.target.value)} onKeyDown={(e) => e.key === "Enter" && guardarNota()}
                placeholder="Añadir nota del comercial..."
                className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-300" />
              <button onClick={guardarNota} disabled={!nota.trim() || guardando}
                className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors">
                {guardando ? "..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Modal de edición ── */}
      {editando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <h2 className="text-base font-bold text-slate-800">Editar lead</h2>
              <button onClick={() => setEditando(false)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
            </div>

            <div className="p-6 space-y-5">
              {/* Datos personales */}
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Datos personales</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Nombre</label>
                    <input value={editForm.nombre ?? ""} onChange={e => setEditForm(p => ({ ...p, nombre: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-300" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Apellidos</label>
                    <input value={editForm.apellidos ?? ""} onChange={e => setEditForm(p => ({ ...p, apellidos: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-300" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">WhatsApp</label>
                    <input value={editForm.telefono_whatsapp ?? ""} onChange={e => setEditForm(p => ({ ...p, telefono_whatsapp: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-300" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Email</label>
                    <input value={editForm.email ?? ""} onChange={e => setEditForm(p => ({ ...p, email: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-300" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Cargo</label>
                    <input value={editForm.cargo ?? ""} onChange={e => setEditForm(p => ({ ...p, cargo: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-300" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Empresa</label>
                    <input value={editForm.empresa ?? ""} onChange={e => setEditForm(p => ({ ...p, empresa: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-300" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Sector</label>
                    <input value={editForm.sector ?? ""} onChange={e => setEditForm(p => ({ ...p, sector: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-300" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Ciudad</label>
                    <input value={editForm.ciudad ?? ""} onChange={e => setEditForm(p => ({ ...p, ciudad: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-300" />
                  </div>
                </div>
              </div>

              {/* Scoring */}
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Scoring</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Temperatura</label>
                    <select value={editForm.temperatura ?? "frio"} onChange={e => setEditForm(p => ({ ...p, temperatura: e.target.value as Lead["temperatura"] }))}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-300 bg-white">
                      <option value="caliente">Caliente</option>
                      <option value="templado">Templado</option>
                      <option value="frio">Frío</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Interés (0-10)</label>
                    <input type="number" min={0} max={10} value={editForm.nivel_interes ?? 0}
                      onChange={e => setEditForm(p => ({ ...p, nivel_interes: Math.min(10, Math.max(0, parseInt(e.target.value) || 0)) }))}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-300" />
                  </div>
                </div>
              </div>

              {/* Comercial asignado */}
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Asignación</p>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Comercial responsable</label>
                  <select
                    value={editForm.comercial_asignado ?? ""}
                    onChange={e => setEditForm(p => ({ ...p, comercial_asignado: e.target.value || null }))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-300 bg-white"
                  >
                    <option value="">Sin asignar</option>
                    {comerciales.map(c => (
                      <option key={c.id} value={c.id}>{c.nombre} {c.apellidos ?? ""}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Notas */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Notas internas</label>
                <textarea value={editForm.notas ?? ""} onChange={e => setEditForm(p => ({ ...p, notas: e.target.value }))} rows={3}
                  placeholder="Contexto del lead, observaciones..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-300 resize-none" />
              </div>
            </div>

            <div className="sticky bottom-0 bg-white border-t border-slate-100 px-6 py-4 flex gap-3 rounded-b-2xl">
              <button onClick={guardarEdicion} disabled={guardandoEdicion}
                className="flex-1 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                {guardandoEdicion ? "Guardando..." : "Guardar cambios"}
              </button>
              <button onClick={() => setEditando(false)}
                className="px-5 py-2.5 border border-slate-200 text-slate-600 text-sm rounded-xl hover:bg-slate-50 transition-colors">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StateChangeBubble({ change }: { change: { estado_anterior: string; estado_nuevo: string; created_at: string } }) {
  const labelDe = ESTADOS.find(e => e.value === change.estado_anterior)?.label ?? change.estado_anterior;
  const labelA = ESTADOS.find(e => e.value === change.estado_nuevo)?.label ?? change.estado_nuevo;
  return (
    <div className="flex justify-center">
      <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 max-w-xs text-center">
        <p className="text-xs text-slate-500">
          <span className="text-slate-400">{labelDe}</span>
          {" → "}
          <span className="font-medium text-slate-700">{labelA}</span>
        </p>
        <p className="text-xs text-slate-400 mt-0.5">{format(new Date(change.created_at), "HH:mm · d MMM", { locale: es })}</p>
      </div>
    </div>
  );
}

function ChatBubble({ interaction }: { interaction: Interaction }) {
  const isLead = interaction.origen === "lead";
  const isBot = interaction.origen === "bot";
  const isNota = interaction.tipo === "nota_manual";

  if (isNota) {
    return (
      <div className="flex justify-center">
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 max-w-md">
          <p className="text-xs text-amber-600 font-medium mb-0.5">Nota del comercial</p>
          <p className="text-sm text-amber-800">{interaction.mensaje}</p>
          <p className="text-xs text-amber-400 mt-1">{format(new Date(interaction.created_at), "HH:mm · d MMM", { locale: es })}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex ${isLead ? "justify-start" : "justify-end"}`}>
      <div className={`max-w-sm rounded-2xl px-3.5 py-2.5 ${isLead ? "bg-slate-100 text-slate-800" : isBot ? "bg-indigo-600 text-white" : "bg-slate-800 text-white"}`}>
        {!isLead && <p className={`text-xs mb-1 ${isBot ? "text-indigo-200" : "text-slate-400"}`}>{isBot ? "Bot" : "Comercial"}</p>}
        <p className="text-sm leading-relaxed">{interaction.mensaje}</p>
        <p className={`text-xs mt-1 ${isLead ? "text-slate-400" : isBot ? "text-indigo-300" : "text-slate-500"}`}>
          {format(new Date(interaction.created_at), "HH:mm · d MMM", { locale: es })}
        </p>
      </div>
    </div>
  );
}
