"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { usePermisos } from "@/components/PermisosProvider";
import {
  addDays, startOfDay, format, parseISO, isToday, isTomorrow,
  differenceInDays, isBefore, startOfWeek, endOfWeek, eachDayOfInterval,
} from "date-fns";
import { es } from "date-fns/locale";

// ─── Types ──────────────────────────────────────────────────────────────────

type SeguimientoItem = {
  id: string;
  nombre: string;
  apellidos: string | null;
  empresa: string | null;
  sector: string | null;
  ciudad: string | null;
  telefono_whatsapp: string | null;
  estado: string;
  temperatura: string;
  nivel_interes: number;
  proxima_accion: string | null;
  proxima_accion_fecha: string;
  proxima_accion_nota: string | null;
  comercial_asignado: string | null;
  comercial_nombre?: string;
  // computed
  diaKey: string;
  vencido: boolean;
};

// ─── Constants ───────────────────────────────────────────────────────────────

const ACCION_CFG: Record<string, { label: string; emoji: string; bg: string; text: string }> = {
  llamar:       { label: "Llamar",      emoji: "📞", bg: "bg-blue-50",   text: "text-blue-700"   },
  whatsapp:     { label: "WhatsApp",    emoji: "💬", bg: "bg-green-50",  text: "text-green-700"  },
  email:        { label: "Email",       emoji: "📧", bg: "bg-purple-50", text: "text-purple-700" },
  cita:         { label: "Cita",        emoji: "📅", bg: "bg-orange-50", text: "text-orange-700" },
  seguimiento:  { label: "Seguimiento", emoji: "🔄", bg: "bg-slate-50",  text: "text-slate-600"  },
  enviar_info:  { label: "Enviar info", emoji: "📤", bg: "bg-cyan-50",   text: "text-cyan-700"   },
};

const TEMP_COLOR: Record<string, string> = {
  caliente: "bg-red-100 text-red-700",
  templado: "bg-amber-100 text-amber-700",
  frio: "bg-blue-100 text-blue-700",
};

