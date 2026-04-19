"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { Suspense } from "react";
import { usePermisos } from "@/components/PermisosProvider";

type Estado =
  | "nuevo"
  | "segmentado"
  | "mensaje_generado"
  | "mensaje_enviado"
  | "respondio"
  | "cita_agendada"
  | "en_negociacion"
  | "cerrado_ganado"
  | "cerrado_perdido";

type Lead = {
  id: string;
  nombre: string;
  apellidos: string | null;
  empresa: string | null;
  sector: string | null;
  nivel_interes: number;
  ciudad: string | null;
  estado: Estado;
  updated_at: string;
  comercial_asignado: string | null;
  proxima_accion: string | null;
  proxima_accion_fecha: string | null;
  telefono_whatsapp: string | null;
  tipo_lead: string | null;
  productos_recomendados: string[] | null;
  producto_interes_principal: string | null;
};

const PRODUCTOS_CORTO: Record<string, string> = {
  contigo_futuro:   "C.Futuro",
  sialp:            "SIALP",
  contigo_autonomo: "Autónomo",
  contigo_familia:  "Familia",
  contigo_pyme:     "Pyme",
  contigo_senior:   "Senior",
  liderplus:        "Lider+",
  sanitas_salud:    "Sanitas",
  mihogar:          "MiHogar",
  hipotecas:        "Hipoteca",
};

const TIPO_LEAD_CFG: Record<string, { label: string; color: string }> = {
  autonomo:  { label: "Autónomo",  color: "#7c3aed" },
  empresa:   { label: "Empresa",   color: "#0284c7" },
  pyme:      { label: "PYME",      color: "#0369a1" },
  particular:{ label: "Particular",color: "#64748b" },
  directivo: { label: "Directivo", color: "#b45309" },
};

type Columna = {
  estado: Estado;
  label: string;
  color: string;
  bg: string;
  dot: string;
};

const COLUMNAS: Columna[] = [
  { estado: "nuevo",            label: "Nuevo",           color: "border-slate-300",   bg: "bg-slate-50",    dot: "bg-slate-400"   },
  { estado: "segmentado",       label: "Segmentado",      color: "border-sky-300",     bg: "bg-sky-50",      dot: "bg-sky-500"     },
  { estado: "mensaje_generado", label: "Msg. listo",      color: "border-cyan-300",    bg: "bg-cyan-50",     dot: "bg-cyan-500"    },
  { estado: "mensaje_enviado",  label: "Contactado",      color: "border-blue-300",    bg: "bg-blue-50",     dot: "bg-blue-500"    },
  { estado: "respondio",        label: "Respondió",       color: "border-amber-300",   bg: "bg-amber-50",    dot: "bg-amber-500"   },
  { estado: "cita_agendada",    label: "Cita agendada",   color: "border-orange-300",  bg: "bg-orange-50",   dot: "bg-orange-500"  },
  { estado: "en_negociacion",   label: "En negociación",  color: "border-violet-300",  bg: "bg-violet-50",   dot: "bg-violet-500"  },
  { estado: "cerrado_ganado",   label: "Ganado",          color: "border-emerald-300", bg: "bg-emerald-50",  dot: "bg-emerald-500" },
];

const ESTADOS_CERRADOS: Estado[] = ["cerrado_ganado", "cerrado_perdido"];

function diasDesde(fecha: string): number {
  return Math.floor((Date.now() - new Date(fecha).getTime()) / 86_400_000);
}

function diasDesdeLabel(fecha: string): string {
  const dias = diasDesde(fecha);
  if (dias === 0) return "hoy";
  if (dias === 1) return "ayer";
  return `hace ${dias}d`;
}

