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
  { estado: "cita_agendada",   label: "Cita agendada",    color: "border-indigo-300",  bg: "bg-indigo-50",   dot: "bg-indigo-500"  },
  { estado: "en_negociacion",  label: "En negociación",   color: "border-violet-300",  bg: "bg-violet-50",   dot: "bg-violet-500"  },
  { estado: "cerrado_ganado",  label: "Ganado",           color: "border-emerald-300", bg: "bg-emerald-50",  dot: "bg-emerald-500" },
];

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
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [moviendo, setMoviendo] = useState<string | null>(null);
  const [comercialId, setComercialId] = useState<string | null>(null);
  const [comercialNombre, setComercialNombre] = useState<string>("");

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
    if (!comercialId) return;
    setLoading(true);
    const { data } = await supabase
      .from("leads")
      .select("id, nombre, apellidos, empresa, sector, nivel_interes, ciudad, estado, updated_at, comercial_asignado")
      .in("estado", COLUMNAS.map(c => c.estado))
      .eq("comercial_asignado", comercialId)
      .order("nivel_interes", { ascending: false })
      .limit(500);
    setLeads((data as Lead[]) ?? []);
    setLoading(false);
  }, [comercialId]);

  useEffect(() => { cargarLeads(); }, [cargarLeads]);

  async function moverLead(leadId: string, nuevoEstado: Estado) {
    setMoviendo(leadId);
    const leadActual = leads.find(l => l.id === leadId);
    await supabase.from("leads").update({
      estado: nuevoEstado,
      updated_at: new Date().toISOString(),
    }).eq("id", leadId);
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

  const leadsColumna = (estado: Estado) => leads.filter(l => l.estado === estado);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Pipeline</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {comercialNombre ? `Leads de ${comercialNombre}` : "Vista Kanban del proceso de ventas"}
          </p>
        </div>
        <button onClick={cargarLeads} className="text-sm text-slate-500 hover:text-slate-800 px-3 py-2 rounded-lg hover:bg-slate-100 transition-colors">
          Actualizar
        </button>
      </div>

      {loading ? (
        <div className="py-24 text-center text-sm text-slate-400">Cargando pipeline...</div>
      ) : !comercialId ? (
        <div className="py-24 text-center text-sm text-slate-400">No se encontró tu perfil de comercial.</div>
      ) : (
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-4 min-w-max">
            {COLUMNAS.map(col => {
              const colLeads = leadsColumna(col.estado);
              return (
                <div key={col.estado} className="w-64 flex-shrink-0">
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-t-xl border-t border-x ${col.color} ${col.bg}`}>
                    <div className={`w-2 h-2 rounded-full ${col.dot}`} />
                    <span className="text-sm font-semibold text-slate-700">{col.label}</span>
                    <span className="ml-auto text-xs font-medium text-slate-500 bg-white rounded-full px-2 py-0.5 border border-slate-200">
                      {colLeads.length}
                    </span>
                  </div>
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
  const nombre = [lead.nombre, lead.apellidos].filter(Boolean).join(" ");
  const colActual = columnas.findIndex(c => c.estado === lead.estado);
  const siguiente = columnas[colActual + 1];
  const anterior = columnas[colActual - 1];

  return (
    <div className={`bg-white rounded-xl border border-slate-200 p-3 shadow-sm hover:shadow-md transition-all ${moviendo ? "opacity-50" : ""}`}>
      <Link href={`/leads/${lead.id}`} className="block group">
        <p className="text-sm font-semibold text-slate-800 group-hover:text-indigo-600 transition-colors leading-tight">
          {nombre || "Sin nombre"}
        </p>
        {lead.empresa && (
          <p className="text-xs text-slate-500 mt-0.5 truncate">{lead.empresa}</p>
        )}
      </Link>

      {lead.ciudad && (
        <div className="mt-2">
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
            {lead.ciudad}
          </span>
        </div>
      )}

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

      <div className="flex items-center gap-1 mt-3 pt-2 border-t border-slate-100">
        {anterior && (
          <button
            onClick={() => onMover(lead.id, anterior.estado)}
            disabled={moviendo}
            className="flex-1 text-xs text-slate-400 hover:text-slate-700 hover:bg-slate-50 py-1 rounded-lg transition-colors disabled:opacity-40"
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
          >
            → {siguiente.label.split(" ")[0]}
          </button>
        )}
      </div>
    </div>
  );
}
