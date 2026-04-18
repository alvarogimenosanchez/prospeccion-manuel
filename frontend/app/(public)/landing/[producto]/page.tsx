"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type LandingContent = {
  headline: string;
  subheadline: string;
  problemas: { icono: string; texto: string }[];
  beneficios: string[];
  precio: string;
  color: string;
  icono: string;
  cta: string;
  testimonios?: { texto: string; autor: string; cargo: string }[];
};

const LANDINGS: Record<string, LandingContent> = {
  autonomo: {
    headline: "Si mañana no puedes trabajar, ¿cuánto tiempo aguantas sin ingresos?",
    subheadline: "Contigo Autónomo te cubre desde el primer día de baja. Desde 5€/mes.",
    problemas: [
      { icono: "😰", texto: "Los autónomos no cobran baja laboral como los empleados" },
      { icono: "📉", texto: "Una enfermedad o accidente puede dejarte semanas sin ingresos" },
      { icono: "⏳", texto: "La Seguridad Social solo cubre el 60% y con retrasos de semanas" },
    ],
    beneficios: [
      "Cobras entre 10€ y 200€/día desde el día 1 de baja",
      "Cubre tanto enfermedad como accidente",
      "Chat médico y asesoría legal 24h incluidos sin coste extra",
    ],
    precio: "Desde 5,25€/mes",
    color: "orange",
    icono: "🧑‍💼",
    cta: "Quiero saber cuánto me costaría",
    testimonios: [
      { texto: "Me operé de la rodilla y cobré 150€/día durante 3 semanas. Sin el seguro no sé cómo lo habría pasado.", autor: "Javier M.", cargo: "Fontanero autónomo, Madrid" },
      { texto: "Por 12€ al mes tengo la tranquilidad de que si me pongo malo, no pierdo mi negocio.", autor: "Carmen R.", cargo: "Fisioterapeuta, Barcelona" },
    ],
  },
  familia: {
    headline: "¿Qué pasaría con tu familia si ya no estuvieras?",
    subheadline: "Contigo Familia. Hasta 1.000.000€ de cobertura. Desde 5€/mes.",
    problemas: [
      { icono: "🏠", texto: "Una hipoteca sin cubrir puede dejar a tu familia sin casa" },
      { icono: "💸", texto: "Los gastos no paran aunque los ingresos sí lo hagan" },
      { icono: "😟", texto: "Solo un seguro de vida garantiza que tu familia esté realmente protegida" },
    ],
    beneficios: [
      "Capital hasta 1.000.000€ para proteger a los tuyos",
      "Totalmente modular: pagas exactamente lo que necesitas",
      "Sin examen médico para importes estándar",
    ],
    precio: "Desde 5,25€/mes",
    color: "emerald",
    icono: "👨‍👩‍👧",
    cta: "Calcular mi cobertura ideal",
    testimonios: [
      { texto: "Pensaba que era caro hasta que me explicaron que por 8€/mes podía dejar a mis hijos protegidos.", autor: "Ana P.", cargo: "Enfermera, Valencia" },
    ],
  },
  hipotecas: {
    headline: "¿Buscas hipoteca? Conseguimos las mejores condiciones sin coste para ti",
    subheadline: "Accedemos a múltiples bancos en una sola gestión. Respuesta en 48-72h.",
    problemas: [
      { icono: "🏦", texto: "Cada banco ofrece condiciones diferentes y comparar lleva semanas" },
      { icono: "😤", texto: "Negociar solo con el banco es difícil — ellos tienen toda la ventaja" },
      { icono: "💰", texto: "Muchos se quedan con la primera oferta sin saber que podían mejorarla" },
    ],
    beneficios: [
      "Comparamos múltiples entidades bancarias simultáneamente",
      "Negociamos en tu nombre con experiencia real del mercado",
      "Sin coste para ti — el banco nos paga a nosotros",
    ],
    precio: "Gratis para el cliente",
    color: "blue",
    icono: "🏠",
    cta: "Quiero estudiar mi hipoteca",
    testimonios: [
      { texto: "Me ahorraron 0,3 puntos de interés. En 25 años son miles de euros.", autor: "David L.", cargo: "Comprador primera vivienda, Sevilla" },
    ],
  },
  ahorro: {
    headline: "¿Estás ahorrando o simplemente guardando dinero en el banco?",
    subheadline: "SIALP: ahorra hasta 5.000€/año con exención total de IRPF. Capital garantizado.",
    problemas: [
      { icono: "📉", texto: "El dinero en cuenta corriente pierde valor cada año por la inflación" },
      { icono: "🔒", texto: "Los planes de pensiones tienen restricciones duras de liquidez" },
      { icono: "💸", texto: "Pagar más impuestos de los necesarios es dinero que simplemente regalas" },
    ],
    beneficios: [
      "Exención total de IRPF sobre rendimientos al 5º año",
      "El 85% del capital garantizado sea cual sea el mercado",
      "Rescatable cuando quieras (con o sin ventaja fiscal)",
    ],
    precio: "Hasta 5.000€/año",
    color: "violet",
    icono: "💰",
    cta: "Ver cuánto me ahorro en impuestos",
  },
  pyme: {
    headline: "¿Tu equipo sabe que los cuidas?",
    subheadline: "Seguro colectivo de vida sin reconocimiento médico. El beneficio que más valoran tus empleados.",
    problemas: [
      { icono: "👋", texto: "Retener talento es cada vez más difícil y caro" },
      { icono: "📊", texto: "Los empleados no valoran los aumentos de sueldo igual que los beneficios reales" },
      { icono: "⚠️", texto: "Una empresa sin seguro colectivo está desprotegida ante cualquier imprevisto" },
    ],
    beneficios: [
      "Sin cuestionario médico individual — toda la plantilla de golpe",
      "Mejora la retención y satisfacción del equipo de forma demostrada",
      "Deducible como gasto empresarial",
    ],
    precio: "Precio según plantilla",
    color: "orange",
    icono: "🏢",
    cta: "Pedir información para mi empresa",
    testimonios: [
      { texto: "Mis 6 empleados me lo agradecieron más que la última subida de sueldo.", autor: "Roberto S.", cargo: "Director, Gestoría Alcalá" },
    ],
  },
  senior: {
    headline: "Entre 55 y 80 años: mereces estar protegido",
    subheadline: "Contigo Senior. Cobertura hasta 65.000€ con acceso a Sanitas. Desde 42€/mes.",
    problemas: [
      { icono: "🚫", texto: "Muchos seguros no aceptan a mayores de 65 o 70 años" },
      { icono: "🏥", texto: "Un accidente a esta edad puede tener consecuencias muy graves y costosas" },
      { icono: "⏱️", texto: "El acceso rápido a especialistas marca la diferencia cuando más importa" },
    ],
    beneficios: [
      "Acepta hasta 80 años sin reconocimiento médico",
      "Cobertura en caso de accidente hasta 65.000€",
      "Teléfono médico Sanitas 24h incluido",
    ],
    precio: "Desde 42€/mes",
    color: "teal",
    icono: "🌟",
    cta: "Quiero más información",
  },
};

