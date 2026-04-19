"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { Suspense } from "react";

type Estado =
  | "nuevo"
  | "segmentado"
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
};

type Columna = {
  estado: Estado;
  label: string;
  color: string;
  bg: string;
  dot: string;
};

const COLUMNAS: Columna[] = [
  { estado: "nuevo",           label: "Nuevo",           color: "border-slate-300",   bg: "bg-slate-50",    dot: "bg-slate-400"   },
  { estado: "mensaje_enviado", label: "Contactado",       color: "border-blue-300",    bg: "bg-blue-50",     dot: "bg-blue-500"    },
  { estado: "respondio",       label: "Respondió",        color: "border-amber-300",   bg: "bg-amber-50",    dot: "bg-amber-500"   },
  { estado: "cita_agendada",   label: "Cita agendada",    color: "border-orange-300",  bg: "bg-orange-50",   dot: "bg-orange-500"  },
  { estado: "en_negociacion",  label: "En negociación",   color: "border-violet-300",  bg: "bg-violet-50",   dot: "bg-violet-500"  },
  { estado: "cerrado_ganado",  label: "Ganado",           color: "border-emerald-300", bg: "bg-emerald-50",  dot: "bg-emerald-500" },
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
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [moviendo, setMoviendo] = useState<string | null>(null);
  const [comercialId, setComercialId] = useState<string | null>(null);
  const [comercialNombre, setComercialNombre] = useState<string>("");
  const [colapsadas, setColapsadas] = useState<Set<Estado>>(new Set());
  const [busqueda, setBusqueda] = useState("");
  const [limiteColumna, setLimiteColumna] = useState<Record<string, number>>({});
  const [verTodos, setVerTodos] = useState(false);

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
    let query = supabase
      .from("leads")
      .select("id, nombre, apellidos, empresa, sector, nivel_interes, ciudad, estado, updated_at, comercial_asignado, proxima_accion, proxima_accion_fecha, telefono_whatsapp")
      .in("estado", COLUMNAS.map(c => c.estado))
      .order("nivel_interes", { ascending: false })
      .limit(500);
    if (!verTodos && comercialId) query = query.eq("comercial_asignado", comercialId);
    const { data } = await query;
    setLeads((data as Lead[]) ?? []);
    setLoading(false);
  }, [comercialId, verTodos]);

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

  const leadsFiltrados = busqueda.trim()
    ? leads.filter(l => {
        const q = busqueda.toLowerCase();
        return (
          l.nombre?.toLowerCase().includes(q) ||
          l.apellidos?.toLowerCase().includes(q) ||
          l.empresa?.toLowerCase().includes(q) ||
          l.ciudad?.toLowerCase().includes(q)
        );
      })
    : leads;

  const leadsColumna = (estado: Estado) => leadsFiltrados.filter(l => l.estado === estado);

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
          <button
            onClick={() => setVerTodos(v => !v)}
            className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border font-medium transition-all ${verTodos ? "text-white border-transparent" : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"}`}
            style={verTodos ? { background: "#ea650d" } : undefined}
          >
            {verTodos ? "👥 Todos" : "👤 Mis leads"}
          </button>
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
                    <div className={`min-h-64 rounded-b-xl border ${col.color} ${col.bg} p-2 space-y-2`}>
                      {leadsVisibles.map(lead => (
                        <TarjetaLead
                          key={lead.id}
                          lead={lead}
                          columnas={COLUMNAS}
                          moviendo={moviendo === lead.id}
                          onMover={moverLead}
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
  lead, columnas, moviendo, onMover,
}: {
  lead: Lead;
  columnas: Columna[];
  moviendo: boolean;
  onMover: (id: string, estado: Estado) => void;
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

  // WhatsApp URL
  const waUrl = lead.telefono_whatsapp
    ? `https://wa.me/${lead.telefono_whatsapp.replace(/\D/g, "")}`
    : null;

  // Nivel interés color
  const interesColor = colorInteres(lead.nivel_interes);

  return (
    <div
      className={`bg-white rounded-xl border shadow-sm hover:shadow-md transition-all relative ${moviendo ? "opacity-50" : ""} ${esUrgente ? "border-red-300 ring-1 ring-red-200" : "border-slate-200"}`}
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

        {/* Ciudad */}
        {lead.ciudad && (
          <div className="mt-1.5">
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
              {lead.ciudad}
            </span>
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

          {waUrl && (
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              title="Abrir WhatsApp"
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
