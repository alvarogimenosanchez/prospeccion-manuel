"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { usePermisos } from "@/components/PermisosProvider";
import { format, parseISO, subMonths, startOfMonth } from "date-fns";
import { es } from "date-fns/locale";

// ─── Types ────────────────────────────────────────────────────────────────────

type NpsRespuesta = {
  id: string;
  cliente_id: string;
  comercial_id: string | null;
  puntuacion: number;
  comentario: string | null;
  motivo_detractor: string | null;
  created_at: string;
  cliente_nombre?: string;
  cliente_telefono?: string;
  comercial_nombre?: string;
};

type ClienteBasico = { id: string; nombre: string; apellidos: string | null; telefono: string | null; producto: string | null };

type Categoria = "promotor" | "pasivo" | "detractor";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function categorizarNPS(puntuacion: number): Categoria {
  if (puntuacion >= 9) return "promotor";
  if (puntuacion >= 7) return "pasivo";
  return "detractor";
}

function calcularNPS(respuestas: NpsRespuesta[]): number {
  if (respuestas.length === 0) return 0;
  const promotores = respuestas.filter(r => r.puntuacion >= 9).length;
  const detractores = respuestas.filter(r => r.puntuacion <= 6).length;
  return Math.round(((promotores - detractores) / respuestas.length) * 100);
}

const CAT_CFG = {
  promotor:   { label: "Promotor",   bg: "bg-green-100",  text: "text-green-700",  border: "border-green-300",  icon: "😍", range: "9–10" },
  pasivo:     { label: "Pasivo",     bg: "bg-amber-100",  text: "text-amber-700",  border: "border-amber-300",  icon: "😐", range: "7–8"  },
  detractor:  { label: "Detractor",  bg: "bg-red-100",    text: "text-red-700",    border: "border-red-300",    icon: "😞", range: "0–6"  },
};

const MOTIVOS_DETRACTOR = [
  "Precio elevado", "Producto no cubrió expectativas", "Mala atención recibida",
  "Tramitación complicada", "Tardó demasiado en resolverse", "Cambio de situación personal", "Otro",
];

const PRODUCTOS_LABEL: Record<string, string> = {
  contigo_autonomo: "C. Autónomo", contigo_pyme: "C. Pyme", contigo_familia: "C. Familia",
  contigo_futuro: "C. Futuro", contigo_senior: "C. Senior", sialp: "SIALP",
  liderplus: "LiderPlus", sanitas_salud: "Sanitas", mihogar: "MiHogar", hipotecas: "Hipoteca",
};

// ─── Modal: Register NPS ──────────────────────────────────────────────────────