const COLOR_MAP: Record<string, {
  bg: string; text: string; btn: string; light: string; border: string;
  gradient: string; ring: string;
}> = {
  indigo: { bg: "bg-indigo-600", text: "text-indigo-600", btn: "bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800", light: "bg-indigo-50", border: "border-indigo-200", gradient: "from-indigo-600 to-indigo-800", ring: "ring-indigo-500" },
  emerald: { bg: "bg-emerald-600", text: "text-emerald-600", btn: "bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800", light: "bg-emerald-50", border: "border-emerald-200", gradient: "from-emerald-600 to-emerald-800", ring: "ring-emerald-500" },
  blue: { bg: "bg-blue-600", text: "text-blue-600", btn: "bg-blue-600 hover:bg-blue-700 active:bg-blue-800", light: "bg-blue-50", border: "border-blue-200", gradient: "from-blue-600 to-blue-800", ring: "ring-blue-500" },
  violet: { bg: "bg-violet-600", text: "text-violet-600", btn: "bg-violet-600 hover:bg-violet-700 active:bg-violet-800", light: "bg-violet-50", border: "border-violet-200", gradient: "from-violet-600 to-violet-800", ring: "ring-violet-500" },
  orange: { bg: "bg-orange-600", text: "text-orange-600", btn: "bg-orange-600 hover:bg-orange-700 active:bg-orange-800", light: "bg-orange-50", border: "border-orange-200", gradient: "from-orange-600 to-orange-800", ring: "ring-orange-500" },
  teal: { bg: "bg-teal-600", text: "text-teal-600", btn: "bg-teal-600 hover:bg-teal-700 active:bg-teal-800", light: "bg-teal-50", border: "border-teal-200", gradient: "from-teal-600 to-teal-800", ring: "ring-teal-500" },
};

