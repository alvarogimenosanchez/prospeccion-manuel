"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { usePermisos } from "@/components/PermisosProvider";
import { SinAcceso } from "@/components/SinAcceso";
import { format } from "date-fns";
import { es } from "date-fns/locale";

type AuditEntry = {
  id: string;
  comercial_id: string | null;
  email: string | null;
  accion: string;
  entidad_tipo: string | null;
  entidad_id: string | null;
  detalles: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
};

const ACCION_LABEL: Record<string, { label: string; color: string }> = {
  lead_reasignar: { label: "Reasignó lead", color: "bg-blue-50 text-blue-700" },
  lead_estado_cambiar: { label: "Cambió estado lead", color: "bg-blue-50 text-blue-700" },
  lead_eliminar: { label: "Eliminó lead", color: "bg-red-50 text-red-700" },
  comercial_crear: { label: "Creó comercial", color: "bg-emerald-50 text-emerald-700" },
  comercial_editar: { label: "Editó comercial", color: "bg-amber-50 text-amber-700" },
  comercial_activar: { label: "Activó comercial", color: "bg-emerald-50 text-emerald-700" },
  comercial_desactivar: { label: "Desactivó comercial", color: "bg-red-50 text-red-700" },
  mensaje_aprobar: { label: "Aprobó mensaje", color: "bg-emerald-50 text-emerald-700" },
  mensaje_descartar: { label: "Descartó mensaje", color: "bg-slate-50 text-slate-600" },
  mensaje_enviar: { label: "Envió WhatsApp", color: "bg-orange-50 text-orange-700" },
  cliente_crear: { label: "Creó cliente", color: "bg-emerald-50 text-emerald-700" },
  cliente_editar: { label: "Editó cliente", color: "bg-amber-50 text-amber-700" },
  cliente_eliminar: { label: "Eliminó cliente", color: "bg-red-50 text-red-700" },
  scraping_lanzar: { label: "Lanzó scraping", color: "bg-blue-50 text-blue-700" },
};

export default function AuditoriaPage() {
  const { rol, cargando: cargandoPermisos } = usePermisos();
  const esDirector = rol === "director" || rol === "manager" || rol === "admin";

  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroAccion, setFiltroAccion] = useState<string>("");
  const [filtroEmail, setFiltroEmail] = useState<string>("");

  const cargar = useCallback(async () => {
    setLoading(true);
    let q = supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(500);
    if (filtroAccion) q = q.eq("accion", filtroAccion);
    if (filtroEmail) q = q.ilike("email", `%${filtroEmail}%`);
    const { data } = await q;
    setEntries((data ?? []) as AuditEntry[]);
    setLoading(false);
  }, [filtroAccion, filtroEmail]);

  useEffect(() => { if (esDirector) cargar(); }, [esDirector, cargar]);

  if (cargandoPermisos) return <div className="py-20 text-center text-sm text-slate-400">Cargando…</div>;
  if (!esDirector) return <SinAcceso />;

  const accionesDisponibles = Object.keys(ACCION_LABEL);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Auditoría</h1>
        <p className="text-sm text-slate-500 mt-0.5">Registro de operaciones sensibles del equipo. Últimos 500 eventos.</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap gap-3 items-center">
        <select
          value={filtroAccion}
          onChange={e => setFiltroAccion(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white"
        >
          <option value="">Todas las acciones</option>
          {accionesDisponibles.map(a => (
            <option key={a} value={a}>{ACCION_LABEL[a].label}</option>
          ))}
        </select>
        <input
          type="text"
          value={filtroEmail}
          onChange={e => setFiltroEmail(e.target.value)}
          placeholder="Filtrar por email…"
          className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white flex-1 min-w-[200px]"
        />
        <button
          onClick={cargar}
          className="text-sm px-4 py-2 rounded-lg text-white"
          style={{ background: "#ea650d" }}
        >
          Aplicar
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-sm text-slate-400">Cargando registros…</div>
        ) : entries.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">Sin eventos para los filtros seleccionados.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs uppercase tracking-wide">Fecha</th>
                <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs uppercase tracking-wide">Quién</th>
                <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs uppercase tracking-wide">Acción</th>
                <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs uppercase tracking-wide">Entidad</th>
                <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs uppercase tracking-wide">Detalles</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(e => {
                const meta = ACCION_LABEL[e.accion] ?? { label: e.accion, color: "bg-slate-100 text-slate-600" };
                return (
                  <tr key={e.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap text-xs">
                      {format(new Date(e.created_at), "d MMM HH:mm:ss", { locale: es })}
                    </td>
                    <td className="px-4 py-2.5 text-slate-700 text-xs">{e.email ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${meta.color}`}>{meta.label}</span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 text-xs whitespace-nowrap">
                      {e.entidad_tipo && (
                        <span className="font-mono">{e.entidad_tipo}:{e.entidad_id?.slice(0, 8) ?? "—"}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 text-xs">
                      {e.detalles && Object.keys(e.detalles).length > 0 ? (
                        <code className="text-xs bg-slate-50 rounded px-1.5 py-0.5">{JSON.stringify(e.detalles)}</code>
                      ) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
