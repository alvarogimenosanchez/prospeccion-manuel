"use client";

import { useEffect, useState, useRef } from "react";
import { createClient } from "@/lib/supabase-browser";

// ── Types ─────────────────────────────────────────────────────────────────────
interface PlantillaWA {
  id: string;
  titulo: string;
  contenido: string;
  descripcion: string | null;
  categoria: string | null;
  es_global: boolean;
  orden: number; // 0 = por defecto
  creado_por: string;
  created_at: string;
}

// ── Variables disponibles ──────────────────────────────────────────────────────
const VARIABLES = [
  { key: "{{nombre}}", label: "Nombre", ejemplo: "María García" },
  { key: "{{empresa}}", label: "Empresa", ejemplo: "Cafetería El Sol" },
  { key: "{{ciudad}}", label: "Ciudad", ejemplo: "Málaga" },
  { key: "{{sector}}", label: "Sector", ejemplo: "Hostelería" },
  { key: "{{producto}}", label: "Producto", ejemplo: "Contigo Autónomo" },
  { key: "{{cargo}}", label: "Cargo", ejemplo: "Propietaria" },
];

const EJEMPLO_LEAD = {
  "{{nombre}}": "María García",
  "{{empresa}}": "Cafetería El Sol",
  "{{ciudad}}": "Málaga",
  "{{sector}}": "Hostelería",
  "{{producto}}": "Contigo Autónomo",
  "{{cargo}}": "Propietaria",
};

