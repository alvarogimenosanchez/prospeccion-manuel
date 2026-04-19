"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { Lead } from "@/lib/supabase";

const NOMBRES_PREOCUPACIONES: Record<string, string> = {
  no_trabajar: "Baja laboral",
  familia:     "Familia",
  accidente:   "Accidente",
  ahorro:      "Ahorro",
  medico:      "Médico privado",
  hipoteca:    "Hipoteca",
  irpf:        "Ahorro fiscal",
};

const NOMBRES_PRODUCTOS: Record<string, string> = {
  contigo_autonomo: "Contigo Autónomo",
  sialp:            "SIALP",
  contigo_familia:  "Contigo Familia",
  contigo_pyme:     "Contigo Pyme",
  hipotecas:        "Hipoteca",
  mi_hogar:         "MiHogar",
  sanitas_salud:    "Sanitas Salud",
  contigo_futuro:   "Contigo Futuro",
  liderplus:        "LiderPlus",
  contigo_senior:   "Contigo Senior",
};

const TIPO_LEAD_LABEL: Record<string, string> = {
  autonomo:   "Autónomo",
  pyme:       "Empresa/Pyme",
  particular: "Particular",
};

const URGENCIA_LABEL: Record<string, string> = {
  hoy_manana:        "⚡ Hoy/mañana",
  esta_semana:       "📅 Esta semana",
  dos_tres_semanas:  "🗓️ 2-3 semanas",
};

function parseNotas(notas: string | null) {
  if (!notas) return { urgencia: "", preocupaciones: [] as string[], hijos: "—", mayor55: "—" };
  const urgenciaMatch = notas.match(/Urgencia: ([^.]+)/);
  const preocMatch    = notas.match(/Preocupaciones: ([^.]+)/);
  const hijosMatch    = notas.match(/Hijos: ([^.]+)/);
  const mayor55Match  = notas.match(/Mayor 55: ([^.]+)/);
  const urgenciaRaw   = urgenciaMatch?.[1]?.trim() ?? "";
  const preocRaw      = preocMatch?.[1]?.trim() ?? "";
  return {
    urgencia:        URGENCIA_LABEL[urgenciaRaw] ?? urgenciaRaw,
    preocupaciones:  preocRaw ? preocRaw.split(", ").filter(Boolean) : [],
    hijos:           hijosMatch?.[1]?.trim() === "true" ? "Sí" : hijosMatch?.[1]?.trim() === "false" ? "No" : "—",
    mayor55:         mayor55Match?.[1]?.trim() === "true" ? "Sí" : mayor55Match?.[1]?.trim() === "false" ? "No" : "—",
  };
}

function EstadoBadge({ estado }: { estado: string }) {
  const map: Record<string, [string, string]> = {
    nuevo:           ["bg-slate-100 text-slate-600",   "Nuevo"],
    enriquecido:     ["bg-blue-100 text-blue-600",     "Enriquecido"],
    segmentado:      ["bg-orange-100 text-orange-600", "Segmentado"],
    mensaje_enviado: ["bg-violet-100 text-violet-600", "Msg. enviado"],
    respondio:       ["bg-amber-100 text-amber-700",   "Respondió"],
    cita_agendada:   ["bg-green-100 text-green-700",   "Cita"],
    en_negociacion:  ["bg-emerald-100 text-emerald-700","Negociación"],
    cerrado_ganado:  ["bg-green-600 text-white",       "Ganado ✓"],
    cerrado_perdido: ["bg-red-100 text-red-600",       "Perdido"],
    descartado:      ["bg-slate-100 text-slate-400",   "Descartado"],
  };
  const [cls, label] = map[estado] ?? ["bg-slate-100 text-slate-500", estado];
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>{label}</span>;
}

