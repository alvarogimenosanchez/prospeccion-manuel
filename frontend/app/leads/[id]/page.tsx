"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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

const ESTADO_LABEL: Record<string, { label: string; class: string }> = {
  nuevo: { label: "Nuevo", class: "bg-slate-100 text-slate-600" },
  enriquecido: { label: "Enriquecido", class: "bg-blue-100 text-blue-600" },
  segmentado: { label: "Segmentado", class: "bg-indigo-100 text-indigo-600" },
  mensaje_generado: { label: "Msg. Generado", class: "bg-purple-100 text-purple-600" },
  mensaje_enviado: { label: "Msg. Enviado", class: "bg-violet-100 text-violet-600" },
  respondio: { label: "Respondió", class: "bg-amber-100 text-amber-700" },
  cita_agendada: { label: "Cita Agendada", class: "bg-green-100 text-green-700" },
  en_negociacion: { label: "En Negociación", class: "bg-emerald-100 text-emerald-700" },
  cerrado_ganado: { label: "Cerrado Ganado", class: "bg-green-600 text-white" },
  cerrado_perdido: { label: "Cerrado Perdido", class: "bg-red-100 text-red-600" },
  descartado: { label: "Descartado", class: "bg-slate-100 text-slate-400" },
};

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

  useEffect(() => {
    async function cargar() {
      const [leadRes, interRes, apptRes] = await Promise.all([
        supabase.from("leads").select("*").eq("id", id).single(),
        supabase.from("interactions").select("*").eq("lead_id", id).order("created_at"),
        supabase.from("appointments").select("*").eq("lead_id", id).order("fecha_hora"),
      ]);

      setLead(leadRes.data as Lead);
      setInteractions((interRes.data as Interaction[]) ?? []);
      setAppointments((apptRes.data as Appointment[]) ?? []);
      setLoading(false);
    }
    cargar();
  }, [id]);

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

  if (loading) {
    return <div className="text-center py-20 text-slate-400 text-sm">Cargando...</div>;
  }

  if (!lead) {
    return <div className="text-center py-20 text-slate-400 text-sm">Lead no encontrado.</div>;
  }

  const nombreCompleto = [lead.nombre, lead.apellidos].filter(Boolean).join(" ");
  const estadoConfig = ESTADO_LABEL[lead.estado] ?? { label: lead.estado, class: "bg-slate-100 text-slate-500" };

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
      if (esInmobiliaria)
        return `Hola ${nombre}, soy Manuel, asesor financiero en ${ciudad}. Vi que diriges ${empresa} y trabajo con varias inmobiliarias de la zona en acuerdos de derivación hipotecaria — cuando un cliente tuyo necesita hipoteca, os generáis una comisión sin hacer nada extra. ¿Tiene sentido que hablemos 15 minutos?`;
      if (esAsesoria)
        return `Hola ${nombre}, soy Manuel. Trabajo con asesorías como ${empresa} para ofrecer a sus clientes autónomos un seguro que cubre desde el primer día de baja. Algo que muchos autónomos necesitan y que puede ser un servicio más para vuestra cartera. ¿Podríamos explorar si encaja?`;
      if (esHosteleria || esAutonomo)
        return `Hola ${nombre}, vi que tienes ${empresa || "tu negocio"} en ${ciudad}. Trabajo con autónomos del sector y muchos no saben que existe un seguro desde 5€/mes que te cubre el día que te pones enfermo — porque si no trabajas, no cobras. ¿Te cuento en 5 minutos?`;
      if (esPyme)
        return `Hola ${nombre}, soy Manuel, asesor en ${ciudad}. ¿${empresa} tiene seguro de vida colectivo para el equipo? Es el beneficio laboral más valorado y no requiere reconocimiento médico. ¿Lo vemos?`;
      return `Hola ${nombre}, soy Manuel, asesor financiero en ${ciudad}. Me gustaría presentarte algo que puede ser útil para tu situación. ¿Tienes 5 minutos esta semana?`;
    }

    if (tipo === "recordatorio_1") {
      if (esInmobiliaria)
        return `Hola ${nombre}, soy Manuel de nuevo. Te escribí hace unos días sobre generar comisiones adicionales para ${empresa} derivando clientes hipotecarios. Sé que estás ocupado. ¿Tienes 10 minutos esta semana?`;
      if (esAutonomo || esHosteleria)
        return `Hola ${nombre}, soy Manuel de nuevo. Te hablé del seguro para autónomos que cubre desde el primer día si te pones enfermo. ¿Sigue siendo algo que te interesa explorar?`;
      return `Hola ${nombre}, soy Manuel. Te contacté hace unos días sobre protección financiera para tu situación. ¿Tienes un momento esta semana para hablarlo?`;
    }

    if (tipo === "recordatorio_2") {
      if (esInmobiliaria)
        return `${nombre}, última vez que te escribo, lo prometo 😄 Trabajamos con inmobiliarias en ${ciudad} y el mes pasado generamos comisiones medias de 800-1.200€ por operación para sus directores. Si no es para ti, sin problema. ¿Lo descartamos?`;
      if (esAutonomo || esHosteleria)
        return `${nombre}, por si se perdió mi mensaje: con Contigo Autónomo cobrarías entre 10€ y 200€/día desde el primer día de baja. Desde 5€/mes. Si tienes 5 minutos, te explico cuánto te saldría exactamente.`;
      return `${nombre}, última vez. Si en algún momento quieres explorar opciones de protección financiera, aquí me tienes. Sin presión.`;
    }

    return "";
  }

  function abrirPanelMensaje() {
    setMensajeWhatsapp(generarMensaje("primer_contacto"));
    setMostrarEnvio(true);
  }

  async function enviarViaWhatsApp() {
    if (!lead?.telefono_whatsapp || !mensajeWhatsapp.trim()) return;
    const tel = lead.telefono_whatsapp.replace("+", "");
    const url = `https://wa.me/${tel}?text=${encodeURIComponent(mensajeWhatsapp)}`;
    window.open(url, "_blank");

    // Registrar en BD
    await supabase.from("interactions").insert({
      lead_id: lead.id,
      tipo: "whatsapp_enviado",
      mensaje: mensajeWhatsapp,
      origen: "comercial",
    });
    await supabase.from("leads").update({
      estado: "mensaje_enviado",
      updated_at: new Date().toISOString(),
    }).eq("id", lead.id);

    setInteractions(prev => [...prev, {
      id: Date.now().toString(),
      lead_id: lead!.id,
      tipo: "whatsapp_enviado",
      mensaje: mensajeWhatsapp,
      origen: "comercial",
      sentimiento: null,
      señal_escalado: false,
      created_at: new Date().toISOString(),
    } as Interaction]);

    setLead(prev => prev ? { ...prev, estado: "mensaje_enviado" } : prev);
    setMostrarEnvio(false);
  }

  async function copiarMensaje() {
    await navigator.clipboard.writeText(mensajeWhatsapp);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  return (
    <div className="space-y-6">
      {/* Back */}
      <button
        onClick={() => router.back()}
        className="text-sm text-slate-500 hover:text-slate-800 flex items-center gap-1"
      >
        ← Volver
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Columna izquierda: ficha del lead */}
        <div className="space-y-4">

          {/* Cabecera */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-start justify-between gap-2 mb-3">
              <div>
                <h1 className="text-xl font-bold text-slate-900">{nombreCompleto}</h1>
                {(lead.cargo || lead.empresa) && (
                  <p className="text-sm text-slate-500 mt-0.5">
                    {[lead.cargo, lead.empresa].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${estadoConfig.class}`}>
                {estadoConfig.label}
              </span>
            </div>

            <div className="flex flex-wrap gap-2 mb-4">
              <TemperaturaBadge temperatura={lead.temperatura} />
              <PrioridadBadge prioridad={lead.prioridad} />
              <FuenteBadge fuente={lead.fuente ?? null} />
            </div>

            <NivelInteresBar nivel={lead.nivel_interes} />
          </div>

          {/* Contacto */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-2">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Contacto</h3>
            {lead.telefono_whatsapp && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 w-20">WhatsApp</span>
                <a
                  href={`https://wa.me/${lead.telefono_whatsapp}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-green-600 hover:underline font-medium"
                >
                  {lead.telefono_whatsapp}
                </a>
              </div>
            )}
            {lead.telefono && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 w-20">Teléfono</span>
                <a href={`tel:${lead.telefono}`} className="text-sm text-slate-700">
                  {lead.telefono}
                </a>
              </div>
            )}
            {lead.email && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 w-20">Email</span>
                <a href={`mailto:${lead.email}`} className="text-sm text-slate-700 hover:underline truncate">
                  {lead.email}
                </a>
              </div>
            )}
            {lead.ciudad && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 w-20">Ciudad</span>
                <span className="text-sm text-slate-700">{lead.ciudad}</span>
              </div>
            )}
          </div>

          {/* Productos */}
          {lead.productos_recomendados && lead.productos_recomendados.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Productos recomendados</h3>
              <div className="space-y-1.5">
                {lead.productos_recomendados.map((p) => (
                  <div key={p} className="flex items-center gap-2">
                    <span
                      className={`text-sm ${
                        p === lead.producto_interes_principal
                          ? "font-semibold text-indigo-700"
                          : "text-slate-600"
                      }`}
                    >
                      {PRODUCTOS_NOMBRE[p] ?? p}
                    </span>
                    {p === lead.producto_interes_principal && (
                      <span className="text-xs bg-indigo-50 text-indigo-500 px-1.5 py-0.5 rounded">Principal</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Citas */}
          {appointments.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Citas</h3>
              <div className="space-y-2">
                {appointments.map((a) => (
                  <div key={a.id} className="flex items-start gap-3 p-2 rounded-lg bg-slate-50">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-700">
                        {a.tipo === "llamada" ? "Llamada" : a.tipo === "videollamada" ? "Videollamada" : "Reunión"}
                      </p>
                      <p className="text-xs text-slate-500">
                        {format(new Date(a.fecha_hora), "EEEE d MMM, HH:mm", { locale: es })}
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      a.estado === "confirmada" ? "bg-green-100 text-green-600" :
                      a.estado === "realizada" ? "bg-slate-100 text-slate-500" :
                      "bg-amber-100 text-amber-600"
                    }`}>
                      {a.estado}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notas */}
          {lead.notas && (
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Notas</h3>
              <p className="text-sm text-slate-600">{lead.notas}</p>
            </div>
          )}
        </div>

        {/* Columna derecha: envío + historial */}
        <div className="lg:col-span-2 space-y-4">

          {/* Panel de envío de mensaje */}
          {lead.telefono_whatsapp && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-800">Enviar mensaje</h2>
                {!mostrarEnvio && (
                  <button
                    onClick={abrirPanelMensaje}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 transition-colors"
                  >
                    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                    </svg>
                    Escribir a {lead.nombre}
                  </button>
                )}
              </div>

              {mostrarEnvio && (
                <div className="p-4 space-y-3">
                  {/* Selector de tipo de mensaje */}
                  <div className="flex gap-2 flex-wrap">
                    {[
                      { key: "primer_contacto", label: "Primer contacto" },
                      { key: "recordatorio_1", label: "Recordatorio 1" },
                      { key: "recordatorio_2", label: "Recordatorio 2" },
                    ].map(({ key, label }) => (
                      <button
                        key={key}
                        onClick={() => setMensajeWhatsapp(generarMensaje(key as "primer_contacto" | "recordatorio_1" | "recordatorio_2"))}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-600 transition-colors"
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* Textarea editable */}
                  <textarea
                    value={mensajeWhatsapp}
                    onChange={e => setMensajeWhatsapp(e.target.value)}
                    rows={5}
                    className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-indigo-300 resize-none text-slate-700 leading-relaxed"
                    placeholder="Escribe o edita el mensaje..."
                  />

                  <p className="text-xs text-slate-400">
                    Puedes editar el mensaje antes de enviarlo. Se abrirá WhatsApp con el texto pre-cargado.
                  </p>

                  {/* Acciones */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={enviarViaWhatsApp}
                      disabled={!mensajeWhatsapp.trim()}
                      className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-40 transition-colors"
                    >
                      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                      </svg>
                      Abrir en WhatsApp
                    </button>
                    <button
                      onClick={copiarMensaje}
                      className="px-4 py-2 text-sm font-medium border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                      {copiado ? "✓ Copiado" : "Copiar texto"}
                    </button>
                    <button
                      onClick={() => setMostrarEnvio(false)}
                      className="ml-auto px-3 py-2 text-xs text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-800">Conversación WhatsApp</h2>
            </div>

            <div className="overflow-y-auto max-h-[480px] p-4 space-y-3">
              {interactions.length === 0 ? (
                <p className="text-center text-sm text-slate-400 py-8">Sin interacciones todavía.</p>
              ) : (
                interactions.map((i) => (
                  <ChatBubble key={i.id} interaction={i} />
                ))
              )}
            </div>

            {/* Input para notas manuales del comercial */}
            <div className="border-t border-slate-100 p-3 flex gap-2">
              <input
                type="text"
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && guardarNota()}
                placeholder="Añadir nota del comercial..."
                className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-300"
              />
              <button
                onClick={guardarNota}
                disabled={!nota.trim() || guardando}
                className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors"
              >
                {guardando ? "..." : "Guardar"}
              </button>
            </div>
          </div>

        </div>
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
          <p className="text-xs text-amber-400 mt-1">
            {format(new Date(interaction.created_at), "HH:mm · d MMM", { locale: es })}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex ${isLead ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-sm rounded-2xl px-3.5 py-2.5 ${
          isLead
            ? "bg-slate-100 text-slate-800"
            : isBot
            ? "bg-indigo-600 text-white"
            : "bg-slate-800 text-white"
        }`}
      >
        {!isLead && (
          <p className={`text-xs mb-1 ${isBot ? "text-indigo-200" : "text-slate-400"}`}>
            {isBot ? "Bot" : "Comercial"}
          </p>
        )}
        <p className="text-sm leading-relaxed">{interaction.mensaje}</p>
        <p className={`text-xs mt-1 ${isLead ? "text-slate-400" : isBot ? "text-indigo-300" : "text-slate-500"}`}>
          {format(new Date(interaction.created_at), "HH:mm · d MMM", { locale: es })}
        </p>
      </div>
    </div>
  );
}
