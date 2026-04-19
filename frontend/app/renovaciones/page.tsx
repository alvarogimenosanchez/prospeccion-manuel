"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { usePermisos } from "@/components/PermisosProvider";
import { SinAcceso } from "@/components/SinAcceso";

type ClienteRenovacion = {
  id: string;
  nombre: string;
  apellidos: string | null;
  empresa: string | null;
  telefono: string | null;
  producto: string | null;
  fecha_renovacion: string;
  valor_contrato: number | null;
  estado: string;
  comercial_asignado: string | null;
  lead_id: string | null;
  comercial_nombre?: string;
  dias_restantes: number;
};

type FiltroVentana = "30" | "60" | "90" | "vencidas";

const ESTADO_COLOR: Record<string, string> = {
  activo: "bg-green-100 text-green-700",
  pendiente: "bg-amber-100 text-amber-700",
  renovado: "bg-blue-100 text-blue-700",
  cancelado: "bg-red-100 text-red-600",
};

function diasLabel(dias: number): { texto: string; color: string } {
  if (dias < 0) return { texto: `Vencido hace ${Math.abs(dias)}d`, color: "text-red-600" };
  if (dias === 0) return { texto: "Vence hoy", color: "text-red-600 font-bold" };
  if (dias <= 7) return { texto: `${dias}d restantes`, color: "text-red-500" };
  if (dias <= 30) return { texto: `${dias}d restantes`, color: "text-amber-600" };
  return { texto: `${dias}d restantes`, color: "text-slate-500" };
}

