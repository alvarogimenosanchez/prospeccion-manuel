"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { usePermisos } from "@/components/PermisosProvider";

// ─── Types ─────────────────────────────────────────────────────────────────────

type Lead = {
  id: string;
  nombre: string;
  apellidos: string | null;
  empresa: string | null;
  ciudad: string | null;
  telefono: string | null;
  telefono_whatsapp: string | null;
  producto_interes_principal: string | null;
  productos_recomendados: string[] | null;
  nivel_interes: number;
  proxima_accion: string | null;
  proxima_accion_fecha: string | null;
  proxima_accion_nota: string | null;
  comercial_asignado: string | null;
  updated_at: string;
  created_at: string;
  comerciales: { nombre: string; apellidos: string | null } | null;
  ultima_interaccion: string | null;
  dias_en_neg: number;
  notas: string | null;
};

type Accion = "cerrado_ganado" | "cerrado_perdido" | "cita_agendada";

// ─── Constants ─────────────────────────────────────────────────────────────────

const PRODUCTOS_LABEL: Record<string, string> = {
  contigo_futuro: "Contigo Futuro",
  sialp: "SIALP",
  contigo_autonomo: "Contigo Autónomo",
  contigo_familia: "Contigo Familia",
  contigo_pyme: "Contigo Pyme",
  contigo_senior: "Contigo Senior",
  liderplus: "LiderPlus",
  sanitas_salud: "Sanitas Salud",
  mihogar: "MiHogar",
  hipotecas: "Hipoteca",
  otro: "Otro",
};

const ACCIONES_NEXT = [
  { value: "llamar",      label: "📞 Llamar" },
  { value: "whatsapp",    label: "💬 WhatsApp" },
  { value: "reunion",     label: "📅 Reunión" },
  { value: "enviar_info", label: "📎 Enviar info" },
];

function diasColor(dias: number): string {
  if (dias <= 3) return "text-green-600 bg-green-100";
  if (dias <= 7) return "text-amber-600 bg-amber-100";
  return "text-red-600 bg-red-100";
}

