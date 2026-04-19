"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";

// ── Types ─────────────────────────────────────────────────────────────────────
type TipoRecurso = "script" | "argumentario" | "link" | "plantilla_wa" | "documento" | "otro";

interface Recurso {
  id: string;
  titulo: string;
  tipo: TipoRecurso;
  contenido: string;
  descripcion: string | null;
  categoria: string | null;
  creado_por: string;
  es_global: boolean;
  orden: number;
  created_at: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const TIPO_CONFIG: Record<TipoRecurso, { label: string; color: string; bg: string; icon: string }> = {
  script:        { label: "Script",        color: "#0270e0", bg: "#eff6ff", icon: "📞" },
  argumentario:  { label: "Argumentario",  color: "#16a34a", bg: "#f0fdf4", icon: "💡" },
  link:          { label: "Link",          color: "#9333ea", bg: "#faf5ff", icon: "🔗" },
  plantilla_wa:  { label: "Plantilla WA",  color: "#16a34a", bg: "#dcfce7", icon: "💬" },
  documento:     { label: "Documento",     color: "#ca8a04", bg: "#fefce8", icon: "📄" },
  otro:          { label: "Otro",          color: "#6b6560", bg: "#f5f0ec", icon: "📌" },
};

const TIPOS: TipoRecurso[] = ["script", "argumentario", "link", "plantilla_wa", "documento", "otro"];

// ── Form state type ───────────────────────────────────────────────────────────
interface FormState {
  titulo: string;
  tipo: TipoRecurso;
  contenido: string;
  descripcion: string;
  categoria: string;
  es_global: boolean;
}

const FORM_EMPTY: FormState = {
  titulo: "",
  tipo: "script",
  contenido: "",
  descripcion: "",
  categoria: "",
  es_global: true,
};

// ── Component ─────────────────────────────────────────────────────────────────
export default function RecursosPage() {
  const supabase = createClient();
  const [recursos, setRecursos] = useState<Recurso[]>([]);
  const [miComercialId, setMiComercialId] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  // Filters
  const [busqueda, setBusqueda] = useState("");
  const [filtroTipo, setFiltroTipo] = useState<TipoRecurso | "todos">("todos");
  const [filtroCategoria, setFiltroCategoria] = useState<string>("todas");

  // Modal
  const [modalAbierto, setModalAbierto] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(FORM_EMPTY);
  const [guardando, setGuardando] = useState(false);

  // Copy feedback
  const [copiado, setCopiado] = useState<string | null>(null);

  // Expand modal
  const [expandido, setExpandido] = useState<Recurso | null>(null);

  // ── Load comercial ──────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) {
        supabase
          .from("comerciales")
          .select("id")
          .eq("email", data.user.email)
          .single()
          .then(({ data: c }) => {
            if (c) setMiComercialId(c.id);
          });
      }
    });
  }, []);

  // ── Load recursos ───────────────────────────────────────────────────────
  async function cargarRecursos() {
    const { data } = await supabase
      .from("recursos_rapidos")
      .select("*")
      .neq("tipo", "cuestionario_config")
      .order("categoria", { ascending: true })
      .order("orden", { ascending: true })
      .order("titulo", { ascending: true });

    if (data) setRecursos(data);
    setCargando(false);
  }

  useEffect(() => {
    cargarRecursos();
  }, []);

  // ── Derived state ───────────────────────────────────────────────────────
  const categorias = Array.from(
    new Set(recursos.map((r) => r.categoria).filter(Boolean) as string[])
  ).sort();

  const recursosFiltrados = recursos.filter((r) => {
    if (filtroTipo !== "todos" && r.tipo !== filtroTipo) return false;
    if (filtroCategoria !== "todas" && r.categoria !== filtroCategoria) return false;
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase();
      return (
        r.titulo.toLowerCase().includes(q) ||
        r.contenido.toLowerCase().includes(q) ||
        r.descripcion?.toLowerCase().includes(q) ||
        r.categoria?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Group by category
  const grupos: Record<string, Recurso[]> = {};
  for (const r of recursosFiltrados) {
    const cat = r.categoria ?? "Sin categoría";
    if (!grupos[cat]) grupos[cat] = [];
    grupos[cat].push(r);
  }

  // ── Copy to clipboard ───────────────────────────────────────────────────
  async function copiar(r: Recurso) {
    await navigator.clipboard.writeText(r.contenido);
    setCopiado(r.id);
    setTimeout(() => setCopiado(null), 1800);
  }

  function abrirLink(url: string) {
    if (!url.startsWith("http")) {
      window.open("https://" + url, "_blank");
    } else {
      window.open(url, "_blank");
    }
  }

  // ── Modal helpers ───────────────────────────────────────────────────────
  function abrirNuevo() {
    setForm(FORM_EMPTY);
    setEditandoId(null);
    setModalAbierto(true);
  }

  function abrirEditar(r: Recurso) {
    setForm({
      titulo: r.titulo,
      tipo: r.tipo,
      contenido: r.contenido,
      descripcion: r.descripcion ?? "",
      categoria: r.categoria ?? "",
      es_global: r.es_global,
    });
    setEditandoId(r.id);
    setModalAbierto(true);
  }

  async function guardar() {
    if (!form.titulo.trim() || !form.contenido.trim() || !miComercialId) return;
    setGuardando(true);

    const payload = {
      titulo: form.titulo.trim(),
      tipo: form.tipo,
      contenido: form.contenido.trim(),
      descripcion: form.descripcion.trim() || null,
      categoria: form.categoria.trim() || null,
      es_global: form.es_global,
    };

    if (editandoId) {
      await supabase
        .from("recursos_rapidos")
        .update(payload)
        .eq("id", editandoId);
    } else {
      await supabase
        .from("recursos_rapidos")
        .insert({ ...payload, creado_por: miComercialId });
    }

    await cargarRecursos();
    setModalAbierto(false);
    setGuardando(false);
  }

  async function eliminar(id: string) {
    if (!confirm("¿Eliminar este recurso?")) return;
    await supabase.from("recursos_rapidos").delete().eq("id", id);
    setRecursos((prev) => prev.filter((r) => r.id !== id));
  }

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Page header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-normal" style={{ color: "#414141" }}>
            Acceso rápido
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "#a09890" }}>
            Scripts, argumentarios, links y plantillas del equipo
          </p>
        </div>
        <button
          onClick={abrirNuevo}
          className="btn-primary flex items-center gap-2 px-4 py-2 text-sm"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.5" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Nuevo recurso
        </button>
      </div>

      {/* Filters */}
      <div
        className="card flex flex-wrap items-center gap-3 mb-5 px-4 py-3"
        style={{ background: "#faf8f6" }}
      >
        {/* Search */}
        <div className="flex items-center gap-2 flex-1 min-w-[180px]">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="#a09890" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar..."
            style={{
              background: "transparent",
              border: "none",
              outline: "none",
              fontSize: 14,
              color: "#414141",
              width: "100%",
            }}
          />
        </div>

        <div style={{ width: 1, height: 20, background: "#e5ded9" }} />

        {/* Tipo filter */}
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setFiltroTipo("todos")}
            style={{
              padding: "3px 10px",
              borderRadius: 9999,
              fontSize: 12,
              fontWeight: filtroTipo === "todos" ? 600 : 400,
              background: filtroTipo === "todos" ? "#ea650d" : "#f0ebe7",
              color: filtroTipo === "todos" ? "#ffffff" : "#6b6560",
              border: "none",
              cursor: "pointer",
              transition: "all 0.1s",
            }}
          >
            Todos
          </button>
          {TIPOS.map((t) => {
            const cfg = TIPO_CONFIG[t];
            const active = filtroTipo === t;
            return (
              <button
                key={t}
                onClick={() => setFiltroTipo(t)}
                style={{
                  padding: "3px 10px",
                  borderRadius: 9999,
                  fontSize: 12,
                  fontWeight: active ? 600 : 400,
                  background: active ? cfg.color : cfg.bg,
                  color: active ? "#ffffff" : cfg.color,
                  border: "none",
                  cursor: "pointer",
                  transition: "all 0.1s",
                }}
              >
                {cfg.icon} {cfg.label}
              </button>
            );
          })}
        </div>

        {/* Category filter */}
        {categorias.length > 0 && (
          <>
            <div style={{ width: 1, height: 20, background: "#e5ded9" }} />
            <select
              value={filtroCategoria}
              onChange={(e) => setFiltroCategoria(e.target.value)}
              style={{
                background: "transparent",
                border: "none",
                outline: "none",
                fontSize: 13,
                color: "#6b6560",
                cursor: "pointer",
              }}
            >
              <option value="todas">Todas las categorías</option>
              {categorias.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </>
        )}
      </div>

      {/* Content */}
      {cargando ? (
        <div className="flex items-center justify-center h-40">
          <p style={{ color: "#a09890", fontSize: 14 }}>Cargando recursos...</p>
        </div>
      ) : recursosFiltrados.length === 0 ? (
        <div
          className="card flex flex-col items-center justify-center py-16"
          style={{ background: "#faf8f6" }}
        >
          <p className="text-2xl mb-3">📂</p>
          <p className="font-medium text-sm" style={{ color: "#414141" }}>
            {recursos.length === 0 ? "Aún no hay recursos" : "Sin resultados"}
          </p>
          <p className="text-sm mt-1" style={{ color: "#a09890" }}>
            {recursos.length === 0
              ? "Crea el primer script, link o plantilla del equipo"
              : "Prueba con otros filtros"}
          </p>
          {recursos.length === 0 && (
            <button
              onClick={abrirNuevo}
              className="btn-primary mt-4 px-4 py-2 text-sm"
            >
              Crear primer recurso
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grupos)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([cat, items]) => (
              <div key={cat}>
                <p
                  className="text-xs uppercase tracking-[0.1em] font-semibold mb-3"
                  style={{ color: "#bbb5b0" }}
                >
                  {cat}
                </p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((r) => {
                    const cfg = TIPO_CONFIG[r.tipo];
                    const esMio = r.creado_por === miComercialId;
                    return (
                      <div
                        key={r.id}
                        className="card flex flex-col"
                        style={{ padding: "16px", gap: 10 }}
                      >
                        {/* Header */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span style={{ fontSize: 18, flexShrink: 0 }}>{cfg.icon}</span>
                            <p
                              className="font-medium text-sm truncate"
                              style={{ color: "#414141" }}
                            >
                              {r.titulo}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {/* Edit/delete — only if mine */}
                            {esMio && (
                              <>
                                <button
                                  onClick={() => abrirEditar(r)}
                                  title="Editar"
                                  style={{
                                    padding: "4px 6px",
                                    background: "transparent",
                                    border: "none",
                                    cursor: "pointer",
                                    color: "#a09890",
                                    borderRadius: 4,
                                  }}
                                  onMouseEnter={(e) =>
                                    (e.currentTarget.style.color = "#414141")
                                  }
                                  onMouseLeave={(e) =>
                                    (e.currentTarget.style.color = "#a09890")
                                  }
                                >
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                                    stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                                  </svg>
                                </button>
                                <button
                                  onClick={() => eliminar(r.id)}
                                  title="Eliminar"
                                  style={{
                                    padding: "4px 6px",
                                    background: "transparent",
                                    border: "none",
                                    cursor: "pointer",
                                    color: "#a09890",
                                    borderRadius: 4,
                                  }}
                                  onMouseEnter={(e) =>
                                    (e.currentTarget.style.color = "#dc2626")
                                  }
                                  onMouseLeave={(e) =>
                                    (e.currentTarget.style.color = "#a09890")
                                  }
                                >
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                                    stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                    <polyline points="3 6 5 6 21 6" />
                                    <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                                    <path d="M10 11v6M14 11v6M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
                                  </svg>
                                </button>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Type badge */}
                        <span
                          style={{
                            display: "inline-flex",
                            alignSelf: "flex-start",
                            padding: "2px 8px",
                            borderRadius: 9999,
                            fontSize: 11,
                            fontWeight: 600,
                            background: cfg.bg,
                            color: cfg.color,
                          }}
                        >
                          {cfg.label}
                        </span>

                        {/* Description */}
                        {r.descripcion && (
                          <p className="text-xs" style={{ color: "#6b6560", lineHeight: "17px" }}>
                            {r.descripcion}
                          </p>
                        )}

                        {/* Content preview */}
                        <div
                          style={{
                            flex: 1,
                            background: "#f5f0ec",
                            borderRadius: 4,
                            padding: "8px 10px",
                            fontSize: 12,
                            color: "#414141",
                            lineHeight: "18px",
                            maxHeight: 90,
                            overflow: "hidden",
                            position: "relative",
                          }}
                        >
                          <p style={{ overflow: "hidden", display: "-webkit-box",
                            WebkitLineClamp: 4, WebkitBoxOrient: "vertical" } as React.CSSProperties}>
                            {r.contenido}
                          </p>
                        </div>

                        {/* Expand if long */}
                        {r.contenido.length > 180 && (
                          <button
                            onClick={() => setExpandido(r)}
                            style={{
                              fontSize: 11,
                              color: "#ea650d",
                              background: "transparent",
                              border: "none",
                              cursor: "pointer",
                              padding: "0",
                              textAlign: "left",
                            }}
                          >
                            Ver texto completo →
                          </button>
                        )}

                        {/* Action button */}
                        {r.tipo === "link" ? (
                          <button
                            onClick={() => abrirLink(r.contenido)}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: 6,
                              padding: "7px",
                              background: "#0270e0",
                              color: "#ffffff",
                              border: "none",
                              borderRadius: 4,
                              fontSize: 12,
                              fontWeight: 500,
                              cursor: "pointer",
                              transition: "background 0.15s",
                              width: "100%",
                            }}
                            onMouseEnter={(e) =>
                              (e.currentTarget.style.background = "#0258b8")
                            }
                            onMouseLeave={(e) =>
                              (e.currentTarget.style.background = "#0270e0")
                            }
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                              <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                              <polyline points="15 3 21 3 21 9" />
                              <line x1="10" y1="14" x2="21" y2="3" />
                            </svg>
                            Abrir enlace
                          </button>
                        ) : (
                          <button
                            onClick={() => copiar(r)}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: 6,
                              padding: "7px",
                              background: copiado === r.id ? "#16a34a" : "#f5f0ec",
                              color: copiado === r.id ? "#ffffff" : "#6b6560",
                              border: copiado === r.id ? "none" : "1px solid #e5ded9",
                              borderRadius: 4,
                              fontSize: 12,
                              fontWeight: 500,
                              cursor: "pointer",
                              transition: "all 0.15s",
                              width: "100%",
                            }}
                          >
                            {copiado === r.id ? (
                              <>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                                ¡Copiado!
                              </>
                            ) : (
                              <>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                                  stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                                </svg>
                                Copiar al portapapeles
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
        </div>
      )}

      {/* ── Modal: ver contenido completo ──────────────────────────────────── */}
      {expandido && (
        <div
          style={{
            position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 16, background: "rgba(0,0,0,0.45)", zIndex: 9999,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setExpandido(null); }}
        >
          <div style={{
            background: "#fff", borderRadius: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
            padding: 24, width: "100%", maxWidth: 600, maxHeight: "85vh", overflowY: "auto",
          }}>
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h2 className="text-base font-semibold" style={{ color: "#414141" }}>{expandido.titulo}</h2>
                {expandido.descripcion && (
                  <p className="text-xs mt-0.5" style={{ color: "#a09890" }}>{expandido.descripcion}</p>
                )}
              </div>
              <button onClick={() => setExpandido(null)} style={{ color: "#a09890", background: "transparent", border: "none", cursor: "pointer", fontSize: 20, lineHeight: 1 }}>×</button>
            </div>
            <div style={{
              background: "#f5f0ec", borderRadius: 6, padding: "14px 16px",
              fontSize: 13, color: "#414141", lineHeight: "20px", whiteSpace: "pre-wrap",
            }}>
              {expandido.contenido}
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => { copiar(expandido); }}
                style={{
                  flex: 1, padding: "9px", background: copiado === expandido.id ? "#16a34a" : "#ea650d",
                  color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600,
                  cursor: "pointer", transition: "background 0.15s",
                }}
              >
                {copiado === expandido.id ? "¡Copiado!" : "Copiar al portapapeles"}
              </button>
              <button
                onClick={() => setExpandido(null)}
                style={{
                  padding: "9px 18px", background: "transparent", border: "1px solid #e5ded9",
                  borderRadius: 6, fontSize: 13, color: "#6b6560", cursor: "pointer",
                }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: nuevo/editar recurso ───────────────────────────────────── */}
      {modalAbierto && (
        <div
          style={{
            position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 16, background: "rgba(0,0,0,0.45)", zIndex: 9999,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalAbierto(false);
          }}
        >
          <div
            style={{
              background: "#fff", border: "1px solid #e5ded9",
              borderRadius: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
              padding: 24, width: "100%", maxWidth: 540,
              maxHeight: "90vh", overflowY: "auto",
            }}
          >
            <h2 className="text-base font-semibold mb-4" style={{ color: "#414141" }}>
              {editandoId ? "Editar recurso" : "Nuevo recurso"}
            </h2>

            <div className="space-y-4">
              {/* Título */}
              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: "#6b6560" }}>
                  Título *
                </label>
                <input
                  value={form.titulo}
                  onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
                  placeholder="Ej: Presentación inicial producto Vida"
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: "1px solid #e5ded9",
                    borderRadius: 4,
                    fontSize: 14,
                    color: "#414141",
                    outline: "none",
                    background: "#ffffff",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              {/* Tipo */}
              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: "#6b6560" }}>
                  Tipo *
                </label>
                <div className="flex flex-wrap gap-2">
                  {TIPOS.map((t) => {
                    const cfg = TIPO_CONFIG[t];
                    const active = form.tipo === t;
                    return (
                      <button
                        key={t}
                        onClick={() => setForm((f) => ({ ...f, tipo: t }))}
                        style={{
                          padding: "5px 12px",
                          borderRadius: 9999,
                          fontSize: 12,
                          fontWeight: active ? 600 : 400,
                          background: active ? cfg.color : cfg.bg,
                          color: active ? "#ffffff" : cfg.color,
                          border: "none",
                          cursor: "pointer",
                          transition: "all 0.1s",
                        }}
                      >
                        {cfg.icon} {cfg.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Categoría */}
              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: "#6b6560" }}>
                  Categoría
                </label>
                <input
                  value={form.categoria}
                  onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))}
                  placeholder="Ej: Producto Vida, Objeciones, Cierre..."
                  list="categorias-existentes"
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: "1px solid #e5ded9",
                    borderRadius: 4,
                    fontSize: 14,
                    color: "#414141",
                    outline: "none",
                    background: "#ffffff",
                    boxSizing: "border-box",
                  }}
                />
                <datalist id="categorias-existentes">
                  {categorias.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>

              {/* Descripción */}
              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: "#6b6560" }}>
                  Descripción breve
                </label>
                <input
                  value={form.descripcion}
                  onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
                  placeholder="Para qué sirve, cuándo usarlo..."
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: "1px solid #e5ded9",
                    borderRadius: 4,
                    fontSize: 14,
                    color: "#414141",
                    outline: "none",
                    background: "#ffffff",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              {/* Contenido */}
              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: "#6b6560" }}>
                  {form.tipo === "link" ? "URL *" : "Contenido *"}
                </label>
                <textarea
                  value={form.contenido}
                  onChange={(e) => setForm((f) => ({ ...f, contenido: e.target.value }))}
                  placeholder={
                    form.tipo === "link"
                      ? "https://..."
                      : form.tipo === "plantilla_wa"
                      ? "Hola {{nombre}}, me llamo Manuel de Nationale-Nederlanden..."
                      : "Escribe aquí el texto completo..."
                  }
                  rows={6}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: "1px solid #e5ded9",
                    borderRadius: 4,
                    fontSize: 13,
                    color: "#414141",
                    outline: "none",
                    background: "#ffffff",
                    resize: "vertical",
                    lineHeight: "19px",
                    boxSizing: "border-box",
                    fontFamily: "inherit",
                  }}
                />
              </div>

              {/* Visibilidad */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setForm((f) => ({ ...f, es_global: !f.es_global }))}
                  style={{
                    width: 36,
                    height: 20,
                    borderRadius: 9999,
                    background: form.es_global ? "#ea650d" : "#e5ded9",
                    border: "none",
                    cursor: "pointer",
                    position: "relative",
                    transition: "background 0.2s",
                    flexShrink: 0,
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      top: 2,
                      left: form.es_global ? 18 : 2,
                      width: 16,
                      height: 16,
                      borderRadius: "50%",
                      background: "#ffffff",
                      transition: "left 0.2s",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                    }}
                  />
                </button>
                <div>
                  <p className="text-sm" style={{ color: "#414141" }}>
                    {form.es_global ? "Visible para todo el equipo" : "Solo visible para mí"}
                  </p>
                  <p className="text-xs" style={{ color: "#a09890" }}>
                    {form.es_global
                      ? "Todos los comerciales podrán verlo y usarlo"
                      : "Solo tú puedes ver este recurso"}
                  </p>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setModalAbierto(false)}
                className="btn-secondary px-4 py-2 text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={guardar}
                disabled={!form.titulo.trim() || !form.contenido.trim() || guardando}
                className="btn-primary px-4 py-2 text-sm disabled:opacity-50"
              >
                {guardando ? "Guardando..." : editandoId ? "Guardar cambios" : "Crear recurso"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
