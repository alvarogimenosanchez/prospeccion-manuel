"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

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
  temperatura: string;
  nivel_interes: number;
  ciudad: string | null;
  estado: Estado;
  updated_at: string;
};

type Columna = {
  estado: Estado;
  label: string;
  color: string;
  bg: string;
  dot: string;
};

const COLUMNAS: Columna[] = [
  { estado: "nuevo",           label: "Nuevo",           color: "border-slate-300",  bg: "bg-slate-50",   dot: "bg-slate-400" },
  { estado: "mensaje_enviado", label: "Contactado",       color: "border-blue-300",   bg: "bg-blue-50",    dot: "bg-blue-500" },
  { estado: "respondio",       label: "Respondió",        color: "border-amber-300",  bg: "bg-amber-50",   dot: "bg-amber-500" },
  { estado: "cita_agendada",   label: "Cita agendada",    color: "border-indigo-300", bg: "bg-indigo-50",  dot: "bg-indigo-500" },
  { estado: "en_negociacion",  label: "En negociación",   color: "border-violet-300", bg: "bg-violet-50",  dot: "bg-violet-500" },
  { estado: "cerrado_ganado",  label: "Ganado",           color: "border-emerald-300",bg: "bg-emerald-50", dot: "bg-emerald-500" },
];

const TEMP_COLOR: Record<string, string> = {
  caliente: "bg-red-100 text-red-700",
  templado: "bg-amber-100 text-amber-700",
  frio:     "bg-blue-100 text-blue-700",
};

const TEMPERATURA_POR_ESTADO: Record<Estado, string> = {
  nuevo:           "frio",
  segmentado:      "frio",
  mensaje_enviado: "frio",
  respondio:       "templado",
  cita_agendada:   "caliente",
  en_negociacion:  "caliente",
  cerrado_ganado:  "caliente",
  cerrado_perdido: "frio",
};

function diasDesde(fecha: string): string {
  const dias = Math.floor((Date.now() - new Date(fecha).getTime()) / 86_400_000);
  if (dias === 0) return "hoy";
  if (dias === 1) return "ayer";
  return `hace ${dias}d`;
}

export default function PipelinePage() {
  return (
    <Suspense fallback={<div className="py-24 text-center text-sm text-slate-400">Cargando pipeline...</div>}>
      <PipelineContent />
    </Suspense>
  );
}

