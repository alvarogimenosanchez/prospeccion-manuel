"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type EstadoFiltro =
  | ""
  | "nuevo"
  | "enriquecido"
  | "segmentado"
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
  temperatura?: string;
  onPrioridad: (v: string) => void;
  onBusqueda: (v: string) => void;
  onEstado: (v: EstadoFiltro) => void;
  onSoloMios: (v: boolean) => void;
  onTeam?: (v: string) => void;
  onTemperatura?: (v: string) => void;
};

const ESTADO_BTNS: { value: EstadoFiltro; label: string }[] = [
  { value: "",               label: "Todos"       },
  { value: "nuevo",          label: "Nuevo"       },
  { value: "enriquecido",    label: "Enriquecido" },
  { value: "segmentado",     label: "Segmentado"  },
  { value: "mensaje_enviado",label: "Contactado"  },
  { value: "respondio",      label: "Respondió"   },
  { value: "cita_agendada",  label: "Cita"        },
  { value: "en_negociacion", label: "Negociando"  },
  { value: "cerrado_ganado", label: "Ganado"      },
  { value: "cerrado_perdido",label: "Perdido"     },
];

const PRIORIDAD_BTNS = [
  { value: "", label: "Todas" },
  { value: "alta",  label: "Alta"  },
  { value: "media", label: "Media" },
  { value: "baja",  label: "Baja"  },
];

const TEMPERATURA_BTNS = [
  { value: "",         label: "Todas",   dot: "" },
  { value: "caliente", label: "Caliente", dot: "🔴" },
  { value: "templado", label: "Templado", dot: "🟡" },
  { value: "frio",     label: "Frío",     dot: "🔵" },
];

export function FiltrosBar({
  prioridad,
  busqueda,
  estado,
  soloMios,
  teamId = "",
  temperatura = "",
  onPrioridad,
  onBusqueda,
  onEstado,
  onSoloMios,
  onTeam,
  onTemperatura,
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
        ? "text-white border-transparent"
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
              style={prioridad === b.value ? { background: "#ea650d" } : undefined}
            >
              {b.label}
            </button>
          ))}
        </div>

        {/* Temperatura */}
        {onTemperatura && (
          <>
            <div className="hidden sm:block w-px h-6 bg-slate-200" />
            <div className="flex gap-1">
              {TEMPERATURA_BTNS.map((b) => (
                <button
                  key={b.value}
                  onClick={() => onTemperatura(b.value)}
                  className={pill(temperatura === b.value)}
                  style={temperatura === b.value ? {
                    background: b.value === "caliente" ? "#ef4444"
                      : b.value === "templado" ? "#f59e0b"
                      : b.value === "frio" ? "#3b82f6"
                      : "#ea650d"
                  } : undefined}
                >
                  {b.dot ? `${b.dot} ${b.label}` : b.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Fila 2: estado del pipeline */}
      <div className="flex flex-wrap gap-1">
        {ESTADO_BTNS.map((b) => (
          <button
            key={b.value}
            onClick={() => onEstado(b.value)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
              estado === b.value
                ? "text-white border-transparent"
                : "bg-white text-slate-500 border-slate-200 hover:border-slate-400 hover:text-slate-700"
            }`}
            style={estado === b.value ? { background: "#ea650d" } : undefined}
          >
            {b.label}
          </button>
        ))}
      </div>
    </div>
  );
}
