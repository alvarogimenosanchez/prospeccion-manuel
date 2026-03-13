"use client";

import Link from "next/link";

type LandingContent = {
  headline: string;
  subheadline: string;
  problemas: string[];
  beneficios: string[];
  precio: string;
  color: string;
  icono: string;
  cta: string;
};

const LANDINGS: Record<string, LandingContent> = {
  autonomo: {
    headline: "Si mañana no puedes trabajar, ¿cuánto tiempo aguantas sin ingresos?",
    subheadline: "Contigo Autónomo te cubre desde el primer día de baja. Desde 5€/mes.",
    problemas: [
      "Los autónomos no cobran baja laboral como los empleados",
      "Una enfermedad o accidente puede dejarte semanas sin ingresos",
      "La Seguridad Social solo cubre el 60% y con retrasos de semanas",
    ],
    beneficios: [
      "Cobras entre 10€ y 200€/día desde el día 1 de baja",
      "Cubre tanto enfermedad como accidente",
      "Chat médico y asesoría legal 24h incluidos sin coste extra",
    ],
    precio: "Desde 5,25€/mes",
    color: "indigo",
    icono: "🧑‍💼",
    cta: "Quiero saber cuánto me costaría",
  },
  familia: {
    headline: "¿Qué pasaría con tu familia si ya no estuvieras?",
    subheadline: "Contigo Familia. Hasta 1.000.000€ de cobertura. Desde 5€/mes.",
    problemas: [
      "Una hipoteca sin cubrir puede dejar a tu familia sin casa",
      "Los gastos no paran aunque los ingresos sí lo hagan",
      "Solo un seguro de vida garantiza que tu familia esté realmente protegida",
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
  },
  hipotecas: {
    headline: "¿Buscas hipoteca? Conseguimos las mejores condiciones sin coste para ti",
    subheadline: "Accedemos a múltiples bancos en una sola gestión. Respuesta en 48-72h.",
    problemas: [
      "Cada banco ofrece condiciones diferentes y comparar lleva semanas",
      "Negociar solo con el banco es difícil — ellos tienen toda la ventaja",
      "Muchos se quedan con la primera oferta sin saber que podían mejorarla",
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
  },
  ahorro: {
    headline: "¿Estás ahorrando o simplemente guardando dinero en el banco?",
    subheadline: "SIALP: ahorra hasta 5.000€/año con exención total de IRPF. Capital garantizado.",
    problemas: [
      "El dinero en cuenta corriente pierde valor cada año por la inflación",
      "Los planes de pensiones tienen restricciones duras de liquidez",
      "Pagar más impuestos de los necesarios es dinero que simplemente regalas",
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
      "Retener talento es cada vez más difícil y caro",
      "Los empleados no valoran los aumentos de sueldo igual que los beneficios reales",
      "Una empresa sin seguro colectivo está desprotegida ante cualquier imprevisto",
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
  },
  senior: {
    headline: "Entre 55 y 80 años: mereces estar protegido",
    subheadline: "Contigo Senior. Cobertura hasta 65.000€ con acceso a Sanitas. Desde 42€/mes.",
    problemas: [
      "Muchos seguros no aceptan a mayores de 65 o 70 años",
      "Un accidente a esta edad puede tener consecuencias muy graves y costosas",
      "El acceso rápido a especialistas marca la diferencia cuando más importa",
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

const COLOR_MAP: Record<string, { bg: string; text: string; btn: string; light: string; border: string }> = {
  indigo: { bg: "bg-indigo-600", text: "text-indigo-600", btn: "bg-indigo-600 hover:bg-indigo-700", light: "bg-indigo-50", border: "border-indigo-200" },
  emerald: { bg: "bg-emerald-600", text: "text-emerald-600", btn: "bg-emerald-600 hover:bg-emerald-700", light: "bg-emerald-50", border: "border-emerald-200" },
  blue: { bg: "bg-blue-600", text: "text-blue-600", btn: "bg-blue-600 hover:bg-blue-700", light: "bg-blue-50", border: "border-blue-200" },
  violet: { bg: "bg-violet-600", text: "text-violet-600", btn: "bg-violet-600 hover:bg-violet-700", light: "bg-violet-50", border: "border-violet-200" },
  orange: { bg: "bg-orange-600", text: "text-orange-600", btn: "bg-orange-600 hover:bg-orange-700", light: "bg-orange-50", border: "border-orange-200" },
  teal: { bg: "bg-teal-600", text: "text-teal-600", btn: "bg-teal-600 hover:bg-teal-700", light: "bg-teal-50", border: "border-teal-200" },
};

export default function LandingPage({ params }: { params: { producto: string } }) {
  const content = LANDINGS[params.producto];

  if (!content) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <p className="text-slate-500 text-lg">Página no encontrada</p>
          <Link href="/captacion" className="mt-4 inline-block text-indigo-600 hover:underline">
            Ver todos los productos →
          </Link>
        </div>
      </div>
    );
  }

  const c = COLOR_MAP[content.color] || COLOR_MAP.indigo;

  return (
    <div className="min-h-screen bg-white">

      {/* HERO */}
      <section className={`${c.bg} text-white`}>
        <div className="max-w-3xl mx-auto px-6 py-16 text-center">
          <div className="text-5xl mb-4">{content.icono}</div>
          <h1 className="text-3xl sm:text-4xl font-bold leading-tight mb-4">
            {content.headline}
          </h1>
          <p className="text-lg sm:text-xl opacity-90 mb-8">
            {content.subheadline}
          </p>
          <Link
            href="/captacion"
            className="inline-block bg-white text-slate-900 font-semibold text-lg px-8 py-4 rounded-xl hover:bg-slate-100 transition-colors shadow-lg"
          >
            {content.cta} →
          </Link>
          <p className="mt-4 text-sm opacity-75">Sin compromiso · Respuesta en menos de 24h</p>
        </div>
      </section>

      {/* PROBLEMA */}
      <section className="max-w-3xl mx-auto px-6 py-14">
        <h2 className="text-2xl font-bold text-slate-800 mb-2 text-center">
          ¿Te suena alguna de estas situaciones?
        </h2>
        <p className="text-slate-500 text-center mb-8">Si dijiste sí a alguna, sigue leyendo.</p>
        <div className="space-y-4">
          {content.problemas.map((p, i) => (
            <div key={i} className={`flex items-start gap-4 p-4 rounded-xl ${c.light} border ${c.border}`}>
              <span className="text-2xl mt-0.5">⚠️</span>
              <p className="text-slate-700 font-medium">{p}</p>
            </div>
          ))}
        </div>
      </section>

      {/* SOLUCIÓN */}
      <section className="bg-slate-50 py-14">
        <div className="max-w-3xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-slate-800 mb-2 text-center">
            Así es como lo resolvemos
          </h2>
          <p className="text-slate-500 text-center mb-8">Sin letra pequeña, sin complicaciones.</p>
          <div className="space-y-4">
            {content.beneficios.map((b, i) => (
              <div key={i} className="flex items-start gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <div className={`w-7 h-7 rounded-full ${c.bg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-slate-700 font-medium">{b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRECIO + CTA */}
      <section className="max-w-3xl mx-auto px-6 py-14 text-center">
        <div className={`inline-block ${c.light} border ${c.border} rounded-2xl px-8 py-6 mb-8`}>
          <p className="text-sm text-slate-500 uppercase tracking-wide font-medium mb-1">Precio</p>
          <p className={`text-3xl font-bold ${c.text}`}>{content.precio}</p>
        </div>
        <h2 className="text-2xl font-bold text-slate-800 mb-3">
          ¿Quieres saber exactamente cuánto te costaría?
        </h2>
        <p className="text-slate-500 mb-8">
          Cuéntame tu situación en 2 minutos y te doy una recomendación personalizada. Sin compromiso.
        </p>
        <Link
          href="/captacion"
          className={`inline-block ${c.btn} text-white font-semibold text-lg px-10 py-4 rounded-xl transition-colors shadow-md`}
        >
          {content.cta} →
        </Link>
        <p className="mt-3 text-sm text-slate-400">Manuel te responde en menos de 24 horas</p>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-slate-100 py-8">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white text-sm font-bold">M</div>
            <span className="font-semibold text-slate-700">Manuel García</span>
          </div>
          <p className="text-sm text-slate-400">Asesor Financiero · Nationale-Nederlanden</p>
          <div className="flex items-center justify-center gap-4 mt-4">
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
