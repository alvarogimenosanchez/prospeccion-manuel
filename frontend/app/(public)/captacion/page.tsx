"use client";

import { useState } from "react";

// ── Tipos ──────────────────────────────────────────────────────────────────────
type TipoLead = "autonomo" | "pyme" | "particular";
type Urgencia = "hoy_manana" | "esta_semana" | "dos_tres_semanas";

interface FormData {
  tipo_lead: TipoLead | null;
  preocupaciones: string[];
  nombre: string;
  telefono: string;
  ciudad: string;
  tiene_hijos: boolean | null;
  tiene_hipoteca: boolean | null;
  mayor_55: boolean | null;
  urgencia: Urgencia | null;
  // Honeypot — debe quedarse vacío. Si un bot lo rellena, descartamos el lead.
  website: string;
}

// ── Catálogos ──────────────────────────────────────────────────────────────────
const CIUDADES = [
  "Madrid", "Barcelona", "Valencia", "Sevilla", "Málaga",
  "Bilbao", "Zaragoza", "Alicante", "Murcia", "Valladolid", "Otra",
];

const PREOCUPACIONES = [
  { id: "no_trabajar",  emoji: "🤒", texto: "Qué pasa si me pongo enfermo y no puedo trabajar" },
  { id: "familia",      emoji: "👨‍👩‍👧", texto: "Dejar protegida económicamente a mi familia" },
  { id: "accidente",    emoji: "🦺", texto: "Protegerme ante un accidente grave" },
  { id: "ahorro",       emoji: "💰", texto: "Ahorrar o invertir de forma segura" },
  { id: "medico",       emoji: "🏥", texto: "Tener médico privado sin esperas" },
  { id: "hipoteca",     emoji: "🏠", texto: "Comprar una vivienda o conseguir hipoteca" },
  { id: "irpf",         emoji: "📉", texto: "Pagar menos impuestos (IRPF)" },
];

const NOMBRES_PRODUCTOS: Record<string, string> = {
  contigo_autonomo: "Protección para Autónomos",
  sialp:            "Ahorro Fiscal SIALP",
  contigo_familia:  "Seguro de Vida Familiar",
  contigo_pyme:     "Seguro Colectivo para Empresas",
  hipotecas:        "Asesoría Hipotecaria",
  mi_hogar:         "Seguro del Hogar",
  sanitas_salud:    "Seguro de Salud Sanitas",
  contigo_futuro:   "Plan de Ahorro Garantizado",
  liderplus:        "Seguro de Accidentes",
  contigo_senior:   "Protección para Mayores",
};

const ICONOS_PRODUCTOS: Record<string, string> = {
  contigo_autonomo: "🧑‍💼",
  sialp:            "📈",
  contigo_familia:  "👨‍👩‍👧",
  contigo_pyme:     "🏢",
  hipotecas:        "🏠",
  mi_hogar:         "🏡",
  sanitas_salud:    "🏥",
  contigo_futuro:   "💰",
  liderplus:        "🛡️",
  contigo_senior:   "👴",
};

// ── Lógica de recomendación ────────────────────────────────────────────────────
function calcularProductos(data: FormData): string[] {
  const { tipo_lead, preocupaciones, tiene_hijos, tiene_hipoteca, mayor_55 } = data;
  const productos: string[] = [];

  // Mayor de 55 → protección senior primero
  if (mayor_55) {
    productos.push("contigo_senior");
  }

  // Autónomo
  if (tipo_lead === "autonomo") {
    productos.push("contigo_autonomo"); // siempre para autónomos
    if (preocupaciones.includes("ahorro") || preocupaciones.includes("irpf")) {
      productos.push("sialp");
    }
    if (preocupaciones.includes("accidente")) {
      productos.push("liderplus");
    }
  }

  // Pyme/empresa
  if (tipo_lead === "pyme") {
    productos.push("contigo_pyme");
    if (preocupaciones.includes("ahorro") || preocupaciones.includes("irpf")) {
      productos.push("sialp");
    }
  }

  // Particular/empleado
  if (tipo_lead === "particular") {
    if (preocupaciones.includes("familia") || tiene_hijos) {
      productos.push("contigo_familia");
    }
    if (preocupaciones.includes("no_trabajar") || preocupaciones.includes("accidente")) {
      productos.push("liderplus");
    }
    if (preocupaciones.includes("ahorro") || preocupaciones.includes("irpf")) {
      productos.push("sialp", "contigo_futuro");
    }
  }

  // Transversales (aplican a todos)
  if (preocupaciones.includes("hipoteca") || tiene_hipoteca) {
    productos.push("hipotecas", "mi_hogar");
  }
  if (preocupaciones.includes("medico")) {
    productos.push("sanitas_salud");
  }

  // Dedup manteniendo orden
  return [...new Set(productos)].slice(0, 3);
}

