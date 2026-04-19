"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { usePermisos } from "@/components/PermisosProvider";
import { SinAcceso } from "@/components/SinAcceso";

type LeadPerdido = {
  id: string;
  nombre: string;
  apellidos: string | null;
  empresa: string | null;
  sector: string | null;
  ciudad: string | null;
  telefono_whatsapp: string | null;
  telefono: string | null;
  email: string | null;
  producto_interes_principal: string | null;
  temperatura: string;
  nivel_interes: number;
  estado: string;
  updated_at: string;
  comercial_asignado: string | null;
  comerciales?: { nombre: string; apellidos: string | null } | null;
};

const PRODUCTOS_LABEL: Record<string, string> = {
  contigo_autonomo: "C. Autónomo",
  contigo_pyme: "C. Pyme",
  contigo_familia: "C. Familia",
  contigo_futuro: "C. Futuro",
  contigo_senior: "C. Senior",
  sialp: "SIALP",
  liderplus: "LiderPlus",
  sanitas_salud: "Sanitas Salud",
  mihogar: "MiHogar",
  hipotecas: "Hipoteca",
};

const VENTANA_OPTIONS = [
  { value: "3-6m",  label: "Perdidos hace 3–6 meses",  desde: 180, hasta: 90 },
  { value: "6-12m", label: "Perdidos hace 6–12 meses", desde: 365, hasta: 180 },
  { value: "todo",  label: "Todos los perdidos",        desde: 9999, hasta: 0 },
];

