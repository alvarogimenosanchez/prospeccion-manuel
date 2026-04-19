"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { usePermisos } from "@/components/PermisosProvider";

// ─── Types ────────────────────────────────────────────────────────────────────

type Competidor = {
  id: string;
  nombre: string;
  descripcion: string | null;
  cuota_mercado: string | null;
  puntos_debiles: string[];
  puntos_fuertes: string[];
  productos_solapados: string[];
  argumentos_vs: string | null;
  activo: boolean;
};

const PRODUCTOS_LABEL: Record<string, string> = {
  contigo_autonomo: "Contigo Autónomo",
  contigo_pyme: "Contigo Pyme",
  contigo_familia: "Contigo Familia",
  contigo_futuro: "Contigo Futuro",
  contigo_senior: "Contigo Senior",
  sialp: "SIALP",
  liderplus: "LiderPlus",
  sanitas_salud: "Sanitas",
  mihogar: "MiHogar",
  hipotecas: "Hipoteca",
};

// ─── Modal ────────────────────────────────────────────────────────────────────

function ModalCompetidor({
  comp,
  onClose,
  onSave,
}: {
  comp?: Competidor | null;
  onClose: () => void;
  onSave: () => void;
}) {
  const [nombre, setNombre] = useState(comp?.nombre ?? "");
  const [descripcion, setDescripcion] = useState(comp?.descripcion ?? "");
  const [cuota, setCuota] = useState(comp?.cuota_mercado ?? "");
  const [debiles, setDebiles] = useState((comp?.puntos_debiles ?? []).join("\n"));
  const [fuertes, setFuertes] = useState((comp?.puntos_fuertes ?? []).join("\n"));
  const [args, setArgs] = useState(comp?.argumentos_vs ?? "");
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    if (!nombre.trim()) return;
    setGuardando(true);
    const payload = {
      nombre: nombre.trim(),
      descripcion: descripcion.trim() || null,
      cuota_mercado: cuota.trim() || null,
      puntos_debiles: debiles.split("\n").map(s => s.trim()).filter(Boolean),
      puntos_fuertes: fuertes.split("\n").map(s => s.trim()).filter(Boolean),
      argumentos_vs: args.trim() || null,
      updated_at: new Date().toISOString(),
    };
    if (comp) {
      await supabase.from("competidores").update(payload).eq("id", comp.id);
    } else {
      await supabase.from("competidores").insert(payload);
    }
    setGuardando(false);
    onSave();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.4)" }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-900">
            {comp ? `Editar: ${comp.nombre}` : "Nuevo competidor"}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">×</button>
        </div>
        <div className="px-6 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Nombre *</label>
              <input value={nombre} onChange={e => setNombre(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Cuota de mercado</label>
              <input value={cuota} onChange={e => setCuota(e.target.value)} placeholder="Ej: ~15% del mercado"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-400" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Descripción breve</label>
            <input value={descripcion} onChange={e => setDescripcion(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-400" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Puntos débiles (uno por línea)</label>
              <textarea value={debiles} onChange={e => setDebiles(e.target.value)} rows={5}
                placeholder="Sin cobertura desde día 1&#10;Precio elevado&#10;Burocracia lenta..."
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-orange-400 resize-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Puntos fuertes (uno por línea)</label>
              <textarea value={fuertes} onChange={e => setFuertes(e.target.value)} rows={5}
                placeholder="Marca reconocida&#10;Red de oficinas..."
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-orange-400 resize-none" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Argumentario vs este competidor</label>
            <textarea value={args} onChange={e => setArgs(e.target.value)} rows={4}
              placeholder="¿Cómo responder cuando el lead dice que ya tiene este seguro o lo está considerando?"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-400 resize-none" />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
            Cancelar
          </button>
          <button onClick={guardar} disabled={!nombre.trim() || guardando}
            className="px-4 py-2 text-sm text-white rounded-lg font-medium disabled:opacity-50"
            style={{ background: "#ea650d" }}>
            {guardando ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Competidor detail card ───────────────────────────────────────────────────

function CompetidorCard({ comp, onEdit }: { comp: Competidor; onEdit: () => void }) {
  const { puede } = usePermisos();
  const [expandido, setExpandido] = useState(false);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden hover:border-orange-200 transition-colors">
      {/* Header */}
      <button className="w-full px-5 py-4 flex items-center gap-4 text-left" onClick={() => setExpandido(!expandido)}>
        {/* Logo placeholder */}
        <div className="shrink-0 w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-lg font-bold text-slate-600">
          {comp.nombre.slice(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-bold text-slate-900">{comp.nombre}</span>
            {comp.cuota_mercado && (
              <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{comp.cuota_mercado}</span>
            )}
          </div>
          {comp.descripcion && (
            <p className="text-xs text-slate-500 mt-0.5">{comp.descripcion}</p>
          )}
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {comp.productos_solapados.slice(0, 3).map(p => (
              <span key={p} className="text-[10px] px-1.5 py-0.5 rounded bg-orange-50 text-orange-600 font-medium">
                {PRODUCTOS_LABEL[p] ?? p}
              </span>
            ))}
            {comp.productos_solapados.length > 3 && (
              <span className="text-[10px] text-slate-400">+{comp.productos_solapados.length - 3} más</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {puede("gestionar_ajustes") && (
            <button onClick={e => { e.stopPropagation(); onEdit(); }}
              className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600">
              Editar
            </button>
          )}
          <svg className={`shrink-0 text-slate-400 transition-transform ${expandido ? "rotate-180" : ""}`}
            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </button>

      {/* Expanded content */}
      {expandido && (
        <div className="border-t border-slate-100 px-5 py-4 space-y-4">
          {/* Two columns: debiles + fuertes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {comp.puntos_debiles.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-red-700 mb-2">🔴 Puntos débiles (úsalos a tu favor)</div>
                <ul className="space-y-1.5">
                  {comp.puntos_debiles.map((d, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-slate-700">
                      <span className="text-red-400 shrink-0 mt-0.5">✗</span>
                      <span>{d}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {comp.puntos_fuertes.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-green-700 mb-2">🟢 Puntos fuertes (reconócelos)</div>
                <ul className="space-y-1.5">
                  {comp.puntos_fuertes.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-slate-700">
                      <span className="text-green-500 shrink-0 mt-0.5">✓</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Argumentario */}
          {comp.argumentos_vs && (
            <div>
              <div className="text-xs font-semibold text-blue-700 mb-2">💬 Cómo responder: "Ya tengo {comp.nombre}"</div>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-slate-700 leading-relaxed">
                {comp.argumentos_vs}
              </div>
              <button
                onClick={() => navigator.clipboard?.writeText(comp.argumentos_vs ?? "")}
                className="mt-2 text-xs text-blue-600 hover:text-blue-700 font-medium">
                📋 Copiar argumentario
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CompetenciaPage() {
  const { puede, cargando: cargandoPermisos } = usePermisos();
  const [competidores, setCompetidores] = useState<Competidor[]>([]);
  const [cargando, setCargando] = useState(true);
  const [modalNuevo, setModalNuevo] = useState(false);
  const [editando, setEditando] = useState<Competidor | null>(null);
  const [busq, setBusq] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data } = await supabase.from("competidores").select("*").eq("activo", true).order("nombre");
    setCompetidores(data ?? []);
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const filtrados = competidores.filter(c =>
    !busq || c.nombre.toLowerCase().includes(busq.toLowerCase()) ||
    c.productos_solapados.some(p => (PRODUCTOS_LABEL[p] ?? p).toLowerCase().includes(busq.toLowerCase()))
  );

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Inteligencia competitiva</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Battle cards para responder cuando un lead menciona a la competencia
          </p>
        </div>
        {puede("gestionar_ajustes") && (
          <button onClick={() => setModalNuevo(true)}
            className="px-4 py-2 text-sm text-white rounded-xl font-medium"
            style={{ background: "#ea650d" }}>
            + Añadir competidor
          </button>
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
        </svg>
        <input value={busq} onChange={e => setBusq(e.target.value)}
          placeholder="Buscar competidor o producto..."
          className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-orange-400 bg-white" />
      </div>

      {/* Tips banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <span className="text-xl">🎯</span>
          <div>
            <div className="text-sm font-semibold text-blue-800">Regla de oro: no atacar, diferenciar</div>
            <p className="text-xs text-blue-700 mt-1 leading-relaxed">
              Nunca digas "X es malo". Di "X es bueno para esto, pero para tu situación específica nosotros tenemos una ventaja concreta: [X]."
              Reconoce sus puntos fuertes, luego diferencia en los que importan.
            </p>
          </div>
        </div>
      </div>

      {/* List */}
      {cargando ? (
        <div className="py-10 text-center text-sm text-slate-400">Cargando...</div>
      ) : filtrados.length === 0 ? (
        <div className="py-10 text-center text-sm text-slate-400">Sin competidores encontrados.</div>
      ) : (
        <div className="space-y-3">
          {filtrados.map(c => (
            <CompetidorCard key={c.id} comp={c} onEdit={() => setEditando(c)} />
          ))}
        </div>
      )}

      {/* Modals */}
      {(modalNuevo || editando) && (
        <ModalCompetidor
          comp={editando}
          onClose={() => { setModalNuevo(false); setEditando(null); }}
          onSave={() => { setModalNuevo(false); setEditando(null); cargar(); }}
        />
      )}
    </div>
  );
}
