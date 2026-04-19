"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { usePermisos } from "@/components/PermisosProvider";
import { SinAcceso } from "@/components/SinAcceso";
import { differenceInDays, parseISO } from "date-fns";

// ─── Types ──────────────────────────────────────────────────────────────────

type ClienteRiesgo = {
  id: string;
  nombre: string;
  apellidos: string | null;
  empresa: string | null;
  telefono: string | null;
  producto: string | null;
  valor_contrato: number | null;
  fecha_inicio: string | null;
  fecha_renovacion: string | null;
  estado: string;
  comercial_asignado: string | null;
  lead_id: string | null;
  comercial_nombre?: string;
  // computed
  riesgoScore: number;
  riesgoNivel: "critico" | "alto" | "medio" | "bajo";
  diasSinContacto: number;
  diasParaRenovacion: number | null;
  factores: string[];
};

// ─── Constants ───────────────────────────────────────────────────────────────

const PRODUCTOS_LABEL: Record<string, string> = {
  contigo_autonomo: "Contigo Autónomo", contigo_pyme: "Contigo Pyme",
  contigo_familia: "Contigo Familia", contigo_futuro: "Contigo Futuro",
  contigo_senior: "Contigo Senior", sialp: "SIALP", liderplus: "LiderPlus",
  sanitas_salud: "Sanitas Salud", mihogar: "MiHogar", hipotecas: "Hipoteca",
};

const RIESGO_CFG: Record<string, { label: string; bg: string; border: string; text: string; dot: string }> = {
  critico: { label: "Crítico",  bg: "bg-red-50",    border: "border-red-300",    text: "text-red-700",    dot: "bg-red-500"    },
  alto:    { label: "Alto",     bg: "bg-orange-50",  border: "border-orange-300", text: "text-orange-700", dot: "bg-orange-500" },
  medio:   { label: "Medio",    bg: "bg-amber-50",   border: "border-amber-200",  text: "text-amber-700",  dot: "bg-amber-400"  },
  bajo:    { label: "Bajo",     bg: "bg-green-50",   border: "border-green-200",  text: "text-green-700",  dot: "bg-green-400"  },
};

