"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type EstadoFiltro =
  | ""
  | "nuevo"
  | "mensaje_enviado"
  | "respondio"
  | "cita_agendada"
  | "en_negociacion"
  | "cerrado_ganado"
  | "cerrado_perdido";

type FiltrosBarProps = {
  prioridad: string;
  busqueda: string;
  estado: EstadoFiltro;
  soloMios: boolean;
  teamId?: string;
  onPrioridad: (v: string) => void;
  onBusqueda: (v: string) => void;
  onEstado: (v: EstadoFiltro) => void;
  onSoloMios: (v: boolean) => void;
  onTeam?: (v: string) => void;
};

const ESTADO_BTNS: { value: EstadoFiltro; label: string }[] = [
  { value: "",               label: "Todos"      },
  { value: "nuevo",          label: "Nuevo"      },
  { value: "mensaje_enviado",label: "Contactado" },
  { value: "respondio",      label: "Respondió"  },
  { value: "cita_agendada",  label: "Cita"       },
  { value: "en_negociacion", label: "Negociando" },
  { value: "cerrado_ganado", label: "Ganado"     },
  { value: "cerrado_perdido",label: "Perdido"    },
];

const PRIORIDAD_BTNS = [
  { value: "", label: "Todas" },
  { value: "alta",  label: "Alta"  },
  { value: "media", label: "Media" },
  { value: "baja",  label: "Baja"  },
];

export function FiltrosBar({
  prioridad,
  busqueda,
  estado,
  soloMios,
  teamId = "",
  onPrioridad,
  onBusqueda,
  onEstado,
  onSoloMios,
  onTeam,
}: FiltrosBarProps) {
  const [teams, setTeams] = useState<{ id: string; nombre: string }[]>([]);

  useEffect(() => {
    supabase
      .from("teams")
      .select("id, nombre")
      .eq("activo", true)
      .order("nombre")
      .then(({ data }) => setTeams(data ?? []));
  }, []);

  const pill = (active: boolean) =>
    `px-3 py-1.5 rounded-lg text-sm font-medium transition-all border ${
      active
        ? "bg-slate-800 text-white border-slate-800"
        : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
    }`;

  return (
    <div className="flex flex-col gap-2.5 py-3">
      {/* Fila 1: búsqueda + mis leads + equipo + prioridad */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          placeholder="Buscar por nombre, empresa..."
          value={busqueda}
          onChange={(e) => onBusqueda(e.target.value)}
          className="flex-1 min-w-44 max-w-64 px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-200"
        />

        {/* Toggle mis leads */}
        <button
          onClick={() => onSoloMios(!soloMios)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
            soloMios
              ? "text-white border-transparent"
              : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
          }`}
          style={soloMios ? { background: "#ea650d" } : undefined}
        >
          <span>{soloMios ? "👤" : "👥"}</span>
          <span>{soloMios ? "Mis leads" : "Todos"}</span>
        </button>

        {onTeam && teams.length > 0 && (
          <select
            value={teamId}
            onChange={(e) => onTeam(e.target.value)}
            className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-slate-400 text-slate-600"
          >
            <option value="">Todos los equipos</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
        )}

        <div className="hidden sm:block w-px h-6 bg-slate-200" />

        {/* Prioridad */}
        <div className="flex gap-1">
          {PRIORIDAD_BTNS.map((b) => (
            <button
              key={b.value}
              onClick={() => onPrioridad(b.value)}
              className={pill(prioridad === b.value)}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>

      {/* Fila 2: estado del pipeline */}
      <div className="flex flex-wrap gap-1">
        {ESTADO_BTNS.map((b) => (
          <button
            key={b.value}
            onClick={() => onEstado(b.value)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
              estado === b.value
                ? "bg-slate-800 text-white border-slate-800"
                : "bg-white text-slate-500 border-slate-200 hover:border-slate-400 hover:text-slate-700"
            }`}
          >
            {b.label}
          </button>
        ))}
      </div>
    </div>
  );
}