export default function RenovacionesPage() {
  const { puede, cargando: cargandoPermisos } = usePermisos();
  const [clientes, setClientes] = useState<ClienteRenovacion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [ventana, setVentana] = useState<FiltroVentana>("30");
  const [filtroComercial, setFiltroComercial] = useState("todos");
  const [comerciales, setComerciales] = useState<{ id: string; nombre: string }[]>([]);

  useEffect(() => {
    supabase.from("comerciales").select("id, nombre").eq("activo", true)
      .then(({ data }) => setComerciales(data ?? []));
  }, []);

  const cargar = useCallback(async () => {
    setCargando(true);
    const hoy = new Date();
    const hoyStr = hoy.toISOString().split("T")[0];

    let desde: string;
    let hasta: string;

    if (ventana === "vencidas") {
      desde = new Date(Date.now() - 90 * 86400_000).toISOString().split("T")[0];
      hasta = hoyStr;
    } else {
      const diasFuturos = parseInt(ventana);
      desde = hoyStr;
      hasta = new Date(Date.now() + diasFuturos * 86400_000).toISOString().split("T")[0];
    }

    let q = supabase.from("clientes")
      .select("id, nombre, apellidos, empresa, telefono, producto, fecha_renovacion, valor_contrato, estado, comercial_asignado, lead_id")
      .gte("fecha_renovacion", desde)
      .lte("fecha_renovacion", hasta)
      .order("fecha_renovacion");

    if (filtroComercial !== "todos") q = q.eq("comercial_asignado", filtroComercial);

    const { data } = await q;
    const hoyMs = hoy.getTime();

    const enriched: ClienteRenovacion[] = (data ?? []).map(c => {
      const renovMs = new Date(c.fecha_renovacion).getTime();
      const dias = Math.round((renovMs - hoyMs) / 86400_000);
      const com = comerciales.find(x => x.id === c.comercial_asignado);
      return {
        ...c,
        dias_restantes: dias,
        comercial_nombre: com?.nombre,
      };
    });

    setClientes(enriched);
    setCargando(false);
  }, [ventana, filtroComercial, comerciales]);

  useEffect(() => { cargar(); }, [cargar]);

  const valorTotal = clientes.reduce((a, c) => a + (c.valor_contrato ?? 0), 0);
  const vencidosHoy = clientes.filter(c => c.dias_restantes <= 0).length;
  const esta_semana = clientes.filter(c => c.dias_restantes > 0 && c.dias_restantes <= 7).length;

  if (!cargandoPermisos && !puede("gestionar_clientes")) return <SinAcceso />;

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Renovaciones</h1>
          <p className="text-sm text-slate-500 mt-0.5">Pólizas próximas a vencer — no pierdas ninguna renovación</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <select
            value={filtroComercial}
            onChange={e => setFiltroComercial(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:border-orange-300"
          >
            <option value="todos">Todos</option>
            {comerciales.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          {(["vencidas", "30", "60", "90"] as FiltroVentana[]).map(v => (
            <button
              key={v}
              onClick={() => setVentana(v)}
              className={`text-sm px-3 py-2 rounded-lg border transition-colors font-medium ${ventana === v ? "text-white border-transparent" : "bg-white border-slate-200 text-slate-600 hover:border-orange-200 hover:bg-orange-50"}`}
              style={ventana === v ? { background: "#ea650d", borderColor: "#ea650d" } : undefined}
            >
              {v === "vencidas" ? "Vencidas" : `${v}d`}
            </button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Total en ventana</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{clientes.length}</p>
          <p className="text-xs text-slate-400 mt-0.5">pólizas</p>
        </div>
        <div className={`rounded-xl border p-4 ${vencidosHoy > 0 ? "bg-red-50 border-red-200" : "bg-white border-slate-200"}`}>
          <p className={`text-xs font-medium uppercase tracking-wide ${vencidosHoy > 0 ? "text-red-500" : "text-slate-500"}`}>
            Vencidas / Hoy
          </p>
          <p className={`text-2xl font-bold mt-1 ${vencidosHoy > 0 ? "text-red-600" : "text-slate-900"}`}>{vencidosHoy}</p>
          <p className="text-xs text-red-400 mt-0.5">{vencidosHoy > 0 ? "requieren acción inmediata" : "al día"}</p>
        </div>
        <div className={`rounded-xl border p-4 ${esta_semana > 0 ? "bg-amber-50 border-amber-200" : "bg-white border-slate-200"}`}>
          <p className={`text-xs font-medium uppercase tracking-wide ${esta_semana > 0 ? "text-amber-600" : "text-slate-500"}`}>
            Esta semana
          </p>
          <p className={`text-2xl font-bold mt-1 ${esta_semana > 0 ? "text-amber-700" : "text-slate-900"}`}>{esta_semana}</p>
          <p className="text-xs text-amber-500 mt-0.5">vencen en 7 días</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Valor en riesgo</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">
            {valorTotal > 0 ? `${valorTotal.toLocaleString("es-ES", { maximumFractionDigits: 0 })}€` : "—"}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">suma valor contratos</p>
        </div>
      </div>

      {/* List */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-700">
            {ventana === "vencidas" ? "Renovaciones vencidas (últimos 90 días)" : `Renovaciones en los próximos ${ventana} días`}
          </h2>
        </div>

        {cargando ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 rounded-full border-2 animate-spin" style={{ borderColor: "#ea650d", borderTopColor: "transparent" }} />
          </div>
        ) : clientes.length === 0 ? (
          <div className="py-14 text-center">
            <p className="text-3xl mb-2">✅</p>
            <p className="text-sm font-semibold text-slate-700">No hay renovaciones pendientes</p>
            <p className="text-xs text-slate-400 mt-1">en esta ventana temporal</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {clientes.map(c => {
              const dl = diasLabel(c.dias_restantes);
              const urgente = c.dias_restantes <= 7;
              return (
                <div key={c.id} className={`px-5 py-4 flex items-center gap-4 ${urgente ? "bg-amber-50/50" : "hover:bg-slate-50"}`}>
                  {/* Urgency indicator */}
                  <div className={`w-1.5 h-10 rounded-full shrink-0 ${c.dias_restantes < 0 ? "bg-red-400" : c.dias_restantes <= 7 ? "bg-amber-400" : c.dias_restantes <= 30 ? "bg-yellow-300" : "bg-slate-200"}`} />

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-slate-800">
                        {c.nombre} {c.apellidos ?? ""}
                        {c.empresa && <span className="text-slate-400 font-normal"> · {c.empresa}</span>}
                      </p>
                      {c.estado && ESTADO_COLOR[c.estado] && (
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${ESTADO_COLOR[c.estado]}`}>{c.estado}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      {c.producto && <span className="text-xs text-slate-500">{c.producto}</span>}
                      {c.comercial_nombre && <span className="text-xs text-slate-400">· {c.comercial_nombre}</span>}
                      {c.telefono && <span className="text-xs text-slate-400 font-mono">· {c.telefono}</span>}
                    </div>
                  </div>

                  {/* Renewal date + days */}
                  <div className="shrink-0 text-right">
                    <p className={`text-sm font-semibold ${dl.color}`}>{dl.texto}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {new Date(c.fecha_renovacion).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  </div>

                  {/* Valor */}
                  {c.valor_contrato != null && (
                    <div className="shrink-0 text-right w-20">
                      <p className="text-sm font-semibold text-slate-700">{c.valor_contrato.toLocaleString("es-ES")}€</p>
                      <p className="text-xs text-slate-400">valor</p>
                    </div>
                  )}

                  {/* CTA */}
                  {c.lead_id ? (
                    <Link
                      href={`/leads/${c.lead_id}`}
                      className="shrink-0 text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:border-orange-300 hover:text-orange-600 hover:bg-orange-50 transition-colors"
                    >
                      Ver lead
                    </Link>
                  ) : (
                    <Link
                      href={`/clientes/${c.id}`}
                      className="shrink-0 text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:border-orange-300 hover:text-orange-600 hover:bg-orange-50 transition-colors"
                    >
                      Ver cliente
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