function calcularRiesgo(cliente: Omit<ClienteRiesgo, "riesgoScore" | "riesgoNivel" | "diasSinContacto" | "diasParaRenovacion" | "factores">, ultimoContacto: Date | null): {
  score: number; nivel: "critico" | "alto" | "medio" | "bajo"; factores: string[]; diasSinContacto: number; diasParaRenovacion: number | null;
} {
  let score = 0;
  const factores: string[] = [];
  const ahora = new Date();

  // Días sin contacto
  const diasContacto = ultimoContacto ? differenceInDays(ahora, ultimoContacto) : 999;
  if (diasContacto > 90) { score += 35; factores.push(`sin contacto ${diasContacto}d`); }
  else if (diasContacto > 45) { score += 20; factores.push(`sin contacto ${diasContacto}d`); }
  else if (diasContacto > 14) { score += 8; }

  // Renovación próxima
  let diasRenovacion: number | null = null;
  if (cliente.fecha_renovacion) {
    diasRenovacion = differenceInDays(parseISO(cliente.fecha_renovacion), ahora);
    if (diasRenovacion < 0)  { score += 50; factores.push("renovación vencida"); }
    else if (diasRenovacion <= 7)  { score += 40; factores.push(`renovación en ${diasRenovacion}d`); }
    else if (diasRenovacion <= 30) { score += 25; factores.push(`renovación en ${diasRenovacion}d`); }
    else if (diasRenovacion <= 60) { score += 10; }
  } else {
    score += 5; // sin fecha de renovación = riesgo latente
  }

  // Estado del cliente
  if (cliente.estado === "pendiente") { score += 15; factores.push("contrato pendiente"); }
  else if (cliente.estado === "cancelado") { score += 100; }

  // Sin asignar a comercial
  if (!cliente.comercial_asignado) { score += 20; factores.push("sin comercial asignado"); }

  // Sin teléfono
  if (!cliente.telefono) { score += 10; factores.push("sin teléfono"); }

  let nivel: "critico" | "alto" | "medio" | "bajo" = "bajo";
  if (score >= 60) nivel = "critico";
  else if (score >= 35) nivel = "alto";
  else if (score >= 15) nivel = "medio";

  return { score: Math.min(100, score), nivel, factores: factores.slice(0, 3), diasSinContacto: diasContacto, diasParaRenovacion: diasRenovacion };
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RetencionPage() {
  const { puede, cargando: cargandoPermisos } = usePermisos();
  const [clientes, setClientes] = useState<ClienteRiesgo[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroNivel, setFiltroNivel] = useState<"" | "critico" | "alto" | "medio" | "bajo">("");
  const [filtroComercial, setFiltroComercial] = useState("todos");
  const [comerciales, setComerciales] = useState<{ id: string; nombre: string }[]>([]);
  const [miId, setMiId] = useState<string | null>(null);
  const [limite, setLimite] = useState(30);

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

    let q = supabase.from("clientes")
      .select("id, nombre, apellidos, empresa, telefono, producto, valor_contrato, fecha_inicio, fecha_renovacion, estado, comercial_asignado, lead_id")
      .neq("estado", "cancelado")
      .order("fecha_renovacion", { ascending: true })
      .limit(300);

    if (!puede("gestionar_clientes") && miId) q = q.eq("comercial_asignado", miId);
    else if (filtroComercial !== "todos") q = q.eq("comercial_asignado", filtroComercial);

    const { data: rows } = await q;
    const lista = rows ?? [];

    // Load comercial names
    const comIds = [...new Set(lista.map(r => r.comercial_asignado).filter(Boolean))] as string[];
    const { data: comsData } = comIds.length > 0
      ? await supabase.from("comerciales").select("id, nombre").in("id", comIds)
      : { data: [] };
    const comMap = new Map((comsData ?? []).map(c => [c.id, c.nombre]));

    // Get last interaction per lead
    const leadIds = lista.map(r => r.lead_id).filter(Boolean) as string[];
    const { data: interData } = leadIds.length > 0
      ? await supabase.from("interactions").select("lead_id, created_at").in("lead_id", leadIds).order("created_at", { ascending: false })
      : { data: [] };

    const ultimoContactoMap = new Map<string, Date>();
    for (const i of interData ?? []) {
      if (i.lead_id && !ultimoContactoMap.has(i.lead_id)) {
        ultimoContactoMap.set(i.lead_id, new Date(i.created_at));
      }
    }

    const scored: ClienteRiesgo[] = lista.map(c => {
      const uc = c.lead_id ? ultimoContactoMap.get(c.lead_id) ?? null : null;
      const { score, nivel, factores, diasSinContacto, diasParaRenovacion } = calcularRiesgo(c, uc);
      return {
        ...c,
        comercial_nombre: c.comercial_asignado ? comMap.get(c.comercial_asignado) : undefined,
        riesgoScore: score,
        riesgoNivel: nivel,
        diasSinContacto,
        diasParaRenovacion,
        factores,
      };
    });

    // Sort: critico first, then by score desc
    const ordenNivel: Record<string, number> = { critico: 3, alto: 2, medio: 1, bajo: 0 };
    scored.sort((a, b) => (ordenNivel[b.riesgoNivel] - ordenNivel[a.riesgoNivel]) || (b.riesgoScore - a.riesgoScore));

    setClientes(scored);
    setLoading(false);
  }, [puede, miId, filtroComercial]);

  useEffect(() => {
    if (!cargandoPermisos) cargar();
  }, [cargar, cargandoPermisos]);

  if (!cargandoPermisos && !puede("gestionar_clientes")) return <SinAcceso />;

  const datos = clientes.filter(c => !filtroNivel || c.riesgoNivel === filtroNivel).slice(0, limite);

  const nCritico = clientes.filter(c => c.riesgoNivel === "critico").length;
  const nAlto    = clientes.filter(c => c.riesgoNivel === "alto").length;
  const nMedio   = clientes.filter(c => c.riesgoNivel === "medio").length;
  const nBajo    = clientes.filter(c => c.riesgoNivel === "bajo").length;

  const valorRiesgo = clientes
    .filter(c => c.riesgoNivel === "critico" || c.riesgoNivel === "alto")
    .reduce((s, c) => s + (c.valor_contrato ?? 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Retención de clientes</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Clientes ordenados por riesgo de churn — actúa antes de perder la renovación
        </p>
      </div>

      {/* Summary alert */}
      {!loading && (nCritico > 0 || nAlto > 0) && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-3">
          <span className="text-xl">🚨</span>
          <div>
            <p className="text-sm font-semibold text-red-800">
              {nCritico + nAlto} clientes en riesgo de no renovar
            </p>
            <p className="text-xs text-red-600">
              Valor en riesgo: {valorRiesgo.toLocaleString("es-ES")} €
            </p>
          </div>
        </div>
      )}

      {/* KPIs */}
      {!loading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { nivel: "critico" as const, n: nCritico, label: "Crítico",   emoji: "🔴" },
            { nivel: "alto"    as const, n: nAlto,    label: "Alto",      emoji: "🟠" },
            { nivel: "medio"   as const, n: nMedio,   label: "Medio",     emoji: "🟡" },
            { nivel: "bajo"    as const, n: nBajo,    label: "Bajo",      emoji: "🟢" },
          ].map(({ nivel, n, label, emoji }) => {
            const cfg = RIESGO_CFG[nivel];
            return (
              <button key={nivel} onClick={() => setFiltroNivel(filtroNivel === nivel ? "" : nivel)}
                className={`rounded-xl border px-4 py-3 text-left transition-all ${
                  filtroNivel === nivel ? `${cfg.bg} ${cfg.border}` : "bg-white border-slate-200 hover:border-orange-200"
                }`}>
                <p className="text-xs font-semibold text-slate-500 mb-1">{emoji} Riesgo {label}</p>
                <p className={`text-2xl font-bold ${filtroNivel === nivel ? cfg.text : "text-slate-800"}`}>{n}</p>
              </button>
            );
          })}
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        {filtroNivel && (
          <button onClick={() => setFiltroNivel("")}
            className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-full bg-orange-100 text-orange-700 border border-orange-200 font-medium">
            Riesgo: {filtroNivel} ✕
          </button>
        )}
        {puede("ver_metricas") && comerciales.length > 1 && (
          <select value={filtroComercial} onChange={e => setFiltroComercial(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:border-orange-300">
            <option value="todos">Todos los comerciales</option>
            {comerciales.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className="py-16 text-center text-sm text-slate-400">Calculando riesgo de churn...</div>
      ) : datos.length === 0 ? (
        <div className="py-16 text-center text-sm text-slate-400">
          {clientes.length === 0 ? "No hay clientes activos aún." : "No hay clientes con este nivel de riesgo."}
        </div>
      ) : (
        <div className="space-y-3">
          {datos.map(c => {
            const cfg = RIESGO_CFG[c.riesgoNivel];
            return (
              <div key={c.id} className={`bg-white rounded-xl border overflow-hidden ${c.riesgoNivel === "critico" ? "border-l-4 border-l-red-400 border-r border-t border-b border-slate-200" : "border-slate-200"} hover:border-orange-200 transition-colors`}>
                <div className="px-4 py-3 flex items-start gap-3">
                  {/* Risk badge */}
                  <div className="shrink-0">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.bg} ${cfg.text} border ${cfg.border}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                      {cfg.label}
                    </span>
                    <p className="text-center text-xs font-bold text-slate-400 mt-1">{c.riesgoScore}pts</p>
                  </div>

                  {/* Client info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          {c.nombre} {c.apellidos}
                          {c.empresa && <span className="font-normal text-slate-400 ml-1">— {c.empresa}</span>}
                        </p>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {c.producto && (
                            <span className="text-xs px-2 py-0.5 bg-orange-50 text-orange-700 border border-orange-100 rounded-full">
                              {PRODUCTOS_LABEL[c.producto] ?? c.producto}
                            </span>
                          )}
                          {c.comercial_nombre && (
                            <span className="text-xs text-slate-400">{c.comercial_nombre}</span>
                          )}
                        </div>
                      </div>
                      {c.valor_contrato != null && c.valor_contrato > 0 && (
                        <p className="text-sm font-bold text-slate-700 shrink-0">
                          {c.valor_contrato.toLocaleString("es-ES")} €
                        </p>
                      )}
                    </div>

                    {/* Factores */}
                    <div className="flex flex-wrap gap-2 mt-2">
                      {c.factores.map((f, i) => (
                        <span key={i} className={`text-xs px-2 py-0.5 rounded-full border font-medium ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                          ⚠️ {f}
                        </span>
                      ))}
                      {c.diasSinContacto < 999 && c.factores.length === 0 && (
                        <span className="text-xs text-slate-400">Último contacto hace {c.diasSinContacto}d</span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="shrink-0 flex flex-col gap-1.5">
                    {c.lead_id && (
                      <Link href={`/leads/${c.lead_id}`}
                        className="text-xs px-2.5 py-1.5 bg-slate-50 text-slate-600 border border-slate-200 rounded-lg hover:bg-orange-50 hover:border-orange-200 hover:text-orange-700 transition-colors font-medium text-center">
                        Ver lead
                      </Link>
                    )}
                    <Link href={`/clientes/${c.id}`}
                      className="text-xs px-2.5 py-1.5 bg-slate-50 text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors font-medium text-center">
                      Cliente
                    </Link>
                    {c.telefono && (
                      <a href={`tel:${c.telefono}`}
                        className="text-xs px-2.5 py-1.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors font-medium text-center">
                        📞
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {clientes.filter(c => !filtroNivel || c.riesgoNivel === filtroNivel).length > limite && (
            <button onClick={() => setLimite(l => l + 30)}
              className="w-full py-3 text-sm text-slate-500 hover:text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
              Cargar más clientes
            </button>
          )}
        </div>
      )}
    </div>
  );
}
