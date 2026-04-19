"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { usePermisos } from "@/components/PermisosProvider";
import { SinAcceso } from "@/components/SinAcceso";

// Upsell/cross-sell rules per existing product
const CROSS_SELL: Record<string, { producto: string; razon: string; prioridad: number }[]> = {
  contigo_autonomo: [
    { producto: "Contigo Familia", razon: "Protege también a su familia ante fallecimiento o invalidez", prioridad: 3 },
    { producto: "Sanitas Salud", razon: "Acceso a médico privado sin esperas, deducible como autónomo", prioridad: 2 },
    { producto: "Contigo Futuro", razon: "Ahorro fiscal para jubilación, hasta 5.000€/año libre de tributar", prioridad: 2 },
  ],
  "contigo pyme": [
    { producto: "Sanitas Salud", razon: "Amplía el beneficio del equipo con seguro médico privado colectivo", prioridad: 3 },
    { producto: "LiderPlus", razon: "Protección integral adicional para el/los directivos de la empresa", prioridad: 2 },
  ],
  contigo_pyme: [
    { producto: "Sanitas Salud", razon: "Amplía el beneficio del equipo con seguro médico privado colectivo", prioridad: 3 },
    { producto: "LiderPlus", razon: "Protección integral adicional para el/los directivos de la empresa", prioridad: 2 },
  ],
  contigo_familia: [
    { producto: "Contigo Autónomo", razon: "Si es autónomo, también necesita proteger sus ingresos si cae de baja", prioridad: 3 },
    { producto: "Contigo Futuro", razon: "Complementa la protección familiar con ahorro para jubilación", prioridad: 2 },
    { producto: "Sanitas Salud", razon: "Cubre los costes médicos que el seguro de vida no contempla", prioridad: 2 },
  ],
  contigo_futuro: [
    { producto: "LiderPlus", razon: "Perfil inversor suele querer también protección ante invalidez/accidente", prioridad: 2 },
    { producto: "Sanitas Salud", razon: "Complemento natural para un perfil de previsión integral", prioridad: 2 },
  ],
  liderplus: [
    { producto: "Contigo Familia", razon: "El directivo ya está cubierto — ahora proteger también a su familia", prioridad: 3 },
    { producto: "Sanitas Salud", razon: "Acceso médico privado premium sin esperas para el directivo", prioridad: 2 },
  ],
  sanitas_salud: [
    { producto: "Contigo Autónomo", razon: "Si es autónomo, el médico privado no cubre baja laboral", prioridad: 3 },
    { producto: "Contigo Familia", razon: "La salud ya cubierta — siguiente paso: proteger a la familia", prioridad: 2 },
  ],
  "mihogar": [
    { producto: "Contigo Familia", razon: "El hogar asegurado — siguiente paso natural: proteger a quienes viven en él", prioridad: 3 },
    { producto: "Sanitas Salud", razon: "Propietario de vivienda suele tener perfil para seguro médico", prioridad: 2 },
  ],
};

type ClienteOpportunity = {
  id: string;
  nombre: string;
  apellidos: string | null;
  empresa: string | null;
  telefono: string | null;
  producto: string | null;
  valor_contrato: number | null;
  fecha_inicio: string | null;
  comercial_asignado: string | null;
  lead_id: string | null;
  sugerencias: { producto: string; razon: string; prioridad: number }[];
  comercial_nombre?: string;
};

function keyNormalize(s: string | null | undefined): string {
  if (!s) return "";
  return s.toLowerCase().replace(/\s+/g, "_").replace(/[áàâä]/g, "a").replace(/[éèêë]/g, "e").replace(/[íìîï]/g, "i").replace(/[óòôö]/g, "o").replace(/[úùûü]/g, "u");
}