export default function RecuperarPage() {
  const { puede, cargando: cargandoPermisos } = usePermisos();
  const [leads, setLeads] = useState<LeadPerdido[]>([]);
  const [loading, setLoading] = useState(true);
  const [ventana, setVentana] = useState("3-6m");
  const [recuperando, setRecuperando] = useState<string | null>(null);
  const [recuperados, setRecuperados] = useState<Set<string>>(new Set());
  const [miId, setMiId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user?.email) return;
      supabase.from("comerciales").select("id").eq("email", user.email).single()
        .then(({ data }) => setMiId(data?.id ?? null));
    });
  }, []);

  const cargar = useCallback(async () => {
    setLoading(true);
    const opt = VENTANA_OPTIONS.find(o => o.value === ventana) ?? VENTANA_OPTIONS[0];
    const ahora = Date.now();
    const desde = new Date(ahora - opt.desde * 86_400_000).toISOString();
    const hasta = opt.hasta > 0 ? new Date(ahora - opt.hasta * 86_400_000).toISOString() : null;

    let q = supabase.from("leads")
      .select("id, nombre, apellidos, empresa, sector, ciudad, telefono_whatsapp, telefono, email, producto_interes_principal, temperatura, nivel_interes, estado, updated_at, comercial_asignado, comerciales(nombre, apellidos)")
      .in("estado", ["cerrado_perdido", "descartado"])
      .gte("updated_at", desde);

    if (hasta) q = q.lte("updated_at", hasta);

    if (!cargandoPermisos && !puede("ver_todos_leads") && miId) {
      q = q.eq("comercial_asignado", miId);
    }

    q = q.order("nivel_interes", { ascending: false }).order("updated_at", { ascending: false }).limit(100);

    const { data } = await q;
    setLeads((data as LeadPerdido[]) ?? []);
    setLoading(false);
  }, [ventana, cargandoPermisos, puede, miId]);

  useEffect(() => {
    if (!cargandoPermisos) cargar();
  }, [cargar, cargandoPermisos]);

  async function recuperar(lead: LeadPerdido) {
    setRecuperando(lead.id);
    await supabase.from("leads").update({
      estado: "nuevo",
      temperatura: "frio",
      updated_at: new Date().toISOString(),
    }).eq("id", lead.id);
    await supabase.from("interactions").insert({
      lead_id: lead.id,
      tipo: "nota_manual",
      mensaje: "Lead recuperado — se reactiva desde cerrado/perdido para nuevo contacto",
      origen: "comercial",
    });
    setRecuperados(prev => new Set([...prev, lead.id]));
    setRecuperando(null);
  }

  if (!cargandoPermisos && !puede("ver_todos_leads") && !miId) return null;
  if (!cargandoPermisos && !puede("asignar_leads") && !puede("ver_todos_leads")) return <SinAcceso />;

  const opt = VENTANA_OPTIONS.find(o => o.value === ventana)!;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Recuperación de leads</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Leads cerrados/perdidos que pueden volver a ser contactados — a veces el momento cambia
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={ventana}
            onChange={e => setVentana(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-600 focus:outline-none focus:border-slate-400"
          >
            {VENTANA_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Info banner */}
      <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 flex items-start gap-3">
        <span className="text-lg shrink-0 mt-0.5">💡</span>
        <div>
          <p className="text-sm font-semibold text-blue-800">¿Por qué recuperar leads perdidos?</p>
          <p className="text-xs text-blue-600 mt-0.5">
            Los estudios de ventas muestran que 20-30% de los leads que dijeron «no» en el pasado pueden convertirse si se contactan
            3-6 meses después. Las circunstancias cambian: cambios de trabajo, nueva necesidad, presupuesto desbloqueado.
            Al recuperar un lead, vuelve a estado «Nuevo» para iniciar el proceso de seguimiento.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 py-16 text-center text-sm text-slate-400">
          Cargando leads...
        </div>
      ) : leads.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 py-16 text-center">
          <p className="text-slate-400 text-sm">No hay leads perdidos en este período.</p>
          <p className="text-xs text-slate-300 mt-1">Prueba con una ventana de tiempo diferente.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <p className="text-sm font-medium text-slate-700">
              {leads.length} lead{leads.length !== 1 ? "s" : ""} — {opt.label.toLowerCase()}
            </p>
            <p className="text-xs text-slate-400">Ordenados por nivel de interés</p>
          </div>

          <div className="divide-y divide-slate-50">
            {leads.map(lead => {
              const yaRecuperado = recuperados.has(lead.id);
              const nombre = [lead.nombre, lead.apellidos].filter(Boolean).join(" ");
              const diasDesde = Math.round((Date.now() - new Date(lead.updated_at).getTime()) / 86_400_000);
              const comercial = lead.comerciales;

              return (
                <div key={lead.id} className={`flex items-center gap-3 px-4 py-3.5 transition-colors ${yaRecuperado ? "bg-green-50" : "hover:bg-slate-50"}`}>
                  {/* Nivel interés */}
                  <div className="w-10 shrink-0 text-center">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold border-2"
                      style={{
                        borderColor: lead.nivel_interes >= 7 ? "#16a34a" : lead.nivel_interes >= 4 ? "#d97706" : "#94a3b8",
                        color: lead.nivel_interes >= 7 ? "#16a34a" : lead.nivel_interes >= 4 ? "#d97706" : "#94a3b8",
                        background: lead.nivel_interes >= 7 ? "#f0fdf4" : lead.nivel_interes >= 4 ? "#fffbeb" : "#f8fafc",
                      }}>
                      {lead.nivel_interes}
                    </div>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link href={`/leads/${lead.id}`} className="text-sm font-semibold text-slate-800 hover:text-orange-600 transition-colors">
                        {nombre || "Sin nombre"}
                      </Link>
                      {lead.empresa && (
                        <span className="text-xs text-slate-400">{lead.empresa}</span>
                      )}
                      {lead.producto_interes_principal && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                          {PRODUCTOS_LABEL[lead.producto_interes_principal] ?? lead.producto_interes_principal}
                        </span>
                      )}
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${lead.estado === "cerrado_perdido" ? "bg-red-50 text-red-600" : "bg-slate-100 text-slate-500"}`}>
                        {lead.estado === "cerrado_perdido" ? "Perdido" : "Descartado"}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      {lead.ciudad && <span className="text-xs text-slate-400">{lead.ciudad}</span>}
                      {lead.sector && <span className="text-xs text-slate-400">{lead.sector}</span>}
                      {lead.telefono_whatsapp && (
                        <a href={`https://wa.me/${lead.telefono_whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="text-xs text-green-600 hover:underline">
                          {lead.telefono_whatsapp}
                        </a>
                      )}
                      <span className="text-xs text-slate-300">Hace {diasDesde} días</span>
                      {comercial && <span className="text-xs text-slate-400">— {comercial.nombre}</span>}
                    </div>
                  </div>

                  {/* Action */}
                  <div className="shrink-0">
                    {yaRecuperado ? (
                      <Link href={`/leads/${lead.id}`} className="text-xs font-medium text-green-600 hover:underline">
                        ✓ Recuperado →
                      </Link>
                    ) : (
                      <button
                        onClick={() => recuperar(lead)}
                        disabled={recuperando === lead.id}
                        className="text-xs font-medium px-3 py-1.5 rounded-lg transition-colors text-white disabled:opacity-50"
                        style={{ background: "#ea650d" }}
                      >
                        {recuperando === lead.id ? "..." : "Recuperar →"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
