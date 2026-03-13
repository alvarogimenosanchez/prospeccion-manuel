"use client";

import Link from "next/link";

type LeadSinAtencion = {
  id: string;
  nombre: string;
  apellidos: string | null;
  nivel_interes: number;
};

export function AlertasUrgentes({ leads }: { leads: LeadSinAtencion[] }) {
  if (leads.length === 0) return null;

  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-red-500 text-lg">⚡</span>
        <h3 className="text-sm font-semibold text-red-700">
          {leads.length} lead{leads.length > 1 ? "s" : ""} esperando respuesta (+2h)
        </h3>
      </div>
      <div className="flex flex-wrap gap-2">
        {leads.map((lead) => (
          <Link
            key={lead.id}
            href={`/leads/${lead.id}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-red-200 rounded-lg text-sm text-red-700 hover:bg-red-100 transition-colors"
          >
            <span className="font-medium">
              {[lead.nombre, lead.apellidos].filter(Boolean).join(" ")}
            </span>
            <span className="text-xs text-red-400">({lead.nivel_interes}/10)</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
