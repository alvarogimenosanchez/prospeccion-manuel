"use client";

import { useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type TipoCliente = "autonomo" | "pyme" | "particular" | "empresa";
type Necesidad = "baja_laboral" | "vida_familiar" | "hipoteca" | "empleados" | "pension" | "salud" | "hogar";

type Perfil = {
  tipo: TipoCliente;
  sector: string;
  edad: number;
  empleados: number;
  necesidades: Necesidad[];
  tieneHipoteca: boolean;
  tieneHijos: boolean;
};

type ProductoRecomendado = {
  id: string;
  nombre: string;
  descripcion: string;
  coberturaPrincipal: string;
  precioDesde: number;
  precioHasta: number;
  fit: number; // 0-100
  argumentos: string[];
  objeciones: { objecion: string; respuesta: string }[];
  pitch: string;
  color: string;
  icon: string;
};

// ─── Product definitions ──────────────────────────────────────────────────────

const PRODUCTOS_DB: Record<string, Omit<ProductoRecomendado, "fit">> = {
  contigo_autonomo: {
    id: "contigo_autonomo",
    nombre: "Contigo Autónomo",
    descripcion: "Protección por baja laboral desde el día 1 para autónomos",
    coberturaPrincipal: "Baja por enfermedad/accidente · Capital IT · Hospitalización",
    precioDesde: 5,
    precioHasta: 50,
    color: "#ea650d",
    icon: "🧑‍💼",
    argumentos: [
      "Cubre desde el PRIMER día de baja (no desde el 4º como la Seguridad Social)",
      "El autónomo cobra directamente, sin trámites complejos",
      "Cubre accidentes laborales y enfermedades comunes",
      "Precio desde 5€/mes, deducible fiscalmente como gasto de empresa",
      "Si estás de baja, tus gastos fijos no esperan",
    ],
    objeciones: [
      { objecion: "Ya tengo la mutua", respuesta: "La mutua cubre desde el día 4. Contigo cubre desde el día 1, y esos 3 primeros días son los más frecuentes." },
      { objecion: "Es muy caro", respuesta: `¿Cuánto pierdes por día sin trabajar? Este seguro cuesta menos de 1 día tuyo al mes.` },
      { objecion: "Nunca me pongo enfermo", respuesta: "Perfecto, esperemos que siga así. Pero los accidentes no avisan — y los trabajadores manuales tienen más riesgo." },
    ],
    pitch: "Hola {{nombre}}, quería comentarte algo que puede interesarte si eres autónomo. Si algún día tienes que coger una baja por enfermedad o accidente, ¿sabes que los gastos fijos del negocio no paran? Tengo un seguro desde 5€/mes que te cubre desde el primer día de baja y te paga directamente. ¿Tienes 5 minutos para que te lo cuente?",
  },
  contigo_pyme: {
    id: "contigo_pyme",
    nombre: "Contigo Pyme",
    descripcion: "Seguro colectivo de baja laboral para empresas con empleados",
    coberturaPrincipal: "IT colectivo · Accidentes laborales · Responsabilidad civil",
    precioDesde: 15,
    precioHasta: 200,
    color: "#2563eb",
    icon: "🏢",
    argumentos: [
      "Cubre a todos los empleados con una sola póliza",
      "Precio muy competitivo por volumen",
      "El empresario puede ofrecerlo como beneficio social (retención de talento)",
      "Deducible fiscalmente al 100% como gasto de empresa",
      "Gestión centralizada, sin papeleo por empleado",
    ],
    objeciones: [
      { objecion: "Ya tenemos seguro de empresa", respuesta: "¿Cubre específicamente la baja laboral de cada empleado? La mayoría de seguros de empresa solo cubren RC o locales, no la IT del trabajador." },
      { objecion: "Es muy complicado de gestionar", respuesta: "Con Contigo Pyme tenéis un único interlocutor y una sola póliza para todos. Nosotros gestionamos todo." },
    ],
    pitch: "Buenos días {{nombre}}, le contacto porque tenemos un producto diseñado para empresas como la suya. Con Contigo Pyme puede cubrir a todos sus empleados ante bajas por enfermedad o accidente con una única póliza. Es un gran beneficio social para su equipo y totalmente deducible. ¿Le interesaría ver los números?",
  },
  contigo_familia: {
    id: "contigo_familia",
    nombre: "Contigo Familia",
    descripcion: "Seguro de vida y protección familiar completa",
    coberturaPrincipal: "Vida · Invalidez · Enfermedad grave · Orfandad",
    precioDesde: 15,
    precioHasta: 80,
    color: "#16a34a",
    icon: "👨‍👩‍👧",
    argumentos: [
      "Protege a tu familia si falleces o quedas inválido",
      "Cubre enfermedades graves (cáncer, infarto, ictus) con capital al diagnóstico",
      "Cubre la hipoteca si no puedes trabajar",
      "Garantiza el futuro de tus hijos",
      "Precio desde 15€/mes con coberturas de hasta 300.000€",
    ],
    objeciones: [
      { objecion: "Soy joven y sano", respuesta: "Precisamente. Cuanto antes contrates, más barato es. Y las enfermedades graves pueden aparecer a cualquier edad." },
      { objecion: "Ya tengo el seguro de la hipoteca", respuesta: "El seguro del banco solo cubre el préstamo. Contigo Familia cubre también la pérdida de ingresos y deja un capital para tu familia." },
    ],
    pitch: "Hola {{nombre}}, ¿has pensado qué pasaría con tu familia si mañana no pudieras trabajar? Tengo un seguro familiar desde 15€/mes que cubre vida, invalidez y enfermedades graves. Si tienes hipoteca o hijos, vale la pena que te lo cuente. ¿Tienes un momento?",
  },
  contigo_futuro: {
    id: "contigo_futuro",
    nombre: "Contigo Futuro",
    descripcion: "Plan de ahorro y pensión complementaria para autónomos",
    coberturaPrincipal: "Ahorro · Pensión · Rentabilidad garantizada",
    precioDesde: 50,
    precioHasta: 500,
    color: "#7c3aed",
    icon: "🔮",
    argumentos: [
      "El autónomo no tiene pensión de empresa — este es su plan B",
      "Ahorro sistemático con rentabilidad garantizada",
      "Deducible en IRPF hasta el máximo legal",
      "Capital disponible en caso de necesidad (con condiciones)",
      "Complemento ideal a la pensión pública para mantener nivel de vida",
    ],
    objeciones: [
      { objecion: "Prefiero el banco", respuesta: "Un depósito bancario no tiene ventajas fiscales. Con Contigo Futuro ahorras impuestos ahora y aseguras el capital para el futuro." },
      { objecion: "Ya cotizo a la Seguridad Social", respuesta: "La pensión pública media para autónomos es muy baja. Este plan complementa hasta el nivel de vida que deseas mantener." },
    ],
    pitch: "{{nombre}}, ¿has pensado en tu jubilación? Como autónomo, la pensión que vas a cobrar puede ser muy inferior a tu sueldo actual. Con Contigo Futuro ahorras de forma sistemática, con ventajas fiscales y rentabilidad garantizada. ¿Le damos un vistazo a lo que tendrías en 20 años?",
  },
  sialp: {
    id: "sialp",
    nombre: "SIALP",
    descripcion: "Seguro Individual de Ahorro a Largo Plazo — máxima eficiencia fiscal",
    coberturaPrincipal: "Ahorro exento de IRPF · Rentabilidad · Capital garantizado",
    precioDesde: 83,
    precioHasta: 5000,
    color: "#b45309",
    icon: "💎",
    argumentos: [
      "Rendimientos EXENTOS de IRPF si se mantiene más de 5 años",
      "Aportación máxima 5.000€/año",
      "Capital 100% garantizado",
      "Ideal para autónomos o directivos con excedentes de liquidez",
      "El mejor vehículo de ahorro fiscal disponible en España hoy",
    ],
    objeciones: [
      { objecion: "¿Mejor que un fondo de inversión?", respuesta: "Fiscalmente sí: con SIALP los rendimientos son EXENTOS de IRPF. En un fondo pagas impuestos por las ganancias. En 20 años, la diferencia es enorme." },
    ],
    pitch: "{{nombre}}, ¿sabías que hay un producto financiero en España donde los rendimientos están completamente exentos de IRPF? El SIALP permite ahorrar hasta 5.000€/año con capital garantizado y sin pagar impuestos por las ganancias. Es lo más eficiente fiscalmente que hay ahora mismo. ¿Quieres que te lo explique?",
  },
  mihogar: {
    id: "mihogar",
    nombre: "MiHogar",
    descripcion: "Seguro de hogar completo para propietarios e inquilinos",
    coberturaPrincipal: "Continente · Contenido · RC familiar · Asistencia",
    precioDesde: 12,
    precioHasta: 60,
    color: "#0891b2",
    icon: "🏠",
    argumentos: [
      "Cubre daños al inmueble y al contenido",
      "Responsabilidad civil familiar ilimitada",
      "Asistencia 24h (fontanero, electricista, cerrajero)",
      "Precio muy competitivo — a menudo más barato que el banco",
      "Proceso de contratación en 5 minutos",
    ],
    objeciones: [
      { objecion: "Ya tengo el del banco", respuesta: "El seguro del banco suele ser caro y básico. Podemos ofrecerte las mismas coberturas por menos, o más coberturas por el mismo precio." },
    ],
    pitch: "Hola {{nombre}}, ¿tienes seguro de hogar? Si quieres, puedo revisar qué coberturas tienes ahora y comparar. En muchos casos conseguimos mejores coberturas por menos dinero. ¿Te parece si lo revisamos juntos?",
  },
  hipotecas: {
    id: "hipotecas",
    nombre: "Hipotecas / Derivación",
    descripcion: "Programa de derivación hipotecaria — comisiones por cliente referido",
    coberturaPrincipal: "Comisiones por derivación · Sin riesgo · Clientes cualificados",
    precioDesde: 0,
    precioHasta: 0,
    color: "#64748b",
    icon: "🤝",
    argumentos: [
      "Tú derivamos al cliente, nosotros gestionamos, tú cobras comisión",
      "Sin riesgo — no tienes que vender nada, solo presentar",
      "Clientes que van a comprar casa siempre necesitan hipoteca",
      "Ideal para inmobiliarias, asesores fiscales, arquitectos",
      "Proceso sencillo — un formulario y ya está",
    ],
    objeciones: [
      { objecion: "No entiendo de hipotecas", respuesta: "No necesitas entenderlas. Tú presentas al cliente, nuestro equipo hace el resto. Tú solo cobras la comisión." },
    ],
    pitch: "Buenos días {{nombre}}, le contacto porque tenemos un programa de derivación hipotecaria muy interesante para profesionales como usted. Por cada cliente que nos deriva y firma hipoteca, usted cobra una comisión sin ningún trabajo adicional. ¿Le gustaría conocer los detalles?",
  },
};

// ─── Scoring algorithm ────────────────────────────────────────────────────────

function calcularRecomendaciones(perfil: Perfil): ProductoRecomendado[] {
  const scores: Record<string, number> = {
    contigo_autonomo: 0,
    contigo_pyme: 0,
    contigo_familia: 0,
    contigo_futuro: 0,
    sialp: 0,
    mihogar: 0,
    hipotecas: 0,
  };

  // Base by client type
  if (perfil.tipo === "autonomo") {
    scores.contigo_autonomo += 40;
    scores.contigo_futuro += 20;
    scores.sialp += 15;
  }
  if (perfil.tipo === "pyme" || perfil.tipo === "empresa") {
    scores.contigo_pyme += 50;
    if (perfil.empleados >= 5) scores.contigo_pyme += 15;
  }
  if (perfil.tipo === "particular") {
    scores.contigo_familia += 30;
    scores.mihogar += 20;
  }

  // By needs
  if (perfil.necesidades.includes("baja_laboral")) {
    scores.contigo_autonomo += 30;
    scores.contigo_pyme += 20;
  }
  if (perfil.necesidades.includes("vida_familiar")) {
    scores.contigo_familia += 35;
  }
  if (perfil.necesidades.includes("hipoteca") || perfil.tieneHipoteca) {
    scores.contigo_familia += 20;
    scores.mihogar += 15;
  }
  if (perfil.necesidades.includes("empleados")) {
    scores.contigo_pyme += 30;
  }
  if (perfil.necesidades.includes("pension")) {
    scores.contigo_futuro += 40;
    scores.sialp += 25;
  }
  if (perfil.necesidades.includes("hogar")) {
    scores.mihogar += 35;
  }

  // By age
  if (perfil.edad >= 25 && perfil.edad <= 45 && perfil.tipo === "autonomo") {
    scores.contigo_autonomo += 10;
  }
  if (perfil.edad >= 40) {
    scores.contigo_futuro += 15;
    scores.sialp += 10;
  }
  if (perfil.edad >= 30 && perfil.tieneHijos) {
    scores.contigo_familia += 20;
  }

  // By sector for derivaciones
  const sectoresDerivacion = ["inmobiliaria", "asesoría", "gestoría", "arquitectura", "banco"];
  if (sectoresDerivacion.some(s => perfil.sector.toLowerCase().includes(s))) {
    scores.hipotecas += 40;
  }

  // Normalize to 0-100
  const maxScore = Math.max(...Object.values(scores));
  const resultado: ProductoRecomendado[] = Object.entries(scores)
    .filter(([, s]) => s > 0)
    .map(([id, s]) => ({
      ...PRODUCTOS_DB[id],
      fit: Math.min(100, Math.round((s / Math.max(maxScore, 1)) * 100)),
    }))
    .sort((a, b) => b.fit - a.fit)
    .slice(0, 4);

  return resultado;
}

// ─── Price estimator ──────────────────────────────────────────────────────────

function estimarPrecio(id: string, edad: number, empleados: number): string {
  if (id === "contigo_autonomo") {
    const base = edad < 35 ? 5 : edad < 45 ? 10 : edad < 55 ? 18 : 25;
    return `~${base}–${base * 3}€/mes`;
  }
  if (id === "contigo_pyme") {
    const base = Math.max(15, empleados * 8);
    return `~${base}–${base * 2}€/mes`;
  }
  if (id === "contigo_familia") {
    const base = edad < 35 ? 15 : edad < 45 ? 25 : edad < 55 ? 40 : 60;
    return `~${base}–${base * 2}€/mes`;
  }
  if (id === "contigo_futuro") return "desde 50€/mes";
  if (id === "sialp") return "desde 83€/mes (1.000€/año)";
  if (id === "mihogar") return "~12–45€/mes";
  if (id === "hipotecas") return "Sin coste — comisión por derivación";
  return "";
}

// ─── Constants ────────────────────────────────────────────────────────────────

const NECESIDADES_CFG: Record<Necesidad, string> = {
  baja_laboral:   "🤕 Baja laboral",
  vida_familiar:  "👨‍👩‍👧 Vida / Familia",
  hipoteca:       "🏠 Hipoteca",
  empleados:      "👥 Empleados",
  pension:        "🔮 Pensión / Ahorro",
  salud:          "🏥 Salud",
  hogar:          "🏡 Hogar",
};

const SECTORES_RAPIDOS = [
  "Hostelería", "Construcción", "Inmobiliaria", "Comercio", "Asesoría/Gestoría",
  "Transporte", "Peluquería/Estética", "Clínica/Salud", "Informática/Tech", "Otro",
];

// ─── Main component ───────────────────────────────────────────────────────────

export default function SimuladorPage() {
  const [perfil, setPerfil] = useState<Perfil>({
    tipo: "autonomo",
    sector: "",
    edad: 38,
    empleados: 1,
    necesidades: [],
    tieneHipoteca: false,
    tieneHijos: false,
  });
  const [calculado, setCalculado] = useState(false);
  const [recomendaciones, setRecomendaciones] = useState<ProductoRecomendado[]>([]);
  const [expandido, setExpandido] = useState<string | null>(null);
  const [nombreCliente, setNombreCliente] = useState("");

  function calcular() {
    const recs = calcularRecomendaciones(perfil);
    setRecomendaciones(recs);
    setCalculado(true);
    setExpandido(recs[0]?.id ?? null);
  }

  function toggleNecesidad(n: Necesidad) {
    setPerfil(p => ({
      ...p,
      necesidades: p.necesidades.includes(n)
        ? p.necesidades.filter(x => x !== n)
        : [...p.necesidades, n],
    }));
    setCalculado(false);
  }

  function buildPitch(template: string): string {
    return template.replace("{{nombre}}", nombreCliente || "[nombre del cliente]");
  }

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-slate-900">Simulador de productos</h1>
          <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full" style={{ background: "#fef3c7", color: "#92400e", border: "1px solid #fbbf24" }}>
            Demo · No operativo
          </span>
        </div>
        <p className="text-sm text-slate-500 mt-0.5">
          Introduce el perfil del cliente para ver qué productos encajan mejor y recibir argumentarios listos para usar.
        </p>
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5">
          <p className="text-xs text-amber-800">
            <strong>Versión demo:</strong> esta funcionalidad aún no se usa en producción. Las recomendaciones son orientativas y no están conectadas con datos reales del cliente.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* ── LEFT: Profile form ── */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-5">
          <h2 className="text-base font-semibold text-slate-800">Perfil del cliente</h2>

          {/* Name (optional) */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5 uppercase tracking-wide">Nombre (opcional)</label>
            <input value={nombreCliente} onChange={e => setNombreCliente(e.target.value)}
              placeholder="Para personalizar el pitch..."
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-400" />
          </div>

          {/* Client type */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5 uppercase tracking-wide">Tipo de cliente</label>
            <div className="grid grid-cols-2 gap-2">
              {([
                { id: "autonomo",   label: "Autónomo",     icon: "🧑‍💼" },
                { id: "pyme",       label: "Pyme",          icon: "🏢" },
                { id: "particular", label: "Particular",    icon: "👤" },
                { id: "empresa",    label: "Gran empresa",  icon: "🏭" },
              ] as const).map(t => (
                <button key={t.id} onClick={() => { setPerfil(p => ({ ...p, tipo: t.id })); setCalculado(false); }}
                  className={`px-3 py-2.5 text-sm font-medium rounded-xl border transition-colors text-left ${
                    perfil.tipo === t.id
                      ? "border-orange-400 text-white"
                      : "border-slate-200 text-slate-600 hover:border-orange-200 bg-white"
                  }`}
                  style={perfil.tipo === t.id ? { background: "#ea650d" } : undefined}>
                  {t.icon} {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Sector */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5 uppercase tracking-wide">Sector / actividad</label>
            <input value={perfil.sector} onChange={e => { setPerfil(p => ({ ...p, sector: e.target.value })); setCalculado(false); }}
              placeholder="Ej: hostelería, construcción..."
              list="sectores-list"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-400" />
            <datalist id="sectores-list">
              {SECTORES_RAPIDOS.map(s => <option key={s} value={s} />)}
            </datalist>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {SECTORES_RAPIDOS.slice(0, 6).map(s => (
                <button key={s} onClick={() => { setPerfil(p => ({ ...p, sector: s })); setCalculado(false); }}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    perfil.sector === s ? "border-orange-400 text-orange-700 bg-orange-50" : "border-slate-200 text-slate-500 hover:border-slate-300"
                  }`}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Age */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5 uppercase tracking-wide">
              Edad del cliente: <span className="text-orange-600 font-bold">{perfil.edad} años</span>
            </label>
            <input type="range" min={20} max={70} value={perfil.edad}
              onChange={e => { setPerfil(p => ({ ...p, edad: Number(e.target.value) })); setCalculado(false); }}
              className="w-full accent-orange-500" />
            <div className="flex justify-between text-xs text-slate-400 mt-1">
              <span>20</span><span>35</span><span>50</span><span>70</span>
            </div>
          </div>

          {/* Employees (pyme/empresa only) */}
          {(perfil.tipo === "pyme" || perfil.tipo === "empresa") && (
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5 uppercase tracking-wide">
                Número de empleados: <span className="text-orange-600 font-bold">{perfil.empleados}</span>
              </label>
              <input type="range" min={1} max={100} value={perfil.empleados}
                onChange={e => { setPerfil(p => ({ ...p, empleados: Number(e.target.value) })); setCalculado(false); }}
                className="w-full accent-orange-500" />
            </div>
          )}

          {/* Necesidades */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5 uppercase tracking-wide">Necesidades detectadas</label>
            <div className="flex flex-wrap gap-2">
              {(Object.entries(NECESIDADES_CFG) as [Necesidad, string][]).map(([k, label]) => (
                <button key={k} onClick={() => toggleNecesidad(k)}
                  className={`text-sm px-3 py-1.5 rounded-lg border transition-colors ${
                    perfil.necesidades.includes(k)
                      ? "border-orange-400 bg-orange-50 text-orange-700 font-medium"
                      : "border-slate-200 text-slate-500 hover:border-slate-300"
                  }`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Checkboxes */}
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
              <input type="checkbox" checked={perfil.tieneHipoteca}
                onChange={e => { setPerfil(p => ({ ...p, tieneHipoteca: e.target.checked })); setCalculado(false); }}
                className="accent-orange-500" />
              Tiene hipoteca
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
              <input type="checkbox" checked={perfil.tieneHijos}
                onChange={e => { setPerfil(p => ({ ...p, tieneHijos: e.target.checked })); setCalculado(false); }}
                className="accent-orange-500" />
              Tiene hijos
            </label>
          </div>

          <button onClick={calcular}
            className="w-full py-3 text-sm font-semibold text-white rounded-xl transition-opacity hover:opacity-90"
            style={{ background: "#ea650d" }}>
            ▶ Calcular recomendaciones
          </button>
        </div>

        {/* ── RIGHT: Recommendations ── */}
        <div className="space-y-3">
          {!calculado ? (
            <div className="bg-white rounded-2xl border border-dashed border-slate-200 py-16 text-center">
              <div className="text-4xl mb-3">🎯</div>
              <p className="text-sm text-slate-400">Rellena el perfil del cliente</p>
              <p className="text-xs text-slate-300 mt-1">y pulsa "Calcular" para ver las recomendaciones</p>
            </div>
          ) : recomendaciones.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 py-12 text-center">
              <p className="text-sm text-slate-400">Sin recomendaciones para este perfil.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-slate-800">Productos recomendados</h2>
                <span className="text-xs text-slate-400">{recomendaciones.length} resultados · por afinidad</span>
              </div>
              {recomendaciones.map((rec, idx) => (
                <div key={rec.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                  {/* Header row */}
                  <button
                    className="w-full px-5 py-4 flex items-center gap-4 text-left hover:bg-slate-50/50 transition-colors"
                    onClick={() => setExpandido(expandido === rec.id ? null : rec.id)}>
                    {/* Rank */}
                    <div className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white"
                      style={{ background: idx === 0 ? "#ea650d" : idx === 1 ? "#64748b" : "#94a3b8" }}>
                      {idx + 1}
                    </div>
                    {/* Icon + name */}
                    <div className="text-2xl shrink-0">{rec.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-slate-900">{rec.nombre}</span>
                        <span className="text-xs text-slate-400">{estimarPrecio(rec.id, perfil.edad, perfil.empleados)}</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5 truncate">{rec.descripcion}</p>
                    </div>
                    {/* Fit score */}
                    <div className="shrink-0 text-right">
                      <div className="text-lg font-bold" style={{ color: rec.color }}>{rec.fit}%</div>
                      <div className="text-[10px] text-slate-400">afinidad</div>
                    </div>
                    <svg className={`shrink-0 text-slate-400 transition-transform ${expandido === rec.id ? "rotate-180" : ""}`}
                      width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>

                  {/* Fit bar */}
                  <div className="mx-5 mb-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${rec.fit}%`, background: rec.color }} />
                  </div>

                  {/* Expanded content */}
                  {expandido === rec.id && (
                    <div className="px-5 pb-5 pt-3 space-y-4 border-t border-slate-100">
                      {/* Coverage */}
                      <div className="bg-slate-50 rounded-xl p-3">
                        <div className="text-xs font-semibold text-slate-600 mb-1">Coberturas principales</div>
                        <div className="text-xs text-slate-700">{rec.coberturaPrincipal}</div>
                      </div>

                      {/* Arguments */}
                      <div>
                        <div className="text-xs font-semibold text-slate-600 mb-2">Argumentos de venta</div>
                        <ul className="space-y-1.5">
                          {rec.argumentos.map((a, i) => (
                            <li key={i} className="flex items-start gap-2 text-xs text-slate-700">
                              <span className="text-green-500 shrink-0 mt-0.5">✓</span>
                              <span>{a}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Objections */}
                      <div>
                        <div className="text-xs font-semibold text-slate-600 mb-2">Objeciones frecuentes</div>
                        <div className="space-y-2">
                          {rec.objeciones.map((o, i) => (
                            <div key={i} className="bg-amber-50 rounded-lg p-2.5">
                              <div className="text-xs font-medium text-amber-800 mb-0.5">"{o.objecion}"</div>
                              <div className="text-xs text-amber-700">→ {o.respuesta}</div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Pitch */}
                      <div>
                        <div className="text-xs font-semibold text-slate-600 mb-2">Pitch de WhatsApp</div>
                        <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-xs text-slate-700 leading-relaxed whitespace-pre-line">
                          {buildPitch(rec.pitch)}
                        </div>
                        <button
                          onClick={() => navigator.clipboard?.writeText(buildPitch(rec.pitch))}
                          className="mt-2 text-xs text-green-700 hover:text-green-800 font-medium">
                          📋 Copiar al portapapeles
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
