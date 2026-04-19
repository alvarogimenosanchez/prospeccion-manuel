"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { usePermisos } from "@/components/PermisosProvider";
import { SinAcceso } from "@/components/SinAcceso";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

// ─── Types ────────────────────────────────────────────────────────────────────

type Formacion = {
  id: string;
  titulo: string;
  descripcion: string | null;
  categoria: "producto" | "ventas" | "compliance" | "herramientas" | "onboarding" | "otro";
  contenido: string | null;
  video_url: string | null;
  duracion_minutos: number;
  obligatoria: boolean;
  activa: boolean;
  orden: number;
  creado_por: string | null;
  created_at: string;
};

type Progreso = {
  id: string;
  formacion_id: string;
  comercial_id: string;
  estado: "pendiente" | "en_curso" | "completada";
  progreso_pct: number;
  completada_at: string | null;
  notas: string | null;
};

type Comercial = {
  id: string;
  nombre: string;
  apellidos: string | null;
  rol: string;
};

type FormacionConProgreso = Formacion & {
  progreso?: Progreso;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIA_CFG = {
  producto:     { label: "Producto",     bg: "bg-blue-50",   text: "text-blue-700",   icon: "📦" },
  ventas:       { label: "Ventas",       bg: "bg-green-50",  text: "text-green-700",  icon: "💰" },
  compliance:   { label: "Compliance",   bg: "bg-red-50",    text: "text-red-700",    icon: "⚖️" },
  herramientas: { label: "Herramientas", bg: "bg-purple-50", text: "text-purple-700", icon: "🔧" },
  onboarding:   { label: "Onboarding",   bg: "bg-orange-50", text: "text-orange-700", icon: "🚀" },
  otro:         { label: "Otro",         bg: "bg-slate-50",  text: "text-slate-600",  icon: "📚" },
};

const ESTADO_CFG = {
  pendiente:  { label: "Pendiente",   bg: "bg-slate-100",  text: "text-slate-600" },
  en_curso:   { label: "En curso",    bg: "bg-blue-100",   text: "text-blue-700"  },
  completada: { label: "Completada",  bg: "bg-green-100",  text: "text-green-700" },
};

// ─── Modal for creating/editing a training module ─────────────────────────────

function ModalFormacion({
  formacion,
  onClose,
  onSave,
}: {
  formacion?: Formacion | null;
  onClose: () => void;
  onSave: () => void;
}) {
  const [titulo, setTitulo] = useState(formacion?.titulo ?? "");
  const [descripcion, setDescripcion] = useState(formacion?.descripcion ?? "");
  const [categoria, setCategoria] = useState<Formacion["categoria"]>(formacion?.categoria ?? "otro");
  const [contenido, setContenido] = useState(formacion?.contenido ?? "");
  const [videoUrl, setVideoUrl] = useState(formacion?.video_url ?? "");
  const [duracion, setDuracion] = useState(formacion?.duracion_minutos ?? 30);
  const [obligatoria, setObligatoria] = useState(formacion?.obligatoria ?? false);
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    if (!titulo.trim()) return;
    setGuardando(true);
    const payload = {
      titulo: titulo.trim(),
      descripcion: descripcion.trim() || null,
      categoria,
      contenido: contenido.trim() || null,
      video_url: videoUrl.trim() || null,
      duracion_minutos: duracion,
      obligatoria,
      activa: true,
    };
    if (formacion) {
      await supabase.from("formaciones").update(payload).eq("id", formacion.id);
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      let creadoPor: string | null = null;
      if (user?.email) {
        const { data: com } = await supabase.from("comerciales").select("id").eq("email", user.email).single();
        creadoPor = com?.id ?? null;
      }
      await supabase.from("formaciones").insert({ ...payload, creado_por: creadoPor });
    }
    setGuardando(false);
    onSave();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.4)" }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-900">
            {formacion ? "Editar formación" : "Nueva formación"}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>
        <div className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Título *</label>
            <input value={titulo} onChange={e => setTitulo(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-400" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Descripción</label>
            <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)} rows={2}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-400 resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Categoría</label>
              <select value={categoria} onChange={e => setCategoria(e.target.value as Formacion["categoria"])}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-400">
                {Object.entries(CATEGORIA_CFG).map(([k, v]) => (
                  <option key={k} value={k}>{v.icon} {v.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Duración (min)</label>
              <input type="number" value={duracion} onChange={e => setDuracion(Number(e.target.value))} min={5} max={480}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-400" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">URL de vídeo (YouTube/Vimeo)</label>
            <input value={videoUrl} onChange={e => setVideoUrl(e.target.value)} placeholder="https://..."
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-400" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Contenido (Markdown)</label>
            <textarea value={contenido} onChange={e => setContenido(e.target.value)} rows={10}
              placeholder="# Título&#10;&#10;## Sección 1&#10;Contenido..."
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-400 resize-none font-mono" />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input type="checkbox" checked={obligatoria} onChange={e => setObligatoria(e.target.checked)} className="accent-orange-500" />
            <span>Formación obligatoria para todos los comerciales</span>
          </label>
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
            Cancelar
          </button>
          <button onClick={guardar} disabled={!titulo.trim() || guardando}
            className="px-4 py-2 text-sm text-white rounded-lg font-medium disabled:opacity-50"
            style={{ background: "#ea650d" }}>
            {guardando ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal for viewing training content ──────────────────────────────────────

function ModalContenido({
  formacion,
  progreso,
  miId,
  onClose,
  onProgresoChange,
}: {
  formacion: Formacion;
  progreso?: Progreso;
  miId: string | null;
  onClose: () => void;
  onProgresoChange: () => void;
}) {
  const [marcando, setMarcando] = useState(false);

  async function marcarCompletada() {
    if (!miId) return;
    setMarcando(true);
    await supabase.from("formaciones_progreso").upsert({
      formacion_id: formacion.id,
      comercial_id: miId,
      estado: "completada",
      progreso_pct: 100,
      completada_at: new Date().toISOString(),
    }, { onConflict: "formacion_id,comercial_id" });
    setMarcando(false);
    onProgresoChange();
  }

  async function marcarEnCurso() {
    if (!miId) return;
    await supabase.from("formaciones_progreso").upsert({
      formacion_id: formacion.id,
      comercial_id: miId,
      estado: "en_curso",
      progreso_pct: 50,
    }, { onConflict: "formacion_id,comercial_id" });
    onProgresoChange();
  }

  const cat = CATEGORIA_CFG[formacion.categoria];
  const yaCompletada = progreso?.estado === "completada";

  // Render simple markdown subset
  function renderContenido(md: string) {
    return md
      .replace(/^### (.+)$/gm, '<h3 class="text-base font-bold text-slate-800 mt-5 mb-2">$1</h3>')
      .replace(/^## (.+)$/gm, '<h2 class="text-lg font-bold text-slate-900 mt-6 mb-2">$1</h2>')
      .replace(/^# (.+)$/gm, '<h1 class="text-xl font-bold text-slate-900 mt-0 mb-3">$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`(.+?)`/g, '<code class="bg-slate-100 px-1.5 py-0.5 rounded text-xs font-mono">$1</code>')
      .replace(/^> (.+)$/gm, '<blockquote class="border-l-4 border-orange-300 pl-3 italic text-slate-600 my-2">$1</blockquote>')
      .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc text-slate-700">$1</li>')
      .replace(/^(\d+)\. (.+)$/gm, '<li class="ml-4 list-decimal text-slate-700">$2</li>')
      .replace(/\n\n/g, '</p><p class="text-slate-700 leading-relaxed my-2">')
      .replace(/```[\s\S]*?```/g, m => `<pre class="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs font-mono overflow-x-auto my-3 whitespace-pre-wrap">${m.replace(/```\w*\n?/g, "").replace(/```/g, "")}</pre>`);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-start justify-between gap-4 rounded-t-2xl">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cat.bg} ${cat.text}`}>
                {cat.icon} {cat.label}
              </span>
              {formacion.obligatoria && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-600 font-medium">Obligatoria</span>
              )}
              {yaCompletada && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-600 font-medium">✓ Completada</span>
              )}
            </div>
            <h2 className="text-xl font-bold text-slate-900">{formacion.titulo}</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              {formacion.duracion_minutos} min de lectura
              {progreso?.completada_at && ` · Completada ${format(parseISO(progreso.completada_at), "d MMM yyyy", { locale: es })}`}
            </p>
          </div>
          <button onClick={onClose} className="shrink-0 text-slate-400 hover:text-slate-600 text-2xl leading-none mt-1">×</button>
        </div>

        {/* Video */}
        {formacion.video_url && (
          <div className="px-6 pt-4">
            <a href={formacion.video_url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 hover:bg-red-100 transition-colors">
              <span className="text-2xl">▶️</span>
              <div>
                <div className="font-medium">Ver vídeo formativo</div>
                <div className="text-xs text-red-500 truncate">{formacion.video_url}</div>
              </div>
            </a>
          </div>
        )}

        {/* Content */}
        {formacion.contenido ? (
          <div className="px-6 py-4 prose prose-sm max-w-none">
            <div
              className="text-slate-700 leading-relaxed space-y-2"
              dangerouslySetInnerHTML={{ __html: renderContenido(formacion.contenido) }}
            />
          </div>
        ) : (
          <div className="px-6 py-8 text-center text-slate-400 text-sm">
            Sin contenido disponible aún.
          </div>
        )}

        {/* Footer actions */}
        {miId && (
          <div className="sticky bottom-0 bg-white border-t border-slate-100 px-6 py-4 flex items-center justify-between rounded-b-2xl">
            <p className="text-xs text-slate-400">
              {!progreso && "Empieza cuando quieras"}
              {progreso?.estado === "en_curso" && "Continúa cuando puedas"}
              {yaCompletada && "¡Has completado esta formación!"}
            </p>
            <div className="flex gap-2">
              {!yaCompletada && progreso?.estado !== "en_curso" && (
                <button onClick={marcarEnCurso}
                  className="px-4 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600">
                  Marcar en curso
                </button>
              )}
              {!yaCompletada && (
                <button onClick={marcarCompletada} disabled={marcando}
                  className="px-4 py-2 text-sm text-white rounded-lg font-medium disabled:opacity-50"
                  style={{ background: "#ea650d" }}>
                  {marcando ? "Guardando..." : "✓ Marcar completada"}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function FormacionesPage() {
  const { puede, cargando: cargandoPermisos } = usePermisos();
  const [formaciones, setFormaciones] = useState<FormacionConProgreso[]>([]);
  const [comerciales, setComerciales] = useState<Comercial[]>([]);
  const [todosProgresos, setTodosProgresos] = useState<(Progreso & { comercial_nombre: string })[]>([]);
  const [cargando, setCargando] = useState(true);
  const [miId, setMiId] = useState<string | null>(null);
  const [esGestor, setEsGestor] = useState(false);
  const [vistaActual, setVistaActual] = useState<"mis" | "equipo" | "gestionar">("mis");
  const [filtroCategoria, setFiltroCategoria] = useState<string>("");
  const [filtroEstado, setFiltroEstado] = useState<string>("");
  const [modalNueva, setModalNueva] = useState(false);
  const [editando, setEditando] = useState<Formacion | null>(null);
  const [viendo, setViendo] = useState<FormacionConProgreso | null>(null);
  const [comercialSeleccionado, setComercialSeleccionado] = useState<string>("todos");

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data: { user } } = await supabase.auth.getUser();
    let cId: string | null = null;
    let esDir = false;

    if (user?.email) {
      const { data: com } = await supabase.from("comerciales").select("id, rol").eq("email", user.email).single();
      if (com) {
        cId = com.id;
        esDir = ["admin", "director", "manager"].includes(com.rol);
      }
    }
    setMiId(cId);
    setEsGestor(esDir);

    const [{ data: fList }, { data: myProg }, { data: allComs }] = await Promise.all([
      supabase.from("formaciones").select("*").eq("activa", true).order("orden").order("created_at"),
      cId ? supabase.from("formaciones_progreso").select("*").eq("comercial_id", cId) : Promise.resolve({ data: [] }),
      esDir ? supabase.from("comerciales").select("id, nombre, apellidos, rol").eq("activo", true).order("nombre") : Promise.resolve({ data: [] }),
    ]);

    const progresoMap: Record<string, Progreso> = {};
    for (const p of myProg ?? []) progresoMap[p.formacion_id] = p;

    setFormaciones((fList ?? []).map(f => ({ ...f, progreso: progresoMap[f.id] })));
    setComerciales(allComs ?? []);

    // Load all progress for team view
    if (esDir) {
      const { data: allProg } = await supabase
        .from("formaciones_progreso")
        .select("*, comerciales(nombre, apellidos)");

      const progWithNames = (allProg ?? []).map(p => {
        const com = p.comerciales as unknown as { nombre: string; apellidos: string | null } | null;
        return {
          ...p,
          comercial_nombre: com ? [com.nombre, com.apellidos].filter(Boolean).join(" ") : "?",
        };
      });
      setTodosProgresos(progWithNames);
    }

    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  if (!cargandoPermisos && !puede("gestionar_clientes") && !puede("ver_metricas")) {
    return <SinAcceso />;
  }

  // ── Stats ──────────────────────────────────────────────────────────────────

  const total = formaciones.length;
  const completadas = formaciones.filter(f => f.progreso?.estado === "completada").length;
  const obligatorias = formaciones.filter(f => f.obligatoria);
  const obligatoriasComp = obligatorias.filter(f => f.progreso?.estado === "completada").length;
  const minutosCompletados = formaciones
    .filter(f => f.progreso?.estado === "completada")
    .reduce((s, f) => s + f.duracion_minutos, 0);

  // ── Filtered list ──────────────────────────────────────────────────────────

  const listaFiltrada = formaciones.filter(f => {
    if (filtroCategoria && f.categoria !== filtroCategoria) return false;
    if (filtroEstado) {
      const estado = f.progreso?.estado ?? "pendiente";
      if (estado !== filtroEstado) return false;
    }
    return true;
  });

  // ── Team progress matrix ───────────────────────────────────────────────────

  function getProgresoComercial(comId: string, formId: string): Progreso | undefined {
    return todosProgresos.find(p => p.comercial_id === comId && p.formacion_id === formId) as unknown as Progreso | undefined;
  }

  const formacionesObligatorias = formaciones.filter(f => f.obligatoria);

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Formaciones</h1>
          <p className="text-sm text-slate-500 mt-0.5">Módulos de formación, producto y ventas del equipo</p>
        </div>
        {esGestor && (
          <button onClick={() => setModalNueva(true)}
            className="px-4 py-2 text-sm text-white rounded-xl font-medium"
            style={{ background: "#ea650d" }}>
            + Nueva formación
          </button>
        )}
      </div>

      {/* My progress stats */}
      {vistaActual === "mis" && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total módulos", value: total, icon: "📚" },
            { label: "Completadas", value: `${completadas}/${total}`, icon: "✅" },
            { label: "Obligatorias", value: `${obligatoriasComp}/${obligatorias.length}`, icon: "⚠️" },
            { label: "Minutos aprendidos", value: minutosCompletados, icon: "⏱️" },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl border border-slate-200 px-4 py-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">{s.icon}</span>
                <span className="text-xs text-slate-500">{s.label}</span>
              </div>
              <div className="text-xl font-bold text-slate-900">{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Progress bar for obligatory */}
      {vistaActual === "mis" && obligatorias.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 px-5 py-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-slate-700">Progreso formaciones obligatorias</span>
            <span className="text-sm font-bold" style={{ color: "#ea650d" }}>
              {obligatoriasComp}/{obligatorias.length}
            </span>
          </div>
          <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${(obligatoriasComp / obligatorias.length) * 100}%`, background: "#ea650d" }}
            />
          </div>
          <p className="text-xs text-slate-400 mt-1.5">
            {obligatoriasComp === obligatorias.length
              ? "¡Todas las formaciones obligatorias completadas! 🎉"
              : `${obligatorias.length - obligatoriasComp} formación${obligatorias.length - obligatoriasComp !== 1 ? "es" : ""} obligatoria${obligatorias.length - obligatoriasComp !== 1 ? "s" : ""} pendiente${obligatorias.length - obligatoriasComp !== 1 ? "s" : ""}`}
          </p>
        </div>
      )}

      {/* View tabs */}
      {esGestor && (
        <div className="flex gap-2">
          {[
            { id: "mis", label: "Mis formaciones" },
            { id: "equipo", label: "Progreso del equipo" },
            { id: "gestionar", label: "Gestionar módulos" },
          ].map(t => (
            <button key={t.id} onClick={() => setVistaActual(t.id as typeof vistaActual)}
              className={`px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
                vistaActual === t.id
                  ? "border-orange-400 text-white"
                  : "border-slate-200 text-slate-600 hover:border-orange-200 bg-white"
              }`}
              style={vistaActual === t.id ? { background: "#ea650d" } : undefined}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* ── MIS FORMACIONES view ── */}
      {vistaActual === "mis" && (
        <>
          {/* Filters */}
          <div className="flex gap-2 flex-wrap">
            <select value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)}
              className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-orange-400">
              <option value="">Todas las categorías</option>
              {Object.entries(CATEGORIA_CFG).map(([k, v]) => (
                <option key={k} value={k}>{v.icon} {v.label}</option>
              ))}
            </select>
            <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}
              className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-orange-400">
              <option value="">Todos los estados</option>
              <option value="pendiente">Pendiente</option>
              <option value="en_curso">En curso</option>
              <option value="completada">Completada</option>
            </select>
          </div>

          {cargando ? (
            <div className="py-12 text-center text-sm text-slate-400">Cargando formaciones...</div>
          ) : listaFiltrada.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-400">No hay formaciones disponibles.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {listaFiltrada.map(f => {
                const cat = CATEGORIA_CFG[f.categoria];
                const estadoP = f.progreso?.estado ?? "pendiente";
                const estadoCfg = ESTADO_CFG[estadoP];
                return (
                  <div key={f.id}
                    className="bg-white rounded-xl border border-slate-200 p-4 hover:border-orange-300 hover:shadow-sm transition-all cursor-pointer"
                    onClick={() => setViendo(f)}>
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 ${cat.bg}`}>
                        {cat.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-slate-900 leading-tight">{f.titulo}</span>
                          {f.obligatoria && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-500 font-medium">Obligatoria</span>
                          )}
                        </div>
                        {f.descripcion && (
                          <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{f.descripcion}</p>
                        )}
                        <div className="flex items-center gap-3 mt-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${estadoCfg.bg} ${estadoCfg.text}`}>
                            {estadoP === "completada" ? "✓ " : ""}{estadoCfg.label}
                          </span>
                          <span className="text-xs text-slate-400">⏱ {f.duracion_minutos} min</span>
                          <span className={`text-xs ${cat.text}`}>{cat.label}</span>
                        </div>
                        {estadoP === "completada" && f.progreso?.completada_at && (
                          <p className="text-xs text-slate-300 mt-1">
                            Completada {format(parseISO(f.progreso.completada_at), "d MMM yyyy", { locale: es })}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── PROGRESO DEL EQUIPO view ── */}
      {vistaActual === "equipo" && esGestor && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <select value={comercialSeleccionado} onChange={e => setComercialSeleccionado(e.target.value)}
              className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-orange-400">
              <option value="todos">Todo el equipo</option>
              {comerciales.map(c => (
                <option key={c.id} value={c.id}>
                  {c.nombre} {c.apellidos ?? ""}
                </option>
              ))}
            </select>
          </div>

          {/* Matrix: agents × formaciones obligatorias */}
          {formacionesObligatorias.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100">
                <h3 className="text-sm font-semibold text-slate-700">Formaciones obligatorias — Cumplimiento del equipo</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left px-4 py-2 text-slate-500 font-medium min-w-[150px]">Comercial</th>
                      {formacionesObligatorias.map(f => (
                        <th key={f.id} className="text-center px-2 py-2 text-slate-500 font-medium max-w-[100px]">
                          <div className="truncate">{f.titulo.split(" ").slice(0, 3).join(" ")}</div>
                        </th>
                      ))}
                      <th className="text-center px-3 py-2 text-slate-500 font-medium">% Cumpl.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comerciales
                      .filter(c => comercialSeleccionado === "todos" || c.id === comercialSeleccionado)
                      .map(c => {
                        const progByForm = formacionesObligatorias.map(f => getProgresoComercial(c.id, f.id));
                        const completas = progByForm.filter(p => p?.estado === "completada").length;
                        const pct = Math.round((completas / formacionesObligatorias.length) * 100);
                        return (
                          <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                            <td className="px-4 py-2.5 font-medium text-slate-700">
                              {c.nombre} {c.apellidos ?? ""}
                            </td>
                            {formacionesObligatorias.map((f, i) => {
                              const p = progByForm[i];
                              const estado = p?.estado ?? "pendiente";
                              return (
                                <td key={f.id} className="text-center px-2 py-2.5">
                                  {estado === "completada" ? (
                                    <span className="text-green-500 text-base">✓</span>
                                  ) : estado === "en_curso" ? (
                                    <span className="text-blue-400 text-base">◔</span>
                                  ) : (
                                    <span className="text-slate-200 text-base">○</span>
                                  )}
                                </td>
                              );
                            })}
                            <td className="text-center px-3 py-2.5">
                              <span className={`font-bold ${pct === 100 ? "text-green-600" : pct >= 50 ? "text-amber-600" : "text-red-500"}`}>
                                {pct}%
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Individual cards */}
          {comerciales
            .filter(c => comercialSeleccionado === "todos" || c.id === comercialSeleccionado)
            .map(c => {
              const progsC = formaciones.map(f => ({
                formacion: f,
                progreso: getProgresoComercial(c.id, f.id),
              }));
              const compC = progsC.filter(p => p.progreso?.estado === "completada").length;
              const pctC = total > 0 ? Math.round((compC / total) * 100) : 0;
              return (
                <div key={c.id} className="bg-white rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-800">{c.nombre} {c.apellidos ?? ""}</div>
                      <div className="text-xs text-slate-400 capitalize">{c.rol}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-slate-900">{compC}/{total}</div>
                      <div className="text-xs text-slate-400">completadas</div>
                    </div>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pctC}%`, background: "#ea650d" }} />
                  </div>
                </div>
              );
            })}
        </div>
      )}

      {/* ── GESTIONAR MÓDULOS view ── */}
      {vistaActual === "gestionar" && esGestor && (
        <div className="space-y-3">
          {cargando ? (
            <div className="py-12 text-center text-sm text-slate-400">Cargando...</div>
          ) : formaciones.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-400">No hay módulos. Crea el primero.</div>
          ) : (
            formaciones.map(f => {
              const cat = CATEGORIA_CFG[f.categoria];
              const completados = todosProgresos.filter(p => p.formacion_id === f.id && p.estado === "completada").length;
              const inscritos = todosProgresos.filter(p => p.formacion_id === f.id).length;
              return (
                <div key={f.id} className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 ${cat.bg}`}>
                    {cat.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900">{f.titulo}</span>
                      {f.obligatoria && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-500 font-medium">Obligatoria</span>}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {cat.label} · {f.duracion_minutos} min · {completados}/{inscritos} completadas
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setEditando(f)}
                      className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600">
                      Editar
                    </button>
                    <button onClick={async () => {
                      if (!confirm("¿Archivar esta formación?")) return;
                      await supabase.from("formaciones").update({ activa: false }).eq("id", f.id);
                      cargar();
                    }} className="px-3 py-1.5 text-xs border border-red-100 rounded-lg hover:bg-red-50 text-red-500">
                      Archivar
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Modals */}
      {(modalNueva || editando) && (
        <ModalFormacion
          formacion={editando}
          onClose={() => { setModalNueva(false); setEditando(null); }}
          onSave={() => { setModalNueva(false); setEditando(null); cargar(); }}
        />
      )}
      {viendo && (
        <ModalContenido
          formacion={viendo}
          progreso={viendo.progreso}
          miId={miId}
          onClose={() => setViendo(null)}
          onProgresoChange={() => { cargar(); setViendo(null); }}
        />
      )}
    </div>
  );
}
