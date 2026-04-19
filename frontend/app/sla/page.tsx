"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { usePermisos } from "@/components/PermisosProvider";
import { SinAcceso } from "@/components/SinAcceso";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

// ─── Types ─────────────────────────────────────────────────────────────────────

type LeadSinContactar = {
  id: string;
  nombre: string;
  apellidos: string | null;
  empresa: string | null;
  ciudad: string | null;
  created_at: string;
  comercial_asignado: string | null;
  comerciales: { nombre: string; apellidos: string | null } | null;
  horasSinContacto: number;
};

type ComercialSLA = {
  id: string;
  nombre: string;
  sinContactar: number;
  contactados24h: number;
  contactados48h: number;
  contactadosMasTarde: number;
  tiempoMedioHoras: number | null;
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function horasDesde(fecha: string): number {
  return (Date.now() - new Date(fecha).getTime()) / (1000 * 60 * 60);
}

function SLABadge({ horas }: { horas: number }) {
  if (horas < 24) return <span className="text-xs font-semibold rounded-full px-2 py-0.5 bg-green-100 text-green-700">&lt;24h</span>;
  if (horas < 48) return <span className="text-xs font-semibold rounded-full px-2 py-0.5 bg-amber-100 text-amber-700">24-48h</span>;
  return <span className="text-xs font-semibold rounded-full px-2 py-0.5 bg-red-100 text-red-700">&gt;48h</span>;
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function SLAPage() {
  const { puede, cargando: cargandoPermisos } = usePermisos();
  const [sinContactar, setSinContactar] = useState<LeadSinContactar[]>([]);
  const [comercialesSLA, setComerciales] = useState<ComercialSLA[]>([]);
  const [stats, setStats] = useState({ total: 0, dentro24h: 0, entre24y48: 0, mas48h: 0, cumplimiento: 0 });
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState<"7d" | "30d" | "todos">("30d");

  const cargar = useCallback(async () => {
    setLoading(true);
    const now = new Date();

    // Find leads that are still in "nuevo" or "enriquecido" or "segmentado" (not yet contacted)
    // Created more than 2 hours ago (to exclude very fresh leads)
    const hace2h = new Date(now.getTime() - 2 * 3600 * 1000);

    let desde: Date | null = null;
    if (periodo === "7d") { desde = new Date(now); desde.setDate(now.getDate() - 7); }
    else if (periodo === "30d") { desde = new Date(now); desde.setDate(now.getDate() - 30); }

    // Leads not yet contacted (still at initial stages)
    let qSinContactar = supabase
      .from("leads")
      .select("id, nombre, apellidos, empresa, ciudad, created_at, comercial_asignado, comerciales(nombre, apellidos)")
      .in("estado", ["nuevo", "enriquecido", "segmentado"])
      .lt("created_at", hace2h.toISOString())
      .order("created_at", { ascending: true })
      .limit(200);

    if (desde) qSinContactar = qSinContactar.gte("created_at", desde.toISOString());

    // Leads that were contacted (moved out of initial stages)
    let qContactados = supabase
      .from("lead_state_history")
      .select("lead_id, created_at, comercial_id, comerciales(nombre, apellidos)")
      .in("estado_nuevo", ["mensaje_enviado", "respondio", "cita_agendada", "en_negociacion", "cerrado_ganado"])
      .order("created_at", { ascending: true })
      .limit(2000);

    if (desde) qContactados = qContactados.gte("created_at", desde.toISOString());

    const [{ data: noContactados }, { data: historial }] = await Promise.all([qSinContactar, qContactados]);

    // Process sin contactar
    const sinCon: LeadSinContactar[] = (noContactados ?? []).map(l => ({
      ...l,
      comerciales: l.comerciales as unknown as { nombre: string; apellidos: string | null } | null,
      horasSinContacto: horasDesde(l.created_at),
    }));

    // Process contactados — get first contact time per lead
    // Join with leads to get creation time
    const leadIdsContactados = [...new Set((historial ?? []).map(h => h.lead_id))];
    let firstContactMap: Map<string, { horasHastaContacto: number; comercialId: string | null; comercialNombre: string }> = new Map();

    if (leadIdsContactados.length > 0) {
      const { data: leadsContactados } = await supabase
        .from("leads")
        .select("id, created_at, comercial_asignado")
        .in("id", leadIdsContactados.slice(0, 500));

      const leadMap = new Map((leadsContactados ?? []).map(l => [l.id, l.created_at]));

      for (const h of historial ?? []) {
        if (firstContactMap.has(h.lead_id)) continue;
        const leadCreated = leadMap.get(h.lead_id);
        if (!leadCreated) continue;
        const horasHastaContacto = (new Date(h.created_at).getTime() - new Date(leadCreated).getTime()) / (1000 * 60 * 60);
        const com = h.comerciales as unknown as { nombre: string; apellidos: string | null } | null;
        firstContactMap.set(h.lead_id, {
          horasHastaContacto: Math.max(0, horasHastaContacto),
          comercialId: h.comercial_id,
          comercialNombre: com ? `${com.nombre}${com.apellidos ? " " + com.apellidos : ""}` : "Sistema",
        });
      }
    }

    // Aggregate stats
    const contactados = [...firstContactMap.values()];
    const dentro24h = contactados.filter(c => c.horasHastaContacto <= 24).length;
    const entre24y48 = contactados.filter(c => c.horasHastaContacto > 24 && c.horasHastaContacto <= 48).length;
    const mas48h = contactados.filter(c => c.horasHastaContacto > 48).length;
    const totalContactados = contactados.length;
    const cumplimiento = totalContactados > 0 ? Math.round((dentro24h / totalContactados) * 100) : 0;

    setStats({ total: totalContactados, dentro24h, entre24y48, mas48h, cumplimiento });
    setSinContactar(sinCon);

    // Per-comercial SLA
    const comMap = new Map<string, ComercialSLA>();

    for (const c of contactados) {
      const id = c.comercialId ?? "__sin__";
      if (!comMap.has(id)) comMap.set(id, { id, nombre: c.comercialNombre, sinContactar: 0, contactados24h: 0, contactados48h: 0, contactadosMasTarde: 0, tiempoMedioHoras: null });
      const e = comMap.get(id)!;
      if (c.horasHastaContacto <= 24) e.contactados24h++;
      else if (c.horasHastaContacto <= 48) e.contactados48h++;
      else e.contactadosMasTarde++;
    }

    for (const sc of sinCon) {
      const id = sc.comercial_asignado ?? "__sin__";
      const com = sc.comerciales;
      const nombre = com ? `${(com as unknown as {nombre: string; apellidos: string | null}).nombre}` : "Sin asignar";
      if (!comMap.has(id)) comMap.set(id, { id, nombre, sinContactar: 0, contactados24h: 0, contactados48h: 0, contactadosMasTarde: 0, tiempoMedioHoras: null });
      comMap.get(id)!.sinContactar++;
    }

    // Calculate average time per comercial
    for (const [id, entry] of comMap) {
      const tiempos = contactados.filter(c => (c.comercialId ?? "__sin__") === id).map(c => c.horasHastaContacto);
      if (tiempos.length > 0) {
        entry.tiempoMedioHoras = tiempos.reduce((a, b) => a + b, 0) / tiempos.length;
      }
    }

    setComerciales([...comMap.values()].sort((a, b) => a.tiempoMedioHoras ?? 999 - (b.tiempoMedioHoras ?? 999)));
    setLoading(false);
  }, [periodo]);

  useEffect(() => {
    if (!cargandoPermisos && puede("ver_metricas")) cargar();
  }, [cargar, cargandoPermisos, puede]);

  if (!cargandoPermisos && !puede("ver_metricas")) return <SinAcceso />;

  const scoreColor = stats.cumplimiento >= 80 ? "#10b981" : stats.cumplimiento >= 60 ? "#f59e0b" : "#ef4444";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">SLA de respuesta</h1>
          <p className="text-sm text-slate-500 mt-0.5">¿Con qué rapidez se contacta a los leads?</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={periodo}
            onChange={e => setPeriodo(e.target.value as typeof periodo)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:border-orange-300"
          >
            <option value="7d">Últimos 7 días</option>
            <option value="30d">Últimos 30 días</option>
            <option value="todos">Todo el tiempo</option>
          </select>
          <button onClick={cargar} className="px-3 py-2 text-sm font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
            ↺ Actualizar
          </button>
        </div>
      </div>

      {/* Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
        <p className="text-sm text-blue-800">
          <strong>SLA recomendado:</strong> Contactar leads nuevos en menos de 24 horas. Los leads contactados en la primera hora tienen <strong>7× más probabilidad de conversión</strong>.
        </p>
      </div>

      {/* KPIs */}
      {!loading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-slate-200 px-5 py-4 flex items-center gap-4">
            <div className="relative w-14 h-14 flex-shrink-0">
              <svg width="56" height="56" viewBox="0 0 56 56" className="-rotate-90">
                <circle cx="28" cy="28" r="22" fill="none" stroke="#f1edeb" strokeWidth="6" />
                <circle cx="28" cy="28" r="22" fill="none" stroke={scoreColor} strokeWidth="6"
                  strokeDasharray={`${2 * Math.PI * 22 * stats.cumplimiento / 100} ${2 * Math.PI * 22}`}
                  strokeLinecap="round" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-sm font-bold" style={{ color: scoreColor }}>{stats.cumplimiento}%</span>
              </div>
            </div>
            <div>
              <p className="text-xs text-slate-500">Cumplimiento SLA</p>
              <p className="text-sm font-semibold" style={{ color: scoreColor }}>
                {stats.cumplimiento >= 80 ? "Excelente" : stats.cumplimiento >= 60 ? "Mejorable" : "Deficiente"}
              </p>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
            <p className="text-xs text-slate-500 mb-1">Contactados &lt;24h</p>
            <p className="text-2xl font-bold text-green-700">{stats.dentro24h}</p>
            <p className="text-xs text-slate-400">de {stats.total} contactados</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
            <p className="text-xs text-slate-500 mb-1">Contactados 24-48h</p>
            <p className="text-2xl font-bold text-amber-600">{stats.entre24y48}</p>
            <p className="text-xs text-slate-400">fuera de SLA</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
            <p className="text-xs text-slate-500 mb-1">Sin contactar aún</p>
            <p className="text-2xl font-bold text-red-600">{sinContactar.length}</p>
            <p className="text-xs text-slate-400">leads pendientes</p>
          </div>
        </div>
      )}

      {/* Leads sin contactar — highest priority */}
      {!loading && sinContactar.length > 0 && (
        <div className="bg-white rounded-xl border border-red-200 overflow-hidden">
          <div className="px-5 py-3 bg-red-50 border-b border-red-200 flex items-center justify-between">
            <p className="text-sm font-semibold text-red-800">⚠️ Leads sin contactar ({sinContactar.length})</p>
            <p className="text-xs text-red-600">Acción inmediata requerida</p>
          </div>
          <div className="divide-y divide-slate-50 max-h-80 overflow-y-auto">
            {sinContactar.map(lead => {
              const nombre = [lead.nombre, lead.apellidos].filter(Boolean).join(" ");
              const com = lead.comerciales as unknown as { nombre: string; apellidos: string | null } | null;
              return (
                <div key={lead.id} className="flex items-center gap-4 px-5 py-3 hover:bg-slate-50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{nombre}</p>
                    <p className="text-xs text-slate-400 truncate">
                      {[lead.empresa, lead.ciudad, com ? com.nombre : "Sin asignar"].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <SLABadge horas={lead.horasSinContacto} />
                    <span className="text-xs text-slate-400">
                      {formatDistanceToNow(new Date(lead.created_at), { locale: es, addSuffix: true })}
                    </span>
                    <Link href={`/leads/${lead.id}`} className="text-xs font-medium text-slate-500 hover:text-orange-600 border border-slate-200 hover:border-orange-300 rounded-md px-2 py-1 transition-colors">
                      Contactar →
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Per-comercial SLA */}
      {!loading && comercialesSLA.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200">
            <p className="text-sm font-semibold text-slate-700">Rendimiento SLA por comercial</p>
          </div>
          <div className="divide-y divide-slate-50">
            {comercialesSLA.map(com => {
              const total = com.contactados24h + com.contactados48h + com.contactadosMasTarde;
              const pct24h = total > 0 ? Math.round((com.contactados24h / total) * 100) : 0;
              const pct24hColor = pct24h >= 80 ? "bg-green-500" : pct24h >= 60 ? "bg-amber-500" : "bg-red-400";
              return (
                <div key={com.id} className="flex items-center gap-4 px-5 py-3.5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <p className="text-sm font-medium text-slate-800">{com.nombre}</p>
                      {com.sinContactar > 0 && (
                        <span className="text-xs text-red-600 bg-red-50 rounded-full px-2 py-0.5">{com.sinContactar} sin contactar</span>
                      )}
                    </div>
                    <div className="flex gap-2 items-center">
                      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${pct24hColor}`} style={{ width: `${pct24h}%` }} />
                      </div>
                      <span className="text-xs font-semibold text-slate-600 w-10 text-right">{pct24h}%</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 flex-shrink-0 text-right">
                    <div>
                      <p className="text-xs text-green-600 font-semibold">{com.contactados24h}</p>
                      <p className="text-[10px] text-slate-400">&lt;24h</p>
                    </div>
                    <div>
                      <p className="text-xs text-amber-600 font-semibold">{com.contactados48h}</p>
                      <p className="text-[10px] text-slate-400">24-48h</p>
                    </div>
                    <div>
                      <p className="text-xs text-red-500 font-semibold">{com.contactadosMasTarde}</p>
                      <p className="text-[10px] text-slate-400">&gt;48h</p>
                    </div>
                    {com.tiempoMedioHoras !== null && (
                      <div>
                        <p className="text-xs text-slate-700 font-semibold">{com.tiempoMedioHoras.toFixed(1)}h</p>
                        <p className="text-[10px] text-slate-400">media</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {loading && (
        <div className="py-24 text-center text-sm text-slate-400">Calculando SLA...</div>
      )}
    </div>
  );
}
