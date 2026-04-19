"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { usePermisos } from "@/components/PermisosProvider";
import {
  startOfWeek, endOfWeek, addWeeks, subWeeks, format, parseISO,
  eachDayOfInterval, isToday, isSameDay, startOfMonth, endOfMonth,
} from "date-fns";
import { es } from "date-fns/locale";

// ─── Types ────────────────────────────────────────────────────────────────────

type Plan = {
  id: string;
  comercial_id: string;
  semana_inicio: string;
  objetivo_llamadas: number;
  objetivo_mensajes: number;
  objetivo_citas: number;
  objetivo_cierres: number;
  objetivo_referidos: number;
  notas: string | null;
};

type Actuals = {
  llamadas: number;
  mensajes: number;
  citas: number;
  cierres: number;
};

type ComercialPlan = {
  id: string;
  nombre: string;
  apellidos: string | null;
  plan: Plan | null;
  actuals: Actuals;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getLunesDeEstaSemana(offset = 0): Date {
  const hoy = new Date();
  const lunes = startOfWeek(addWeeks(hoy, offset), { weekStartsOn: 1 });
  return lunes;
}

function formatSemana(lunes: Date): string {
  const viernes = addWeeks(lunes, 0);
  const dom = endOfWeek(lunes, { weekStartsOn: 1 });
  return `${format(lunes, "d MMM", { locale: es })} – ${format(dom, "d MMM yyyy", { locale: es })}`;
}

function pctColor(val: number, objetivo: number): string {
  if (objetivo === 0) return "bg-slate-200";
  const pct = val / objetivo;
  if (pct >= 1) return "bg-green-500";
  if (pct >= 0.7) return "bg-amber-400";
  return "bg-red-400";
}

function pctNum(val: number, objetivo: number): number {
  if (objetivo === 0) return 0;
  return Math.min(100, Math.round((val / objetivo) * 100));
}

const SEMAFORO = (val: number, obj: number) => {
  if (obj === 0) return "text-slate-400";
  const p = val / obj;
  if (p >= 1) return "text-green-600";
  if (p >= 0.5) return "text-amber-600";
  return "text-red-500";
};

// ─── KPI row component ────────────────────────────────────────────────────────

function KPIRow({
  label, icon, actual, objetivo, editable, onEdit,
}: {
  label: string; icon: string; actual: number; objetivo: number;
  editable: boolean; onEdit?: (val: number) => void;
}) {
  const [editVal, setEditVal] = useState<string>(objetivo.toString());
  const [editing, setEditing] = useState(false);

  return (
    <div className="flex items-center gap-3 py-2 border-b border-slate-50 last:border-0">
      <span className="text-base w-6 shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-slate-600">{label}</span>
          <span className={`text-xs font-bold ${SEMAFORO(actual, objetivo)}`}>
            {actual}{objetivo > 0 ? `/${objetivo}` : ""}
          </span>
        </div>
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${pctColor(actual, objetivo)}`}
            style={{ width: `${pctNum(actual, objetivo)}%` }} />
        </div>
      </div>
      {editable && (
        <div className="shrink-0">
          {editing ? (
            <div className="flex items-center gap-1">
              <input type="number" value={editVal} onChange={e => setEditVal(e.target.value)}
                className="w-12 text-xs text-center border border-orange-300 rounded px-1 py-0.5 focus:outline-none" min={0} max={200} />
              <button onClick={() => { onEdit?.(parseInt(editVal) || 0); setEditing(false); }}
                className="text-xs text-green-600 hover:text-green-700 font-medium">✓</button>
            </div>
          ) : (
            <button onClick={() => { setEditVal(objetivo.toString()); setEditing(true); }}
              className="text-xs text-slate-400 hover:text-orange-500">
              ✏️
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PlanificacionPage() {
  const { puede, cargando: cargandoPermisos } = usePermisos();
  const [semanaOffset, setSemanaOffset] = useState(0);
  const [miId, setMiId] = useState<string | null>(null);
  const [miPlan, setMiPlan] = useState<Plan | null>(null);
  const [actuals, setActuals] = useState<Actuals>({ llamadas: 0, mensajes: 0, citas: 0, cierres: 0 });
  const [equipoPlanes, setEquipoPlanes] = useState<ComercialPlan[]>([]);
  const [cargando, setCargando] = useState(true);
  const [esGestor, setEsGestor] = useState(false);
  const [vistaActual, setVistaActual] = useState<"mi_plan" | "equipo">("mi_plan");
  const [guardando, setGuardando] = useState(false);
  const [notas, setNotas] = useState("");

  const lunes = getLunesDeEstaSemana(semanaOffset);
  const viernes = endOfWeek(lunes, { weekStartsOn: 1 });
  const semanaInicioStr = format(lunes, "yyyy-MM-dd");

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

    if (!cId) { setCargando(false); return; }

    // Load my plan for this week
    const { data: plan } = await supabase
      .from("planes_semana")
      .select("*")
      .eq("comercial_id", cId)
      .eq("semana_inicio", semanaInicioStr)
      .single();

    setMiPlan(plan ?? null);
    setNotas(plan?.notas ?? "");

    // Load actuals for this week
    const [{ data: llamadas }, { data: mensajes }, { data: citas }, { data: cierres }] = await Promise.all([
      supabase.from("interactions")
        .select("id", { count: "exact", head: true })
        .eq("tipo", "llamada")
        .gte("created_at", lunes.toISOString())
        .lte("created_at", viernes.toISOString()),
      supabase.from("interactions")
        .select("id", { count: "exact", head: true })
        .in("tipo", ["whatsapp", "mensaje"])
        .gte("created_at", lunes.toISOString())
        .lte("created_at", viernes.toISOString()),
      supabase.from("appointments")
        .select("id", { count: "exact", head: true })
        .eq("comercial_id", cId)
        .gte("created_at", lunes.toISOString())
        .lte("created_at", viernes.toISOString()),
      supabase.from("clientes")
        .select("id", { count: "exact", head: true })
        .eq("comercial_asignado", cId)
        .gte("created_at", lunes.toISOString())
        .lte("created_at", viernes.toISOString()),
    ]);

    setActuals({
      llamadas: (llamadas as unknown as { count: number })?.count ?? 0,
      mensajes: (mensajes as unknown as { count: number })?.count ?? 0,
      citas: (citas as unknown as { count: number })?.count ?? 0,
      cierres: (cierres as unknown as { count: number })?.count ?? 0,
    });

    // Load team plans if director
    if (esDir) {
      const [{ data: coms }, { data: todosPlanes }] = await Promise.all([
        supabase.from("comerciales").select("id, nombre, apellidos").eq("activo", true).order("nombre"),
        supabase.from("planes_semana").select("*").eq("semana_inicio", semanaInicioStr),
      ]);

      const planesMap: Record<string, Plan> = {};
      for (const p of todosPlanes ?? []) planesMap[p.comercial_id] = p;

      // For actuals per comercial — load cierres this week
      const { data: cierresEquipo } = await supabase
        .from("clientes")
        .select("comercial_asignado")
        .gte("created_at", lunes.toISOString())
        .lte("created_at", viernes.toISOString());

      const cierresMap: Record<string, number> = {};
      for (const c of cierresEquipo ?? []) {
        if (c.comercial_asignado) cierresMap[c.comercial_asignado] = (cierresMap[c.comercial_asignado] ?? 0) + 1;
      }

      setEquipoPlanes((coms ?? []).map(c => ({
        id: c.id,
        nombre: c.nombre,
        apellidos: c.apellidos,
        plan: planesMap[c.id] ?? null,
        actuals: {
          llamadas: 0, mensajes: 0,
          citas: 0,
          cierres: cierresMap[c.id] ?? 0,
        },
      })));
    }

    setCargando(false);
  }, [semanaOffset]);

  useEffect(() => { cargar(); }, [cargar]);

  async function actualizarObjetivo(campo: keyof Plan, valor: number) {
    if (!miId) return;
    setGuardando(true);
    if (miPlan) {
      await supabase.from("planes_semana").update({ [campo]: valor, updated_at: new Date().toISOString() }).eq("id", miPlan.id);
      setMiPlan(prev => prev ? { ...prev, [campo]: valor } : null);
    } else {
      const payload: Partial<Plan> & { comercial_id: string; semana_inicio: string } = {
        comercial_id: miId,
        semana_inicio: semanaInicioStr,
        objetivo_llamadas: 0,
        objetivo_mensajes: 0,
        objetivo_citas: 0,
        objetivo_cierres: 0,
        objetivo_referidos: 0,
        [campo]: valor,
      };
      const { data } = await supabase.from("planes_semana").insert(payload).select().single();
      setMiPlan(data);
    }
    setGuardando(false);
  }

  async function guardarNotas() {
    if (!miId) return;
    if (miPlan) {
      await supabase.from("planes_semana").update({ notas, updated_at: new Date().toISOString() }).eq("id", miPlan.id);
    } else {
      const { data } = await supabase.from("planes_semana").upsert({
        comercial_id: miId,
        semana_inicio: semanaInicioStr,
        objetivo_llamadas: 0,
        objetivo_mensajes: 0,
        objetivo_citas: 0,
        objetivo_cierres: 0,
        objetivo_referidos: 0,
        notas,
      }, { onConflict: "comercial_id,semana_inicio" }).select().single();
      setMiPlan(data);
    }
  }

  // ── Week score ─────────────────────────────────────────────────────────────

  const objetivos = miPlan ? [
    miPlan.objetivo_llamadas, miPlan.objetivo_mensajes,
    miPlan.objetivo_citas, miPlan.objetivo_cierres,
  ] : [0, 0, 0, 0];
  const actualsArr = [actuals.llamadas, actuals.mensajes, actuals.citas, actuals.cierres];
  const totalObjetivos = objetivos.reduce((s, v) => s + v, 0);
  const totalActuals = actualsArr.reduce((s, v, i) => s + Math.min(v, objetivos[i]), 0);
  const scoreSemana = totalObjetivos > 0 ? Math.round((totalActuals / totalObjetivos) * 100) : 0;

  const dias = eachDayOfInterval({ start: lunes, end: viernes });

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Planificación semanal</h1>
          <p className="text-sm text-slate-500 mt-0.5">Define tus objetivos cada semana y mide tu progreso en tiempo real</p>
        </div>
        {/* Week navigation */}
        <div className="flex items-center gap-2">
          <button onClick={() => setSemanaOffset(o => o - 1)}
            className="w-8 h-8 flex items-center justify-center border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600">
            ‹
          </button>
          <div className="text-sm font-medium text-slate-700 px-2 min-w-[180px] text-center">
            {semanaOffset === 0 ? "Esta semana" : semanaOffset === 1 ? "Próxima semana" : semanaOffset === -1 ? "Semana pasada" : formatSemana(lunes)}
          </div>
          <button onClick={() => setSemanaOffset(o => o + 1)}
            className="w-8 h-8 flex items-center justify-center border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600">
            ›
          </button>
          {semanaOffset !== 0 && (
            <button onClick={() => setSemanaOffset(0)}
              className="text-xs text-orange-600 hover:text-orange-700 ml-1">Hoy</button>
          )}
        </div>
      </div>

      {/* Week range */}
      <div className="text-sm text-slate-500">{formatSemana(lunes)}</div>

      {/* View tabs for managers */}
      {esGestor && (
        <div className="flex gap-2">
          <button onClick={() => setVistaActual("mi_plan")}
            className={`px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${vistaActual === "mi_plan" ? "border-orange-400 text-white" : "border-slate-200 text-slate-600 bg-white hover:border-orange-200"}`}
            style={vistaActual === "mi_plan" ? { background: "#ea650d" } : undefined}>
            Mi plan
          </button>
          <button onClick={() => setVistaActual("equipo")}
            className={`px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${vistaActual === "equipo" ? "border-orange-400 text-white" : "border-slate-200 text-slate-600 bg-white hover:border-orange-200"}`}
            style={vistaActual === "equipo" ? { background: "#ea650d" } : undefined}>
            Equipo
          </button>
        </div>
      )}

      {/* ── MI PLAN view ── */}
      {vistaActual === "mi_plan" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left: KPIs */}
          <div className="lg:col-span-2 space-y-3">
            {/* Week score */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 flex items-center gap-5">
              <div className="relative shrink-0">
                <svg width="80" height="80" viewBox="0 0 80 80">
                  <circle cx="40" cy="40" r="34" fill="none" stroke="#f1edeb" strokeWidth="8" />
                  <circle cx="40" cy="40" r="34" fill="none"
                    stroke={scoreSemana >= 80 ? "#16a34a" : scoreSemana >= 50 ? "#d97706" : "#dc2626"}
                    strokeWidth="8" strokeLinecap="round"
                    strokeDasharray={`${(scoreSemana / 100) * 213.6} 213.6`}
                    transform="rotate(-90 40 40)" />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-lg font-bold text-slate-900">{scoreSemana}%</span>
                </div>
              </div>
              <div>
                <div className="text-base font-semibold text-slate-800">Progreso de la semana</div>
                <div className="text-sm text-slate-400 mt-0.5">
                  {semanaOffset === 0 ? (
                    scoreSemana >= 80 ? "¡Semana excelente! Sigue así." :
                    scoreSemana >= 50 ? "Buen ritmo. Empuja un poco más." :
                    "Hay que acelerar. Tienes tiempo."
                  ) : "Semana finalizada"}
                </div>
                {!miPlan && semanaOffset === 0 && (
                  <div className="text-xs text-amber-600 mt-1 font-medium">
                    ⚠️ Sin plan esta semana — define tus objetivos abajo
                  </div>
                )}
              </div>
            </div>

            {/* KPIs */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <div className="text-sm font-semibold text-slate-700 mb-3">Objetivos de la semana</div>
              <KPIRow label="Llamadas" icon="📞" actual={actuals.llamadas} objetivo={miPlan?.objetivo_llamadas ?? 0}
                editable={semanaOffset === 0} onEdit={v => actualizarObjetivo("objetivo_llamadas", v)} />
              <KPIRow label="Mensajes WhatsApp" icon="💬" actual={actuals.mensajes} objetivo={miPlan?.objetivo_mensajes ?? 0}
                editable={semanaOffset === 0} onEdit={v => actualizarObjetivo("objetivo_mensajes", v)} />
              <KPIRow label="Citas agendadas" icon="📅" actual={actuals.citas} objetivo={miPlan?.objetivo_citas ?? 0}
                editable={semanaOffset === 0} onEdit={v => actualizarObjetivo("objetivo_citas", v)} />
              <KPIRow label="Cierres" icon="✅" actual={actuals.cierres} objetivo={miPlan?.objetivo_cierres ?? 0}
                editable={semanaOffset === 0} onEdit={v => actualizarObjetivo("objetivo_cierres", v)} />
              {semanaOffset === 0 && (
                <p className="text-xs text-slate-400 mt-3">✏️ Pulsa el lápiz para editar un objetivo</p>
              )}
            </div>

            {/* Day headers */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <div className="text-sm font-semibold text-slate-700 mb-3">Días de la semana</div>
              <div className="flex gap-2">
                {dias.map(d => {
                  const hoy = isToday(d);
                  const pasado = d < new Date() && !hoy;
                  return (
                    <div key={d.toISOString()} className={`flex-1 text-center py-2.5 rounded-xl text-xs font-medium ${
                      hoy ? "text-white" : pasado ? "bg-slate-50 text-slate-400" : "bg-slate-50 text-slate-600"
                    }`} style={hoy ? { background: "#ea650d" } : undefined}>
                      <div>{format(d, "EEE", { locale: es })}</div>
                      <div className="text-base font-bold mt-0.5">{format(d, "d")}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right: Notes + quick stats */}
          <div className="space-y-3">
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <div className="text-sm font-semibold text-slate-700 mb-3">Notas de la semana</div>
              <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={8}
                placeholder="Leads prioritarios, recordatorios, objetivos especiales..."
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-orange-400 resize-none" />
              {semanaOffset === 0 && (
                <button onClick={guardarNotas}
                  className="mt-2 w-full py-2 text-xs text-white rounded-lg font-medium"
                  style={{ background: "#ea650d" }}>
                  Guardar notas
                </button>
              )}
            </div>

            {/* Consejos */}
            <div className="bg-orange-50 border border-orange-100 rounded-2xl p-4">
              <div className="text-xs font-semibold text-orange-800 mb-2">💡 Consejo de la semana</div>
              <p className="text-xs text-orange-700 leading-relaxed">
                Los mejores comerciales hacen el 80% de sus llamadas antes del mediodía. Programa tus llamadas de 9 a 12 y deja las tardes para seguimiento y propuestas.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── EQUIPO view ── */}
      {vistaActual === "equipo" && esGestor && (
        <div className="space-y-3">
          {equipoPlanes.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-400">Sin datos del equipo.</div>
          ) : (
            <>
              <p className="text-sm text-slate-500">
                {equipoPlanes.filter(c => c.plan).length} de {equipoPlanes.length} agentes han creado plan para esta semana
              </p>
              <div className="space-y-2">
                {equipoPlanes.map(c => {
                  const p = c.plan;
                  const totalObj = p ? p.objetivo_llamadas + p.objetivo_mensajes + p.objetivo_citas + p.objetivo_cierres : 0;
                  const totalAct = c.actuals.llamadas + c.actuals.mensajes + c.actuals.citas + c.actuals.cierres;
                  const pct = totalObj > 0 ? Math.min(100, Math.round((totalAct / totalObj) * 100)) : 0;
                  return (
                    <div key={c.id} className="bg-white rounded-xl border border-slate-200 px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-slate-800">{c.nombre} {c.apellidos ?? ""}</span>
                            {!p && (
                              <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">Sin plan</span>
                            )}
                          </div>
                          {p && (
                            <div className="text-xs text-slate-400 mt-0.5">
                              📞{p.objetivo_llamadas} · 💬{p.objetivo_mensajes} · 📅{p.objetivo_citas} · ✅{p.objetivo_cierres}
                            </div>
                          )}
                          {p && (
                            <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${pctColor(totalAct, totalObj)}`}
                                style={{ width: `${pct}%` }} />
                            </div>
                          )}
                        </div>
                        {p && (
                          <div className={`text-lg font-bold ${pct >= 80 ? "text-green-600" : pct >= 50 ? "text-amber-600" : "text-red-500"}`}>
                            {pct}%
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
