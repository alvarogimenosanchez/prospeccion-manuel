"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { usePermisos } from "@/components/PermisosProvider";
import { format, formatDistanceToNow, parseISO, startOfDay, subDays } from "date-fns";
import { es } from "date-fns/locale";

// ─── Types ──────────────────────────────────────────────────────────────────

type Llamada = {
  id: string;
  lead_id: string;
  comercial_id: string | null;
  tipo: string;
  duracion_segundos: number | null;
  resultado: string | null;
  mensaje: string | null;
  created_at: string;
  lead_nombre?: string;
  lead_empresa?: string;
  lead_telefono?: string;
  comercial_nombre?: string;
};

type DiaStats = {
  fecha: string;
  label: string;
  llamadas: number;
  contestadas: number;
  minutos: number;
};

type ComercialStats = {
  id: string;
  nombre: string;
  llamadas: number;
  contestadas: number;
  minutos: number;
  promedio_minutos: number;
};

// ─── Helpers ────────────────────────────────────────────────────────────────

const RESULTADO_CFG: Record<string, { label: string; color: string; bg: string }> = {
  contestada:       { label: "Contestada",       color: "text-green-700",  bg: "bg-green-50"  },
  no_contestada:    { label: "No contestada",     color: "text-slate-500",  bg: "bg-slate-50"  },
  buzon:            { label: "Buzón",             color: "text-amber-700",  bg: "bg-amber-50"  },
  interesado:       { label: "Interesado",        color: "text-blue-700",   bg: "bg-blue-50"   },
  no_interesado:    { label: "No interesado",     color: "text-red-600",    bg: "bg-red-50"    },
  cita_acordada:    { label: "Cita acordada",     color: "text-orange-700", bg: "bg-orange-50" },
  llamar_despues:   { label: "Llamar después",    color: "text-violet-700", bg: "bg-violet-50" },
};

