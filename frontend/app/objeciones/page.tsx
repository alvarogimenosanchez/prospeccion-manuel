"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { usePermisos } from "@/components/PermisosProvider";

// ─── Types ────────────────────────────────────────────────────────────────────

type Objecion = {
  id: string;
  texto: string;
  respuesta: string;
  tipo: string;
  productos: string[];
  tags: string[];
  votos: number;
  activo: boolean;
};

const TIPO_CFG: Record<string, { label: string; color: string; icon: string }> = {
  precio:      { label: "Precio",      color: "#ef4444", icon: "💰" },
  competencia: { label: "Competencia", color: "#8b5cf6", icon: "⚔️" },
  tiempo:      { label: "Tiempo",      color: "#f59e0b", icon: "⏰" },
  necesidad:   { label: "Necesidad",   color: "#3b82f6", icon: "🤔" },
  confianza:   { label: "Confianza",   color: "#10b981", icon: "🤝" },
  producto:    { label: "Producto",    color: "#06b6d4", icon: "📦" },
  otro:        { label: "Otro",        color: "#9ca3af", icon: "💬" },
};

const PRODUCTOS_LABEL: Record<string, string> = {
  contigo_autonomo: "Contigo Autónomo",
  contigo_pyme:     "Contigo Pyme",
  contigo_familia:  "Contigo Familia",
  contigo_futuro:   "Contigo Futuro",
  contigo_senior:   "Contigo Senior",
  sialp:            "SIALP",
  liderplus:        "LiderPlus",
  sanitas_salud:    "Sanitas",
  mihogar:          "MiHogar",
  hipotecas:        "Hipoteca",
};

// ─── Modal ────────────────────────────────────────────────────────────────────