/** Devuelve info de la próxima acción para mostrar en la card */
function infoProximaAccion(
  accion: string | null,
  fecha: string | null
): { texto: string; clase: string } {
  if (!accion) {
    return { texto: "Sin acción", clase: "text-slate-300" };
  }

  const accionCorta = accion.length > 20 ? accion.slice(0, 20) + "…" : accion;

  if (!fecha) {
    return { texto: accionCorta, clase: "text-slate-400" };
  }

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const fechaAccion = new Date(fecha);
  fechaAccion.setHours(0, 0, 0, 0);
  const diffDias = Math.round((fechaAccion.getTime() - hoy.getTime()) / 86_400_000);

  if (diffDias < 0) {
    // Vencida
    return { texto: `⚠ ${accionCorta} · vencida`, clase: "text-red-500 font-medium" };
  }
  if (diffDias === 0) {
    // Hoy
    return { texto: `Hoy · ${accionCorta}`, clase: "text-orange-500 font-medium" };
  }
  // Futura — mostrar día de la semana abreviado
  const dias = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  const diaSemana = dias[new Date(fecha).getDay()];
  return { texto: `${diaSemana} · ${accionCorta}`, clase: "text-slate-400" };
}

function mensajePipelineWA(lead: Lead): string {
  const n = lead.nombre;
  const sec = (lead.sector || "").toLowerCase();
  const ciu = lead.ciudad || "tu zona";
  const esInmob = sec.includes("inmobil");
  const esAsesoria = sec.includes("asesor") || sec.includes("gestor") || sec.includes("contab");

  switch (lead.estado) {
    case "nuevo":
    case "segmentado":
      if (esInmob)
        return `Hola ${n}, soy Manuel de Nationale-Nederlanden en ${ciu}. Trabajo con inmobiliarias en acuerdos de derivación hipotecaria — comisión por cada cliente que necesita hipoteca. ¿15 minutos esta semana?`;
      if (esAsesoria)
        return `Hola ${n}, soy Manuel de Nationale-Nederlanden. Muchos de vuestros clientes autónomos no tienen cubierta la baja desde el primer día. Desde 5€/mes, ¿lo vemos?`;
      return `Hola ${n}, soy Manuel, asesor en ${ciu}. Si un día no puedes trabajar, ¿cuánto cobrarías? Tengo una solución desde ~5€/mes. ¿Tienes 5 minutos?`;
    case "mensaje_enviado":
      return `Hola ${n}, te escribí hace unos días sobre proteger tus ingresos. ¿Has podido verlo? Si no era buen momento, dímelo sin problema.`;
    case "respondio":
      return `Hola ${n}, ¿has podido pensar en lo que hablamos? Quedo a tu disposición para prepararte una propuesta sin compromiso.`;
    case "cita_agendada":
      return `Hola ${n}, te confirmo nuestra cita próximamente. Si necesitas cambiar el horario o tienes alguna pregunta, dímelo. ¡Nos vemos pronto!`;
    case "en_negociacion":
      return `Hola ${n}, ¿has podido revisar la propuesta que te preparé? Si tienes dudas sobre coberturas o precio, estoy disponible para aclarártelas.`;
    default:
      return `Hola ${n}, soy Manuel de Nationale-Nederlanden. ¿Tienes un momento para hablar?`;
  }
}

/** Color de fondo según nivel de interés */
function colorInteres(nivel: number): string {
  if (nivel >= 8) return "bg-emerald-500";
  if (nivel >= 5) return "bg-amber-400";
  return "bg-slate-300";
}

export default function PipelinePage() {
  return (
    <Suspense fallback={<div className="py-24 text-center text-sm text-slate-400">Cargando pipeline...</div>}>
      <PipelineContent />
    </Suspense>
  );
}