function nivelColor(n: number): string {
  if (n >= 8) return "bg-green-500";
  if (n >= 5) return "bg-amber-500";
  return "bg-red-400";
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function NegociacionesPage() {
  const { puede, cargando: cargandoPermisos } = usePermisos();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [comId, setComId] = useState<string | null>(null);
  const [esDirector, setEsDirector] = useState(false);
  const [accionando, setAccionando] = useState<string | null>(null);
  const [accionModal, setAccionModal] = useState<{ lead: Lead; accion: Accion } | null>(null);
  const [sorterPor, setSorterPor] = useState<"dias" | "nivel" | "updated">("dias");
  const [filtroComercial, setFiltroComercial] = useState<string>("todos");
  const [comercialesLista, setComerciales] = useState<{ id: string; nombre: string }[]>([]);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user?.email) return;
      const { data } = await supabase.from("comerciales").select("id, rol").eq("email", user.email).single();
      if (data) {
        setComId(data.id);
        setEsDirector(["admin", "director", "manager"].includes(data.rol));
      }
    });
    supabase.from("comerciales").select("id, nombre").eq("activo", true).order("nombre")
      .then(({ data }) => setComerciales(data ?? []));
  }, []);

  const cargar = useCallback(async () => {
    if (!comId) return;
    setLoading(true);

    let q = supabase
      .from("leads")
      .select("id, nombre, apellidos, empresa, ciudad, telefono, telefono_whatsapp, producto_interes_principal, productos_recomendados, nivel_interes, proxima_accion, proxima_accion_fecha, proxima_accion_nota, comercial_asignado, updated_at, created_at, notas, comerciales(nombre, apellidos)")
      .eq("estado", "en_negociacion")
      .order("updated_at", { ascending: true });

    if (!esDirector) {
      q = q.eq("comercial_asignado", comId);
    } else if (filtroComercial !== "todos") {
      q = q.eq("comercial_asignado", filtroComercial);
    }

    const { data } = await q.limit(200);

    // Load last interaction for each lead
    const now = new Date();
    const processed: Lead[] = (data ?? []).map((l: Record<string, unknown>) => {
      const diasEnNeg = Math.floor((now.getTime() - new Date(l.updated_at as string).getTime()) / (1000 * 60 * 60 * 24));
      return { ...l, dias_en_neg: diasEnNeg, ultima_interaccion: null } as Lead;
    });

    // Sort
    processed.sort((a, b) => {
      if (sorterPor === "dias") return b.dias_en_neg - a.dias_en_neg;
      if (sorterPor === "nivel") return b.nivel_interes - a.nivel_interes;
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });

    setLeads(processed);
    setLoading(false);
  }, [comId, esDirector, filtroComercial, sorterPor]);

  useEffect(() => {
    if (comId !== null) cargar();
  }, [cargar, comId]);

  async function ejecutarAccion(leadId: string, nuevoEstado: string) {
    setAccionando(leadId);
    await supabase.from("leads").update({ estado: nuevoEstado, updated_at: new Date().toISOString() }).eq("id", leadId);
    setAccionModal(null);
    setLeads(prev => prev.filter(l => l.id !== leadId));
    setAccionando(null);
  }

  async function programarAccion(leadId: string, accion: string, fecha: string) {
    await supabase.from("leads").update({
      proxima_accion: accion,
      proxima_accion_fecha: fecha,
      updated_at: new Date().toISOString(),
    }).eq("id", leadId);
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, proxima_accion: accion, proxima_accion_fecha: fecha } : l));
  }

  const sinAccion = leads.filter(l => !l.proxima_accion || l.proxima_accion === "ninguna" || !l.proxima_accion_fecha).length;
  const vencidas = leads.filter(l => l.proxima_accion_fecha && new Date(l.proxima_accion_fecha) < new Date()).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Negociaciones activas</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {loading ? "Cargando..." : `${leads.length} deals en negociación`}
            {!loading && vencidas > 0 && (
              <span className="ml-2 text-xs text-red-600 font-medium">{vencidas} con acción vencida</span>
            )}
            {!loading && sinAccion > 0 && (
              <span className="ml-2 text-xs text-amber-600 font-medium">{sinAccion} sin próxima acción</span>
            )}
          </p>
        </div>
        <button onClick={cargar} className="px-3 py-2 text-sm font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
          ↺ Actualizar
        </button>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
          {(["dias", "nivel", "updated"] as const).map(s => (
            <button
              key={s}
              onClick={() => setSorterPor(s)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${sorterPor === s ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
              {{ dias: "Más tiempo parado", nivel: "Mayor interés", updated: "Más reciente" }[s]}
            </button>
          ))}
        </div>
        {esDirector && (
          <select
            value={filtroComercial}
            onChange={e => setFiltroComercial(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-600 focus:outline-none focus:border-orange-300"
          >
            <option value="todos">Todos los comerciales</option>
            {comercialesLista.map(c => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
        )}
      </div>

      {/* Deal cards */}
      {loading ? (
        <div className="py-24 text-center text-sm text-slate-400">Cargando negociaciones...</div>
      ) : leads.length === 0 ? (
        <div className="py-24 text-center">
          <p className="text-4xl mb-3">🎯</p>
          <p className="text-base font-semibold text-slate-700 mb-1">Sin negociaciones activas</p>
          <p className="text-sm text-slate-400">No hay leads en estado de negociación ahora mismo.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {leads.map(lead => {
            const nombre = [lead.nombre, lead.apellidos].filter(Boolean).join(" ");
            const com = lead.comerciales as unknown as { nombre: string; apellidos: string | null } | null;
            const comNombre = com ? `${com.nombre}${com.apellidos ? " " + com.apellidos.charAt(0) + "." : ""}` : "Sin asignar";
            const producto = lead.producto_interes_principal ?? (lead.productos_recomendados?.[0] ?? null);
            const proximo = lead.proxima_accion && lead.proxima_accion !== "ninguna" && lead.proxima_accion_fecha;
            const proximo_fecha = lead.proxima_accion_fecha ? new Date(lead.proxima_accion_fecha) : null;
            const proximo_vencido = proximo_fecha && proximo_fecha < new Date();
            const enPronto = proximo_fecha && proximo_fecha <= new Date(Date.now() + 24 * 3600 * 1000);
            return (
              <div key={lead.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="flex items-start gap-4 px-5 py-4">
                  {/* Interest level */}
                  <div className="flex-shrink-0 w-10 pt-0.5">
                    <div className="flex flex-col gap-0.5">
                      {[...Array(10)].map((_, i) => (
                        <div key={i} className={`h-0.5 rounded-full ${i < lead.nivel_interes ? nivelColor(lead.nivel_interes) : "bg-slate-100"}`} />
                      )).reverse()}
                    </div>
                    <p className="text-xs text-center text-slate-400 mt-1">{lead.nivel_interes}/10</p>
                  </div>

                  {/* Main info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <p className="text-base font-semibold text-slate-900">{nombre}</p>
                      <span className={`text-xs font-semibold rounded-full px-2 py-0.5 ${diasColor(lead.dias_en_neg)}`}>
                        {lead.dias_en_neg === 0 ? "Hoy" : `${lead.dias_en_neg}d parado`}
                      </span>
                      {esDirector && (
                        <span className="text-xs text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">{comNombre}</span>
                      )}
                    </div>
                    <p className="text-sm text-slate-600 truncate">
                      {[lead.empresa, lead.ciudad, producto ? (PRODUCTOS_LABEL[producto] ?? producto) : null].filter(Boolean).join(" · ")}
                    </p>

                    {/* Next action */}
                    {proximo && (
                      <div className={`mt-2 flex items-center gap-2 text-xs rounded-md px-2 py-1.5 w-fit ${proximo_vencido ? "bg-red-50 text-red-700" : enPronto ? "bg-amber-50 text-amber-700" : "bg-slate-50 text-slate-600"}`}>
                        <span>{
                          { llamar: "📞", whatsapp: "💬", reunion: "📅", enviar_info: "📎", email: "📧" }[lead.proxima_accion ?? ""] ?? "📌"
                        }</span>
                        <span>{lead.proxima_accion} · {proximo_fecha?.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" })}</span>
                        {proximo_vencido && <span className="font-semibold">vencida</span>}
                      </div>
                    )}
                    {!proximo && (
                      <div className="mt-2 flex items-center gap-2 text-xs text-amber-600 bg-amber-50 rounded-md px-2 py-1.5 w-fit">
                        ⚠️ Sin próxima acción programada
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Link
                      href={`/leads/${lead.id}`}
                      className="text-xs font-medium text-slate-600 border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50 transition-colors"
                    >
                      Ver
                    </Link>
                    <button
                      onClick={() => setAccionModal({ lead, accion: "cerrado_ganado" })}
                      className="text-xs font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg px-3 py-1.5 transition-colors"
                    >
                      Ganado ✅
                    </button>
                    <button
                      onClick={() => setAccionModal({ lead, accion: "cerrado_perdido" })}
                      className="text-xs font-medium text-red-600 border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-50 transition-colors"
                    >
                      Perdido
                    </button>
                  </div>
                </div>

                {/* Quick schedule next action */}
                <div className="border-t border-slate-50 px-5 py-2 flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-slate-400">Programar:</span>
                  {ACCIONES_NEXT.map(a => (
                    <button
                      key={a.value}
                      onClick={async () => {
                        const fecha = new Date();
                        fecha.setDate(fecha.getDate() + 1);
                        fecha.setHours(10, 0, 0, 0);
                        await programarAccion(lead.id, a.value, fecha.toISOString());
                      }}
                      className="text-xs text-slate-500 hover:text-orange-600 hover:bg-orange-50 border border-transparent hover:border-orange-200 rounded-md px-2 py-1 transition-all"
                    >
                      {a.label}
                    </button>
                  ))}
                  {lead.telefono_whatsapp && (
                    <a
                      href={`https://wa.me/${lead.telefono_whatsapp.replace(/\D/g, "")}`}
                      target="_blank" rel="noreferrer"
                      className="ml-auto text-xs text-green-700 bg-green-50 hover:bg-green-100 border border-green-200 rounded-md px-2 py-1 transition-colors"
                    >
                      💬 Abrir WA
                    </a>
                  )}
                  {lead.telefono && (
                    <a
                      href={`tel:${lead.telefono}`}
                      className="text-xs text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md px-2 py-1 transition-colors"
                    >
                      📞 Llamar
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Action confirmation modal */}
      {accionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.4)" }}>
          <div className="bg-white rounded-2xl p-6 shadow-2xl w-full max-w-md">
            <p className="text-lg font-semibold text-slate-900 mb-1">
              {accionModal.accion === "cerrado_ganado" ? "✅ Marcar como ganado" : "❌ Marcar como perdido"}
            </p>
            <p className="text-sm text-slate-500 mb-4">
              {[accionModal.lead.nombre, accionModal.lead.apellidos].filter(Boolean).join(" ")}
              {accionModal.lead.empresa && ` · ${accionModal.lead.empresa}`}
            </p>
            {accionModal.accion === "cerrado_ganado" ? (
              <p className="text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2 mb-4">
                El lead pasará a estado "Cerrado ganado". Recuerda crear el cliente en Cartera para registrar la póliza.
              </p>
            ) : (
              <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mb-4">
                El lead pasará a estado "Cerrado perdido". Se te pedirá el motivo de la pérdida en la ficha del lead.
              </p>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setAccionModal(null)}
                className="flex-1 px-4 py-2.5 text-sm font-medium border border-slate-200 rounded-xl text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => ejecutarAccion(accionModal.lead.id, accionModal.accion)}
                disabled={!!accionando}
                className={`flex-1 px-4 py-2.5 text-sm font-semibold rounded-xl text-white transition-colors ${
                  accionModal.accion === "cerrado_ganado"
                    ? "bg-green-600 hover:bg-green-700"
                    : "bg-red-600 hover:bg-red-700"
                }`}
              >
                {accionando ? "Guardando..." : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
