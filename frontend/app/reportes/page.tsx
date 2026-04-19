"use client";

import { useEffect, useState, useCallback } from "react";
import { usePermisos } from "@/components/PermisosProvider";
import { SinAcceso } from "@/components/SinAcceso";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { supabase } from "@/lib/supabase";

// ─── Types ─────────────────────────────────────────────────────────────────────

type Reporte = {
  id: string;
  tipo: "mejora" | "bug" | "otro";
  titulo: string;
  descripcion: string;
  estado: "abierto" | "en_progreso" | "resuelto" | "descartado";
  votos: number;
  comercial_id: string | null;
  created_at: string;
  comerciales: { nombre: string } | null;
  yaVote?: boolean;
};

// ─── Constants ─────────────────────────────────────────────────────────────────

const TIPO_CONFIG = {
  mejora: { label: "Mejora",   color: "bg-blue-100 text-blue-700",    emoji: "✨" },
  bug:    { label: "Bug",      color: "bg-red-100 text-red-700",      emoji: "🐛" },
  otro:   { label: "Otro",     color: "bg-slate-100 text-slate-600",  emoji: "💬" },
};

const ESTADO_CONFIG = {
  abierto:     { label: "Abierto",      color: "bg-amber-100 text-amber-700"   },
  en_progreso: { label: "En progreso",  color: "bg-blue-100 text-blue-700"     },
  resuelto:    { label: "Resuelto",     color: "bg-green-100 text-green-700"   },
  descartado:  { label: "Descartado",   color: "bg-slate-100 text-slate-400"   },
};

