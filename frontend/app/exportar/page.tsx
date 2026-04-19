"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { usePermisos } from "@/components/PermisosProvider";
import { SinAcceso } from "@/components/SinAcceso";

type ExportJob = {
  id: string;
  entidad: "leads" | "clientes" | "interacciones" | "citas";
  filtros: Record<string, string>;
  nombre: string;
};

const LEAD_ESTADOS = [
  "nuevo", "enriquecido", "segmentado", "mensaje_generado", "mensaje_enviado",
  "respondio", "cita_agendada", "en_negociacion",
  "cerrado_ganado", "cerrado_perdido", "descartado",
];

function csvEscape(val: unknown): string {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCSV(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(","),
    ...rows.map(r => headers.map(h => csvEscape(r[h])).join(",")),
  ];
  return lines.join("\n");
}

function downloadCSV(csv: string, filename: string) {
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ExportarPage() {
  const { puede, cargando: cargandoPermisos } = usePermisos();

  const [entidad, setEntidad] = useState<"leads" | "clientes" | "citas">("leads");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [filtroTemperatura, setFiltroTemperatura] = useState("");
  const [filtroDesde, setFiltroDesde] = useState("");
  const [filtroHasta, setFiltroHasta] = useState("");
  const [exportando, setExportando] = useState(false);
  const [ultimoExport, setUltimoExport] = useState<{ filas: number; nombre: string } | null>(null);

  if (!cargandoPermisos && !puede("exportar_datos")) return <SinAcceso />;

  async function exportarLeads() {
    let q = supabase.from("leads").select(
      "id, nombre, apellidos, email, telefono, telefono_whatsapp, empresa, sector, ciudad, provincia, tipo_lead, fuente, estado, temperatura, nivel_interes, prioridad, producto_interes_principal, comercial_asignado, created_at, updated_at"
    );
    if (filtroEstado) q = q.eq("estado", filtroEstado);
    if (filtroTemperatura) q = q.eq("temperatura", filtroTemperatura);
    if (filtroDesde) q = q.gte("created_at", filtroDesde);
    if (filtroHasta) q = q.lte("created_at", filtroHasta + "T23:59:59");
    q = q.order("created_at", { ascending: false }).limit(10000);
    const { data } = await q;
    return data ?? [];
  }

  async function exportarClientes() {
    let q = supabase.from("clientes").select(
      "id, nombre, apellidos, email, telefono, empresa, producto, valor_contrato, fecha_inicio, fecha_renovacion, estado, comercial_asignado, created_at"
    );
    if (filtroDesde) q = q.gte("created_at", filtroDesde);
    if (filtroHasta) q = q.lte("created_at", filtroHasta + "T23:59:59");
    q = q.order("created_at", { ascending: false }).limit(10000);
    const { data } = await q;
    return data ?? [];
  }

  async function exportarCitas() {
    let q = supabase.from("appointments").select(
      "id, tipo, estado, fecha_hora, duracion_minutos, producto_a_tratar, resultado, comercial_id, lead_id, created_at"
    );
    if (filtroDesde) q = q.gte("created_at", filtroDesde);
    if (filtroHasta) q = q.lte("created_at", filtroHasta + "T23:59:59");
    q = q.order("fecha_hora", { ascending: false }).limit(10000);
    const { data } = await q;
    return data ?? [];
  }

  async function lanzarExport() {
    setExportando(true);
    try {
      let rows: Record<string, unknown>[] = [];
      let nombre = "";
      const fecha = new Date().toISOString().slice(0, 10);

      if (entidad === "leads") {
        rows = (await exportarLeads()) as Record<string, unknown>[];
        nombre = `leads_${fecha}.csv`;
      } else if (entidad === "clientes") {
        rows = (await exportarClientes()) as Record<string, unknown>[];
        nombre = `clientes_${fecha}.csv`;
      } else {
        rows = (await exportarCitas()) as Record<string, unknown>[];
        nombre = `citas_${fecha}.csv`;
      }

      if (rows.length === 0) {
        alert("No hay datos con los filtros aplicados.");
        return;
      }

      const csv = toCSV(rows);
      downloadCSV(csv, nombre);
      setUltimoExport({ filas: rows.length, nombre });
    } finally {
      setExportando(false);
    }
  }

  const ENTIDAD_CONFIG = {
    leads: { label: "Leads", desc: "Todos los leads del pipeline con estado, temperatura y datos de contacto" },
    clientes: { label: "Clientes", desc: "Clientes activos con contratos, valores y fechas de renovación" },
    citas: { label: "Citas / Agenda", desc: "Historial de citas con resultados y asignaciones" },
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Exportar datos</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Descarga datos del CRM en formato CSV para análisis externo o reportes a dirección
        </p>
      </div>

      {ultimoExport && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 flex items-center gap-3">
          <span className="text-lg">✅</span>
          <p className="text-sm text-green-800">
            <span className="font-semibold">{ultimoExport.nombre}</span> descargado —{" "}
            {ultimoExport.filas.toLocaleString()} filas exportadas
          </p>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-6">
        {/* Entidad */}
        <div>
          <label className="text-sm font-semibold text-slate-700 mb-3 block">¿Qué quieres exportar?</label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {(["leads", "clientes", "citas"] as const).map(e => (
              <button
                key={e}
                onClick={() => setEntidad(e)}
                className={`text-left p-3 rounded-xl border-2 transition-colors ${
                  entidad === e
                    ? "border-orange-400 bg-orange-50"
                    : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <p className={`text-sm font-semibold ${entidad === e ? "text-orange-700" : "text-slate-700"}`}>
                  {ENTIDAD_CONFIG[e].label}
                </p>
                <p className="text-xs text-slate-400 mt-0.5 leading-snug">
                  {ENTIDAD_CONFIG[e].desc}
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* Filtros */}
        <div className="space-y-4">
          <label className="text-sm font-semibold text-slate-700 block">Filtros (opcionales)</label>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Fecha desde</label>
              <input
                type="date"
                value={filtroDesde}
                onChange={e => setFiltroDesde(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Fecha hasta</label>
              <input
                type="date"
                value={filtroHasta}
                onChange={e => setFiltroHasta(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400"
              />
            </div>
          </div>

          {entidad === "leads" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Estado</label>
                <select
                  value={filtroEstado}
                  onChange={e => setFiltroEstado(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-slate-400"
                >
                  <option value="">Todos los estados</option>
                  {LEAD_ESTADOS.map(s => (
                    <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Temperatura</label>
                <select
                  value={filtroTemperatura}
                  onChange={e => setFiltroTemperatura(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-slate-400"
                >
                  <option value="">Todas</option>
                  <option value="caliente">Caliente</option>
                  <option value="templado">Templado</option>
                  <option value="frio">Frío</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Info CSV columns */}
        <div className="rounded-lg bg-slate-50 border border-slate-100 p-3">
          <p className="text-xs font-medium text-slate-600 mb-1.5">Columnas incluidas</p>
          <p className="text-xs text-slate-400 leading-relaxed">
            {entidad === "leads" && "id, nombre, apellidos, email, teléfono, whatsapp, empresa, sector, ciudad, provincia, tipo, fuente, estado, temperatura, nivel_interés, prioridad, producto, comercial, creado_en, actualizado_en"}
            {entidad === "clientes" && "id, nombre, apellidos, email, teléfono, empresa, producto, valor_contrato, fecha_inicio, fecha_renovacion, estado, comercial, creado_en"}
            {entidad === "citas" && "id, tipo, estado, fecha_hora, duración, producto, resultado, comercial_id, lead_id, creado_en"}
          </p>
        </div>

        <button
          onClick={lanzarExport}
          disabled={exportando}
          className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-opacity disabled:opacity-40 flex items-center justify-center gap-2"
          style={{ background: "#ea650d" }}
        >
          {exportando ? (
            <>
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                <path d="M12 2a10 10 0 0110 10" />
              </svg>
              Exportando...
            </>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
              </svg>
              Descargar CSV
            </>
          )}
        </button>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
        <p className="text-xs text-amber-700">
          <span className="font-semibold">Nota de privacidad:</span> Los datos exportados incluyen información personal de contactos.
          Úsalos conforme a la política de protección de datos y la LOPD. No compartas el archivo en canales no seguros.
        </p>
      </div>
    </div>
  );
}