function duracionLabel(seg: number | null): string {
  if (!seg) return "—";
  if (seg < 60) return `${seg}s`;
  const m = Math.floor(seg / 60);
  const s = seg % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function duracionMinutos(seg: number | null): number {
  return seg ? Math.round(seg / 60) : 0;
}

type QuickLogForm = {
  lead_busqueda: string;
  lead_id: string;
  resultado: string;
  duracion_segundos: string;
  mensaje: string;
};

// ─── Quick log modal ─────────────────────────────────────────────────────────

type LeadBasico = { id: string; nombre: string; apellidos: string | null; empresa: string | null; telefono: string | null };

function ModalQuickLog({
  leads, miId, onGuardar, onCerrar, guardando,
}: {
  leads: LeadBasico[];
  miId: string | null;
  onGuardar: (form: QuickLogForm) => void;
  onCerrar: () => void;
  guardando: boolean;
}) {
  const [form, setForm] = useState<QuickLogForm>({
    lead_busqueda: "", lead_id: "", resultado: "contestada", duracion_segundos: "", mensaje: "",
  });

  const leadsFiltered = form.lead_busqueda.trim().length >= 2
    ? leads.filter(l => {
        const q = form.lead_busqueda.toLowerCase();
        return l.nombre?.toLowerCase().includes(q) || l.apellidos?.toLowerCase().includes(q) || l.empresa?.toLowerCase().includes(q);
      }).slice(0, 8)
    : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.45)" }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-6 pt-6 pb-4 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-900">Registrar llamada</h2>
        </div>
        <div className="px-6 py-4 space-y-4">

          {/* Lead */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Lead *</label>
            {form.lead_id ? (
              <div className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2">
                <span className="text-sm text-slate-700 flex-1">
                  {leads.find(l => l.id === form.lead_id)?.nombre ?? "Lead seleccionado"}
                </span>
                <button onClick={() => setForm(f => ({ ...f, lead_id: "", lead_busqueda: "" }))}
                  className="text-xs text-slate-400 hover:text-red-500">✕</button>
              </div>
            ) : (
              <div className="relative">
                <input value={form.lead_busqueda}
                  onChange={e => setForm(f => ({ ...f, lead_busqueda: e.target.value }))}
                  placeholder="Buscar lead por nombre..."
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-300" />
                {leadsFiltered.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg">
                    {leadsFiltered.map(l => (
                      <button key={l.id}
                        onClick={() => setForm(f => ({ ...f, lead_id: l.id, lead_busqueda: "" }))}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-orange-50 border-b border-slate-50 last:border-0">
                        <span className="font-medium text-slate-800">{l.nombre} {l.apellidos}</span>
                        {l.empresa && <span className="text-slate-400 ml-1">— {l.empresa}</span>}
                        {l.telefono && <span className="text-slate-300 ml-1">· {l.telefono}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Resultado */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Resultado</label>
            <div className="grid grid-cols-2 gap-1.5">
              {Object.entries(RESULTADO_CFG).map(([k, v]) => (
                <button key={k} onClick={() => setForm(f => ({ ...f, resultado: k }))}
                  className={`px-2.5 py-1.5 text-xs rounded-lg border font-medium transition-colors text-left ${
                    form.resultado === k
                      ? `${v.bg} ${v.color} border-current`
                      : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"
                  }`}>
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          {/* Duración */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Duración (segundos)</label>
            <input type="number" value={form.duracion_segundos}
              onChange={e => setForm(f => ({ ...f, duracion_segundos: e.target.value }))}
              placeholder="Ej: 180 (= 3 minutos)"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-300" />
          </div>

          {/* Notas */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Notas de la llamada</label>
            <textarea rows={3} value={form.mensaje}
              onChange={e => setForm(f => ({ ...f, mensaje: e.target.value }))}
              placeholder="¿Qué se habló? ¿Cuál es el siguiente paso?"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-300 resize-none" />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onCerrar} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">Cancelar</button>
          <button
            onClick={() => onGuardar(form)}
            disabled={!form.lead_id || guardando}
            className="px-5 py-2 text-sm font-semibold text-white rounded-lg disabled:opacity-50 transition-colors"
            style={{ background: "#ea650d" }}
          >
            {guardando ? "Guardando..." : "Registrar llamada"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function LlamadasPage() {
  const { puede, cargando: cargandoPermisos } = usePermisos();
  const [llamadas, setLlamadas] = useState<Llamada[]>([]);
  const [leads, setLeads] = useState<LeadBasico[]>([]);
  const [diasStats, setDiasStats] = useState<DiaStats[]>([]);
  const [comStats, setComStats] = useState<ComercialStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState<"7d" | "30d" | "90d">("30d");
  const [filtroResultado, setFiltroResultado] = useState("");
  const [filtroComercial, setFiltroComercial] = useState("todos");
  const [comerciales, setComerciales] = useState<{ id: string; nombre: string }[]>([]);
  const [mostrarModal, setMostrarModal] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [miId, setMiId] = useState<string | null>(null);

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
    const dias = periodo === "7d" ? 7 : periodo === "30d" ? 30 : 90;
    const desde = new Date(Date.now() - dias * 86400_000).toISOString();

    let q = supabase.from("interactions")
      .select("id, lead_id, comercial_id, tipo, duracion_segundos, resultado, mensaje, created_at")
      .eq("tipo", "llamada")
      .gte("created_at", desde)
      .order("created_at", { ascending: false })
      .limit(500);

    if (filtroResultado) q = q.eq("resultado", filtroResultado);
    if (filtroComercial !== "todos") q = q.eq("comercial_id", filtroComercial);
    if (!puede("ver_metricas") && miId) q = q.eq("comercial_id", miId);

    const { data: rows } = await q;
    const lista = rows ?? [];

    // Enrich
    const leadIds = [...new Set(lista.map(r => r.lead_id).filter(Boolean))] as string[];
    const comIds  = [...new Set(lista.map(r => r.comercial_id).filter(Boolean))] as string[];

    const [{ data: leadsData }, { data: comsData }] = await Promise.all([
      leadIds.length > 0 ? supabase.from("leads").select("id, nombre, apellidos, empresa, telefono").in("id", leadIds) : { data: [] },
      comIds.length > 0  ? supabase.from("comerciales").select("id, nombre").in("id", comIds) : { data: [] },
    ]);

    const leadMap = new Map((leadsData ?? []).map(l => [l.id, l]));
    const comMap  = new Map((comsData ?? []).map(c => [c.id, c]));

    const enriched: Llamada[] = lista.map(r => {
      const l = r.lead_id ? leadMap.get(r.lead_id) : null;
      const c = r.comercial_id ? comMap.get(r.comercial_id) : null;
      return {
        ...r,
        lead_nombre: l ? `${l.nombre}${l.apellidos ? ` ${l.apellidos}` : ""}` : undefined,
        lead_empresa: l?.empresa ?? undefined,
        lead_telefono: l?.telefono ?? undefined,
        comercial_nombre: c?.nombre ?? undefined,
      };
    });
    setLlamadas(enriched);

    // Daily stats (last 7 days)
    const hoy = startOfDay(new Date());
    const dias7: DiaStats[] = Array.from({ length: 7 }, (_, i) => {
      const d = subDays(hoy, 6 - i);
      const fechaStr = d.toISOString().split("T")[0];
      const del_dia = enriched.filter(l => l.created_at.startsWith(fechaStr));
      return {
        fecha: fechaStr,
        label: format(d, "EEE d", { locale: es }),
        llamadas: del_dia.length,
        contestadas: del_dia.filter(l => l.resultado && ["contestada", "interesado", "cita_acordada"].includes(l.resultado)).length,
        minutos: del_dia.reduce((s, l) => s + duracionMinutos(l.duracion_segundos), 0),
      };
    });
    setDiasStats(dias7);

    // Per-comercial stats
    const comStatsMap = new Map<string, ComercialStats>();
    for (const l of enriched) {
      const cid = l.comercial_id ?? "sin_asignar";
      if (!comStatsMap.has(cid)) {
        comStatsMap.set(cid, { id: cid, nombre: l.comercial_nombre ?? "Sin asignar", llamadas: 0, contestadas: 0, minutos: 0, promedio_minutos: 0 });
      }
      const s = comStatsMap.get(cid)!;
      s.llamadas++;
      if (l.resultado && ["contestada", "interesado", "cita_acordada"].includes(l.resultado)) s.contestadas++;
      s.minutos += duracionMinutos(l.duracion_segundos);
    }
    for (const s of comStatsMap.values()) {
      s.promedio_minutos = s.llamadas > 0 ? Math.round(s.minutos / s.llamadas) : 0;
    }
    setComStats([...comStatsMap.values()].sort((a, b) => b.llamadas - a.llamadas));

    setLoading(false);
  }, [periodo, filtroResultado, filtroComercial, puede, miId]);

  useEffect(() => {
    if (!cargandoPermisos) cargar();
  }, [cargar, cargandoPermisos]);

  useEffect(() => {
    async function cargarAux() {
      const [{ data: ls }, { data: cs }] = await Promise.all([
        supabase.from("leads").select("id, nombre, apellidos, empresa, telefono")
          .not("estado", "in", "(cerrado_perdido,descartado)").order("nombre").limit(500),
        supabase.from("comerciales").select("id, nombre").eq("activo", true).order("nombre"),
      ]);
      setLeads(ls ?? []);
      setComerciales(cs ?? []);
    }
    cargarAux();
  }, []);

  async function guardarLlamada(form: QuickLogForm) {
    setGuardando(true);
    await supabase.from("interactions").insert({
      lead_id: form.lead_id,
      comercial_id: miId,
      tipo: "llamada",
      resultado: form.resultado || null,
      duracion_segundos: form.duracion_segundos ? parseInt(form.duracion_segundos) : null,
      mensaje: form.mensaje.trim() || null,
    });
    setGuardando(false);
    setMostrarModal(false);
    cargar();
  }

  // KPIs
  const totalLlamadas = llamadas.length;
  const contestadas = llamadas.filter(l => l.resultado && ["contestada", "interesado", "cita_acordada"].includes(l.resultado)).length;
  const tasaContacto = totalLlamadas > 0 ? Math.round((contestadas / totalLlamadas) * 100) : 0;
  const citasAcordadas = llamadas.filter(l => l.resultado === "cita_acordada").length;
  const minutosTotal = llamadas.reduce((s, l) => s + duracionMinutos(l.duracion_segundos), 0);
  const maxDia = Math.max(...diasStats.map(d => d.llamadas), 1);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Registro de llamadas</h1>
          <p className="text-sm text-slate-500 mt-0.5">Historial unificado de todas las llamadas del equipo</p>
        </div>
        <button
          onClick={() => setMostrarModal(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white rounded-lg shadow-sm hover:opacity-90 transition-opacity"
          style={{ background: "#ea650d" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14" /></svg>
          Registrar llamada
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
          <p className="text-xs text-slate-500 mb-1">Total llamadas</p>
          <p className="text-2xl font-bold text-slate-900">{totalLlamadas}</p>
          <p className="text-xs text-slate-400">últimos {periodo === "7d" ? "7 días" : periodo === "30d" ? "30 días" : "90 días"}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
          <p className="text-xs text-slate-500 mb-1">Tasa de contacto</p>
          <p className={`text-2xl font-bold ${tasaContacto >= 60 ? "text-green-700" : tasaContacto >= 40 ? "text-amber-700" : "text-red-600"}`}>
            {tasaContacto}%
          </p>
          <p className="text-xs text-slate-400">{contestadas} contestadas</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
          <p className="text-xs text-slate-500 mb-1">Citas acordadas</p>
          <p className="text-2xl font-bold text-orange-600">{citasAcordadas}</p>
          <p className="text-xs text-slate-400">desde llamadas</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
          <p className="text-xs text-slate-500 mb-1">Tiempo total</p>
          <p className="text-2xl font-bold text-slate-900">
            {minutosTotal >= 60 ? `${Math.floor(minutosTotal / 60)}h ${minutosTotal % 60}m` : `${minutosTotal}m`}
          </p>
          <p className="text-xs text-slate-400">en llamadas</p>
        </div>
      </div>

      {/* Weekly sparkline */}
      <div className="bg-white rounded-xl border border-slate-200 px-5 py-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Llamadas últimos 7 días</h2>
        <div className="flex items-end gap-2 h-16">
          {diasStats.map(d => (
            <div key={d.fecha} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full flex flex-col justify-end" style={{ height: "48px" }}>
                <div className="w-full rounded-t"
                  style={{ height: `${Math.round((d.llamadas / maxDia) * 48)}px`, background: "#ea650d", minHeight: d.llamadas > 0 ? "3px" : "0" }} />
              </div>
              <span className="text-[10px] text-slate-400">{d.label}</span>
              <span className="text-[10px] font-semibold text-slate-600">{d.llamadas}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Per-comercial stats (directors only) */}
      {puede("ver_metricas") && comStats.length > 1 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-700">Por comercial</h2>
          </div>
          <div className="divide-y divide-slate-50">
            {comStats.map(c => {
              const pctContacto = c.llamadas > 0 ? Math.round((c.contestadas / c.llamadas) * 100) : 0;
              return (
                <div key={c.id} className="px-5 py-3 flex items-center gap-4">
                  <p className="text-sm font-medium text-slate-800 w-32 shrink-0 truncate">{c.nombre}</p>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-orange-400"
                          style={{ width: `${Math.min(100, (c.llamadas / Math.max(...comStats.map(x => x.llamadas), 1)) * 100)}%` }} />
                      </div>
                      <span className="text-xs text-slate-600 font-semibold w-8 text-right">{c.llamadas}</span>
                    </div>
                  </div>
                  <span className={`text-xs font-semibold w-12 text-right ${pctContacto >= 60 ? "text-green-700" : pctContacto >= 40 ? "text-amber-700" : "text-red-500"}`}>
                    {pctContacto}%
                  </span>
                  <span className="text-xs text-slate-400 w-14 text-right hidden md:block">{c.minutos}min</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
          {(["7d", "30d", "90d"] as const).map(p => (
            <button key={p} onClick={() => setPeriodo(p)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${periodo === p ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
              {p === "7d" ? "7 días" : p === "30d" ? "30 días" : "90 días"}
            </button>
          ))}
        </div>
        <select value={filtroResultado} onChange={e => setFiltroResultado(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:border-orange-300">
          <option value="">Todos los resultados</option>
          {Object.entries(RESULTADO_CFG).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        {puede("ver_metricas") && comerciales.length > 1 && (
          <select value={filtroComercial} onChange={e => setFiltroComercial(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:border-orange-300">
            <option value="todos">Todos los comerciales</option>
            {comerciales.map(c => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
        )}
      </div>

      {/* Call list */}
      {loading ? (
        <div className="py-16 text-center text-sm text-slate-400">Cargando llamadas...</div>
      ) : llamadas.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-slate-400 text-sm mb-4">No hay llamadas registradas en este período.</p>
          <button onClick={() => setMostrarModal(true)}
            className="px-4 py-2 text-sm font-semibold text-white rounded-lg"
            style={{ background: "#ea650d" }}>
            Registrar la primera
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 grid grid-cols-12 gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wide">
            <span className="col-span-4">Lead</span>
            <span className="col-span-2">Comercial</span>
            <span className="col-span-2">Resultado</span>
            <span className="col-span-2 text-right hidden md:block">Duración</span>
            <span className="col-span-2 text-right">Fecha</span>
          </div>
          <div className="divide-y divide-slate-50">
            {llamadas.map(l => {
              const cfg = l.resultado ? RESULTADO_CFG[l.resultado] : null;
              return (
                <div key={l.id} className="px-5 py-3 grid grid-cols-12 gap-2 items-center hover:bg-slate-50 transition-colors">
                  <div className="col-span-4">
                    {l.lead_id ? (
                      <Link href={`/leads/${l.lead_id}`} className="text-sm font-medium text-slate-800 hover:text-orange-600 truncate block">
                        {l.lead_nombre ?? "Lead"}
                      </Link>
                    ) : (
                      <span className="text-sm text-slate-400">—</span>
                    )}
                    {l.lead_empresa && <p className="text-xs text-slate-400 truncate">{l.lead_empresa}</p>}
                    {l.mensaje && <p className="text-xs text-slate-500 mt-0.5 line-clamp-1 italic">"{l.mensaje}"</p>}
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs text-slate-600 truncate">{l.comercial_nombre ?? "—"}</p>
                  </div>
                  <div className="col-span-2">
                    {cfg ? (
                      <span className={`inline-block px-2 py-0.5 text-xs rounded-full font-medium ${cfg.bg} ${cfg.color}`}>
                        {cfg.label}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </div>
                  <div className="col-span-2 text-right hidden md:block">
                    <span className="text-xs text-slate-500">{duracionLabel(l.duracion_segundos)}</span>
                  </div>
                  <div className="col-span-2 text-right">
                    <p className="text-xs text-slate-400" title={format(parseISO(l.created_at), "dd/MM/yyyy HH:mm")}>
                      {formatDistanceToNow(parseISO(l.created_at), { addSuffix: true, locale: es })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal */}
      {mostrarModal && (
        <ModalQuickLog
          leads={leads}
          miId={miId}
          onGuardar={guardarLlamada}
          onCerrar={() => setMostrarModal(false)}
          guardando={guardando}
        />
      )}
    </div>
  );
}
