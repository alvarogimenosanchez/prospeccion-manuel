"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type Mensaje = { role: "user" | "assistant"; content: string };

type LeadBasico = {
  id: string;
  nombre: string;
  apellidos: string | null;
  empresa: string | null;
  sector: string | null;
  tipo_lead: string | null;
};

const PROMPTS_RAPIDOS = [
  {
    grupo: "Mensajes WhatsApp",
    items: [
      { label: "Autónomo hostelería", prompt: "Escríbeme un mensaje WhatsApp de primer contacto para un autónomo de hostelería (bar o restaurante). Quiero hablarle de Contigo Autónomo." },
      { label: "Inmobiliaria", prompt: "Escríbeme un mensaje WhatsApp para el director de una inmobiliaria. Quiero presentarle la posibilidad de generar comisiones derivando clientes hipotecarios." },
      { label: "Asesoría/Gestoría", prompt: "Escríbeme un mensaje WhatsApp para una asesoría o gestoría. Quiero presentarles Contigo Autónomo como servicio para sus clientes autónomos." },
      { label: "PYME con empleados", prompt: "Escríbeme un mensaje WhatsApp para el director de una pyme con empleados. Quiero presentarle Contigo Pyme (seguro colectivo)." },
      { label: "Seguimiento (no responde)", prompt: "Escríbeme un mensaje de seguimiento para un lead que no ha respondido a mi primer mensaje. Tono natural, sin presión." },
    ],
  },
  {
    grupo: "Scripts de llamada",
    items: [
      { label: "Primer contacto autónomo", prompt: "Dame un script de llamada de primer contacto para un autónomo. Quiero presentarle Contigo Autónomo. Incluye cómo abrir la llamada, 2-3 preguntas abiertas y cómo cerrar con próxima acción." },
      { label: "Primer contacto inmobiliaria", prompt: "Dame un script de llamada para el director de una inmobiliaria. Quiero presentarle el acuerdo de derivación hipotecaria. Incluye apertura, preguntas clave y cierre." },
      { label: "Llamada de seguimiento", prompt: "Dame un script para una llamada de seguimiento a un lead que mostró interés pero no ha vuelto a responder. ¿Cómo retomar la conversación?" },
    ],
  },
  {
    grupo: "Manejo de objeciones",
    items: [
      { label: "\"Ya tengo seguro\"", prompt: "Un lead me dice 'ya tengo seguro'. ¿Cómo respondo para diferenciarlo de Contigo Autónomo? Dame 2-3 respuestas posibles." },
      { label: "\"Es muy caro\"", prompt: "Un lead me dice que el seguro le parece caro. ¿Cómo justifico el precio de Contigo Autónomo (desde ~5€/mes) de forma concreta y convincente?" },
      { label: "\"No me interesa\"", prompt: "Un lead me dice que no le interesa. ¿Cómo cambio el ángulo para despertar su interés sin ser insistente? Dame 2 enfoques diferentes." },
      { label: "\"Ahora no es el momento\"", prompt: "Un lead me dice que ahora no es el momento. ¿Cómo respondo para no perderle pero tampoco presionarle?" },
    ],
  },
  {
    grupo: "Conocimiento de productos",
    items: [
      { label: "Contigo Autónomo", prompt: "Explícame Contigo Autónomo: qué cubre, precio aproximado, para quién es ideal y los 3 mejores argumentos de venta." },
      { label: "SIALP vs Plan Pensiones", prompt: "¿Cuáles son las diferencias entre el SIALP y un plan de pensiones? ¿Cuándo recomiendas uno u otro?" },
      { label: "Contigo Pyme", prompt: "Explícame Contigo Pyme: qué incluye, para qué tamaño de empresa es ideal, y cuál es el argumento principal para el director." },
      { label: "Sanitas Salud", prompt: "¿Cuándo recomiendas Sanitas Salud? Dame argumentos específicos para autónomos y para empresas con empleados." },
    ],
  },
];