const CIUDADES = ["Madrid", "Barcelona", "Valencia", "Sevilla", "Málaga", "Bilbao", "Zaragoza", "Alicante", "Murcia", "Otra"];

const PRODUCTO_A_LEAD: Record<string, string[]> = {
  autonomo: ["contigo_autonomo"],
  familia: ["contigo_familia"],
  hipotecas: ["hipotecas"],
  ahorro: ["sialp", "contigo_futuro"],
  pyme: ["contigo_pyme"],
  senior: ["contigo_senior"],
};

const NOMBRE_PRODUCTO: Record<string, string> = {
  autonomo: "autonomo",
  familia: "particular",
  hipotecas: "particular",
  ahorro: "particular",
  pyme: "pyme",
  senior: "particular",
};

type FormState = { nombre: string; telefono: string; ciudad: string };
type Paso = "idle" | "form" | "enviando" | "ok" | "error";

export default function LandingPage({ params }: { params: { producto: string } }) {
  const content = LANDINGS[params.producto];
  const [paso, setPaso] = useState<Paso>("idle");
  const [form, setForm] = useState<FormState>({ nombre: "", telefono: "", ciudad: "" });

  if (!content) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <p className="text-slate-500 text-lg">Página no encontrada</p>
          <Link href="/captacion" className="mt-4 inline-block hover:underline" style={{ color: "#ea650d" }}>Ver todos los productos →</Link>
        </div>
      </div>
    );
  }

  const c = COLOR_MAP[content.color] || COLOR_MAP.indigo;

  async function enviarFormulario(e: React.FormEvent) {
    e.preventDefault();
    setPaso("enviando");
    try {
      await supabase.from("leads").insert({
        nombre: form.nombre.trim(),
        telefono_whatsapp: `+34${form.telefono.replace(/\s/g, "")}`,
        ciudad: form.ciudad || null,
        tipo_lead: NOMBRE_PRODUCTO[params.producto] ?? "particular",
        fuente: "inbound",
        fuente_detalle: `landing_${params.producto}`,
        estado: "nuevo",
        temperatura: "templado",
        nivel_interes: 6,
        prioridad: "media",
        productos_recomendados: PRODUCTO_A_LEAD[params.producto] ?? [],
        producto_interes_principal: PRODUCTO_A_LEAD[params.producto]?.[0] ?? null,
        notas: `Lead desde landing de ${params.producto}. Ciudad: ${form.ciudad || "no indicada"}.`,
      });
      setPaso("ok");
    } catch {
      setPaso("error");
    }
  }

  const formularioValido = form.nombre.trim().length > 1 && form.telefono.replace(/\s/g, "").length === 9;

  return (
    <div className="min-h-screen bg-white">

      {/* ── HERO ── */}
      <section className={`bg-gradient-to-br ${c.gradient} text-white`}>
        <div className="max-w-3xl mx-auto px-6 py-16 sm:py-20">
          <div className="text-center mb-10">
            <div className="text-5xl mb-5">{content.icono}</div>
            <h1 className="text-3xl sm:text-4xl font-extrabold leading-tight mb-4 tracking-tight">
              {content.headline}
            </h1>
            <p className="text-lg sm:text-xl opacity-90 max-w-xl mx-auto">
              {content.subheadline}
            </p>
          </div>

          {/* CTA principal */}
          {paso === "idle" && (
            <div className="flex flex-col items-center gap-3">
              <button
                onClick={() => setPaso("form")}
                className="bg-white text-slate-900 font-bold text-lg px-10 py-4 rounded-2xl hover:bg-slate-100 transition-colors shadow-xl"
              >
                {content.cta} →
              </button>
              <p className="text-sm opacity-70">Sin compromiso · Respuesta en menos de 24h</p>
            </div>
          )}

          {/* Formulario en el hero */}
          {(paso === "form" || paso === "enviando") && (
            <form
              onSubmit={enviarFormulario}
              className="bg-white rounded-2xl p-6 shadow-2xl max-w-md mx-auto space-y-4"
            >
              <h3 className="text-slate-800 font-bold text-lg text-center">
                Te contactamos hoy
              </h3>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Tu nombre</label>
                <input
                  type="text"
                  required
                  value={form.nombre}
                  onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))}
                  placeholder="Nombre y apellidos"
                  className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-orange-400 focus:outline-none text-slate-800 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Teléfono WhatsApp</label>
                <div className="flex items-center gap-2">
                  <span className="px-3 py-3 bg-slate-100 rounded-xl text-sm font-medium text-slate-600 border-2 border-slate-200 whitespace-nowrap">🇪🇸 +34</span>
                  <input
                    type="tel"
                    required
                    value={form.telefono}
                    onChange={e => {
                      const val = e.target.value.replace(/[^0-9]/g, "").slice(0, 9);
                      setForm(p => ({ ...p, telefono: val }));
                    }}
                    placeholder="600 000 000"
                    className="flex-1 px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-orange-400 focus:outline-none text-slate-800 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Ciudad</label>
                <select
                  value={form.ciudad}
                  onChange={e => setForm(p => ({ ...p, ciudad: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-orange-400 focus:outline-none text-slate-800 text-sm bg-white appearance-none"
                >
                  <option value="">Seleccionar ciudad...</option>
                  {CIUDADES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <button
                type="submit"
                disabled={!formularioValido || paso === "enviando"}
                className={`w-full py-4 text-white font-bold text-base rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${c.btn}`}
              >
                {paso === "enviando" ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                    </svg>
                    Enviando...
                  </span>
                ) : "Quiero que me contacten →"}
              </button>
              <p className="text-xs text-slate-400 text-center">Manuel te responde en menos de 24h · Sin compromiso</p>
            </form>
          )}

          {/* Confirmación */}
          {paso === "ok" && (
            <div className="bg-white rounded-2xl p-8 shadow-2xl max-w-md mx-auto text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
                <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                </svg>
              </div>
              <h3 className="text-slate-800 font-bold text-xl">¡Perfecto, {form.nombre.split(" ")[0]}!</h3>
              <p className="text-slate-500">Manuel te contactará en menos de 24 horas por WhatsApp.</p>
            </div>
          )}

          {paso === "error" && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-6 max-w-md mx-auto text-center">
              <p className="text-red-700 font-medium">Ha habido un error. Por favor, inténtalo de nuevo.</p>
              <button onClick={() => setPaso("form")} className="mt-3 text-sm text-red-600 underline">Volver al formulario</button>
            </div>
          )}
        </div>
      </section>

      {/* ── PROBLEMA ── */}
      <section className="max-w-3xl mx-auto px-6 py-14">
        <h2 className="text-2xl font-bold text-slate-800 mb-2 text-center">¿Te suena alguna de estas situaciones?</h2>
        <p className="text-slate-500 text-center mb-8 text-sm">Si dijiste sí a alguna, sigue leyendo.</p>
        <div className="space-y-3">
          {content.problemas.map((p, i) => (
            <div key={i} className={`flex items-center gap-4 p-4 rounded-xl ${c.light} border ${c.border}`}>
              <span className="text-2xl flex-shrink-0">{p.icono}</span>
              <p className="text-slate-700 font-medium text-sm sm:text-base">{p.texto}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── SOLUCIÓN ── */}
      <section className="bg-slate-50 py-14">
        <div className="max-w-3xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-slate-800 mb-2 text-center">Así es como lo resolvemos</h2>
          <p className="text-slate-500 text-center mb-8 text-sm">Sin letra pequeña, sin complicaciones.</p>
          <div className="space-y-3">
            {content.beneficios.map((b, i) => (
              <div key={i} className="flex items-start gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <div className={`w-7 h-7 rounded-full ${c.bg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                  </svg>
                </div>
                <p className="text-slate-700 font-medium text-sm sm:text-base">{b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIOS ── */}
      {content.testimonios && content.testimonios.length > 0 && (
        <section className="max-w-3xl mx-auto px-6 py-14">
          <h2 className="text-2xl font-bold text-slate-800 mb-8 text-center">Lo que dicen quienes ya lo tienen</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {content.testimonios.map((t, i) => (
              <div key={i} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                <div className="flex gap-1 mb-3">
                  {[1,2,3,4,5].map(s => (
                    <svg key={s} className="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                    </svg>
                  ))}
                </div>
                <p className="text-slate-700 text-sm leading-relaxed mb-4">"{t.texto}"</p>
                <div>
                  <p className="font-semibold text-slate-800 text-sm">{t.autor}</p>
                  <p className="text-xs text-slate-400">{t.cargo}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── PRECIO + CTA FINAL ── */}
      <section className={`bg-gradient-to-br ${c.gradient} py-16`}>
        <div className="max-w-xl mx-auto px-6 text-center text-white">
          <div className="bg-white/20 backdrop-blur rounded-2xl px-8 py-4 inline-block mb-6">
            <p className="text-sm opacity-80 uppercase tracking-wide font-medium mb-1">Precio</p>
            <p className="text-3xl font-extrabold">{content.precio}</p>
          </div>
          <h2 className="text-2xl font-bold mb-3">¿Quieres saber exactamente cuánto te costaría?</h2>
          <p className="opacity-85 mb-8 text-sm">Cuéntame tu situación y te doy una recomendación personalizada. Sin compromiso.</p>
          {paso !== "ok" ? (
            <button
              onClick={() => { setPaso("form"); window.scrollTo({ top: 0, behavior: "smooth" }); }}
              className="bg-white text-slate-900 font-bold text-lg px-10 py-4 rounded-2xl hover:bg-slate-100 transition-colors shadow-xl"
            >
              {content.cta} →
            </button>
          ) : (
            <div className="bg-white/20 rounded-2xl px-8 py-4">
              <p className="font-semibold">¡Ya tienes tu solicitud enviada! Manuel te contactará pronto.</p>
            </div>
          )}
          <p className="mt-3 text-sm opacity-70">Manuel te responde en menos de 24 horas</p>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-slate-100 py-8 bg-white">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold" style={{ background: "#ea650d" }}>M</div>
            <span className="font-semibold text-slate-700">Manuel García</span>
          </div>
          <p className="text-sm text-slate-400">Asesor Financiero · Nationale-Nederlanden</p>
          <div className="flex flex-wrap items-center justify-center gap-4 mt-4">
            {Object.keys(LANDINGS).map(slug => (
              <Link key={slug} href={`/landing/${slug}`} className="text-xs text-slate-400 hover:text-slate-600 capitalize">
                {slug === "autonomo" ? "Autónomos" : slug === "familia" ? "Familias" : slug === "hipotecas" ? "Hipotecas" : slug === "ahorro" ? "Ahorro" : slug === "pyme" ? "Pymes" : "Seniors"}
              </Link>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