function ModalNPS({
  clientes,
  miId,
  onClose,
  onSave,
}: {
  clientes: ClienteBasico[];
  miId: string | null;
  onClose: () => void;
  onSave: () => void;
}) {
  const [clienteId, setClienteId] = useState("");
  const [puntuacion, setPuntuacion] = useState<number | null>(null);
  const [comentario, setComentario] = useState("");
  const [motivoDetractor, setMotivoDetractor] = useState("");
  const [busqCliente, setBusqCliente] = useState("");
  const [guardando, setGuardando] = useState(false);

  const clientesFiltrados = clientes.filter(c => {
    const n = `${c.nombre} ${c.apellidos ?? ""}`.toLowerCase();
    return !busqCliente || n.includes(busqCliente.toLowerCase()) || (c.telefono ?? "").includes(busqCliente);
  }).slice(0, 8);

  const clienteSel = clientes.find(c => c.id === clienteId);
  const categoria = puntuacion !== null ? categorizarNPS(puntuacion) : null;

  async function guardar() {
    if (!clienteId || puntuacion === null) return;
    setGuardando(true);
    await supabase.from("nps_respuestas").insert({
      cliente_id: clienteId,
      comercial_id: miId,
      puntuacion,
      comentario: comentario.trim() || null,
      motivo_detractor: motivoDetractor || null,
    });
    setGuardando(false);
    onSave();
  }

  const scoreColors = [
    "bg-red-600", "bg-red-500", "bg-red-400", "bg-red-400", "bg-red-300",
    "bg-red-300", "bg-amber-400", "bg-amber-300", "bg-amber-200", "bg-green-400", "bg-green-500",
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.4)" }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-900">Registrar encuesta NPS</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">×</button>
        </div>
        <div className="px-6 py-4 space-y-5">
          {/* Client */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Cliente *</label>
            {clienteSel ? (
              <div className="flex items-center justify-between p-2.5 bg-green-50 border border-green-200 rounded-lg">
                <div>
                  <span className="text-sm font-medium text-green-800">{clienteSel.nombre} {clienteSel.apellidos ?? ""}</span>
                  {clienteSel.producto && (
                    <span className="ml-2 text-xs text-green-600">{PRODUCTOS_LABEL[clienteSel.producto] ?? clienteSel.producto}</span>
                  )}
                </div>
                <button onClick={() => setClienteId("")} className="text-green-500 text-xs hover:text-green-700">✕</button>
              </div>
            ) : (
              <>
                <input value={busqCliente} onChange={e => setBusqCliente(e.target.value)}
                  placeholder="Buscar cliente..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-400" />
                {busqCliente && clientesFiltrados.length > 0 && (
                  <div className="border border-slate-200 rounded-lg mt-1 overflow-hidden shadow-sm">
                    {clientesFiltrados.map(c => (
                      <button key={c.id} onClick={() => { setClienteId(c.id); setBusqCliente(""); }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-orange-50 border-b border-slate-50 last:border-0">
                        <span className="font-medium">{c.nombre} {c.apellidos ?? ""}</span>
                        {c.producto && <span className="text-slate-400 ml-2 text-xs">{PRODUCTOS_LABEL[c.producto] ?? c.producto}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Score */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-3">
              Puntuación NPS: ¿Con qué probabilidad recomendarías NN a un amigo? *
            </label>
            <div className="flex gap-1.5 flex-wrap">
              {Array.from({ length: 11 }, (_, i) => (
                <button key={i} onClick={() => setPuntuacion(i)}
                  className={`w-9 h-9 rounded-lg text-sm font-bold transition-all ${
                    puntuacion === i
                      ? `${scoreColors[i]} text-white scale-110 shadow-md`
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}>
                  {i}
                </button>
              ))}
            </div>
            <div className="flex justify-between text-xs text-slate-400 mt-2">
              <span>😞 Nada probable</span>
              <span>😍 Totalmente probable</span>
            </div>
            {categoria && (
              <div className={`mt-3 px-3 py-2 rounded-lg text-sm font-medium border ${CAT_CFG[categoria].bg} ${CAT_CFG[categoria].text} ${CAT_CFG[categoria].border}`}>
                {CAT_CFG[categoria].icon} {CAT_CFG[categoria].label} (puntuación {puntuacion}: {CAT_CFG[categoria].range})
                {categoria === "promotor" && " — Excelente candidato para pedir referidos"}
                {categoria === "detractor" && " — Requiere atención inmediata"}
              </div>
            )}
          </div>

          {/* Motivo detractor */}
          {categoria === "detractor" && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Motivo de insatisfacción *</label>
              <div className="flex flex-wrap gap-2">
                {MOTIVOS_DETRACTOR.map(m => (
                  <button key={m} onClick={() => setMotivoDetractor(m)}
                    className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                      motivoDetractor === m ? "border-red-400 bg-red-50 text-red-700" : "border-slate-200 text-slate-500 hover:border-slate-300"
                    }`}>
                    {m}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Comment */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Comentario del cliente (opcional)</label>
            <textarea value={comentario} onChange={e => setComentario(e.target.value)} rows={3}
              placeholder="¿Qué te dijo el cliente?"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-400 resize-none" />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
            Cancelar
          </button>
          <button onClick={guardar} disabled={!clienteId || puntuacion === null || guardando}
            className="px-4 py-2 text-sm text-white rounded-lg font-medium disabled:opacity-50"
            style={{ background: "#ea650d" }}>
            {guardando ? "Guardando..." : "Guardar encuesta"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── NPS Score display ────────────────────────────────────────────────────────

function NPSCircle({ score, size = "lg" }: { score: number; size?: "sm" | "lg" }) {
  const color = score >= 50 ? "#16a34a" : score >= 0 ? "#d97706" : "#dc2626";
  const dim = size === "lg" ? 96 : 56;
  const fontSize = size === "lg" ? "text-3xl" : "text-lg";
  return (
    <div
      className={`rounded-full flex items-center justify-center font-bold ${fontSize} border-4`}
      style={{ width: dim, height: dim, color, borderColor: color, background: `${color}10` }}>
      {score > 0 ? `+${score}` : score}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function NPSPage() {
  const { puede, cargando: cargandoPermisos } = usePermisos();
  const [respuestas, setRespuestas] = useState<NpsRespuesta[]>([]);
  const [clientes, setClientes] = useState<ClienteBasico[]>([]);
  const [cargando, setCargando] = useState(true);
  const [miId, setMiId] = useState<string | null>(null);
  const [esGestor, setEsGestor] = useState(false);
  const [modalNuevo, setModalNuevo] = useState(false);
  const [periodo, setPeriodo] = useState<"3m" | "6m" | "12m" | "all">("6m");
  const [vistaActual, setVistaActual] = useState<"resumen" | "lista" | "promotores">("resumen");

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data: { user } } = await supabase.auth.getUser();
    let cId: string | null = null;
    let esDir = false;

    if (user?.email) {
      const { data: com } = await supabase.from("comerciales").select("id, rol").eq("email", user.email).single();
      if (com) { cId = com.id; esDir = ["admin", "director", "manager"].includes(com.rol); }
    }
    setMiId(cId);
    setEsGestor(esDir);

    const [{ data: resps }, { data: clis }] = await Promise.all([
      supabase.from("nps_respuestas")
        .select("*, clientes(nombre, apellidos, telefono), comerciales(nombre, apellidos)")
        .order("created_at", { ascending: false }),
      supabase.from("clientes")
        .select("id, nombre, apellidos, telefono, producto")
        .eq("estado", "activo")
        .order("nombre"),
    ]);

    const respsConNombres = (resps ?? []).map(r => {
      const cli = r.clientes as unknown as { nombre: string; apellidos: string | null; telefono: string | null } | null;
      const com = r.comerciales as unknown as { nombre: string; apellidos: string | null } | null;
      return {
        ...r,
        cliente_nombre: cli ? [cli.nombre, cli.apellidos].filter(Boolean).join(" ") : undefined,
        cliente_telefono: cli?.telefono ?? undefined,
        comercial_nombre: com ? [com.nombre, com.apellidos].filter(Boolean).join(" ") : undefined,
      };
    });

    setRespuestas(respsConNombres);
    setClientes(clis ?? []);
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // ── Filter by period ─────────────────────────────────────────────────────

  const ahora = new Date();
  const desde = periodo === "all" ? null
    : startOfMonth(subMonths(ahora, periodo === "3m" ? 3 : periodo === "6m" ? 6 : 12));

  const respuestasFiltradas = respuestas.filter(r =>
    !desde || new Date(r.created_at) >= desde
  );

  // ── Statistics ────────────────────────────────────────────────────────────

  const total = respuestasFiltradas.length;
  const promotores = respuestasFiltradas.filter(r => r.puntuacion >= 9);
  const pasivos = respuestasFiltradas.filter(r => r.puntuacion >= 7 && r.puntuacion <= 8);
  const detractores = respuestasFiltradas.filter(r => r.puntuacion <= 6);
  const npsScore = calcularNPS(respuestasFiltradas);
  const media = total > 0 ? (respuestasFiltradas.reduce((s, r) => s + r.puntuacion, 0) / total).toFixed(1) : "–";

  const pctPromotor = total > 0 ? Math.round((promotores.length / total) * 100) : 0;
  const pctPasivo = total > 0 ? Math.round((pasivos.length / total) * 100) : 0;
  const pctDetractor = total > 0 ? Math.round((detractores.length / total) * 100) : 0;

  // ── Monthly trend ─────────────────────────────────────────────────────────

  const meses: { label: string; nps: number; n: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const inicio = startOfMonth(subMonths(ahora, i));
    const fin = startOfMonth(subMonths(ahora, i - 1));
    const del_mes = respuestas.filter(r => {
      const d = new Date(r.created_at);
      return d >= inicio && d < fin;
    });
    meses.push({
      label: format(inicio, "MMM", { locale: es }),
      nps: calcularNPS(del_mes),
      n: del_mes.length,
    });
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">NPS — Satisfacción del cliente</h1>
          <p className="text-sm text-slate-500 mt-0.5">Net Promoter Score: mide la lealtad y satisfacción de tu cartera de clientes</p>
        </div>
        <div className="flex gap-2">
          {[
            { id: "3m", label: "3 meses" }, { id: "6m", label: "6 meses" },
            { id: "12m", label: "12 meses" }, { id: "all", label: "Todo" },
          ].map(p => (
            <button key={p.id} onClick={() => setPeriodo(p.id as typeof periodo)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                periodo === p.id ? "border-orange-400 text-white" : "border-slate-200 text-slate-600 hover:border-orange-200 bg-white"
              }`}
              style={periodo === p.id ? { background: "#ea650d" } : undefined}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* NPS Score */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex items-center gap-4">
          <NPSCircle score={npsScore} />
          <div>
            <div className="text-xs text-slate-500 uppercase tracking-wide font-medium mb-1">Puntuación NPS</div>
            <div className="text-sm text-slate-500">{total} encuesta{total !== 1 ? "s" : ""}</div>
            <div className="text-xs text-slate-400 mt-0.5">Media: {media}/10</div>
            <div className="text-xs mt-1">
              {npsScore >= 50 ? <span className="text-green-600 font-medium">Excelente</span>
               : npsScore >= 30 ? <span className="text-amber-600 font-medium">Bueno</span>
               : npsScore >= 0 ? <span className="text-amber-500 font-medium">Mejorable</span>
               : <span className="text-red-600 font-medium">Urgente mejorar</span>}
            </div>
          </div>
        </div>

        {/* Distribution */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="text-xs text-slate-500 uppercase tracking-wide font-medium mb-3">Distribución</div>
          <div className="space-y-2">
            {[
              { cat: "promotor", pct: pctPromotor, n: promotores.length },
              { cat: "pasivo",   pct: pctPasivo,   n: pasivos.length },
              { cat: "detractor", pct: pctDetractor, n: detractores.length },
            ].map(({ cat, pct, n }) => {
              const cfg = CAT_CFG[cat as Categoria];
              const barColor = cat === "promotor" ? "#16a34a" : cat === "pasivo" ? "#d97706" : "#dc2626";
              return (
                <div key={cat}>
                  <div className="flex items-center justify-between text-xs mb-0.5">
                    <span className={`font-medium ${cfg.text}`}>{cfg.icon} {cfg.label}</span>
                    <span className="text-slate-400">{n} ({pct}%)</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: barColor }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Monthly trend */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="text-xs text-slate-500 uppercase tracking-wide font-medium mb-3">Tendencia NPS (6 meses)</div>
          <div className="flex items-end gap-1 h-16">
            {meses.map(m => {
              const h = m.n === 0 ? 4 : Math.max(8, Math.min(64, ((m.nps + 100) / 200) * 64));
              const col = m.nps >= 50 ? "#16a34a" : m.nps >= 0 ? "#d97706" : "#dc2626";
              return (
                <div key={m.label} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full rounded-sm" style={{ height: h, background: m.n > 0 ? col : "#e2e8f0", minHeight: 4 }} />
                  <span className="text-[9px] text-slate-400">{m.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* View tabs */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-2">
          {[
            { id: "resumen", label: "Resumen" },
            { id: "lista", label: "Todas las encuestas" },
            { id: "promotores", label: `🌟 Promotores (${promotores.length})` },
          ].map(t => (
            <button key={t.id} onClick={() => setVistaActual(t.id as typeof vistaActual)}
              className={`px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
                vistaActual === t.id ? "border-orange-400 text-white" : "border-slate-200 text-slate-600 hover:border-orange-200 bg-white"
              }`}
              style={vistaActual === t.id ? { background: "#ea650d" } : undefined}>
              {t.label}
            </button>
          ))}
        </div>
        <button onClick={() => setModalNuevo(true)}
          className="px-4 py-2 text-sm text-white rounded-xl font-medium"
          style={{ background: "#ea650d" }}>
          + Registrar encuesta
        </button>
      </div>

      {/* ── RESUMEN view ── */}
      {vistaActual === "resumen" && (
        <div className="space-y-4">
          {/* Detractores alert */}
          {detractores.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <span className="text-2xl">🚨</span>
                <div>
                  <div className="text-sm font-semibold text-red-800">
                    {detractores.length} detractor{detractores.length !== 1 ? "es" : ""} requiere{detractores.length === 1 ? "" : "n"} atención
                  </div>
                  <p className="text-xs text-red-700 mt-1">
                    Clientes con puntuación 0-6 tienen alto riesgo de cancelar. Contacta con ellos en las próximas 48h.
                  </p>
                  <div className="mt-2 space-y-1">
                    {detractores.slice(0, 3).map(r => (
                      <div key={r.id} className="text-xs text-red-700">
                        • {r.cliente_nombre} — puntuación <strong>{r.puntuacion}</strong>
                        {r.motivo_detractor && ` · ${r.motivo_detractor}`}
                      </div>
                    ))}
                    {detractores.length > 3 && <div className="text-xs text-red-500">y {detractores.length - 3} más...</div>}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Promotores info */}
          {promotores.length > 0 && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <span className="text-2xl">🌟</span>
                <div>
                  <div className="text-sm font-semibold text-green-800">
                    {promotores.length} promotor{promotores.length !== 1 ? "es" : ""} — candidatos ideales para pedir referidos
                  </div>
                  <p className="text-xs text-green-700 mt-1">
                    Clientes con 9-10 están muy satisfechos. Este es el mejor momento para pedirles que te recomienden a amigos o familiares.
                  </p>
                </div>
              </div>
            </div>
          )}

          {total === 0 && !cargando && (
            <div className="bg-white rounded-xl border border-dashed border-slate-200 py-16 text-center">
              <div className="text-4xl mb-3">📊</div>
              <p className="text-sm text-slate-400">Sin encuestas NPS aún.</p>
              <p className="text-xs text-slate-300 mt-1">Empieza registrando la satisfacción de tus primeros clientes.</p>
              <button onClick={() => setModalNuevo(true)}
                className="mt-4 px-4 py-2 text-sm text-white rounded-lg"
                style={{ background: "#ea650d" }}>
                + Primera encuesta
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── LISTA view ── */}
      {vistaActual === "lista" && (
        <div className="space-y-2">
          {cargando ? (
            <div className="py-10 text-center text-sm text-slate-400">Cargando...</div>
          ) : respuestasFiltradas.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-400">Sin encuestas en este período.</div>
          ) : (
            respuestasFiltradas.map(r => {
              const cat = categorizarNPS(r.puntuacion);
              const cfg = CAT_CFG[cat];
              return (
                <div key={r.id} className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-start gap-4">
                  {/* Score */}
                  <div className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold border-2 ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                    {r.puntuacion}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-900">{r.cliente_nombre ?? "Cliente"}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.bg} ${cfg.text}`}>
                        {cfg.icon} {cfg.label}
                      </span>
                    </div>
                    {r.comentario && (
                      <p className="text-xs text-slate-600 mt-1 italic">"{r.comentario}"</p>
                    )}
                    {r.motivo_detractor && (
                      <p className="text-xs text-red-500 mt-0.5">Motivo: {r.motivo_detractor}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1.5">
                      {r.comercial_nombre && (
                        <span className="text-xs text-slate-400">{r.comercial_nombre}</span>
                      )}
                      <span className="text-xs text-slate-300">
                        {format(parseISO(r.created_at), "d MMM yyyy", { locale: es })}
                      </span>
                      {r.cliente_telefono && cat === "promotor" && (
                        <a href={`https://wa.me/34${r.cliente_telefono.replace(/\D/g, "")}`}
                          target="_blank" rel="noopener noreferrer"
                          className="text-xs text-green-600 hover:text-green-700 font-medium">
                          📱 Pedir referido
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── PROMOTORES view ── */}
      {vistaActual === "promotores" && (
        <div className="space-y-4">
          <div className="bg-green-50 border border-green-100 rounded-xl p-4">
            <p className="text-sm text-green-800">
              <strong>Script para pedir referidos:</strong> "Hola [nombre], estoy muy contento de que estés satisfecho con tu seguro. Me preguntaba si conoces a alguien más — autónomo o con familia — que podría beneficiarse de algo similar. Si me presentas a alguien, me aseguro de atenderle personalmente."
            </p>
          </div>
          {promotores.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-400">Sin promotores en este período.</div>
          ) : (
            <div className="space-y-2">
              {promotores.map(r => (
                <div key={r.id} className="bg-white rounded-xl border border-green-200 px-4 py-3 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-green-100 border-2 border-green-300 flex items-center justify-center text-lg font-bold text-green-700">
                    {r.puntuacion}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-900">{r.cliente_nombre}</div>
                    {r.comentario && <p className="text-xs text-slate-500 mt-0.5 italic">"{r.comentario}"</p>}
                    <div className="text-xs text-slate-400 mt-0.5">
                      {format(parseISO(r.created_at), "d MMM yyyy", { locale: es })}
                    </div>
                  </div>
                  {r.cliente_telefono && (
                    <a href={`https://wa.me/34${r.cliente_telefono.replace(/\D/g, "")}`}
                      target="_blank" rel="noopener noreferrer"
                      className="shrink-0 px-3 py-1.5 text-xs text-white rounded-lg font-medium"
                      style={{ background: "#25D366" }}>
                      📱 Pedir referido
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal */}
      {modalNuevo && (
        <ModalNPS
          clientes={clientes}
          miId={miId}
          onClose={() => setModalNuevo(false)}
          onSave={() => { setModalNuevo(false); cargar(); }}
        />
      )}
    </div>
  );
}