const FILTROS = [
  { value: "todos",       label: "Todos"       },
  { value: "mejora",      label: "Mejoras"     },
  { value: "bug",         label: "Bugs"        },
  { value: "abierto",     label: "Abiertos"    },
  { value: "en_progreso", label: "En progreso" },
  { value: "resuelto",    label: "Resueltos"   },
];

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function ReportesPage() {
  const { puede, cargando: cargandoPermisos } = usePermisos();
  if (!cargandoPermisos && !puede("ver_reportes")) return <SinAcceso />;
  const [comercialId, setComercialId] = useState<string | null>(null);
  const [reportes, setReportes] = useState<Reporte[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState("todos");
  const [mostrarForm, setMostrarForm] = useState(false);
  const [votando, setVotando] = useState<string | null>(null);

  // Form state
  const [tipo, setTipo] = useState<"mejora" | "bug" | "otro">("mejora");
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [errForm, setErrForm] = useState("");

  useEffect(() => {
    async function obtenerComercial() {
      const { data: { session } } = await supabase.auth.getSession();
      const email = session?.user?.email;
      if (!email) return;
      const { data } = await supabase.from("comerciales").select("id").eq("email", email).single();
      setComercialId(data?.id ?? null);
    }
    obtenerComercial();
  }, []);

  const cargarReportes = useCallback(async () => {
    setLoading(true);
    try {
      const { data: reportesData } = await supabase
        .from("feedback_reportes")
        .select("id, tipo, titulo, descripcion, estado, votos, comercial_id, created_at, comerciales(nombre)")
        .order("votos", { ascending: false })
        .order("created_at", { ascending: false });

      if (!reportesData) { setReportes([]); return; }

      // Fetch which ones this user has voted
      let votados = new Set<string>();
      if (comercialId) {
        const { data: votosData } = await supabase
          .from("feedback_votos")
          .select("reporte_id")
          .eq("comercial_id", comercialId);
        votados = new Set((votosData ?? []).map(v => v.reporte_id));
      }

      setReportes(reportesData.map(r => ({
        ...r,
        tipo: r.tipo as Reporte["tipo"],
        estado: r.estado as Reporte["estado"],
        comerciales: Array.isArray(r.comerciales) ? r.comerciales[0] ?? null : r.comerciales,
        yaVote: votados.has(r.id),
      })));
    } finally {
      setLoading(false);
    }
  }, [comercialId]);

  useEffect(() => { if (comercialId !== undefined) cargarReportes(); }, [cargarReportes, comercialId]);

  async function enviarReporte() {
    if (!titulo.trim()) { setErrForm("Escribe un título."); return; }
    if (!descripcion.trim()) { setErrForm("Describe el problema o mejora."); return; }
    if (!comercialId) { setErrForm("No se encontró tu usuario."); return; }
    setEnviando(true);
    setErrForm("");
    try {
      const { error } = await supabase.from("feedback_reportes").insert({
        tipo, titulo: titulo.trim(), descripcion: descripcion.trim(), comercial_id: comercialId,
      });
      if (error) throw error;
      setTitulo(""); setDescripcion(""); setTipo("mejora");
      setMostrarForm(false);
      await cargarReportes();
    } catch (e: unknown) {
      setErrForm(e instanceof Error ? e.message : "Error al enviar.");
    } finally {
      setEnviando(false);
    }
  }

  async function votar(reporteId: string, yaVote: boolean) {
    if (!comercialId || votando) return;
    setVotando(reporteId);
    try {
      if (yaVote) {
        await Promise.all([
          supabase.from("feedback_votos").delete().eq("reporte_id", reporteId).eq("comercial_id", comercialId),
          supabase.from("feedback_reportes").update({ votos: Math.max(0, (reportes.find(r => r.id === reporteId)?.votos ?? 1) - 1) }).eq("id", reporteId),
        ]);
      } else {
        await Promise.all([
          supabase.from("feedback_votos").insert({ reporte_id: reporteId, comercial_id: comercialId }),
          supabase.from("feedback_reportes").update({ votos: (reportes.find(r => r.id === reporteId)?.votos ?? 0) + 1 }).eq("id", reporteId),
        ]);
      }
      setReportes(prev => prev
        .map(r => r.id === reporteId
          ? { ...r, votos: r.votos + (yaVote ? -1 : 1), yaVote: !yaVote }
          : r
        )
        .sort((a, b) => b.votos - a.votos || new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      );
    } finally {
      setVotando(null);
    }
  }

  const reportesFiltrados = reportes.filter(r => {
    if (filtro === "todos") return true;
    if (filtro === "mejora" || filtro === "bug" || filtro === "otro") return r.tipo === filtro;
    return r.estado === filtro;
  });

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-slate-900">📋 Reportes del equipo</h1>
              <p className="mt-0.5 text-sm text-slate-500">
                Propón mejoras, reporta bugs y vota lo que más te importa
              </p>
            </div>
            <button
              onClick={() => { setMostrarForm(true); setErrForm(""); }}
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white transition-colors hover:opacity-90"
              style={{ background: "#ea650d" }}
            >
              + Nuevo reporte
            </button>
          </div>

          {/* Filtros */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {FILTROS.map(f => (
              <button
                key={f.value}
                onClick={() => setFiltro(f.value)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  filtro === f.value
                    ? "text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
                style={filtro === f.value ? { background: "#ea650d" } : undefined}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 pt-4 space-y-3">
        {/* Modal nuevo reporte */}
        {mostrarForm && (
          <div
            style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
            onClick={e => { if (e.target === e.currentTarget) setMostrarForm(false); }}
          >
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
              <div className="px-6 py-4 border-b border-slate-100">
                <h2 className="text-base font-bold text-slate-800">Nuevo reporte</h2>
                <p className="text-sm text-slate-500 mt-0.5">Cuéntanos qué mejoraría el CRM</p>
              </div>
              <div className="p-6 space-y-4">
                {/* Tipo */}
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 block">Tipo</label>
                  <div className="flex gap-2">
                    {(["mejora", "bug", "otro"] as const).map(t => (
                      <button
                        key={t}
                        onClick={() => setTipo(t)}
                        className={`flex-1 rounded-lg border py-2 text-sm font-medium transition-colors ${
                          tipo === t ? "border-orange-300 text-orange-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                        }`}
                        style={tipo === t ? { background: "#fff5f0" } : undefined}
                      >
                        {TIPO_CONFIG[t].emoji} {TIPO_CONFIG[t].label}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Título */}
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">
                    Título <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={titulo}
                    onChange={e => { setTitulo(e.target.value); setErrForm(""); }}
                    placeholder="Resumen en una línea"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:border-orange-300"
                  />
                </div>
                {/* Descripción */}
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">
                    Descripción <span className="text-red-400">*</span>
                  </label>
                  <textarea
                    value={descripcion}
                    onChange={e => { setDescripcion(e.target.value); setErrForm(""); }}
                    rows={4}
                    placeholder="Describe el problema o la mejora con detalle. ¿Cómo afecta tu trabajo? ¿Qué esperarías ver?"
                    className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:border-orange-300"
                  />
                </div>
                {errForm && <p className="text-xs text-red-500">{errForm}</p>}
              </div>
              <div className="px-6 py-4 border-t border-slate-100 flex gap-3">
                <button
                  onClick={enviarReporte}
                  disabled={enviando}
                  className="flex-1 py-2.5 text-white text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors"
                  style={{ background: "#ea650d" }}
                >
                  {enviando ? "Enviando..." : "Enviar reporte"}
                </button>
                <button
                  onClick={() => setMostrarForm(false)}
                  className="px-4 py-2.5 border border-slate-200 text-slate-600 text-sm rounded-xl hover:bg-slate-50"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Lista vacía */}
        {!loading && reportesFiltrados.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white py-14 px-8 text-center">
            <div className="mb-3 text-4xl">{filtro === "todos" ? "📋" : "🔍"}</div>
            <p className="font-semibold text-slate-700">
              {filtro === "todos" ? "Aún no hay reportes" : "Sin resultados para este filtro"}
            </p>
            <p className="mt-1 text-sm text-slate-400">
              {filtro === "todos"
                ? "Sé el primero en proponer una mejora o reportar un bug."
                : "Prueba con otro filtro."}
            </p>
            {filtro === "todos" && (
              <button
                onClick={() => setMostrarForm(true)}
                className="mt-5 rounded-xl px-5 py-2 text-sm font-semibold text-white"
                style={{ background: "#ea650d" }}
              >
                + Crear primer reporte
              </button>
            )}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex justify-center py-12">
            <div className="h-7 w-7 animate-spin rounded-full border-4 border-t-transparent" style={{ borderColor: "#ea650d", borderTopColor: "transparent" }} />
          </div>
        )}

        {/* Reportes */}
        {!loading && reportesFiltrados.map((r, idx) => {
          const tipoCfg = TIPO_CONFIG[r.tipo];
          const estadoCfg = ESTADO_CONFIG[r.estado];
          const esTop = idx === 0 && r.votos > 0;
          return (
            <div
              key={r.id}
              className={`rounded-xl border bg-white shadow-sm transition-shadow hover:shadow-md ${esTop ? "border-orange-200" : "border-slate-200"}`}
            >
              <div className="p-4">
                <div className="flex gap-4">
                  {/* Botón votar */}
                  <div className="flex flex-col items-center gap-1 shrink-0 pt-0.5">
                    <button
                      onClick={() => votar(r.id, r.yaVote ?? false)}
                      disabled={!comercialId || votando === r.id}
                      className={`flex h-9 w-9 items-center justify-center rounded-xl border-2 text-base transition-all disabled:opacity-40 ${
                        r.yaVote
                          ? "border-orange-400 bg-orange-50 text-orange-600"
                          : "border-slate-200 text-slate-400 hover:border-orange-300 hover:text-orange-500 hover:bg-orange-50"
                      }`}
                      title={r.yaVote ? "Quitar voto" : "Votar"}
                    >
                      {votando === r.id ? (
                        <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      ) : "▲"}
                    </button>
                    <span className={`text-sm font-bold ${r.votos > 0 ? "text-slate-700" : "text-slate-300"}`}>
                      {r.votos}
                    </span>
                  </div>

                  {/* Contenido */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      {esTop && (
                        <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ background: "#fff5f0", color: "#ea650d" }}>
                          🔥 Más votado
                        </span>
                      )}
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tipoCfg.color}`}>
                        {tipoCfg.emoji} {tipoCfg.label}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${estadoCfg.color}`}>
                        {estadoCfg.label}
                      </span>
                    </div>
                    <p className="font-semibold text-slate-800 leading-snug">{r.titulo}</p>
                    <p className="mt-1 text-sm text-slate-500 leading-relaxed">{r.descripcion}</p>
                    <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
                      <span>{r.comerciales?.nombre ?? "Equipo"}</span>
                      <span>·</span>
                      <span>{formatDistanceToNow(new Date(r.created_at), { locale: es, addSuffix: true })}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