export default function CrossSellPage() {
  const { puede, cargando: cargandoPermisos } = usePermisos();
  const [oportunidades, setOportunidades] = useState<ClienteOpportunity[]>([]);
  const [cargando, setCargando] = useState(true);
  const [filtroProducto, setFiltroProducto] = useState("todos");
  const [filtroComercial, setFiltroComercial] = useState("todos");
  const [comerciales, setComerciales] = useState<{ id: string; nombre: string }[]>([]);

  useEffect(() => {
    supabase.from("comerciales").select("id, nombre").eq("activo", true)
      .then(({ data }) => setComerciales(data ?? []));
  }, []);

  const cargar = useCallback(async () => {
    setCargando(true);
    let q = supabase.from("clientes")
      .select("id, nombre, apellidos, empresa, telefono, producto, valor_contrato, fecha_inicio, comercial_asignado, lead_id")
      .eq("estado", "activo")
      .not("producto", "is", null);

    if (filtroComercial !== "todos") q = q.eq("comercial_asignado", filtroComercial);

    const { data } = await q;

    const opps: ClienteOpportunity[] = (data ?? [])
      .map(c => {
        const key = keyNormalize(c.producto);
        const sugerencias = CROSS_SELL[key] ?? CROSS_SELL[c.producto?.toLowerCase() ?? ""] ?? [];
        if (sugerencias.length === 0) return null;
        const com = comerciales.find(x => x.id === c.comercial_asignado);
        return { ...c, sugerencias, comercial_nombre: com?.nombre };
      })
      .filter(Boolean) as ClienteOpportunity[];

    // Sort by max priority in suggestions
    opps.sort((a, b) => Math.max(...b.sugerencias.map(s => s.prioridad)) - Math.max(...a.sugerencias.map(s => s.prioridad)));

    const filtered = filtroProducto !== "todos"
      ? opps.filter(o => keyNormalize(o.producto) === keyNormalize(filtroProducto))
      : opps;

    setOportunidades(filtered);
    setCargando(false);
  }, [filtroProducto, filtroComercial, comerciales]);

  useEffect(() => { cargar(); }, [cargar]);

  const productosUnicos = [...new Set((oportunidades).map(o => o.producto).filter(Boolean))];

  if (!cargandoPermisos && !puede("gestionar_clientes")) return <SinAcceso />;

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Oportunidades cross-sell</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Clientes activos con potencial de ampliar su cobertura — ingresos sin coste de captación
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <select
            value={filtroComercial}
            onChange={e => setFiltroComercial(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:border-orange-300"
          >
            <option value="todos">Todos los comerciales</option>
            {comerciales.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          <select
            value={filtroProducto}
            onChange={e => setFiltroProducto(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:border-orange-300"
          >
            <option value="todos">Todos los productos</option>
            {productosUnicos.map(p => <option key={p!} value={p!}>{p}</option>)}
          </select>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Oportunidades</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{oportunidades.length}</p>
          <p className="text-xs text-slate-400 mt-0.5">clientes con cross-sell posible</p>
        </div>
        <div className="bg-white rounded-xl border border-green-200 bg-green-50 p-4">
          <p className="text-xs text-green-600 font-medium uppercase tracking-wide">Alta prioridad</p>
          <p className="text-2xl font-bold text-green-700 mt-1">
            {oportunidades.filter(o => o.sugerencias.some(s => s.prioridad >= 3)).length}
          </p>
          <p className="text-xs text-green-500 mt-0.5">fit muy alto</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Valor actual</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">
            {oportunidades.reduce((a, c) => a + (c.valor_contrato ?? 0), 0) > 0
              ? `${oportunidades.reduce((a, c) => a + (c.valor_contrato ?? 0), 0).toLocaleString("es-ES", { maximumFractionDigits: 0 })}€`
              : "—"}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">en contratos activos</p>
        </div>
      </div>

      {/* Opportunities list */}
      {cargando ? (
        <div className="flex justify-center py-16">
          <div className="w-7 h-7 rounded-full border-2 animate-spin" style={{ borderColor: "#ea650d", borderTopColor: "transparent" }} />
        </div>
      ) : oportunidades.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 py-16 text-center">
          <p className="text-3xl mb-2">🎉</p>
          <p className="text-sm font-semibold text-slate-700">No hay oportunidades cross-sell disponibles</p>
          <p className="text-xs text-slate-400 mt-1">Cuando se registren clientes activos aparecerán aquí</p>
        </div>
      ) : (
        <div className="space-y-3">
          {oportunidades.map(c => {
            const altaPrioridad = c.sugerencias.filter(s => s.prioridad >= 3);
            const mediaPrioridad = c.sugerencias.filter(s => s.prioridad < 3);
            return (
              <div key={c.id} className="bg-white rounded-xl border border-slate-200 p-5">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  {/* Client info */}
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-slate-800">
                        {c.nombre} {c.apellidos ?? ""}
                        {c.empresa && <span className="text-slate-400 font-normal"> · {c.empresa}</span>}
                      </p>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                        {c.producto}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                      {c.comercial_nombre && <span>Comercial: {c.comercial_nombre}</span>}
                      {c.valor_contrato != null && <span>· {c.valor_contrato.toLocaleString("es-ES")}€/año</span>}
                      {c.telefono && <span className="font-mono">· {c.telefono}</span>}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 shrink-0">
                    {c.lead_id && (
                      <Link
                        href={`/leads/${c.lead_id}`}
                        className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:border-orange-300 hover:text-orange-600 hover:bg-orange-50 transition-colors"
                      >
                        Ver lead
                      </Link>
                    )}
                    <Link
                      href={`/clientes/${c.id}`}
                      className="text-xs px-3 py-1.5 rounded-lg border text-white transition-opacity hover:opacity-90"
                      style={{ background: "#ea650d", borderColor: "#ea650d" }}
                    >
                      Ver cliente
                    </Link>
                  </div>
                </div>

                {/* Suggestions */}
                <div className="mt-4 space-y-2">
                  {altaPrioridad.length > 0 && (
                    <div className="space-y-1.5">
                      {altaPrioridad.map((s, i) => (
                        <div key={i} className="flex items-start gap-2.5 rounded-lg bg-orange-50 border border-orange-100 px-3 py-2.5">
                          <span className="text-base shrink-0 mt-0.5">🎯</span>
                          <div>
                            <p className="text-xs font-semibold text-orange-800">{s.producto}</p>
                            <p className="text-xs text-orange-600 mt-0.5">{s.razon}</p>
                          </div>
                          <span className="ml-auto shrink-0 text-xs font-bold text-orange-500 bg-orange-100 px-1.5 py-0.5 rounded">Alta</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {mediaPrioridad.length > 0 && (
                    <div className="space-y-1.5">
                      {mediaPrioridad.map((s, i) => (
                        <div key={i} className="flex items-start gap-2.5 rounded-lg bg-slate-50 border border-slate-100 px-3 py-2.5">
                          <span className="text-base shrink-0 mt-0.5">💡</span>
                          <div>
                            <p className="text-xs font-semibold text-slate-700">{s.producto}</p>
                            <p className="text-xs text-slate-500 mt-0.5">{s.razon}</p>
                          </div>
                          <span className="ml-auto shrink-0 text-xs font-medium text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">Media</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