// ── Componente principal ───────────────────────────────────────────────────────
export default function CaptacionPage() {
  const [paso, setPaso] = useState(0); // 0=bienvenida, 1-4=preguntas, 5=confirmación
  const [animando, setAnimando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [productosRecomendados, setProductosRecomendados] = useState<string[]>([]);

  const [form, setForm] = useState<FormData>({
    tipo_lead: null,
    preocupaciones: [],
    nombre: "",
    telefono: "",
    ciudad: "",
    tiene_hijos: null,
    tiene_hipoteca: null,
    mayor_55: null,
    urgencia: null,
    website: "",
  });

  const irAPaso = (siguiente: number) => {
    setAnimando(true);
    setTimeout(() => {
      setPaso(siguiente);
      setAnimando(false);
    }, 220);
  };

  const togglePreocupacion = (id: string) => {
    setForm(prev => ({
      ...prev,
      preocupaciones: prev.preocupaciones.includes(id)
        ? prev.preocupaciones.filter(p => p !== id)
        : [...prev.preocupaciones, id],
    }));
  };

  const guardarYFinalizar = async (urgencia: Urgencia) => {
    const datosFinales = { ...form, urgencia };
    setForm(datosFinales);
    const productos = calcularProductos(datosFinales);
    setProductosRecomendados(productos);
    setGuardando(true);

    try {
      await fetch("/api/public/captacion-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: datosFinales.nombre,
          telefono: datosFinales.telefono,
          ciudad: datosFinales.ciudad || null,
          tipo_lead: datosFinales.tipo_lead,
          tiene_hijos: datosFinales.tiene_hijos,
          tiene_hipoteca: datosFinales.tiene_hipoteca,
          mayor_55: datosFinales.mayor_55,
          urgencia,
          preocupaciones: datosFinales.preocupaciones,
          productos_recomendados: productos,
          website: datosFinales.website,
        }),
      });
    } catch {
      // Silencioso — el lead puede no guardarse si el backend no está disponible
    } finally {
      setGuardando(false);
      irAPaso(5);
    }
  };

  const progreso = paso === 0 ? 0 : Math.round((paso / 5) * 100);

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Barra de progreso */}
      {paso > 0 && paso < 5 && (
        <div className="fixed top-0 left-0 right-0 z-10 bg-white border-b border-slate-100">
          <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
            <span className="text-xs font-medium text-slate-500 whitespace-nowrap">
              Paso {paso} de 4
            </span>
            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-orange-600 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${progreso}%` }}
              />
            </div>
            <span className="text-xs font-semibold text-orange-600 whitespace-nowrap">
              {progreso}%
            </span>
          </div>
        </div>
      )}

      {/* Contenido principal */}
      <div
        className={`flex-1 flex items-center justify-center px-4 transition-all duration-220 ${
          paso > 0 && paso < 5 ? "pt-16" : ""
        } ${animando ? "opacity-0 translate-y-2" : "opacity-100 translate-y-0"}`}
        style={{ transition: "opacity 220ms ease, transform 220ms ease" }}
      >
        <div className="w-full max-w-lg py-8">

          {/* ── PASO 0: Bienvenida ── */}
          {paso === 0 && (
            <div className="text-center space-y-6">
              <div className="flex justify-center">
                <div className="w-16 h-16 rounded-full bg-orange-600 flex items-center justify-center text-white text-2xl font-bold shadow-lg shadow-orange-200">
                  M
                </div>
              </div>
              <div className="space-y-3">
                <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 leading-tight">
                  Descubre qué producto financiero se adapta a ti
                </h1>
                <p className="text-slate-500 text-base leading-relaxed">
                  Responde 5 preguntas y te recomiendo exactamente lo que necesitas.
                  <br className="hidden sm:block" />
                  Sin compromiso, gratis.
                </p>
              </div>
              <button
                onClick={() => irAPaso(1)}
                className="inline-flex items-center gap-2 px-8 py-4 bg-orange-600 text-white text-lg font-semibold rounded-2xl hover:bg-orange-700 active:bg-orange-800 transition-colors shadow-lg shadow-orange-200"
              >
                Empezar
                <span className="text-xl">→</span>
              </button>
              <p className="text-xs text-slate-400">
                Manuel García · Asesor Financiero · Nationale-Nederlanden
              </p>
            </div>
          )}

          {/* ── PASO 1: Situación ── */}
          {paso === 1 && (
            <div className="space-y-5">
              <div className="space-y-1">
                <h2 className="text-xl font-bold text-slate-800">¿Cuál es tu situación?</h2>
                <p className="text-sm text-slate-500">Elige la opción que mejor te describe</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { emoji: "🧑‍💼", titulo: "Soy autónomo o freelance", desc: "Trabajas por cuenta propia", tipo: "autonomo" as TipoLead },
                  { emoji: "🏢", titulo: "Tengo una empresa con empleados", desc: "Eres empresario o diriges un equipo", tipo: "pyme" as TipoLead },
                  { emoji: "👨‍👩‍👧", titulo: "Soy empleado / particular", desc: "Trabajas por cuenta ajena", tipo: "particular" as TipoLead },
                  { emoji: "🏠", titulo: "Busco financiación o hipoteca", desc: "Quieres comprar vivienda", tipo: "particular" as TipoLead, señal: "hipoteca" },
                ].map(opcion => (
                  <button
                    key={opcion.titulo}
                    onClick={() => {
                      const nuevaPreocupaciones = opcion.señal === "hipoteca"
                        ? [...new Set([...form.preocupaciones, "hipoteca"])]
                        : form.preocupaciones;
                      setForm(prev => ({ ...prev, tipo_lead: opcion.tipo, preocupaciones: nuevaPreocupaciones }));
                      irAPaso(2);
                    }}
                    className="flex items-start gap-3 p-4 rounded-xl border-2 border-slate-200 hover:border-orange-400 hover:bg-orange-50 active:bg-orange-100 transition-all text-left group"
                  >
                    <span className="text-2xl mt-0.5">{opcion.emoji}</span>
                    <div>
                      <p className="font-semibold text-slate-800 text-sm group-hover:text-orange-700 transition-colors">
                        {opcion.titulo}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">{opcion.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── PASO 2: Preocupaciones ── */}
          {paso === 2 && (
            <div className="space-y-5">
              <div className="space-y-1">
                <h2 className="text-xl font-bold text-slate-800">¿Qué te preocupa más?</h2>
                <p className="text-sm text-slate-500">Puedes elegir varias opciones</p>
              </div>
              <div className="grid grid-cols-1 gap-2.5">
                {PREOCUPACIONES.map(p => {
                  const activa = form.preocupaciones.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      onClick={() => togglePreocupacion(p.id)}
                      className={`flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 transition-all text-left ${
                        activa
                          ? "border-orange-500 bg-orange-50"
                          : "border-slate-200 hover:border-orange-300 hover:bg-slate-50"
                      }`}
                    >
                      <span className="text-xl flex-shrink-0">{p.emoji}</span>
                      <span className={`text-sm font-medium ${activa ? "text-orange-700" : "text-slate-700"}`}>
                        {p.texto}
                      </span>
                      <div className={`ml-auto w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                        activa ? "border-orange-500 bg-orange-500" : "border-slate-300"
                      }`}>
                        {activa && (
                          <svg viewBox="0 0 10 8" className="w-2.5 h-2" fill="none">
                            <path d="M1 4l2.5 2.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => irAPaso(3)}
                disabled={form.preocupaciones.length === 0}
                className="w-full py-4 bg-orange-600 text-white font-semibold rounded-xl hover:bg-orange-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Continuar →
              </button>
            </div>
          )}

          {/* ── PASO 3: Datos personales ── */}
          {paso === 3 && (
            <div className="space-y-5">
              <div className="space-y-1">
                <h2 className="text-xl font-bold text-slate-800">Un poco más sobre ti</h2>
                <p className="text-sm text-slate-500">Para que Manuel pueda contactarte</p>
              </div>
              <div className="space-y-4">
                {/* Honeypot anti-bot — invisible para humanos, los bots autocompletan */}
                <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", top: "-9999px", height: 0, width: 0, overflow: "hidden" }}>
                  <label>
                    Web (no rellenar)
                    <input
                      type="text"
                      name="website"
                      tabIndex={-1}
                      autoComplete="off"
                      value={form.website}
                      onChange={e => setForm(prev => ({ ...prev, website: e.target.value }))}
                    />
                  </label>
                </div>

                {/* Nombre */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Nombre <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.nombre}
                    onChange={e => setForm(prev => ({ ...prev, nombre: e.target.value }))}
                    placeholder="Tu nombre"
                    className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-orange-400 focus:outline-none text-slate-800 placeholder:text-slate-400 transition-colors"
                  />
                </div>

                {/* Teléfono */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Teléfono WhatsApp <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-sm font-medium">🇪🇸 +34</span>
                    <input
                      type="tel"
                      value={form.telefono}
                      onChange={e => {
                        const val = e.target.value.replace(/[^0-9]/g, "").slice(0, 9);
                        setForm(prev => ({ ...prev, telefono: val }));
                      }}
                      placeholder="600 000 000"
                      className="w-full pl-20 pr-4 py-3 rounded-xl border-2 border-slate-200 focus:border-orange-400 focus:outline-none text-slate-800 placeholder:text-slate-400 transition-colors"
                    />
                  </div>
                </div>

                {/* Ciudad */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Ciudad
                  </label>
                  <select
                    value={form.ciudad}
                    onChange={e => setForm(prev => ({ ...prev, ciudad: e.target.value }))}
                    className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-orange-400 focus:outline-none text-slate-800 bg-white transition-colors appearance-none"
                  >
                    <option value="">Seleccionar ciudad...</option>
                    {CIUDADES.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                {/* Preguntas contextuales */}
                <div className="grid grid-cols-1 gap-3">
                  {/* Hijos — siempre relevante */}
                  <div>
                    <p className="text-sm font-medium text-slate-700 mb-2">¿Tienes hijos o personas a tu cargo?</p>
                    <div className="flex gap-2">
                      {[{ label: "Sí", val: true }, { label: "No", val: false }].map(op => (
                        <button
                          key={op.label}
                          onClick={() => setForm(prev => ({ ...prev, tiene_hijos: op.val }))}
                          className={`flex-1 py-2.5 rounded-xl text-sm font-medium border-2 transition-all ${
                            form.tiene_hijos === op.val
                              ? "bg-orange-600 border-orange-600 text-white"
                              : "border-slate-200 text-slate-600 hover:border-orange-300"
                          }`}
                        >
                          {op.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Hipoteca — solo si NO eligieron "hipoteca" ya en preocupaciones */}
                  {!form.preocupaciones.includes("hipoteca") && (
                    <div>
                      <p className="text-sm font-medium text-slate-700 mb-2">¿Tienes hipoteca o vivienda en propiedad?</p>
                      <div className="flex gap-2">
                        {[{ label: "Sí", val: true }, { label: "No", val: false }].map(op => (
                          <button
                            key={op.label}
                            onClick={() => setForm(prev => ({ ...prev, tiene_hipoteca: op.val }))}
                            className={`flex-1 py-2.5 rounded-xl text-sm font-medium border-2 transition-all ${
                              form.tiene_hipoteca === op.val
                                ? "bg-orange-600 border-orange-600 text-white"
                                : "border-slate-200 text-slate-600 hover:border-orange-300"
                            }`}
                          >
                            {op.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Edad — relevante para contigo_senior */}
                  <div>
                    <p className="text-sm font-medium text-slate-700 mb-2">¿Tienes más de 55 años?</p>
                    <div className="flex gap-2">
                      {[{ label: "Sí", val: true }, { label: "No", val: false }].map(op => (
                        <button
                          key={op.label}
                          onClick={() => setForm(prev => ({ ...prev, mayor_55: op.val }))}
                          className={`flex-1 py-2.5 rounded-xl text-sm font-medium border-2 transition-all ${
                            form.mayor_55 === op.val
                              ? "bg-orange-600 border-orange-600 text-white"
                              : "border-slate-200 text-slate-600 hover:border-orange-300"
                          }`}
                        >
                          {op.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <button
                onClick={() => irAPaso(4)}
                disabled={!form.nombre.trim() || form.telefono.length < 9}
                className="w-full py-4 bg-orange-600 text-white font-semibold rounded-xl hover:bg-orange-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Continuar →
              </button>
            </div>
          )}

          {/* ── PASO 4: Urgencia ── */}
          {paso === 4 && (
            <div className="space-y-5">
              <div className="space-y-1">
                <h2 className="text-xl font-bold text-slate-800">¿Cuándo prefieres que te contactemos?</h2>
                <p className="text-sm text-slate-500">Manuel se ajusta a tu ritmo</p>
              </div>
              <div className="space-y-3">
                {[
                  { emoji: "⚡", titulo: "Lo antes posible", desc: "Hoy o mañana", val: "hoy_manana" as Urgencia },
                  { emoji: "📅", titulo: "Esta semana, sin prisa", desc: "En los próximos días", val: "esta_semana" as Urgencia },
                  { emoji: "🗓️", titulo: "En 2-3 semanas", desc: "Cuando sea conveniente", val: "dos_tres_semanas" as Urgencia },
                ].map(op => (
                  <button
                    key={op.val}
                    onClick={() => guardarYFinalizar(op.val)}
                    disabled={guardando}
                    className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-slate-200 hover:border-orange-400 hover:bg-orange-50 active:bg-orange-100 transition-all text-left disabled:opacity-50 disabled:cursor-wait"
                  >
                    <span className="text-2xl">{op.emoji}</span>
                    <div>
                      <p className="font-semibold text-slate-800">{op.titulo}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{op.desc}</p>
                    </div>
                    <svg viewBox="0 0 20 20" className="w-4 h-4 text-slate-400 ml-auto" fill="currentColor">
                      <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd"/>
                    </svg>
                  </button>
                ))}
              </div>
              {guardando && (
                <p className="text-center text-sm text-slate-500 animate-pulse">Guardando tu información...</p>
              )}
            </div>
          )}

          {/* ── PASO 5: Confirmación ── */}
          {paso === 5 && (
            <div className="text-center space-y-8">
              {/* Checkmark animado */}
              <div className="flex justify-center">
                <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center">
                  <svg
                    viewBox="0 0 52 52"
                    className="w-10 h-10 text-emerald-600"
                    fill="none"
                    style={{ animation: "checkmark 0.6s ease-out forwards" }}
                  >
                    <style>{`
                      @keyframes checkmark {
                        0% { stroke-dashoffset: 60; opacity: 0; }
                        30% { opacity: 1; }
                        100% { stroke-dashoffset: 0; opacity: 1; }
                      }
                      .check-path {
                        stroke-dasharray: 60;
                        stroke-dashoffset: 60;
                        animation: checkmark 0.6s 0.2s ease-out forwards;
                      }
                    `}</style>
                    <path
                      className="check-path"
                      d="M14 27l9 9 15-18"
                      stroke="currentColor"
                      strokeWidth="3.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              </div>

              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-slate-800">¡Perfecto, {form.nombre.split(" ")[0]}!</h2>
                <p className="text-slate-500 text-base">
                  Manuel te contactará en menos de 24 horas por WhatsApp.
                </p>
              </div>

              {/* Productos recomendados */}
              {productosRecomendados.length > 0 && (
                <div className="space-y-3 text-left">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-center">
                    Productos que te recomendamos
                  </p>
                  <div className="space-y-2.5">
                    {productosRecomendados.map((prod, i) => (
                      <div
                        key={prod}
                        className={`flex items-center gap-3 p-3.5 rounded-xl border ${
                          i === 0
                            ? "border-orange-200 bg-orange-50"
                            : "border-slate-200 bg-slate-50"
                        }`}
                      >
                        <span className="text-xl">{ICONOS_PRODUCTOS[prod] ?? "📋"}</span>
                        <div className="flex-1">
                          <p className={`font-semibold text-sm ${i === 0 ? "text-orange-700" : "text-slate-700"}`}>
                            {NOMBRES_PRODUCTOS[prod] ?? prod}
                          </p>
                          {i === 0 && (
                            <p className="text-xs text-orange-500 mt-0.5">Recomendación principal</p>
                          )}
                        </div>
                        {i === 0 && (
                          <span className="text-xs bg-orange-600 text-white px-2 py-0.5 rounded-full font-medium">
                            #1
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-xs text-slate-400 pb-4">
                Manuel García · Asesor Financiero · Nationale-Nederlanden
              </p>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