const ESTADO_LABEL: Record<string, string> = {
  nuevo: "Nuevo", segmentado: "Segmentado", mensaje_enviado: "Contactado",
  respondio: "Respondió", cita_agendada: "Cita", en_negociacion: "Negociación",
};

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SeguimientoPage() {
  const { puede, cargando: cargandoPermisos } = usePermisos();
  const [items, setItems] = useState<SeguimientoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [semanaOffset, setSemanaOffset] = useState(0); // 0 = esta semana, 1 = próxima, -1 = pasada
  const [vistaMode, setVistaMode] = useState<"semana" | "lista">("semana");
  const [filtroComercial, setFiltroComercial] = useState("todos");
  const [filtroAccion, setFiltroAccion] = useState("");
  const [comerciales, setComerciales] = useState<{ id: string; nombre: string }[]>([]);
  const [miId, setMiId] = useState<string | null>(null);
  const [completando, setCompletando] = useState<string | null>(null);

  const hoy = useMemo(() => startOfDay(new Date()), []);
  const semanaInicio = useMemo(() => startOfWeek(addDays(hoy, semanaOffset * 7), { weekStartsOn: 1 }), [hoy, semanaOffset]);
  const semanaFin = useMemo(() => endOfWeek(semanaInicio, { weekStartsOn: 1 }), [semanaInicio]);
  const diasSemana = useMemo(() => eachDayOfInterval({ start: semanaInicio, end: semanaFin }), [semanaInicio, semanaFin]);

  useEffect(() => {
    async function cargarMiId() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) return;
      const { data: com } = await supabase.from("comerciales").select("id").eq("email", user.email).single();
      setMiId(com?.id ?? null);
    }
    cargarMiId();
    supabase.from("comerciales").select("id, nombre").eq("activo", true).order("nombre")
      .then(({ data }) => setComerciales(data ?? []));
  }, []);

  const cargar = useCallback(async () => {
    setLoading(true);
    const desde = addDays(hoy, -14); // incluye vencidas de las últimas 2 semanas
    const hasta = addDays(semanaFin, 30); // y próximos 30 días extra

    let q = supabase.from("leads")
      .select("id, nombre, apellidos, empresa, sector, ciudad, telefono_whatsapp, estado, temperatura, nivel_interes, proxima_accion, proxima_accion_fecha, proxima_accion_nota, comercial_asignado")
      .not("proxima_accion_fecha", "is", null)
      .not("proxima_accion", "is", null)
      .neq("proxima_accion", "ninguna")
      .gte("proxima_accion_fecha", desde.toISOString())
      .lte("proxima_accion_fecha", hasta.toISOString())
      .not("estado", "in", "(cerrado_ganado,cerrado_perdido,descartado)")
      .order("proxima_accion_fecha")
      .limit(400);

    if (!puede("ver_metricas") && miId) q = q.eq("comercial_asignado", miId);
    else if (filtroComercial !== "todos") q = q.eq("comercial_asignado", filtroComercial);
    if (filtroAccion) q = q.eq("proxima_accion", filtroAccion);

    const { data } = await q;

    const comIds = [...new Set((data ?? []).map(r => r.comercial_asignado).filter(Boolean))] as string[];
    const { data: comsData } = comIds.length > 0
      ? await supabase.from("comerciales").select("id, nombre").in("id", comIds)
      : { data: [] };
    const comMap = new Map((comsData ?? []).map(c => [c.id, c.nombre]));

    const enriched: SeguimientoItem[] = (data ?? [])
      .filter(l => l.proxima_accion_fecha)
      .map(l => ({
        ...l,
        proxima_accion_fecha: l.proxima_accion_fecha!,
        comercial_nombre: l.comercial_asignado ? comMap.get(l.comercial_asignado) : undefined,
        diaKey: l.proxima_accion_fecha!.slice(0, 10),
        vencido: isBefore(parseISO(l.proxima_accion_fecha!), hoy),
      }));

    setItems(enriched);
    setLoading(false);
  }, [puede, miId, filtroComercial, filtroAccion, semanaOffset, semanaFin, hoy]);

  useEffect(() => {
    if (!cargandoPermisos) cargar();
  }, [cargar, cargandoPermisos]);

  async function marcarCompletado(leadId: string) {
    setCompletando(leadId);
    await supabase.from("leads").update({
      proxima_accion: null,
      proxima_accion_fecha: null,
      proxima_accion_nota: null,
      updated_at: new Date().toISOString(),
    }).eq("id", leadId);
    setCompletando(null);
    cargar();
  }

  // KPIs
  const vencidos = items.filter(i => i.vencido).length;
  const hoyItems = items.filter(i => i.diaKey === format(hoy, "yyyy-MM-dd")).length;
  const semanaItems = items.filter(i => {
    const d = parseISO(i.proxima_accion_fecha);
    return d >= semanaInicio && d <= semanaFin;
  }).length;

  // Group by day for semana view
  const itemsByDay = new Map<string, SeguimientoItem[]>();
  for (const item of items) {
    const k = item.diaKey;
    if (!itemsByDay.has(k)) itemsByDay.set(k, []);
    itemsByDay.get(k)!.push(item);
  }

  function LeadCard({ item }: { item: SeguimientoItem }) {
    const cfg = item.proxima_accion ? ACCION_CFG[item.proxima_accion] : null;
    return (
      <div className={`bg-white rounded-lg border ${item.vencido ? "border-red-200" : "border-slate-200"} px-3 py-2.5 hover:border-orange-200 transition-colors`}>
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <Link href={`/leads/${item.id}`} className="text-sm font-medium text-slate-800 hover:text-orange-600 leading-tight block truncate">
              {item.nombre} {item.apellidos}
            </Link>
            {item.empresa && <p className="text-xs text-slate-400 truncate">{item.empresa}</p>}
            <div className="flex flex-wrap gap-1 mt-1">
              {cfg && (
                <span className={`text-xs px-1.5 py-0.5 rounded text-xs font-medium ${cfg.bg} ${cfg.text}`}>
                  {cfg.emoji} {cfg.label}
                </span>
              )}
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${TEMP_COLOR[item.temperatura] ?? "bg-slate-100 text-slate-500"}`}>
                {item.temperatura}
              </span>
            </div>
            {item.proxima_accion_nota && (
              <p className="text-xs text-slate-400 mt-1 line-clamp-1 italic">"{item.proxima_accion_nota}"</p>
            )}
            {puede("ver_metricas") && item.comercial_nombre && (
              <p className="text-xs text-slate-300 mt-0.5">{item.comercial_nombre}</p>
            )}
          </div>
          <div className="shrink-0 flex flex-col gap-1">
            {item.telefono_whatsapp && (
              <a href={`https://wa.me/${item.telefono_whatsapp.replace(/\D/g, "")}`}
                target="_blank" rel="noopener noreferrer"
                className="text-xs bg-green-50 text-green-700 border border-green-200 rounded px-1.5 py-0.5 hover:bg-green-100 transition-colors font-medium">
                💬
              </a>
            )}
            <button onClick={() => marcarCompletado(item.id)} disabled={completando === item.id}
              className="text-xs bg-slate-50 text-slate-500 border border-slate-200 rounded px-1.5 py-0.5 hover:bg-green-50 hover:border-green-200 hover:text-green-700 transition-colors font-medium">
              {completando === item.id ? "..." : "✓"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Plan de seguimiento</h1>
          <p className="text-sm text-slate-500 mt-0.5">Todas las acciones programadas, organizadas por día</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
            <button onClick={() => setVistaMode("semana")}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${vistaMode === "semana" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>
              Semana
            </button>
            <button onClick={() => setVistaMode("lista")}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${vistaMode === "lista" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>
              Lista
            </button>
          </div>
        </div>
      </div>

      {/* KPI strip */}
      {!loading && (
        <div className="grid grid-cols-3 gap-3">
          <div className={`rounded-xl border px-4 py-3 ${vencidos > 0 ? "bg-red-50 border-red-200" : "bg-white border-slate-200"}`}>
            <p className="text-xs font-semibold text-slate-500 mb-1">Vencidas</p>
            <p className={`text-2xl font-bold ${vencidos > 0 ? "text-red-700" : "text-slate-400"}`}>{vencidos}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
            <p className="text-xs font-semibold text-slate-500 mb-1">Hoy</p>
            <p className="text-2xl font-bold text-orange-600">{hoyItems}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
            <p className="text-xs font-semibold text-slate-500 mb-1">Esta semana</p>
            <p className="text-2xl font-bold text-slate-700">{semanaItems}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Semana nav */}
        {vistaMode === "semana" && (
          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
            <button onClick={() => setSemanaOffset(o => o - 1)}
              className="px-2 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 rounded-md">←</button>
            <button onClick={() => setSemanaOffset(0)}
              className="px-3 py-1.5 text-xs font-medium text-slate-600 rounded-md hover:bg-white">
              {semanaOffset === 0 ? "Esta semana" : semanaOffset === 1 ? "Próxima semana" : semanaOffset === -1 ? "Semana pasada" : `Semana ${semanaOffset > 0 ? "+" : ""}${semanaOffset}`}
            </button>
            <button onClick={() => setSemanaOffset(o => o + 1)}
              className="px-2 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 rounded-md">→</button>
          </div>
        )}
        <select value={filtroAccion} onChange={e => setFiltroAccion(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:border-orange-300">
          <option value="">Todas las acciones</option>
          {Object.entries(ACCION_CFG).map(([k, v]) => (
            <option key={k} value={k}>{v.emoji} {v.label}</option>
          ))}
        </select>
        {puede("ver_metricas") && comerciales.length > 1 && (
          <select value={filtroComercial} onChange={e => setFiltroComercial(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:border-orange-300">
            <option value="todos">Todos</option>
            {comerciales.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        )}
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm text-slate-400">Cargando plan de seguimiento...</div>
      ) : vistaMode === "semana" ? (
        /* ── Week grid ── */
        <div className="grid grid-cols-7 gap-2">
          {diasSemana.map(dia => {
            const key = format(dia, "yyyy-MM-dd");
            const esHoy = isToday(dia);
            const esFinde = dia.getDay() === 0 || dia.getDay() === 6;
            const del_dia = itemsByDay.get(key) ?? [];
            // Also show vencidos on Monday column
            const vencidosDia = key === format(semanaInicio, "yyyy-MM-dd")
              ? items.filter(i => i.vencido && i.diaKey < format(semanaInicio, "yyyy-MM-dd"))
              : [];

            return (
              <div key={key} className={`min-h-[120px] rounded-xl border overflow-hidden ${esFinde ? "opacity-60" : ""} ${esHoy ? "border-orange-400" : "border-slate-200"}`}>
                <div className={`px-2 py-1.5 border-b text-center ${esHoy ? "bg-orange-500 border-orange-500" : esFinde ? "bg-slate-100 border-slate-200" : "bg-slate-50 border-slate-100"}`}>
                  <p className={`text-[10px] font-semibold uppercase tracking-wide ${esHoy ? "text-white" : "text-slate-500"}`}>
                    {format(dia, "EEE", { locale: es })}
                  </p>
                  <p className={`text-base font-bold leading-tight ${esHoy ? "text-white" : "text-slate-700"}`}>
                    {format(dia, "d")}
                  </p>
                  {del_dia.length > 0 && (
                    <span className={`text-[10px] font-semibold px-1.5 rounded-full ${esHoy ? "bg-white/20 text-white" : "bg-orange-100 text-orange-700"}`}>
                      {del_dia.length}
                    </span>
                  )}
                </div>
                <div className="p-1.5 space-y-1">
                  {vencidosDia.map(item => (
                    <div key={item.id} className="bg-red-50 border border-red-200 rounded px-1.5 py-1">
                      <p className="text-[10px] font-semibold text-red-600 truncate">⚠️ {item.nombre}</p>
                      <p className="text-[9px] text-red-400">{item.diaKey.slice(5).replace("-", "/")}</p>
                    </div>
                  ))}
                  {del_dia.slice(0, 4).map(item => {
                    const cfg = item.proxima_accion ? ACCION_CFG[item.proxima_accion] : null;
                    return (
                      <Link key={item.id} href={`/leads/${item.id}`}
                        className={`block rounded px-1.5 py-1 border hover:border-orange-300 transition-colors ${cfg?.bg ?? "bg-slate-50"} border-slate-200`}>
                        <p className="text-[10px] font-medium truncate" style={{ color: "inherit" }}>
                          {cfg?.emoji ?? "•"} {item.nombre}
                        </p>
                        {item.empresa && (
                          <p className="text-[9px] text-slate-400 truncate">{item.empresa}</p>
                        )}
                      </Link>
                    );
                  })}
                  {del_dia.length > 4 && (
                    <p className="text-[10px] text-slate-400 text-center">+{del_dia.length - 4} más</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ── List view ── */
        <div className="space-y-6">
          {/* Vencidos */}
          {items.filter(i => i.vencido).length > 0 && (
            <div>
              <h2 className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-2">
                ⚠️ Vencidas — {items.filter(i => i.vencido).length} acciones sin realizar
              </h2>
              <div className="space-y-2">
                {items.filter(i => i.vencido).map(item => <LeadCard key={item.id} item={item} />)}
              </div>
            </div>
          )}

          {/* Future days */}
          {Array.from({ length: 14 }, (_, i) => {
            const dia = addDays(hoy, i);
            const key = format(dia, "yyyy-MM-dd");
            const del_dia = itemsByDay.get(key) ?? [];
            if (del_dia.length === 0) return null;
            return (
              <div key={key}>
                <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                  {isToday(dia) ? "📍 Hoy" : isTomorrow(dia) ? "⏭ Mañana" : format(dia, "EEEE d 'de' MMMM", { locale: es })}
                  <span className="ml-2 text-slate-400 normal-case font-normal">{del_dia.length} acciones</span>
                </h2>
                <div className="space-y-2">
                  {del_dia.map(item => <LeadCard key={item.id} item={item} />)}
                </div>
              </div>
            );
          })}

          {items.filter(i => !i.vencido).length === 0 && (
            <div className="py-16 text-center text-sm text-slate-400">
              No hay acciones programadas para los próximos 14 días.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
