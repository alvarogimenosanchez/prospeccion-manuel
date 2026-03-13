"use client";

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { TemperaturaBadge } from "./TemperaturaBadge";
import { PrioridadBadge } from "./PrioridadBadge";
import { NivelInteresBar } from "./NivelInteresBar";
import { FuenteBadge } from "./FuenteBadge";
import type { LeadDashboard } from "@/lib/supabase";

const PRODUCTOS_LABEL: Record<string, string> = {
  contigo_futuro: "C. Futuro",
  sialp: "SIALP",
  contigo_autonomo: "Autónomo",
  contigo_familia: "Familia",
  contigo_pyme: "Pyme",
  contigo_senior: "Senior",
  liderplus: "LiderPlus",
  sanitas_salud: "Sanitas",
  mihogar: "MiHogar",
  hipotecas: "Hipoteca",
};

export function LeadRow({ lead }: { lead: LeadDashboard }) {
  const nombre = [lead.nombre, lead.apellidos].filter(Boolean).join(" ");
  const sublinea = [lead.cargo, lead.empresa].filter(Boolean).join(" · ");

  const ultimaActividad = lead.ultima_interaccion
    ? formatDistanceToNow(new Date(lead.ultima_interaccion), { locale: es, addSuffix: true })
    : "Sin actividad";

  const alertaAtencion = lead.horas_sin_atencion && lead.horas_sin_atencion > 2;

  return (
    <Link href={`/leads/${lead.id}`} className="block">
      <div className={`flex items-center gap-4 px-4 py-3 hover:bg-slate-50 border-b border-slate-100 transition-colors cursor-pointer ${alertaAtencion ? "bg-red-50/50" : ""}`}>

        {/* Temperatura + nombre */}
        <div className="w-44 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <TemperaturaBadge temperatura={lead.temperatura} />
            {alertaAtencion && (
              <span className="text-xs text-red-500 font-medium">
                ⚡ {Math.round(lead.horas_sin_atencion!)}h sin atender
              </span>
            )}
          </div>
          <p className="text-sm font-semibold text-slate-800 truncate">{nombre}</p>
          {sublinea && <p className="text-xs text-slate-400 truncate">{sublinea}</p>}
        </div>

        {/* Ciudad + fuente */}
        <div className="w-28 min-w-0 hidden md:block">
          <p className="text-xs text-slate-500 truncate">{lead.ciudad ?? "—"}</p>
          <div className="mt-0.5">
            <FuenteBadge fuente={lead.fuente ?? null} />
          </div>
        </div>

        {/* Productos */}
        <div className="flex-1 min-w-0 hidden lg:block">
          {lead.productos_recomendados && lead.productos_recomendados.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {lead.productos_recomendados.slice(0, 3).map((p) => (
                <span
                  key={p}
                  className={`text-xs px-1.5 py-0.5 rounded border ${
                    p === lead.producto_interes_principal
                      ? "bg-indigo-50 border-indigo-200 text-indigo-700 font-medium"
                      : "bg-slate-50 border-slate-200 text-slate-500"
                  }`}
                >
                  {PRODUCTOS_LABEL[p] ?? p}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-xs text-slate-300">Sin asignar</span>
          )}
        </div>

        {/* Nivel interés */}
        <div className="w-32 hidden sm:block">
          <NivelInteresBar nivel={lead.nivel_interes} />
        </div>

        {/* Prioridad */}
        <div className="w-16 text-center">
          <PrioridadBadge prioridad={lead.prioridad} />
        </div>

        {/* Última actividad */}
        <div className="w-28 text-right hidden md:block">
          <p className="text-xs text-slate-400">{ultimaActividad}</p>
          {lead.proxima_cita && (
            <p className="text-xs text-indigo-500 font-medium mt-0.5">
              Cita agendada
            </p>
          )}
        </div>

        {/* Flecha */}
        <div className="text-slate-300 text-lg">›</div>
      </div>
    </Link>
  );
}