function ModalObjecion({
  obj,
  onClose,
  onSave,
}: {
  obj?: Objecion | null;
  onClose: () => void;
  onSave: () => void;
}) {
  const [texto, setTexto] = useState(obj?.texto ?? "");
  const [respuesta, setRespuesta] = useState(obj?.respuesta ?? "");
  const [tipo, setTipo] = useState(obj?.tipo ?? "precio");
  const [productosSelec, setProductosSelec] = useState<string[]>(obj?.productos ?? []);
  const [guardando, setGuardando] = useState(false);

  function toggleProducto(p: string) {
    setProductosSelec(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
  }

  async function guardar() {
    if (!texto.trim() || !respuesta.trim()) return;
    setGuardando(true);
    const payload = {
      texto: texto.trim(),
      respuesta: respuesta.trim(),
      tipo,
      productos: productosSelec,
      updated_at: new Date().toISOString(),
    };
    if (obj) {
      await supabase.from("objeciones").update(payload).eq("id", obj.id);
    } else {
      await supabase.from("objeciones").insert({ ...payload, activo: true });
    }
    setGuardando(false);
    onSave();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.4)" }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-900">{obj ? "Editar objeción" : "Nueva objeción"}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">×</button>
        </div>
        <div className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Tipo de objeción</label>
            <div className="flex flex-wrap gap-2">
              {Object.entries(TIPO_CFG).map(([key, cfg]) => (
                <button key={key} onClick={() => setTipo(key)}
                  className="px-3 py-1.5 text-xs rounded-full border font-medium transition-all"
                  style={{
                    borderColor: tipo === key ? cfg.color : "#e2e8f0",
                    background: tipo === key ? cfg.color + "15" : "white",
                    color: tipo === key ? cfg.color : "#64748b",
                  }}>
                  {cfg.icon} {cfg.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Objeción del cliente *</label>
            <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={2}
              placeholder='Ej: "Es muy caro, no me lo puedo permitir"'
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-400 resize-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Respuesta recomendada *</label>
            <textarea value={respuesta} onChange={e => setRespuesta(e.target.value)} rows={5}
              placeholder="Cómo responder de forma efectiva..."
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-400 resize-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Productos relacionados</label>
            <div className="flex flex-wrap gap-2">
              {Object.entries(PRODUCTOS_LABEL).map(([key, label]) => (
                <button key={key} onClick={() => toggleProducto(key)}
                  className="px-2.5 py-1 text-xs rounded-lg border font-medium transition-all"
                  style={{
                    borderColor: productosSelec.includes(key) ? "#ea650d" : "#e2e8f0",
                    background: productosSelec.includes(key) ? "#fff5f0" : "white",
                    color: productosSelec.includes(key) ? "#ea650d" : "#64748b",
                  }}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
            Cancelar
          </button>
          <button onClick={guardar} disabled={!texto.trim() || !respuesta.trim() || guardando}
            className="px-4 py-2 text-sm text-white rounded-lg font-medium disabled:opacity-50"
            style={{ background: "#ea650d" }}>
            {guardando ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Objecion card ────────────────────────────────────────────────────────────

function ObjecionCard({ obj, onEdit, onVotar }: { obj: Objecion; onEdit: () => void; onVotar: () => void }) {
  const { puede } = usePermisos();
  const [expandida, setExpandida] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const cfg = TIPO_CFG[obj.tipo] ?? TIPO_CFG.otro;

  async function votar() {
    await supabase.from("objeciones").update({ votos: obj.votos + 1 }).eq("id", obj.id);
    onVotar();
  }

  function copiar() {
    navigator.clipboard?.writeText(obj.respuesta);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden hover:border-orange-200 transition-colors">
      <button className="w-full px-5 py-4 flex items-start gap-4 text-left" onClick={() => setExpandida(!expandida)}>
        <div className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-lg mt-0.5"
          style={{ background: cfg.color + "15" }}>
          {cfg.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={{ background: cfg.color + "15", color: cfg.color }}>{cfg.label}</span>
            {obj.productos.slice(0, 3).map(p => (
              <span key={p} className="text-[10px] px-1.5 py-0.5 rounded bg-orange-50 text-orange-600 font-medium">
                {PRODUCTOS_LABEL[p] ?? p}
              </span>
            ))}
            {obj.productos.length > 3 && (
              <span className="text-[10px] text-slate-400">+{obj.productos.length - 3}</span>
            )}
          </div>
          <p className="text-sm font-semibold text-slate-800 leading-snug">&ldquo;{obj.texto}&rdquo;</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={e => { e.stopPropagation(); votar(); }}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-orange-500 transition-colors"
            title="Útil">
            👍 {obj.votos > 0 && <span>{obj.votos}</span>}
          </button>
          <svg className={`shrink-0 text-slate-400 transition-transform ${expandida ? "rotate-180" : ""}`}
            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </button>

      {expandida && (
        <div className="border-t border-slate-100 px-5 py-4">
          <div className="text-xs font-semibold text-blue-700 mb-2">💬 Cómo responder</div>
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
            {obj.respuesta}
          </div>
          <div className="flex items-center gap-3 mt-3">
            <button onClick={copiar}
              className="text-xs font-medium transition-colors"
              style={{ color: copiado ? "#10b981" : "#3b82f6" }}>
              {copiado ? "✓ Copiado" : "📋 Copiar respuesta"}
            </button>
            {puede("gestionar_ajustes") && (
              <button onClick={onEdit} className="text-xs text-slate-400 hover:text-slate-600">
                Editar
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ObjecionesPage() {
  const { puede, cargando: cargandoPermisos } = usePermisos();
  const [objeciones, setObjeciones] = useState<Objecion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState<Objecion | null>(null);
  const [busq, setBusq] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [filtroProducto, setFiltroProducto] = useState("todos");
  const [orden, setOrden] = useState<"votos" | "reciente">("votos");

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data } = await supabase.from("objeciones").select("*").eq("activo", true).order("votos", { ascending: false });
    setObjeciones(data ?? []);
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const filtradas = objeciones
    .filter(o => {
      const matchBusq = !busq || o.texto.toLowerCase().includes(busq.toLowerCase()) || o.respuesta.toLowerCase().includes(busq.toLowerCase()) || o.tags.some(t => t.toLowerCase().includes(busq.toLowerCase()));
      const matchTipo = filtroTipo === "todos" || o.tipo === filtroTipo;
      const matchProd = filtroProducto === "todos" || o.productos.includes(filtroProducto);
      return matchBusq && matchTipo && matchProd;
    })
    .sort((a, b) => orden === "votos" ? b.votos - a.votos : 0);

  const productosPresentes = [...new Set(objeciones.flatMap(o => o.productos))];

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Banco de objeciones</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Respuestas probadas para las objeciones más comunes
          </p>
        </div>
        {puede("gestionar_ajustes") && (
          <button onClick={() => setModal(true)}
            className="px-4 py-2 text-sm text-white rounded-xl font-medium"
            style={{ background: "#ea650d" }}>
            + Añadir objeción
          </button>
        )}
      </div>

      {/* Tip */}
      <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3">
        <span className="text-xl">🎯</span>
        <div>
          <div className="text-sm font-semibold text-green-800">Escucha, valida, redirige</div>
          <p className="text-xs text-green-700 mt-1 leading-relaxed">
            Nunca contradigas directamente. Primero reconoce la objeción (&ldquo;Entiendo lo que dices&rdquo;), luego haz una pregunta que la desmonte, y finalmente presenta el argumento. Usa estas respuestas como guía, no como guión literal.
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
          </svg>
          <input value={busq} onChange={e => setBusq(e.target.value)}
            placeholder="Buscar objeción o palabra clave..."
            className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-orange-400 bg-white" />
        </div>
        <select value={orden} onChange={e => setOrden(e.target.value as "votos" | "reciente")}
          className="px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:border-orange-400 text-slate-600">
          <option value="votos">Más útiles primero</option>
          <option value="reciente">Más recientes</option>
        </select>
      </div>

      {/* Filters */}
      <div className="space-y-2">
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setFiltroTipo("todos")}
            className="px-3 py-1.5 text-xs rounded-full border font-medium transition-all"
            style={{
              borderColor: filtroTipo === "todos" ? "#ea650d" : "#e2e8f0",
              background: filtroTipo === "todos" ? "#fff5f0" : "white",
              color: filtroTipo === "todos" ? "#ea650d" : "#64748b",
            }}>
            Todos los tipos
          </button>
          {Object.entries(TIPO_CFG).map(([key, cfg]) => {
            const count = objeciones.filter(o => o.tipo === key).length;
            if (count === 0) return null;
            return (
              <button key={key} onClick={() => setFiltroTipo(key)}
                className="px-3 py-1.5 text-xs rounded-full border font-medium transition-all"
                style={{
                  borderColor: filtroTipo === key ? cfg.color : "#e2e8f0",
                  background: filtroTipo === key ? cfg.color + "15" : "white",
                  color: filtroTipo === key ? cfg.color : "#64748b",
                }}>
                {cfg.icon} {cfg.label} ({count})
              </button>
            );
          })}
        </div>
        {productosPresentes.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setFiltroProducto("todos")}
              className="px-3 py-1.5 text-xs rounded-full border font-medium transition-all"
              style={{
                borderColor: filtroProducto === "todos" ? "#ea650d" : "#e2e8f0",
                background: filtroProducto === "todos" ? "#fff5f0" : "white",
                color: filtroProducto === "todos" ? "#ea650d" : "#64748b",
              }}>
              Todos los productos
            </button>
            {productosPresentes.map(p => (
              <button key={p} onClick={() => setFiltroProducto(p)}
                className="px-3 py-1.5 text-xs rounded-full border font-medium transition-all"
                style={{
                  borderColor: filtroProducto === p ? "#ea650d" : "#e2e8f0",
                  background: filtroProducto === p ? "#fff5f0" : "white",
                  color: filtroProducto === p ? "#ea650d" : "#64748b",
                }}>
                {PRODUCTOS_LABEL[p] ?? p}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Count */}
      {!cargando && (
        <div className="text-xs text-slate-400">
          {filtradas.length} {filtradas.length === 1 ? "objeción encontrada" : "objeciones encontradas"}
        </div>
      )}

      {/* List */}
      {cargando ? (
        <div className="py-10 text-center text-sm text-slate-400">Cargando...</div>
      ) : filtradas.length === 0 ? (
        <div className="py-10 text-center text-sm text-slate-400">Sin objeciones encontradas.</div>
      ) : (
        <div className="space-y-3">
          {filtradas.map(o => (
            <ObjecionCard
              key={o.id}
              obj={o}
              onEdit={() => setEditando(o)}
              onVotar={cargar}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      {(modal || editando) && (
        <ModalObjecion
          obj={editando}
          onClose={() => { setModal(false); setEditando(null); }}
          onSave={() => { setModal(false); setEditando(null); cargar(); }}
        />
      )}
    </div>
  );
}