function aplicarVariables(texto: string): string {
  let resultado = texto;
  for (const [key, val] of Object.entries(EJEMPLO_LEAD)) {
    resultado = resultado.replaceAll(key, val);
  }
  return resultado;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function AjustesPage() {
  const supabase = createClient();
  const [miComercialId, setMiComercialId] = useState<string | null>(null);
  const [miNombre, setMiNombre] = useState("");
  const [plantillas, setPlantillas] = useState<PlantillaWA[]>([]);
  const [cargando, setCargando] = useState(true);

  // Form state
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [formTitulo, setFormTitulo] = useState("");
  const [formTexto, setFormTexto] = useState("");
  const [formDescripcion, setFormDescripcion] = useState("");
  const [formGlobal, setFormGlobal] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [modalAbierto, setModalAbierto] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Load comercial ──────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) {
        supabase
          .from("comerciales")
          .select("id, nombre")
          .eq("email", data.user.email)
          .single()
          .then(({ data: c }) => {
            if (c) {
              setMiComercialId(c.id);
              setMiNombre(c.nombre);
            }
          });
      }
    });
  }, []);

  // ── Load plantillas ─────────────────────────────────────────────────────────
  async function cargarPlantillas(cid: string) {
    const { data } = await supabase
      .from("recursos_rapidos")
      .select("*")
      .eq("tipo", "plantilla_wa")
      .eq("creado_por", cid)
      .order("orden", { ascending: true })
      .order("created_at", { ascending: true });
    if (data) setPlantillas(data as PlantillaWA[]);
    setCargando(false);
  }

  useEffect(() => {
    if (miComercialId) cargarPlantillas(miComercialId);
  }, [miComercialId]);

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function abrirNueva() {
    setEditandoId(null);
    setFormTitulo("");
    setFormTexto("");
    setFormDescripcion("");
    setFormGlobal(false);
    setModalAbierto(true);
  }

  function abrirEditar(p: PlantillaWA) {
    setEditandoId(p.id);
    setFormTitulo(p.titulo);
    setFormTexto(p.contenido);
    setFormDescripcion(p.descripcion ?? "");
    setFormGlobal(p.es_global);
    setModalAbierto(true);
  }

  function insertarVariable(variable: string) {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const nuevoTexto = formTexto.slice(0, start) + variable + formTexto.slice(end);
    setFormTexto(nuevoTexto);
    // Reposicionar cursor
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + variable.length, start + variable.length);
    }, 0);
  }

  async function guardar() {
    if (!formTitulo.trim() || !formTexto.trim() || !miComercialId) return;
    setGuardando(true);

    const payload = {
      titulo: formTitulo.trim(),
      tipo: "plantilla_wa",
      contenido: formTexto.trim(),
      descripcion: formDescripcion.trim() || null,
      es_global: formGlobal,
      categoria: "WhatsApp",
    };

    if (editandoId) {
      await supabase.from("recursos_rapidos").update(payload).eq("id", editandoId);
    } else {
      await supabase.from("recursos_rapidos").insert({
        ...payload,
        creado_por: miComercialId,
        orden: plantillas.length, // nuevas van al final
      });
    }

    await cargarPlantillas(miComercialId);
    setModalAbierto(false);
    setGuardando(false);
  }

  async function eliminar(id: string) {
    if (!confirm("¿Eliminar esta plantilla?")) return;
    await supabase.from("recursos_rapidos").delete().eq("id", id);
    setPlantillas((prev) => prev.filter((p) => p.id !== id));
  }

  async function marcarDefault(id: string) {
    if (!miComercialId) return;
    // Todas a orden 1, la elegida a orden 0
    await Promise.all(
      plantillas.map((p) =>
        supabase
          .from("recursos_rapidos")
          .update({ orden: p.id === id ? 0 : 1 })
          .eq("id", p.id)
      )
    );
    setPlantillas((prev) =>
      prev.map((p) => ({ ...p, orden: p.id === id ? 0 : 1 }))
    );
  }

  async function copiarTexto(texto: string) {
    await navigator.clipboard.writeText(texto);
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-normal" style={{ color: "#414141" }}>
          Ajustes
        </h1>
        {miNombre && (
          <p className="text-sm mt-0.5" style={{ color: "#a09890" }}>
            Configuración personal de {miNombre}
          </p>
        )}
      </div>

      {/* ── Sección plantillas WhatsApp ────────────────────────────────────── */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {/* Section header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid #e5ded9",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div className="flex items-center gap-2.5">
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 6,
                background: "#dcfce7",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#16a34a">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: "#414141" }}>
                Plantillas de WhatsApp
              </p>
              <p className="text-xs" style={{ color: "#a09890" }}>
                Mensajes que se usan al enviar WA a un lead
              </p>
            </div>
          </div>
          <button
            onClick={abrirNueva}
            className="btn-primary flex items-center gap-1.5 px-3 py-1.5 text-xs"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Nueva plantilla
          </button>
        </div>

        {/* Variable guide */}
        <div
          style={{
            padding: "10px 20px",
            background: "#faf8f6",
            borderBottom: "1px solid #f0ebe7",
          }}
        >
          <p className="text-xs font-semibold mb-1.5" style={{ color: "#6b6560" }}>
            Variables disponibles — se sustituyen automáticamente con los datos del lead:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {VARIABLES.map((v) => (
              <span
                key={v.key}
                style={{
                  fontFamily: "monospace",
                  fontSize: 11,
                  padding: "2px 7px",
                  borderRadius: 4,
                  background: "#fff5f0",
                  color: "#ea650d",
                  border: "1px solid #f5c5a8",
                }}
              >
                {v.key}
              </span>
            ))}
          </div>
        </div>

        {/* Plantillas list */}
        {cargando ? (
          <div className="py-12 text-center text-sm" style={{ color: "#a09890" }}>
            Cargando plantillas...
          </div>
        ) : plantillas.length === 0 ? (
          <div className="py-12 flex flex-col items-center gap-3">
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                background: "#f5f0ec",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 22,
              }}
            >
              💬
            </div>
            <p className="text-sm font-medium" style={{ color: "#414141" }}>
              Sin plantillas todavía
            </p>
            <p className="text-xs" style={{ color: "#a09890" }}>
              Crea tu primera plantilla para usarla al enviar WhatsApp a leads
            </p>
            <button onClick={abrirNueva} className="btn-primary px-4 py-2 text-sm mt-1">
              Crear primera plantilla
            </button>
          </div>
        ) : (
          <div style={{ divide: "1px solid #f0ebe7" }}>
            {[...plantillas].sort((a, b) => a.orden - b.orden).map((p, i) => (
              <div
                key={p.id}
                style={{
                  padding: "16px 20px",
                  borderBottom: i < plantillas.length - 1 ? "1px solid #f0ebe7" : "none",
                  background: p.orden === 0 ? "#fffbf8" : "#ffffff",
                }}
              >
                {/* Header row */}
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {p.orden === 0 && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: "2px 7px",
                          borderRadius: 9999,
                          background: "#ea650d",
                          color: "#ffffff",
                          flexShrink: 0,
                          letterSpacing: "0.05em",
                          textTransform: "uppercase",
                        }}
                      >
                        Por defecto
                      </span>
                    )}
                    <p className="text-sm font-semibold truncate" style={{ color: "#414141" }}>
                      {p.titulo}
                    </p>
                    {p.es_global && (
                      <span
                        style={{
                          fontSize: 10,
                          padding: "2px 7px",
                          borderRadius: 9999,
                          background: "#f0ebe7",
                          color: "#6b6560",
                          flexShrink: 0,
                        }}
                      >
                        Compartida
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {p.orden !== 0 && (
                      <button
                        onClick={() => marcarDefault(p.id)}
                        title="Marcar como plantilla por defecto"
                        style={{
                          padding: "4px 8px",
                          fontSize: 11,
                          borderRadius: 4,
                          border: "1px solid #e5ded9",
                          background: "#ffffff",
                          color: "#6b6560",
                          cursor: "pointer",
                          transition: "all 0.1s",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = "#ea650d";
                          e.currentTarget.style.color = "#ea650d";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = "#e5ded9";
                          e.currentTarget.style.color = "#6b6560";
                        }}
                      >
                        ★ Hacer default
                      </button>
                    )}
                    <button
                      onClick={() => abrirEditar(p)}
                      title="Editar"
                      style={{
                        padding: "5px 7px",
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        color: "#a09890",
                        borderRadius: 4,
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "#414141")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "#a09890")}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => eliminar(p.id)}
                      title="Eliminar"
                      style={{
                        padding: "5px 7px",
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        color: "#a09890",
                        borderRadius: 4,
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "#dc2626")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "#a09890")}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                        <path d="M10 11v6M14 11v6M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
                      </svg>
                    </button>
                  </div>
                </div>

                {p.descripcion && (
                  <p className="text-xs mb-2" style={{ color: "#6b6560" }}>
                    {p.descripcion}
                  </p>
                )}

                {/* Message preview */}
                <div
                  style={{
                    background: "#f5f0ec",
                    borderRadius: 6,
                    padding: "10px 12px",
                    fontSize: 12,
                    color: "#414141",
                    lineHeight: "18px",
                    whiteSpace: "pre-wrap",
                    maxHeight: 90,
                    overflow: "hidden",
                    position: "relative",
                  }}
                >
                  {aplicarVariables(p.contenido)}
                  <div
                    style={{
                      position: "absolute",
                      bottom: 0,
                      left: 0,
                      right: 0,
                      height: 28,
                      background: "linear-gradient(transparent, #f5f0ec)",
                    }}
                  />
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 mt-2">
                  <button
                    onClick={() => copiarTexto(aplicarVariables(p.contenido))}
                    style={{
                      fontSize: 11,
                      color: "#a09890",
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      padding: "2px 0",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "#414141")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "#a09890")}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="9" y="9" width="13" height="13" rx="2" />
                      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                    </svg>
                    Copiar (con datos de ejemplo)
                  </button>
                  <span style={{ color: "#e5ded9", fontSize: 10 }}>·</span>
                  <button
                    onClick={() => copiarTexto(p.contenido)}
                    style={{
                      fontSize: 11,
                      color: "#a09890",
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      padding: "2px 0",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "#414141")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "#a09890")}
                  >
                    Copiar con variables
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Modal editor ───────────────────────────────────────────────────── */}
      {modalAbierto && (
        <div
          className="fixed inset-0 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.45)", zIndex: 9999 }}
          onClick={(e) => { if (e.target === e.currentTarget) setModalAbierto(false); }}
        >
          <div
            className="card w-full"
            style={{
              maxWidth: 640,
              padding: 0,
              overflow: "hidden",
              maxHeight: "92vh",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Modal header */}
            <div
              style={{
                padding: "16px 20px",
                borderBottom: "1px solid #e5ded9",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexShrink: 0,
              }}
            >
              <h2 className="text-sm font-semibold" style={{ color: "#414141" }}>
                {editandoId ? "Editar plantilla" : "Nueva plantilla de WhatsApp"}
              </h2>
              <button
                onClick={() => setModalAbierto(false)}
                style={{ background: "transparent", border: "none", cursor: "pointer", color: "#a09890", padding: 4 }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="overflow-y-auto flex-1" style={{ padding: "20px" }}>
              <div className="space-y-4">
                {/* Título */}
                <div>
                  <label className="text-xs font-semibold block mb-1" style={{ color: "#6b6560" }}>
                    Nombre de la plantilla *
                  </label>
                  <input
                    value={formTitulo}
                    onChange={(e) => setFormTitulo(e.target.value)}
                    placeholder="Ej: Presentación inicial, Recordatorio, Cierre..."
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      border: "1px solid #e5ded9",
                      borderRadius: 4,
                      fontSize: 14,
                      color: "#414141",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                {/* Descripción */}
                <div>
                  <label className="text-xs font-semibold block mb-1" style={{ color: "#6b6560" }}>
                    Descripción (cuándo usarla)
                  </label>
                  <input
                    value={formDescripcion}
                    onChange={(e) => setFormDescripcion(e.target.value)}
                    placeholder="Ej: Primer contacto con autónomos del sector hostelería"
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      border: "1px solid #e5ded9",
                      borderRadius: 4,
                      fontSize: 14,
                      color: "#414141",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                {/* Variable insert buttons */}
                <div>
                  <label className="text-xs font-semibold block mb-1.5" style={{ color: "#6b6560" }}>
                    Insertar variable en el cursor
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {VARIABLES.map((v) => (
                      <button
                        key={v.key}
                        type="button"
                        onClick={() => insertarVariable(v.key)}
                        title={`Ejemplo: ${v.ejemplo}`}
                        style={{
                          fontFamily: "monospace",
                          fontSize: 11,
                          padding: "3px 8px",
                          borderRadius: 4,
                          background: "#fff5f0",
                          color: "#ea650d",
                          border: "1px solid #f5c5a8",
                          cursor: "pointer",
                          transition: "background 0.1s",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "#fee5cc")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "#fff5f0")}
                      >
                        {v.key}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Textarea */}
                <div>
                  <label className="text-xs font-semibold block mb-1" style={{ color: "#6b6560" }}>
                    Mensaje *
                  </label>
                  <textarea
                    ref={textareaRef}
                    value={formTexto}
                    onChange={(e) => setFormTexto(e.target.value)}
                    rows={7}
                    placeholder={`Hola {{nombre}},\n\nMe llamo Manuel y soy asesor de Nationale-Nederlanden. Vi que tienes {{empresa}} en {{ciudad}}...\n\n¿Tienes 5 minutos para comentarte algo?`}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      border: "1px solid #e5ded9",
                      borderRadius: 4,
                      fontSize: 13,
                      color: "#414141",
                      outline: "none",
                      resize: "vertical",
                      lineHeight: "19px",
                      boxSizing: "border-box",
                      fontFamily: "inherit",
                    }}
                  />
                  <p className="text-xs mt-1" style={{ color: "#c7bdb7" }}>
                    {formTexto.length} caracteres
                  </p>
                </div>

                {/* Preview */}
                {formTexto.trim() && (
                  <div>
                    <label className="text-xs font-semibold block mb-1.5" style={{ color: "#6b6560" }}>
                      Vista previa con datos de ejemplo
                    </label>
                    <div
                      style={{
                        background: "#e9fbe5",
                        border: "1px solid #bbf7d0",
                        borderRadius: 8,
                        padding: "12px 14px",
                        fontSize: 13,
                        color: "#166534",
                        lineHeight: "20px",
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {aplicarVariables(formTexto)}
                    </div>
                  </div>
                )}

                {/* Visibilidad */}
                <div className="flex items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setFormGlobal((v) => !v)}
                    style={{
                      width: 36,
                      height: 20,
                      borderRadius: 9999,
                      background: formGlobal ? "#ea650d" : "#e5ded9",
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
                        left: formGlobal ? 18 : 2,
                        width: 16,
                        height: 16,
                        borderRadius: "50%",
                        background: "#ffffff",
                        transition: "left 0.2s",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                      }}
                    />
                  </button>
                  <p className="text-sm" style={{ color: "#414141" }}>
                    {formGlobal ? "Compartida con todo el equipo" : "Solo para mí"}
                  </p>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div
              style={{
                padding: "14px 20px",
                borderTop: "1px solid #e5ded9",
                display: "flex",
                justifyContent: "flex-end",
                gap: 10,
                flexShrink: 0,
              }}
            >
              <button
                onClick={() => setModalAbierto(false)}
                className="btn-secondary px-4 py-2 text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={guardar}
                disabled={!formTitulo.trim() || !formTexto.trim() || guardando}
                className="btn-primary px-4 py-2 text-sm disabled:opacity-50"
              >
                {guardando ? "Guardando..." : editandoId ? "Guardar cambios" : "Crear plantilla"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
