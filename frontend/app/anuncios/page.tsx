"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { usePermisos } from "@/components/PermisosProvider";
import { format, parseISO, formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

// ─── Types ──────────────────────────────────────────────────────────────────

type Anuncio = {
  id: string;
  titulo: string;
  contenido: string;
  tipo: "general" | "objetivo" | "campana" | "producto" | "urgente" | "logro";
  creado_por: string | null;
  activo: boolean;
  fijado: boolean;
  fecha_expira: string | null;
  lecturas: string[];
  created_at: string;
  updated_at: string;
  autor_nombre?: string;
};

// ─── Constants ───────────────────────────────────────────────────────────────

const TIPO_CFG: Record<string, { label: string; emoji: string; bg: string; border: string; text: string; headerBg: string }> = {
  general:  { label: "General",   emoji: "📢", bg: "bg-slate-50",   border: "border-slate-200",  text: "text-slate-700",  headerBg: "bg-slate-100"  },
  objetivo: { label: "Objetivo",  emoji: "🎯", bg: "bg-orange-50",  border: "border-orange-200", text: "text-orange-700", headerBg: "bg-orange-100" },
  campana:  { label: "Campaña",   emoji: "📣", bg: "bg-blue-50",    border: "border-blue-200",   text: "text-blue-700",   headerBg: "bg-blue-100"   },
  producto: { label: "Producto",  emoji: "✨", bg: "bg-purple-50",  border: "border-purple-200", text: "text-purple-700", headerBg: "bg-purple-100" },
  urgente:  { label: "Urgente",   emoji: "🚨", bg: "bg-red-50",     border: "border-red-300",    text: "text-red-700",    headerBg: "bg-red-100"    },
  logro:    { label: "Logro",     emoji: "🏆", bg: "bg-amber-50",   border: "border-amber-200",  text: "text-amber-700",  headerBg: "bg-amber-100"  },
};

type FormData = {
  titulo: string;
  contenido: string;
  tipo: Anuncio["tipo"];
  fijado: boolean;
  fecha_expira: string;
};

const FORM_VACIO: FormData = { titulo: "", contenido: "", tipo: "general", fijado: false, fecha_expira: "" };

// ─── Modal ───────────────────────────────────────────────────────────────────

function ModalAnuncio({
  inicial, onGuardar, onCerrar, guardando,
}: {
  inicial: FormData;
  onGuardar: (f: FormData) => void;
  onCerrar: () => void;
  guardando: boolean;
}) {
  const [form, setForm] = useState<FormData>(inicial);

  function set<K extends keyof FormData>(k: K, v: FormData[K]) {
    setForm(prev => ({ ...prev, [k]: v }));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.45)" }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="px-6 pt-6 pb-4 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-900">Nuevo anuncio</h2>
        </div>
        <div className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Tipo</label>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(TIPO_CFG).map(([k, v]) => (
                <button key={k} onClick={() => set("tipo", k as Anuncio["tipo"])}
                  className={`flex items-center gap-1.5 px-2 py-1.5 text-xs rounded-lg border font-medium transition-colors ${
                    form.tipo === k ? `${v.bg} ${v.border} ${v.text}` : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"
                  }`}>
                  <span>{v.emoji}</span>
                  {v.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Título *</label>
            <input value={form.titulo} onChange={e => set("titulo", e.target.value)}
              placeholder="Ej: Objetivo de marzo: 15 cierres"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-300" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Mensaje *</label>
            <textarea rows={4} value={form.contenido} onChange={e => set("contenido", e.target.value)}
              placeholder="Escribe el contenido del anuncio..."
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-300 resize-none" />
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.fijado} onChange={e => set("fijado", e.target.checked)}
                className="rounded border-slate-300 text-orange-500 focus:ring-orange-400" />
              <span className="text-sm text-slate-600">📌 Fijar en la parte superior</span>
            </label>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Fecha de expiración (opcional)</label>
            <input type="date" value={form.fecha_expira} onChange={e => set("fecha_expira", e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-300 bg-white" />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onCerrar} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">Cancelar</button>
          <button onClick={() => onGuardar(form)} disabled={!form.titulo.trim() || !form.contenido.trim() || guardando}
            className="px-5 py-2 text-sm font-semibold text-white rounded-lg disabled:opacity-50"
            style={{ background: "#ea650d" }}>
            {guardando ? "Publicando..." : "Publicar anuncio"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AnunciosPage() {
  const { puede, cargando: cargandoPermisos } = usePermisos();
  const [anuncios, setAnuncios] = useState<Anuncio[]>([]);
  const [loading, setLoading] = useState(true);
  const [mostrarModal, setMostrarModal] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [miId, setMiId] = useState<string | null>(null);
  const [filtroTipo, setFiltroTipo] = useState("");
  const [expandido, setExpandido] = useState<string | null>(null);

  useEffect(() => {
    async function cargarMiId() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) return;
      const { data: com } = await supabase.from("comerciales").select("id").eq("email", user.email).single();
      setMiId(com?.id ?? null);
    }
    cargarMiId();
  }, []);

  const cargar = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("anuncios")
      .select("*")
      .eq("activo", true)
      .order("fijado", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(50);

    const lista = data ?? [];

    // Load author names
    const creadorIds = [...new Set(lista.map(a => a.creado_por).filter(Boolean))] as string[];
    const { data: coms } = creadorIds.length > 0
      ? await supabase.from("comerciales").select("id, nombre").in("id", creadorIds)
      : { data: [] };
    const comMap = new Map((coms ?? []).map(c => [c.id, c.nombre]));

    setAnuncios(lista.map(a => ({
      ...a,
      autor_nombre: a.creado_por ? comMap.get(a.creado_por) ?? undefined : undefined,
    })));
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!cargandoPermisos) cargar();
  }, [cargar, cargandoPermisos]);

  async function guardar(form: FormData) {
    setGuardando(true);
    await supabase.from("anuncios").insert({
      titulo: form.titulo.trim(),
      contenido: form.contenido.trim(),
      tipo: form.tipo,
      fijado: form.fijado,
      fecha_expira: form.fecha_expira || null,
      creado_por: miId,
      lecturas: [],
    });
    setGuardando(false);
    setMostrarModal(false);
    cargar();
  }

  async function marcarLeido(id: string) {
    if (!miId) return;
    const an = anuncios.find(a => a.id === id);
    if (!an || an.lecturas.includes(miId)) return;
    const nuevas = [...an.lecturas, miId];
    await supabase.from("anuncios").update({ lecturas: nuevas }).eq("id", id);
    setAnuncios(prev => prev.map(a => a.id === id ? { ...a, lecturas: nuevas } : a));
  }

  async function archivar(id: string) {
    if (!confirm("¿Archivar este anuncio? Dejará de ser visible para el equipo.")) return;
    await supabase.from("anuncios").update({ activo: false }).eq("id", id);
    cargar();
  }

  async function toggleFijado(id: string, fijado: boolean) {
    await supabase.from("anuncios").update({ fijado: !fijado }).eq("id", id);
    cargar();
  }

  const datos = filtroTipo ? anuncios.filter(a => a.tipo === filtroTipo) : anuncios;
  const noLeidos = anuncios.filter(a => miId && !a.lecturas.includes(miId)).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Tablón de anuncios
            {noLeidos > 0 && (
              <span className="ml-2 text-sm font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 align-middle">
                {noLeidos} nuevo{noLeidos > 1 ? "s" : ""}
              </span>
            )}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Comunicados del equipo — campañas, objetivos y novedades</p>
        </div>
        {puede("asignar_leads") && (
          <button onClick={() => setMostrarModal(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white rounded-lg shadow-sm hover:opacity-90 transition-opacity"
            style={{ background: "#ea650d" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14" /></svg>
            Nuevo anuncio
          </button>
        )}
      </div>

      {/* Type filter */}
      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setFiltroTipo("")}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${!filtroTipo ? "text-white border-transparent" : "bg-white border-slate-200 text-slate-500 hover:border-orange-200"}`}
          style={!filtroTipo ? { background: "#ea650d" } : undefined}>
          Todos ({anuncios.length})
        </button>
        {Object.entries(TIPO_CFG).map(([k, v]) => {
          const n = anuncios.filter(a => a.tipo === k).length;
          if (n === 0) return null;
          return (
            <button key={k} onClick={() => setFiltroTipo(filtroTipo === k ? "" : k)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                filtroTipo === k ? `${v.bg} ${v.border} ${v.text}` : "bg-white border-slate-200 text-slate-500 hover:border-orange-200"
              }`}>
              {v.emoji} {v.label} ({n})
            </button>
          );
        })}
      </div>

      {/* Announcements list */}
      {loading ? (
        <div className="py-16 text-center text-sm text-slate-400">Cargando anuncios...</div>
      ) : datos.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-slate-400 text-sm mb-4">
            {anuncios.length === 0 ? "No hay anuncios publicados todavía." : "No hay anuncios de este tipo."}
          </p>
          {puede("asignar_leads") && anuncios.length === 0 && (
            <button onClick={() => setMostrarModal(true)}
              className="px-4 py-2 text-sm font-semibold text-white rounded-lg"
              style={{ background: "#ea650d" }}>
              Publicar el primer anuncio
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {datos.map(a => {
            const cfg = TIPO_CFG[a.tipo] ?? TIPO_CFG.general;
            const leido = miId ? a.lecturas.includes(miId) : true;
            const esExpandido = expandido === a.id;
            const expirado = a.fecha_expira ? new Date(a.fecha_expira) < new Date() : false;
            return (
              <div key={a.id}
                className={`rounded-xl border overflow-hidden transition-all ${cfg.border} ${!leido ? "shadow-sm" : ""}`}
                style={{ background: expirado ? "#fafafa" : undefined }}>
                {/* Header */}
                <div className={`px-5 py-3 flex items-start gap-3 ${cfg.headerBg} border-b ${cfg.border}`}>
                  <span className="text-xl shrink-0">{cfg.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className={`text-sm font-bold ${cfg.text} ${expirado ? "opacity-50" : ""}`}>
                        {a.fijado && "📌 "}{a.titulo}
                      </p>
                      {!leido && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold">Nuevo</span>
                      )}
                      {expirado && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-400">Expirado</span>
                      )}
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.bg} ${cfg.text} border ${cfg.border}`}>
                        {cfg.label}
                      </span>
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: "inherit", opacity: 0.7 }}>
                      {a.autor_nombre ?? "Equipo"} · {formatDistanceToNow(parseISO(a.created_at), { addSuffix: true, locale: es })}
                      {a.fecha_expira && ` · Expira ${format(parseISO(a.fecha_expira), "d MMM", { locale: es })}`}
                    </p>
                  </div>
                  <div className="shrink-0 flex items-center gap-1.5">
                    <span className="text-xs text-slate-400">{a.lecturas.length} leídos</span>
                    {puede("asignar_leads") && (
                      <>
                        <button onClick={() => toggleFijado(a.id, a.fijado)} title={a.fijado ? "Desfijar" : "Fijar"}
                          className={`p-1 rounded hover:bg-slate-200 transition-colors text-xs ${a.fijado ? "text-orange-600" : "text-slate-400"}`}>
                          📌
                        </button>
                        <button onClick={() => archivar(a.id)} title="Archivar"
                          className="p-1 rounded hover:bg-slate-200 transition-colors text-xs text-slate-400 hover:text-red-500">
                          🗑
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Content */}
                <div className={`px-5 py-3 ${cfg.bg}`}>
                  <div className={`text-sm text-slate-700 whitespace-pre-wrap leading-relaxed ${!esExpandido && a.contenido.length > 300 ? "line-clamp-3" : ""}`}>
                    {a.contenido}
                  </div>
                  {a.contenido.length > 300 && (
                    <button onClick={() => {
                      setExpandido(esExpandido ? null : a.id);
                      if (!leido) marcarLeido(a.id);
                    }}
                      className={`mt-2 text-xs font-medium ${cfg.text} hover:underline`}>
                      {esExpandido ? "Ver menos ↑" : "Leer más ↓"}
                    </button>
                  )}

                  {/* Mark as read */}
                  {!leido && (
                    <button onClick={() => marcarLeido(a.id)}
                      className={`mt-3 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${cfg.bg} ${cfg.border} ${cfg.text} hover:opacity-80`}>
                      ✓ Marcar como leído
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {mostrarModal && (
        <ModalAnuncio
          inicial={FORM_VACIO}
          onGuardar={guardar}
          onCerrar={() => setMostrarModal(false)}
          guardando={guardando}
        />
      )}
    </div>
  );
}