function PipelineContent() {
  const { puede, cargando: cargandoPermisos } = usePermisos();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [moviendo, setMoviendo] = useState<string | null>(null);
  const [comercialId, setComercialId] = useState<string | null>(null);
  const [comercialNombre, setComercialNombre] = useState<string>("");
  const [colapsadas, setColapsadas] = useState<Set<Estado>>(new Set());
  const [busqueda, setBusqueda] = useState("");
  const [limiteColumna, setLimiteColumna] = useState<Record<string, number>>({});
  const [verTodos, setVerTodos] = useState(false);
  const [filtroProducto, setFiltroProducto] = useState("");
  const [ganadosMes, setGanadosMes] = useState(0);
  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null);
  const [dragOverEstado, setDragOverEstado] = useState<Estado | null>(null);

  const CARDS_PER_COL = 25;

  // Obtener el comercial logueado
  useEffect(() => {
    async function obtenerComercial() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) return;
      const { data } = await supabase
        .from("comerciales")
        .select("id, nombre, apellidos")
        .eq("email", user.email)
        .single();
      if (data) {
        setComercialId(data.id);
        setComercialNombre([data.nombre, data.apellidos].filter(Boolean).join(" "));
      }
    }
    obtenerComercial();
  }, []);

  const cargarLeads = useCallback(async () => {
    if (!comercialId && !verTodos) return;
    setLoading(true);
    const inicioMes = new Date();
    inicioMes.setDate(1);
    inicioMes.setHours(0, 0, 0, 0);

    let query = supabase
      .from("leads")
      .select("id, nombre, apellidos, empresa, sector, nivel_interes, ciudad, estado, updated_at, comercial_asignado, proxima_accion, proxima_accion_fecha, telefono_whatsapp, tipo_lead, productos_recomendados, producto_interes_principal")
      .in("estado", COLUMNAS.map(c => c.estado))
      .order("nivel_interes", { ascending: false })
      .limit(500);
    const sinPermisoVerTodos = !cargandoPermisos && !puede("ver_todos_leads");
    const filtrarPorMios = (!verTodos || sinPermisoVerTodos);
    if (filtrarPorMios && comercialId) query = query.eq("comercial_asignado", comercialId);
    const { data } = await query;
    setLeads((data as Lead[]) ?? []);

    // Leads cerrados ganados este mes
    let ganadosQ = supabase.from("leads").select("id", { count: "exact", head: true }).eq("estado", "cerrado_ganado").gte("updated_at", inicioMes.toISOString());
    if (filtrarPorMios && comercialId) ganadosQ = ganadosQ.eq("comercial_asignado", comercialId);
    const { count: ganados } = await ganadosQ;
    setGanadosMes(ganados ?? 0);

    setLoading(false);
  }, [comercialId, verTodos, cargandoPermisos, puede]);

  useEffect(() => { cargarLeads(); }, [cargarLeads]);

  const TEMP_POR_ESTADO: Record<string, string> = {
    nuevo: "frio", mensaje_enviado: "frio", segmentado: "frio",
    respondio: "templado",
    cita_agendada: "caliente", en_negociacion: "caliente",
    cerrado_ganado: "caliente", cerrado_perdido: "frio",
  };

  async function moverLead(leadId: string, nuevoEstado: Estado) {
    setMoviendo(leadId);
    const leadActual = leads.find(l => l.id === leadId);
    const updates: Record<string, string> = { estado: nuevoEstado, updated_at: new Date().toISOString() };
    if (TEMP_POR_ESTADO[nuevoEstado]) updates.temperatura = TEMP_POR_ESTADO[nuevoEstado];
    await supabase.from("leads").update(updates).eq("id", leadId);
    if (leadActual) {
      supabase.from("lead_state_history").insert({
        lead_id: leadId,
        estado_anterior: leadActual.estado,
        estado_nuevo: nuevoEstado,
        comercial_id: comercialId,
      });
    }
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, estado: nuevoEstado } : l));
    setMoviendo(null);
  }

  function toggleColapsada(estado: Estado) {
    setColapsadas(prev => {
      const next = new Set(prev);
      if (next.has(estado)) {
        next.delete(estado);
      } else {
        next.add(estado);
      }
      return next;
    });
  }

  const leadsFiltrados = leads.filter(l => {
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase();
      const matchesSearch = l.nombre?.toLowerCase().includes(q) ||
        l.apellidos?.toLowerCase().includes(q) ||
        l.empresa?.toLowerCase().includes(q) ||
        l.ciudad?.toLowerCase().includes(q);
      if (!matchesSearch) return false;
    }
    if (filtroProducto) {
      const matchesProd = l.producto_interes_principal === filtroProducto ||
        (l.productos_recomendados ?? []).includes(filtroProducto);
      if (!matchesProd) return false;
    }
    return true;
  });

  const leadsColumna = (estado: Estado) => leadsFiltrados.filter(l => l.estado === estado);

  // Stats del pipeline
  const totalActivos = leadsFiltrados.filter(l => !["cerrado_ganado", "cerrado_perdido"].includes(l.estado)).length;

  function avgInteresColumna(estado: Estado): number | null {
    const col = leadsFiltrados.filter(l => l.estado === estado);
    if (col.length === 0) return null;
    return Math.round(col.reduce((s, l) => s + l.nivel_interes, 0) / col.length * 10) / 10;
  }
  const enNegociacion = leadsFiltrados.filter(l => l.estado === "en_negociacion").length;
  const conCita = leadsFiltrados.filter(l => l.estado === "cita_agendada").length;
  const avgInteres = totalActivos > 0
    ? Math.round(leadsFiltrados.filter(l => !["cerrado_ganado", "cerrado_perdido"].includes(l.estado)).reduce((s, l) => s + l.nivel_interes, 0) / totalActivos * 10) / 10
    : 0;

  // Productos únicos para el filtro
  const productosEnPipeline = [...new Set(leadsFiltrados.flatMap(l => l.productos_recomendados ?? []))].sort();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Pipeline</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {verTodos ? "Todos los comerciales" : comercialNombre ? `Leads de ${comercialNombre}` : "Vista Kanban del proceso de ventas"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!cargandoPermisos && puede("ver_todos_leads") && (
            <button
              onClick={() => setVerTodos(v => !v)}
              className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border font-medium transition-all ${verTodos ? "text-white border-transparent" : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"}`}
              style={verTodos ? { background: "#ea650d" } : undefined}
            >
              {verTodos ? "👥 Todos" : "👤 Mis leads"}
            </button>
          )}
          <input
            type="text"
            placeholder="Buscar lead..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 w-48 focus:outline-none focus:border-orange-300 bg-white"
          />
          <button onClick={cargarLeads} className="text-sm text-slate-500 hover:text-slate-800 px-3 py-2 rounded-lg hover:bg-slate-100 transition-colors">
            ↺
          </button>
        </div>
      </div>

      {/* Stats del pipeline */}
      {!loading && totalActivos > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Activos", value: totalActivos, color: "#ea650d", sub: "en pipeline" },
            { label: "Con cita", value: conCita, color: "#f59e0b", sub: "agendada" },
            { label: "Negociando", value: enNegociacion, color: "#8b5cf6", sub: "ofertas abiertas" },
            { label: "Ganados", value: ganadosMes, color: "#16a34a", sub: "este mes" },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl border border-slate-200 px-4 py-3">
              <p className="text-xs text-slate-400 font-medium">{s.label}</p>
              <p className="text-2xl font-bold mt-0.5" style={{ color: s.color }}>{s.value}</p>
              <p className="text-xs text-slate-400">{s.sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filtro por producto */}
      {!loading && productosEnPipeline.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-slate-400 font-medium">Filtrar por producto:</span>
          <button
            onClick={() => setFiltroProducto("")}
            className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-colors ${!filtroProducto ? "text-white border-transparent" : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"}`}
            style={!filtroProducto ? { background: "#ea650d" } : undefined}
          >
            Todos
          </button>
          {productosEnPipeline.map(p => (
            <button
              key={p}
              onClick={() => setFiltroProducto(filtroProducto === p ? "" : p)}
              className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-colors ${filtroProducto === p ? "text-white border-transparent" : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"}`}
              style={filtroProducto === p ? { background: "#ea650d" } : undefined}
            >
              {PRODUCTOS_CORTO[p] ?? p}
            </button>
          ))}
        </div>
      )}

      {/* Alerta columna Nuevo saturada */}
      {!loading && leadsColumna("nuevo").length > 100 && (
        <div className="flex items-center gap-3 rounded-xl border px-4 py-3" style={{ background: "#fffbeb", borderColor: "#fbbf24" }}>
          <span className="text-lg">📬</span>
          <p className="text-sm text-amber-800 flex-1">
            <strong>{leadsColumna("nuevo").length} leads</strong> en Nuevo sin contactar — usa <a href="/mensajes" style={{ color: "#ea650d" }} className="underline">Mensajes IA</a> para procesarlos en lote
          </p>
        </div>
      )}

      {loading ? (
        <div className="py-24 text-center text-sm text-slate-400">Cargando pipeline...</div>
      ) : (!comercialId && !verTodos) ? (
        <div className="py-24 text-center text-sm text-slate-400">No se encontró tu perfil de comercial.</div>
      ) : (
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-3 min-w-max items-start">
            {COLUMNAS.map(col => {
              const colLeads = leadsColumna(col.estado);
              const limite = limiteColumna[col.estado] ?? CARDS_PER_COL;
              const leadsVisibles = busqueda ? colLeads : colLeads.slice(0, limite);
              const hayMas = !busqueda && colLeads.length > limite;
              const vacia = colLeads.length === 0;
              const colapsada = colapsadas.has(col.estado);
              const avgInteres = avgInteresColumna(col.estado);

              // Columna vacía colapsada: ancho mínimo
              if (vacia) {
                return (
                  <div key={col.estado} className="w-20 flex-shrink-0">
                    <div
                      className={`flex flex-col items-center gap-1.5 px-2 py-3 rounded-xl border ${col.color} ${col.bg} cursor-pointer select-none`}
                      title={col.label}
                    >
                      <div className={`w-2 h-2 rounded-full ${col.dot}`} />
                      <span className="text-xs text-slate-400 font-medium writing-mode-vertical" style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", letterSpacing: "0.05em" }}>
                        {col.label}
                      </span>
                      <span className="text-xs text-slate-300 font-medium">0</span>
                    </div>
                  </div>
                );
              }

              return (
                <div key={col.estado} className={`flex-shrink-0 transition-all duration-200 ${colapsada ? "w-20" : "w-64"}`}>
                  {/* Header de columna */}
                  <div
                    className={`flex items-center gap-2 px-3 py-2 rounded-t-xl border-t border-x ${col.color} ${col.bg} cursor-pointer select-none`}
                    onClick={() => toggleColapsada(col.estado)}
                    title={colapsada ? "Expandir columna" : "Colapsar columna"}
                  >
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${col.dot}`} />
                    {!colapsada && (
                      <span className="text-sm font-semibold text-slate-700 truncate">{col.label}</span>
                    )}
                    {!colapsada && avgInteres !== null && (
                      <span className="text-xs text-slate-400 flex-shrink-0" title="Interés medio">
                        ⭐{avgInteres}
                      </span>
                    )}
                    <span className={`text-xs font-medium text-slate-500 bg-white rounded-full px-2 py-0.5 border border-slate-200 flex-shrink-0 ${colapsada ? "mx-auto" : "ml-auto"}`}>
                      {colLeads.length}
                    </span>
                    {hayMas && !colapsada && (
                      <span className="text-xs text-slate-400 flex-shrink-0">+{colLeads.length - limite}</span>
                    )}
                  </div>

                  {/* Cuerpo de columna */}
                  {colapsada ? (
                    <div
                      className={`rounded-b-xl border ${col.color} ${col.bg} p-2 min-h-20 flex items-center justify-center cursor-pointer`}
                      onClick={() => toggleColapsada(col.estado)}
                    >
                      <span className="text-xs text-slate-400" style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}>
                        {col.label}
                      </span>
                    </div>
                  ) : (
                    <div
                      className={`min-h-64 rounded-b-xl border ${col.color} p-2 space-y-2 transition-colors ${dragOverEstado === col.estado ? "ring-2 ring-inset ring-orange-400 bg-orange-50" : col.bg}`}
                      onDragOver={e => { e.preventDefault(); setDragOverEstado(col.estado); }}
                      onDragLeave={() => setDragOverEstado(null)}
                      onDrop={e => {
                        e.preventDefault();
                        setDragOverEstado(null);
                        if (draggedLeadId && draggedLeadId !== col.estado) moverLead(draggedLeadId, col.estado);
                        setDraggedLeadId(null);
                      }}
                    >
                      {leadsVisibles.map(lead => (
                        <TarjetaLead
                          key={lead.id}
                          lead={lead}
                          columnas={COLUMNAS}
                          moviendo={moviendo === lead.id}
                          onMover={moverLead}
                          onDragStart={() => setDraggedLeadId(lead.id)}
                          onDragEnd={() => { setDraggedLeadId(null); setDragOverEstado(null); }}
                        />
                      ))}
                      {hayMas && (
                        <button
                          onClick={() => setLimiteColumna(prev => ({ ...prev, [col.estado]: (prev[col.estado] ?? CARDS_PER_COL) + CARDS_PER_COL }))}
                          className="w-full py-2 text-xs text-slate-400 hover:text-slate-600 border border-dashed border-slate-200 rounded-lg hover:border-slate-300 transition-colors"
                        >
                          Mostrar {Math.min(colLeads.length - limite, CARDS_PER_COL)} más de {colLeads.length - limite} restantes
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function TarjetaLead({
  lead, columnas, moviendo, onMover, onDragStart, onDragEnd,
}: {
  lead: Lead;
  columnas: Columna[];
  moviendo: boolean;
  onMover: (id: string, estado: Estado) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}) {
  const nombre = [lead.nombre, lead.apellidos].filter(Boolean).join(" ");
  const colActual = columnas.findIndex(c => c.estado === lead.estado);
  const siguiente = columnas[colActual + 1];
  const anterior = columnas[colActual - 1];

  // Badge urgencia: >3 días sin cambio y no es estado cerrado
  const diasSinCambio = diasDesde(lead.updated_at);
  const esUrgente = diasSinCambio >= 3 && !ESTADOS_CERRADOS.includes(lead.estado);

  // Próxima acción
  const accionInfo = infoProximaAccion(lead.proxima_accion, lead.proxima_accion_fecha);

  // WhatsApp URL con mensaje pre-relleno
  const telLimpio = lead.telefono_whatsapp ? lead.telefono_whatsapp.replace(/\D/g, "") : null;
  const waUrl = telLimpio
    ? `https://wa.me/${telLimpio}?text=${encodeURIComponent(mensajePipelineWA(lead))}`
    : null;
  const telUrl = telLimpio ? `tel:+${telLimpio.replace(/^\+/, "")}` : null;

  // Nivel interés color
  const interesColor = colorInteres(lead.nivel_interes);

  return (
    <div
      draggable
      onDragStart={e => { e.dataTransfer.effectAllowed = "move"; onDragStart?.(); }}
      onDragEnd={onDragEnd}
      className={`bg-white rounded-xl border shadow-sm hover:shadow-md transition-all relative cursor-grab active:cursor-grabbing ${moviendo ? "opacity-50" : ""} ${esUrgente ? "border-red-300 ring-1 ring-red-200" : "border-slate-200"}`}
    >
      {/* Badge urgencia */}
      {esUrgente && (
        <div className="absolute -top-2 right-2 z-10">
          <span className="text-[10px] font-semibold bg-red-100 text-red-600 border border-red-200 rounded-full px-2 py-0.5 whitespace-nowrap">
            {diasSinCambio}d sin contacto
          </span>
        </div>
      )}

      <div className="p-3">
        {/* Nombre y empresa */}
        <div className="flex items-start justify-between gap-1">
          <Link href={`/leads/${lead.id}`} className="block group flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-800 transition-colors leading-tight truncate">
              {nombre || "Sin nombre"}
            </p>
            {lead.empresa && (
              <p className="text-xs text-slate-500 mt-0.5 truncate">{lead.empresa}</p>
            )}
          </Link>

          {/* Nivel interés como número */}
          <div className="flex items-center gap-1 flex-shrink-0 ml-1">
            <div className={`w-2 h-2 rounded-full ${interesColor}`} />
            <span className="text-xs font-semibold text-slate-600">{lead.nivel_interes}/10</span>
          </div>
        </div>

        {/* Ciudad + tipo lead + sector */}
        <div className="mt-1.5 flex items-center flex-wrap gap-1">
          {lead.ciudad && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
              {lead.ciudad}
            </span>
          )}
          {lead.tipo_lead && TIPO_LEAD_CFG[lead.tipo_lead] && (
            <span className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={{ background: TIPO_LEAD_CFG[lead.tipo_lead].color + "15", color: TIPO_LEAD_CFG[lead.tipo_lead].color }}>
              {TIPO_LEAD_CFG[lead.tipo_lead].label}
            </span>
          )}
          {lead.sector && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-50 text-slate-400 border border-slate-100">
              {lead.sector}
            </span>
          )}
        </div>

        {/* Productos recomendados */}
        {lead.productos_recomendados && lead.productos_recomendados.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {lead.productos_recomendados.slice(0, 2).map(p => (
              <span key={p} className="text-[10px] px-1.5 py-0.5 rounded border font-medium"
                style={p === lead.producto_interes_principal
                  ? { background: "#fff5f0", borderColor: "#f5a677", color: "#c2530b" }
                  : { background: "#f8fafc", borderColor: "#e2e8f0", color: "#64748b" }}>
                {PRODUCTOS_CORTO[p] ?? p}
              </span>
            ))}
            {lead.productos_recomendados.length > 2 && (
              <span className="text-[10px] text-slate-300">+{lead.productos_recomendados.length - 2}</span>
            )}
          </div>
        )}

        {/* Próxima acción */}
        <div className="mt-2 flex items-center gap-1">
          <span className={`text-[11px] leading-tight ${accionInfo.clase}`}>
            {accionInfo.texto}
          </span>
        </div>

        {/* Footer: tiempo + botones */}
        <div className="flex items-center gap-1 mt-2.5 pt-2 border-t border-slate-100">
          <span className="text-[10px] text-slate-300 mr-auto">{diasDesdeLabel(lead.updated_at)}</span>

          {telUrl && (
            <a
              href={telUrl}
              onClick={e => e.stopPropagation()}
              title={`Llamar: ${lead.telefono_whatsapp}`}
              className="flex items-center gap-1 bg-blue-100 hover:bg-blue-200 text-blue-700 text-[11px] font-semibold px-2 py-1 rounded-lg transition-colors"
            >
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 10.8a19.79 19.79 0 01-3.07-8.67A2 2 0 012 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92z"/>
              </svg>
              Tel
            </a>
          )}
          {waUrl && (
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              title="Abrir WhatsApp con mensaje"
              className="flex items-center gap-1 bg-emerald-500 hover:bg-emerald-600 text-white text-[11px] font-semibold px-2 py-1 rounded-lg transition-colors"
            >
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              WA
            </a>
          )}

          {anterior && (
            <button
              onClick={() => onMover(lead.id, anterior.estado)}
              disabled={moviendo}
              title={`← ${anterior.label}`}
              className="text-xs text-slate-400 hover:text-slate-700 hover:bg-slate-50 px-2 py-1 rounded-lg transition-colors disabled:opacity-40"
            >
              ←
            </button>
          )}
          <Link
            href={`/leads/${lead.id}`}
            className="text-xs text-center text-slate-400 px-2 py-1 rounded-lg transition-colors hover:bg-orange-50" onMouseEnter={e => (e.currentTarget.style.color = "#ea650d")} onMouseLeave={e => (e.currentTarget.style.color = "")}
          >
            Ver
          </Link>
          {siguiente && (
            <button
              onClick={() => onMover(lead.id, siguiente.estado)}
              disabled={moviendo}
              title={`→ ${siguiente.label}`}
              className={`text-xs text-center px-2 py-1 rounded-lg transition-colors disabled:opacity-40 font-medium ${
                siguiente.estado === "cerrado_ganado"
                  ? "text-emerald-600 hover:bg-emerald-50"
                  : "hover:bg-orange-50 text-orange-600"
              }`}
            >
              →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