export default function CuestionarioPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [filtroProducto, setFiltroProducto] = useState("todos");
  const [filtroPeriodo, setFiltroPeriodo] = useState("30d");

  const cargar = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from("leads")
      .select("*")
      .eq("fuente_detalle", "formulario_captacion")
      .order("fecha_captacion", { ascending: false });

    if (filtroPeriodo !== "todo") {
      const dias = filtroPeriodo === "7d" ? 7 : filtroPeriodo === "30d" ? 30 : 90;
      const desde = new Date();
      desde.setDate(desde.getDate() - dias);
      q = q.gte("fecha_captacion", desde.toISOString());
    }
    if (filtroTipo !== "todos") q = q.eq("tipo_lead", filtroTipo);

    const { data } = await q;
    let resultados = (data as Lead[]) ?? [];
    if (filtroProducto !== "todos") {
      resultados = resultados.filter(l => l.productos_recomendados?.includes(filtroProducto));
    }
    setLeads(resultados);
    setLoading(false);
  }, [filtroTipo, filtroProducto, filtroPeriodo]);

  useEffect(() => { cargar(); }, [cargar]);

  const total       = leads.length;
  const contactados = leads.filter(l => l.estado !== "nuevo").length;
  const respondieron = leads.filter(l => ["respondio","cita_agendada","en_negociacion","cerrado_ganado"].includes(l.estado)).length;
  const citas       = leads.filter(l => ["cita_agendada","en_negociacion","cerrado_ganado"].includes(l.estado)).length;
  const ganados     = leads.filter(l => l.estado === "cerrado_ganado").length;
  const pct = (n: number) => total === 0 ? "—" : `${Math.round((n / total) * 100)}%`;

  const conteoProductos: Record<string, number> = {};
  leads.forEach(l => l.productos_recomendados?.forEach(p => { conteoProductos[p] = (conteoProductos[p] ?? 0) + 1; }));
  const topProductos = Object.entries(conteoProductos).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const conteoUrgencia: Record<string, number> = {};
  leads.forEach(l => {
    const u = parseNotas(l.notas).urgencia;
    if (u) conteoUrgencia[u] = (conteoUrgencia[u] ?? 0) + 1;
  });

  const urlFormulario = "https://prospeccion-manuel.vercel.app/captacion";

  return (
    <div className="space-y-6">
      {/* Cabecera */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Cuestionario de captación</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Leads que completaron el formulario público
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { navigator.clipboard.writeText(urlFormulario); }}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
          >
            🔗 Copiar enlace
          </button>
          <a
            href="/captacion"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 text-white text-sm font-medium rounded-lg transition-colors"
            style={{ background: "#ea650d" }}
          >
            📋 Ver formulario
          </a>
        </div>
      </div>

      {/* Embudo de conversión */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "Completaron",    n: total,        color: "#ea650d", pctStr: "100%" },
          { label: "Contactados",    n: contactados,  color: "#6366f1", pctStr: pct(contactados) },
          { label: "Respondieron",   n: respondieron, color: "#f59e0b", pctStr: pct(respondieron) },
          { label: "Cita agendada",  n: citas,        color: "#10b981", pctStr: pct(citas) },
          { label: "Cerrado ganado", n: ganados,      color: "#059669", pctStr: pct(ganados) },
        ].map(({ label, n, color, pctStr }) => (
          <div key={label} className="bg-white border border-slate-200 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold" style={{ color }}>{n}</p>
            <p className="text-xs font-medium text-slate-500 mt-0.5">{label}</p>
            <p className="text-xs font-semibold mt-1" style={{ color: color + "aa" }}>{pctStr}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Panel lateral: stats */}
        <div className="space-y-4">
          {/* Top productos */}
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Productos recomendados</h3>
            {topProductos.length === 0 ? (
              <p className="text-xs text-slate-400 py-2">Sin datos</p>
            ) : (
              <div className="space-y-2">
                {topProductos.map(([prod, cnt]) => (
                  <div key={prod} className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-xs text-slate-700 truncate">{NOMBRES_PRODUCTOS[prod] ?? prod}</span>
                        <span className="text-xs font-semibold flex-shrink-0 ml-2" style={{ color: "#ea650d" }}>{cnt}</span>
                      </div>
                      <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${Math.round((cnt / total) * 100)}%`, background: "#ea650d" }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Distribución por tipo */}
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Perfil de lead</h3>
            <div className="space-y-1.5">
              {(["autonomo", "pyme", "particular"] as const).map(tipo => {
                const n = leads.filter(l => l.tipo_lead === tipo).length;
                return (
                  <div key={tipo} className="flex items-center justify-between text-xs">
                    <span className="text-slate-600">{TIPO_LEAD_LABEL[tipo]}</span>
                    <span className="font-semibold text-slate-700">{n} <span className="text-slate-400 font-normal">({pct(n)})</span></span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Urgencia */}
          {Object.keys(conteoUrgencia).length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Urgencia de contacto</h3>
              <div className="space-y-1.5">
                {Object.entries(conteoUrgencia).map(([u, n]) => (
                  <div key={u} className="flex items-center justify-between text-xs">
                    <span className="text-slate-600 truncate">{u}</span>
                    <span className="font-semibold text-slate-700 flex-shrink-0 ml-2">{n}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Tabla principal */}
        <div className="lg:col-span-3 space-y-3">
          {/* Filtros */}
          <div className="flex flex-wrap gap-2">
            <select value={filtroPeriodo} onChange={e => setFiltroPeriodo(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none">
              <option value="7d">Últimos 7 días</option>
              <option value="30d">Últimos 30 días</option>
              <option value="90d">Últimos 90 días</option>
              <option value="todo">Todo el historial</option>
            </select>
            <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none">
              <option value="todos">Todos los perfiles</option>
              <option value="autonomo">Autónomos</option>
              <option value="pyme">Empresas/Pymes</option>
              <option value="particular">Particulares</option>
            </select>
            <select value={filtroProducto} onChange={e => setFiltroProducto(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none">
              <option value="todos">Todos los productos</option>
              {Object.entries(NOMBRES_PRODUCTOS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          {loading ? (
            <div className="bg-white border border-slate-200 rounded-xl py-12 text-center text-sm text-slate-400">
              Cargando respuestas...
            </div>
          ) : leads.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl py-12 text-center space-y-3 px-6">
              <p className="text-4xl">📋</p>
              <p className="text-slate-600 font-medium text-sm">Sin respuestas todavía</p>
              <p className="text-xs text-slate-400">
                Comparte el formulario con tus prospects para empezar a captarlos
              </p>
              <div className="flex items-center justify-center gap-2 bg-slate-50 rounded-lg px-4 py-2 border border-slate-200">
                <span className="text-xs text-slate-500 font-mono truncate">{urlFormulario}</span>
                <button onClick={() => navigator.clipboard.writeText(urlFormulario)}
                  className="text-xs font-medium flex-shrink-0 hover:underline" style={{ color: "#ea650d" }}>
                  Copiar
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      <th className="text-left text-xs font-semibold text-slate-500 px-4 py-2.5">Nombre</th>
                      <th className="text-left text-xs font-semibold text-slate-500 px-3 py-2.5">Perfil</th>
                      <th className="text-left text-xs font-semibold text-slate-500 px-3 py-2.5">Preocupaciones</th>
                      <th className="text-left text-xs font-semibold text-slate-500 px-3 py-2.5">Productos</th>
                      <th className="text-left text-xs font-semibold text-slate-500 px-3 py-2.5">Urgencia</th>
                      <th className="text-left text-xs font-semibold text-slate-500 px-3 py-2.5">Estado</th>
                      <th className="text-left text-xs font-semibold text-slate-500 px-3 py-2.5">Fecha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads.map((lead, i) => {
                      const parsed = parseNotas(lead.notas);
                      return (
                        <tr key={lead.id} className={`border-b border-slate-50 hover:bg-orange-50/30 transition-colors ${i % 2 !== 0 ? "bg-slate-50/30" : ""}`}>
                          <td className="px-4 py-3">
                            <Link href={`/leads/${lead.id}`} className="font-medium hover:underline" style={{ color: "#ea650d" }}>
                              {[lead.nombre, lead.apellidos].filter(Boolean).join(" ") || "Sin nombre"} →
                            </Link>
                            {lead.telefono_whatsapp && (
                              <p className="text-xs text-slate-400 mt-0.5">{lead.telefono_whatsapp}</p>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            <span className="text-xs px-2 py-0.5 rounded-full border font-medium bg-slate-50 text-slate-600 border-slate-200 whitespace-nowrap">
                              {TIPO_LEAD_LABEL[lead.tipo_lead ?? ""] ?? lead.tipo_lead ?? "—"}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex flex-wrap gap-1">
                              {parsed.preocupaciones.slice(0, 2).map(p => (
                                <span key={p} className="text-xs px-1.5 py-0.5 rounded bg-orange-50 text-orange-700 border border-orange-100 whitespace-nowrap">
                                  {NOMBRES_PREOCUPACIONES[p] ?? p}
                                </span>
                              ))}
                              {parsed.preocupaciones.length > 2 && (
                                <span className="text-xs text-slate-400">+{parsed.preocupaciones.length - 2}</span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <div className="space-y-0.5">
                              {lead.productos_recomendados?.slice(0, 2).map((p, pi) => (
                                <p key={p} className="text-xs whitespace-nowrap" style={pi === 0 ? { color: "#ea650d", fontWeight: 600 } : { color: "#94a3b8" }}>
                                  {pi === 0 ? "★ " : "· "}{NOMBRES_PRODUCTOS[p] ?? p}
                                </p>
                              ))}
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <span className="text-xs text-slate-600 whitespace-nowrap">{parsed.urgencia || "—"}</span>
                          </td>
                          <td className="px-3 py-3">
                            <EstadoBadge estado={lead.estado} />
                          </td>
                          <td className="px-3 py-3 text-xs text-slate-400 whitespace-nowrap">
                            {new Date(lead.fecha_captacion).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-2 border-t border-slate-100 bg-slate-50">
                <p className="text-xs text-slate-400">{leads.length} respuesta{leads.length !== 1 ? "s" : ""}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