export default function IAPage() {
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [input, setInput] = useState("");
  const [cargando, setCargando] = useState(false);
  const [leadContexto, setLeadContexto] = useState<LeadBasico | null>(null);
  const [busquedaLead, setBusquedaLead] = useState("");
  const [resultadosBusqueda, setResultadosBusqueda] = useState<LeadBasico[]>([]);
  const [buscandoLead, setBuscandoLead] = useState(false);
  const [copiadoIdx, setCopiadoIdx] = useState<number | null>(null);
  const [guardadoIdx, setGuardadoIdx] = useState<number | null>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  function copiarMensaje(content: string, idx: number) {
    navigator.clipboard.writeText(content);
    setCopiadoIdx(idx);
    setTimeout(() => setCopiadoIdx(null), 2000);
  }

  async function guardarComoNota(content: string, idx: number) {
    if (!leadContexto) return;
    await supabase.from("interactions").insert({
      lead_id: leadContexto.id,
      tipo: "nota_manual",
      mensaje: `🤖 IA: ${content}`,
      origen: "bot",
    });
    setGuardadoIdx(idx);
    setTimeout(() => setGuardadoIdx(null), 2500);
  }

  // Auto-scroll al último mensaje
  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });
  }, [mensajes, cargando]);

  // Buscar leads por nombre/empresa
  useEffect(() => {
    if (busquedaLead.trim().length < 2) { setResultadosBusqueda([]); return; }
    const timeout = setTimeout(async () => {
      setBuscandoLead(true);
      const { data } = await supabase
        .from("leads")
        .select("id, nombre, apellidos, empresa, sector, tipo_lead")
        .or(`nombre.ilike.%${busquedaLead}%,empresa.ilike.%${busquedaLead}%`)
        .limit(6);
      setResultadosBusqueda((data as LeadBasico[]) ?? []);
      setBuscandoLead(false);
    }, 300);
    return () => clearTimeout(timeout);
  }, [busquedaLead]);

  async function enviar(textoOverride?: string) {
    const texto = (textoOverride ?? input).trim();
    if (!texto || cargando) return;

    const nuevosMensajes: Mensaje[] = [...mensajes, { role: "user", content: texto }];
    setMensajes(nuevosMensajes);
    setInput("");
    setCargando(true);

    try {
      const res = await fetch(`/api/backend/ia/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nuevosMensajes,
          lead_id: leadContexto?.id ?? null,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setMensajes(prev => [...prev, { role: "assistant", content: data.respuesta }]);
    } catch {
      setMensajes(prev => [...prev, { role: "assistant", content: "Lo siento, hubo un error. Comprueba que el backend está activo e inténtalo de nuevo." }]);
    } finally {
      setCargando(false);
      inputRef.current?.focus();
    }
  }

  function usarPrompt(prompt: string) {
    setInput(prompt);
    inputRef.current?.focus();
  }

  function seleccionarLead(lead: LeadBasico) {
    setLeadContexto(lead);
    setBusquedaLead("");
    setResultadosBusqueda([]);
    setMensajes([]);
  }

  const nombreLead = leadContexto ? [leadContexto.nombre, leadContexto.apellidos].filter(Boolean).join(" ") : null;

  return (
    <div className="flex gap-0 h-[calc(100vh-2rem)] -mt-4 -mx-4 overflow-hidden" style={{ background: "#f1edeb" }}>

      {/* ── Columna izquierda: prompts rápidos ── */}
      <div className="w-64 flex-shrink-0 flex flex-col bg-white border-r border-slate-200 overflow-y-auto">
        <div className="px-4 py-4 border-b border-slate-100">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Prompts rápidos</p>
          <p className="text-xs text-slate-400 mt-0.5">Haz clic para cargar en el chat</p>
        </div>
        <div className="flex-1 px-2 py-3 space-y-4">
          {PROMPTS_RAPIDOS.map(grupo => (
            <div key={grupo.grupo}>
              <p className="px-2 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{grupo.grupo}</p>
              <div className="space-y-1">
                {grupo.items.map(item => (
                  <button
                    key={item.label}
                    onClick={() => usarPrompt(item.prompt)}
                    className="w-full text-left text-xs px-2.5 py-1.5 rounded-lg text-slate-600 hover:bg-orange-50 hover:text-orange-700 transition-colors"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Columna derecha: chat ── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Header */}
        <div className="bg-white border-b border-slate-200 px-5 py-3 flex items-center gap-3 flex-shrink-0">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
            style={{ background: "#ea650d" }}>
            ✦
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-800">Asistente IA comercial</p>
            <p className="text-xs text-slate-400">Mensajes WA · Scripts · Objeciones · Productos</p>
          </div>

          {/* Contexto de lead */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {leadContexto ? (
              <div className="flex items-center gap-2">
                <span className="text-xs px-2.5 py-1 rounded-full font-medium border"
                  style={{ background: "#fff5f0", borderColor: "#f5a677", color: "#c2530b" }}>
                  📋 {nombreLead || leadContexto.empresa || "Lead"}
                </span>
                <button
                  onClick={() => { setLeadContexto(null); setMensajes([]); }}
                  className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
                  title="Quitar contexto de lead"
                >
                  ✕
                </button>
              </div>
            ) : (
              <div className="relative">
                <input
                  type="text"
                  value={busquedaLead}
                  onChange={e => setBusquedaLead(e.target.value)}
                  placeholder="Añadir contexto de lead..."
                  className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 w-48 focus:outline-none focus:border-orange-300 bg-white"
                />
                {resultadosBusqueda.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 overflow-hidden">
                    {resultadosBusqueda.map(lead => (
                      <button
                        key={lead.id}
                        onClick={() => seleccionarLead(lead)}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-orange-50 transition-colors border-b border-slate-50 last:border-0"
                      >
                        <p className="font-medium text-slate-800">{[lead.nombre, lead.apellidos].filter(Boolean).join(" ")}</p>
                        {lead.empresa && <p className="text-slate-400">{lead.empresa} · {lead.sector}</p>}
                      </button>
                    ))}
                  </div>
                )}
                {buscandoLead && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-400 z-50">
                    Buscando...
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Área de mensajes */}
        <div ref={chatRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {/* Mensaje de bienvenida */}
          {mensajes.length === 0 && (
            <div className="flex gap-3 max-w-2xl">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5"
                style={{ background: "#ea650d" }}>
                ✦
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-slate-700 shadow-sm">
                <p className="font-medium mb-1">¡Hola! Soy tu asistente comercial.</p>
                <p className="text-slate-500">Puedo ayudarte a:</p>
                <ul className="mt-1.5 space-y-0.5 text-slate-500">
                  <li>• Redactar mensajes WhatsApp para cualquier tipo de lead</li>
                  <li>• Preparar scripts de llamada por sector</li>
                  <li>• Manejar objeciones con argumentos concretos</li>
                  <li>• Explicar productos NN España con argumentos de venta</li>
                </ul>
                <p className="mt-2 text-slate-400 text-xs">
                  {leadContexto
                    ? `Tengo contexto de ${nombreLead || "tu lead"} — mis respuestas estarán personalizadas.`
                    : "Puedes buscar un lead arriba para que mis respuestas sean más personalizadas."}
                </p>
              </div>
            </div>
          )}

          {/* Mensajes del chat */}
          {mensajes.map((m, i) => (
            <div key={i} className={`flex gap-3 ${m.role === "user" ? "justify-end" : "justify-start"} max-w-2xl ${m.role === "user" ? "ml-auto" : ""}`}>
              {m.role === "assistant" && (
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5"
                  style={{ background: "#ea650d" }}>
                  ✦
                </div>
              )}
              <div className="flex flex-col gap-1 max-w-xl">
                <div className={`px-4 py-3 rounded-2xl text-sm shadow-sm whitespace-pre-wrap ${
                  m.role === "user"
                    ? "text-white rounded-tr-sm"
                    : "bg-white border border-slate-200 text-slate-700 rounded-tl-sm"
                }`}
                  style={m.role === "user" ? { background: "#ea650d" } : undefined}>
                  {m.content}
                </div>
                {m.role === "assistant" && (
                  <div className="flex items-center gap-2 pl-1">
                    <button
                      onClick={() => copiarMensaje(m.content, i)}
                      className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      {copiadoIdx === i ? "✓ Copiado" : "Copiar"}
                    </button>
                    <button
                      onClick={() => setInput(m.content)}
                      className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      Editar
                    </button>
                    {leadContexto && (
                      <button
                        onClick={() => guardarComoNota(m.content, i)}
                        className="text-xs font-medium transition-colors"
                        style={{ color: guardadoIdx === i ? "#16a34a" : "#ea650d" }}
                      >
                        {guardadoIdx === i ? "✓ Guardado en lead" : "Guardar como nota →"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Indicador de carga */}
          {cargando && (
            <div className="flex gap-3 max-w-2xl">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5"
                style={{ background: "#ea650d" }}>
                ✦
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "#ea650d", animationDelay: "0ms" }} />
                  <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "#ea650d", animationDelay: "150ms" }} />
                  <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "#ea650d", animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="bg-white border-t border-slate-200 px-4 py-3 flex-shrink-0">
          <div className="flex gap-2 items-end">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); }
              }}
              placeholder="Escribe tu pregunta o usa los prompts rápidos de la izquierda... (Enter para enviar)"
              rows={2}
              className="flex-1 text-sm border border-slate-200 rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:border-orange-300 bg-white placeholder:text-slate-300"
              style={{ maxHeight: 120 }}
            />
            <button
              onClick={() => enviar()}
              disabled={!input.trim() || cargando}
              className="flex-shrink-0 w-10 h-10 rounded-xl text-white flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: "#ea650d" }}
              title="Enviar (Enter)"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
          {mensajes.length > 0 && (
            <button
              onClick={() => setMensajes([])}
              className="mt-1.5 text-xs text-slate-300 hover:text-slate-500 transition-colors"
            >
              Limpiar conversación
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