function PipelineContent() {
  const searchParams = useSearchParams();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [moviendo, setMoviendo] = useState<string | null>(null);
  const [teamId, setTeamId] = useState(searchParams.get("team") ?? "");
  const [teams, setTeams] = useState<{ id: string; nombre: string }[]>([]);

  useEffect(() => {
    supabase.from("teams").select("id, nombre").eq("activo", true).order("nombre")
      .then(({ data }) => setTeams(data ?? []));
  }, []);

  const cargarLeads = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("leads")
      .select("id, nombre, apellidos, empresa, sector, temperatura, nivel_interes, ciudad, estado, updated_at")
      .in("estado", COLUMNAS.map(c => c.estado))
      .order("nivel_interes", { ascending: false })
      .limit(300);
    if (teamId) query = query.eq("team_id", teamId);
    const { data } = await query;
    setLeads((data as Lead[]) ?? []);
    setLoading(false);
  }, [teamId]);

  useEffect(() => { cargarLeads(); }, [cargarLeads]);

  async function moverLead(leadId: string, nuevoEstado: Estado) {
    setMoviendo(leadId);
    const temperatura = TEMPERATURA_POR_ESTADO[nuevoEstado];
    const updates: Record<string, string> = { estado: nuevoEstado, updated_at: new Date().toISOString() };
    if (temperatura) updates.temperatura = temperatura;
    await supabase.from("leads").update(updates).eq("id", leadId);
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, estado: nuevoEstado, ...(temperatura ? { temperatura } : {}) } : l));
    setMoviendo(null);
  }

  const leadsColumna = (estado: Estado) => leads.filter(l => l.estado === estado);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Pipeline</h1>
          <p className="text-sm text-slate-500 mt-0.5">Vista Kanban del proceso de ventas</p>
        </div>
        <div className="flex items-center gap-3">
          {teams.length > 0 && (
            <select
              value={teamId}
              onChange={e => setTeamId(e.target.value)}
              className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-slate-400 text-slate-600"
            >
              <option value="">Todos los equipos</option>
              {teams.map(t => (
                <option key={t.id} value={t.id}>{t.nombre}</option>
              ))}
            </select>
          )}
          <button onClick={cargarLeads} className="text-sm text-slate-500 hover:text-slate-800 px-3 py-2 rounded-lg hover:bg-slate-100 transition-colors">
            Actualizar
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-24 text-center text-sm text-slate-400">Cargando pipeline...</div>
      ) : (
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-4 min-w-max">
            {COLUMNAS.map(col => {
              const colLeads = leadsColumna(col.estado);
              return (
                <div key={col.estado} className="w-64 flex-shrink-0">
                  {/* Header columna */}
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-t-xl border-t border-x ${col.color} ${col.bg}`}>
                    <div className={`w-2 h-2 rounded-full ${col.dot}`} />
                    <span className="text-sm font-semibold text-slate-700">{col.label}</span>
                    <span className="ml-auto text-xs font-medium text-slate-500 bg-white rounded-full px-2 py-0.5 border border-slate-200">
                      {colLeads.length}
                    </span>
                  </div>

                  {/* Tarjetas */}
                  <div className={`min-h-64 rounded-b-xl border ${col.color} ${col.bg} p-2 space-y-2`}>
                    {colLeads.length === 0 && (
                      <p className="text-xs text-slate-400 text-center py-8">Sin leads</p>
                    )}
                    {colLeads.map(lead => (
                      <TarjetaLead
                        key={lead.id}
                        lead={lead}
                        columnas={COLUMNAS}
                        moviendo={moviendo === lead.id}
                        onMover={moverLead}
                      />
                    ))}
                  </div>
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
  const [menuAbierto, setMenuAbierto] = useState(false);
  const nombre = [lead.nombre, lead.apellidos].filter(Boolean).join(" ");
  const colActual = columnas.findIndex(c => c.estado === lead.estado);
  const siguiente = columnas[colActual + 1];
  const anterior = columnas[colActual - 1];

  return (
    <div className={`bg-white rounded-xl border border-slate-200 p-3 shadow-sm hover:shadow-md transition-all ${moviendo ? "opacity-50" : ""}`}>
      {/* Nombre + empresa */}
      <Link href={`/leads/${lead.id}`} className="block group">
        <p className="text-sm font-semibold text-slate-800 group-hover:text-indigo-600 transition-colors leading-tight">
          {nombre || "Sin nombre"}
        </p>
        {lead.empresa && (
          <p className="text-xs text-slate-500 mt-0.5 truncate">{lead.empresa}</p>
        )}
      </Link>

      {/* Badges */}
      <div className="flex flex-wrap gap-1.5 mt-2">
        {(() => { const temp = TEMPERATURA_POR_ESTADO[lead.estado]; return temp ? (
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TEMP_COLOR[temp] ?? "bg-slate-100 text-slate-600"}`}>
            {temp}
          </span>
        ) : null; })()}
        {lead.ciudad && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
            {lead.ciudad}
          </span>
        )}
      </div>

      {/* Nivel interés + fecha */}
      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-1">
          {[...Array(10)].map((_, i) => (
            <div
              key={i}
              className={`w-1.5 h-3 rounded-sm ${i < lead.nivel_interes ? "bg-indigo-500" : "bg-slate-100"}`}
            />
          ))}
        </div>
        <span className="text-xs text-slate-400">{diasDesde(lead.updated_at)}</span>
      </div>

      {/* Acciones mover */}
      <div className="flex items-center gap-1 mt-3 pt-2 border-t border-slate-100">
        {anterior && (
          <button
            onClick={() => onMover(lead.id, anterior.estado)}
            disabled={moviendo}
            className="flex-1 text-xs text-slate-400 hover:text-slate-700 hover:bg-slate-50 py-1 rounded-lg transition-colors disabled:opacity-40"
            title={`← ${anterior.label}`}
          >
            ←
          </button>
        )}
        <Link
          href={`/leads/${lead.id}`}
          className="flex-1 text-xs text-center text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 py-1 rounded-lg transition-colors"
        >
          Ver
        </Link>
        {siguiente && (
          <button
            onClick={() => onMover(lead.id, siguiente.estado)}
            disabled={moviendo}
            className={`flex-1 text-xs text-center py-1 rounded-lg transition-colors disabled:opacity-40 font-medium ${
              siguiente.estado === "cerrado_ganado"
                ? "text-emerald-600 hover:bg-emerald-50"
                : "text-indigo-600 hover:bg-indigo-50"
            }`}
            title={`→ ${siguiente.label}`}
          >
            → {siguiente.label.split(" ")[0]}
          </button>
        )}
      </div>
    </div>
  );
}
