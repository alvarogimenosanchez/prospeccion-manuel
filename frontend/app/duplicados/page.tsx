"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { usePermisos } from "@/components/PermisosProvider";
import { SinAcceso } from "@/components/SinAcceso";

// ─── Types ─────────────────────────────────────────────────────────────────────

type LeadMin = {
  id: string;
  nombre: string;
  apellidos: string | null;
  empresa: string | null;
  telefono: string | null;
  telefono_whatsapp: string | null;
  email: string | null;
  estado: string;
  created_at: string;
  comercial_asignado: string | null;
  comerciales: { nombre: string; apellidos: string | null } | null;
};

type GrupoDuplicados = {
  clave: string;
  tipo: "telefono" | "whatsapp" | "email" | "nombre";
  valor: string;
  leads: LeadMin[];
  revisado: boolean;
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

const ESTADO_CONFIG: Record<string, { label: string; color: string }> = {
  nuevo:              { label: "Nuevo",          color: "bg-slate-100 text-slate-600" },
  enriquecido:        { label: "Enriquecido",    color: "bg-blue-100 text-blue-700" },
  segmentado:         { label: "Segmentado",     color: "bg-indigo-100 text-indigo-700" },
  mensaje_generado:   { label: "Msg. generado",  color: "bg-purple-100 text-purple-700" },
  mensaje_enviado:    { label: "Contactado",     color: "bg-amber-100 text-amber-700" },
  respondio:          { label: "Respondió",      color: "bg-green-100 text-green-700" },
  cita_agendada:      { label: "Cita agendada",  color: "bg-orange-100 text-orange-700" },
  en_negociacion:     { label: "Negociación",    color: "bg-orange-200 text-orange-800" },
  cerrado_ganado:     { label: "Cerrado ✅",     color: "bg-green-200 text-green-800" },
  cerrado_perdido:    { label: "Perdido",        color: "bg-red-100 text-red-700" },
  descartado:         { label: "Descartado",     color: "bg-slate-200 text-slate-500" },
};

const TIPO_LABEL: Record<string, string> = {
  telefono: "Mismo teléfono",
  whatsapp: "Mismo WhatsApp",
  email: "Mismo email",
  nombre: "Mismo nombre",
};

const TIPO_EMOJI: Record<string, string> = {
  telefono: "📞",
  whatsapp: "💬",
  email: "📧",
  nombre: "👤",
};

function normalizarTel(t: string | null): string | null {
  if (!t) return null;
  return t.replace(/\D/g, "").replace(/^34/, "").slice(-9);
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function DuplicadosPage() {
  const { puede, cargando: cargandoPermisos } = usePermisos();
  const [grupos, setGrupos] = useState<GrupoDuplicados[]>([]);
  const [loading, setLoading] = useState(true);
  const [revisados, setRevisados] = useState<Set<string>>(new Set());
  const [filtroTipo, setFiltroTipo] = useState<"todos" | "telefono" | "whatsapp" | "email" | "nombre">("todos");
  const [mostrarRevisados, setMostrarRevisados] = useState(false);
  const [procesando, setProcesando] = useState<Set<string>>(new Set());
  const [mensaje, setMensaje] = useState<{ clave: string; texto: string; tipo: "ok" | "err" } | null>(null);

  // Load reviewed keys from localStorage
  useEffect(() => {
    const stored = localStorage.getItem("dup_revisados");
    if (stored) {
      try { setRevisados(new Set(JSON.parse(stored))); } catch { /* ignore */ }
    }
  }, []);

  const cargar = useCallback(async () => {
    setLoading(true);

    const { data: leads } = await supabase
      .from("leads")
      .select("id, nombre, apellidos, empresa, telefono, telefono_whatsapp, email, estado, created_at, comercial_asignado, comerciales(nombre, apellidos)")
      .not("estado", "in", "(cerrado_perdido,descartado)")
      .order("created_at", { ascending: false })
      .limit(2000);

    if (!leads) { setLoading(false); return; }

    const leadsTyped = leads as unknown as LeadMin[];

    // Build duplicate groups
    const grupos: Map<string, GrupoDuplicados> = new Map();

    // By normalized phone
    const telMap = new Map<string, LeadMin[]>();
    for (const l of leadsTyped) {
      const tel = normalizarTel(l.telefono);
      if (tel && tel.length >= 9) {
        if (!telMap.has(tel)) telMap.set(tel, []);
        telMap.get(tel)!.push(l);
      }
    }
    for (const [tel, items] of telMap) {
      if (items.length > 1) {
        const clave = `tel-${tel}`;
        grupos.set(clave, { clave, tipo: "telefono", valor: tel, leads: items, revisado: false });
      }
    }

    // By normalized WhatsApp
    const waMap = new Map<string, LeadMin[]>();
    for (const l of leadsTyped) {
      const wa = normalizarTel(l.telefono_whatsapp);
      if (wa && wa.length >= 9) {
        if (!waMap.has(wa)) waMap.set(wa, []);
        waMap.get(wa)!.push(l);
      }
    }
    for (const [wa, items] of waMap) {
      if (items.length > 1) {
        const clave = `wa-${wa}`;
        // Skip if same leads already captured in tel group
        const existente = [...grupos.values()].find(g => g.tipo === "telefono" && g.leads.map(l => l.id).join(",") === items.map(l => l.id).join(","));
        if (!existente) {
          grupos.set(clave, { clave, tipo: "whatsapp", valor: wa, leads: items, revisado: false });
        }
      }
    }

    // By email
    const emailMap = new Map<string, LeadMin[]>();
    for (const l of leadsTyped) {
      const em = l.email?.toLowerCase().trim();
      if (em) {
        if (!emailMap.has(em)) emailMap.set(em, []);
        emailMap.get(em)!.push(l);
      }
    }
    for (const [em, items] of emailMap) {
      if (items.length > 1) {
        grupos.set(`em-${em}`, { clave: `em-${em}`, tipo: "email", valor: em, leads: items, revisado: false });
      }
    }

    // By normalized name + empresa (fuzzy: same first name + apellido)
    const nameMap = new Map<string, LeadMin[]>();
    for (const l of leadsTyped) {
      const key = `${l.nombre?.toLowerCase().trim()}_${l.apellidos?.toLowerCase().trim() ?? ""}`;
      if (key.length > 3 && l.apellidos) {
        if (!nameMap.has(key)) nameMap.set(key, []);
        nameMap.get(key)!.push(l);
      }
    }
    for (const [key, items] of nameMap) {
      if (items.length > 1) {
        const clave = `nm-${key}`;
        // Skip if already captured in phone/email group
        const alreadyCaptured = [...grupos.values()].some(g =>
          g.leads.map(l => l.id).sort().join(",") === items.map(l => l.id).sort().join(",")
        );
        if (!alreadyCaptured) {
          const [nombre, apellido] = key.split("_");
          grupos.set(clave, { clave, tipo: "nombre", valor: `${nombre} ${apellido}`.trim(), leads: items, revisado: false });
        }
      }
    }

    // Sort: phone/email first (more reliable), then name
    const sorted = [...grupos.values()].sort((a, b) => {
      const order = { telefono: 0, whatsapp: 1, email: 2, nombre: 3 };
      return order[a.tipo] - order[b.tipo];
    });

    setGrupos(sorted);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!cargandoPermisos && puede("asignar_leads")) cargar();
  }, [cargar, cargandoPermisos, puede]);

  function marcarRevisado(clave: string) {
    const nuevos = new Set(revisados);
    nuevos.add(clave);
    setRevisados(nuevos);
    localStorage.setItem("dup_revisados", JSON.stringify([...nuevos]));
  }

  function desmarcarRevisado(clave: string) {
    const nuevos = new Set(revisados);
    nuevos.delete(clave);
    setRevisados(nuevos);
    localStorage.setItem("dup_revisados", JSON.stringify([...nuevos]));
  }

  async function mantenerYDescartarOtros(grupo: GrupoDuplicados, leadId: string) {
    const otrosIds = grupo.leads.filter(l => l.id !== leadId).map(l => l.id);
    if (otrosIds.length === 0) return;
    const ganador = grupo.leads.find(l => l.id === leadId);
    const nombreGanador = [ganador?.nombre, ganador?.apellidos].filter(Boolean).join(" ");
    if (!confirm(`¿Mantener "${nombreGanador}" y descartar los otros ${otrosIds.length} duplicado(s)?\n\nLos descartados podrán recuperarse desde el detalle del lead.`)) return;

    setProcesando(prev => new Set(prev).add(grupo.clave));
    setMensaje(null);
    try {
      const { error } = await supabase
        .from("leads")
        .update({ estado: "descartado", motivo_descarte: "duplicado", updated_at: new Date().toISOString() })
        .in("id", otrosIds);
      if (error) throw error;
      marcarRevisado(grupo.clave);
      setMensaje({ clave: grupo.clave, texto: `✓ ${otrosIds.length} duplicado(s) descartado(s)`, tipo: "ok" });
      setTimeout(() => setMensaje(null), 3500);
      cargar();
    } catch (e) {
      const msg = (e as { message?: string })?.message ?? "Error al descartar";
      setMensaje({ clave: grupo.clave, texto: msg, tipo: "err" });
    } finally {
      setProcesando(prev => { const s = new Set(prev); s.delete(grupo.clave); return s; });
    }
  }

  async function fusionarEnEste(grupo: GrupoDuplicados, leadId: string) {
    const ganador = grupo.leads.find(l => l.id === leadId);
    const otros = grupo.leads.filter(l => l.id !== leadId);
    if (!ganador || otros.length === 0) return;
    const nombreGanador = [ganador.nombre, ganador.apellidos].filter(Boolean).join(" ");
    if (!confirm(`Fusionar en "${nombreGanador}":\n• Se copiarán los datos faltantes (teléfono, email, empresa…) desde los otros ${otros.length} lead(s).\n• Los otros se descartarán como duplicados.\n\n¿Continuar?`)) return;

    setProcesando(prev => new Set(prev).add(grupo.clave));
    setMensaje(null);
    try {
      // Obtener datos completos del ganador y otros
      const ids = grupo.leads.map(l => l.id);
      const { data: completos, error: errFetch } = await supabase
        .from("leads")
        .select("id, nombre, apellidos, empresa, telefono, telefono_whatsapp, email, web, direccion, ciudad, sector, cargo, notas, productos_recomendados, comercial_asignado")
        .in("id", ids);
      if (errFetch) throw errFetch;

      const winnerFull = (completos ?? []).find(l => l.id === leadId);
      const othersFull = (completos ?? []).filter(l => l.id !== leadId);
      if (!winnerFull) throw new Error("Lead ganador no encontrado");

      // Campos a fusionar: si están vacíos en el ganador, copiar del primero que lo tenga
      type Field = keyof typeof winnerFull;
      const camposCopiables: Field[] = ["empresa", "telefono", "telefono_whatsapp", "email", "web", "direccion", "ciudad", "sector", "cargo", "notas", "comercial_asignado"];
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      for (const campo of camposCopiables) {
        if (!winnerFull[campo]) {
          for (const otro of othersFull) {
            if (otro[campo]) { updates[campo] = otro[campo]; break; }
          }
        }
      }
      // Productos recomendados: unión de todos
      const productosUnion = new Set<string>();
      for (const l of completos ?? []) {
        for (const p of (l.productos_recomendados ?? []) as string[]) productosUnion.add(p);
      }
      if (productosUnion.size > 0) updates.productos_recomendados = [...productosUnion];

      if (Object.keys(updates).length > 1) {
        const { error: errUpdate } = await supabase.from("leads").update(updates).eq("id", leadId);
        if (errUpdate) throw errUpdate;
      }

      // Marcar otros como descartados
      const otrosIds = othersFull.map(l => l.id);
      const { error: errDescarte } = await supabase
        .from("leads")
        .update({ estado: "descartado", motivo_descarte: `fusionado_con:${leadId}`, updated_at: new Date().toISOString() })
        .in("id", otrosIds);
      if (errDescarte) throw errDescarte;

      marcarRevisado(grupo.clave);
      setMensaje({ clave: grupo.clave, texto: `✓ Fusionado · ${otrosIds.length} duplicado(s) descartado(s)`, tipo: "ok" });
      setTimeout(() => setMensaje(null), 3500);
      cargar();
    } catch (e) {
      const msg = (e as { message?: string })?.message ?? "Error al fusionar";
      setMensaje({ clave: grupo.clave, texto: msg, tipo: "err" });
    } finally {
      setProcesando(prev => { const s = new Set(prev); s.delete(grupo.clave); return s; });
    }
  }

  if (!cargandoPermisos && !puede("asignar_leads")) return <SinAcceso />;

  const gruposFiltrados = grupos
    .map(g => ({ ...g, revisado: revisados.has(g.clave) }))
    .filter(g => {
      if (!mostrarRevisados && g.revisado) return false;
      if (filtroTipo !== "todos" && g.tipo !== filtroTipo) return false;
      return true;
    });

  const conteoPorTipo = {
    todos: grupos.filter(g => !revisados.has(g.clave)).length,
    telefono: grupos.filter(g => !revisados.has(g.clave) && g.tipo === "telefono").length,
    whatsapp: grupos.filter(g => !revisados.has(g.clave) && g.tipo === "whatsapp").length,
    email: grupos.filter(g => !revisados.has(g.clave) && g.tipo === "email").length,
    nombre: grupos.filter(g => !revisados.has(g.clave) && g.tipo === "nombre").length,
  };

  const totalLeadsAfectados = new Set(
    grupos.filter(g => !revisados.has(g.clave)).flatMap(g => g.leads.map(l => l.id))
  ).size;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Leads duplicados</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {loading ? "Analizando base de datos..." : grupos.length === 0 ? "Sin duplicados detectados" : `${conteoPorTipo.todos} grupos de posibles duplicados · ${totalLeadsAfectados} leads afectados`}
          </p>
        </div>
        <button
          onClick={cargar}
          className="px-3 py-2 text-sm font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
        >
          ↺ Reanalizar
        </button>
      </div>

      {/* Info card */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
        <p className="text-sm text-amber-800">
          <strong>Método de detección:</strong> Teléfono y email idénticos (alta fiabilidad) · Nombre completo exacto (requiere revisión manual). Los leads descartados y perdidos se excluyen del análisis.
        </p>
      </div>

      {/* Stats row */}
      {!loading && grupos.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {(["telefono", "whatsapp", "email", "nombre"] as const).map(tipo => (
            <div key={tipo} className="bg-white rounded-xl border border-slate-200 px-4 py-3">
              <p className="text-xs text-slate-500 mb-0.5">{TIPO_LABEL[tipo]}</p>
              <p className="text-xl font-bold text-slate-900">{grupos.filter(g => g.tipo === tipo).length}</p>
              <p className="text-xs text-slate-400">{TIPO_EMOJI[tipo]} grupos</p>
            </div>
          ))}
        </div>
      )}

      {/* Filtros */}
      <div className="flex items-center gap-2 flex-wrap">
        {(["todos", "telefono", "whatsapp", "email", "nombre"] as const).map(t => (
          <button
            key={t}
            onClick={() => setFiltroTipo(t)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-full transition-colors ${
              filtroTipo === t
                ? "bg-slate-900 text-white"
                : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {t !== "todos" && TIPO_EMOJI[t]}{" "}
            {t === "todos" ? "Todos" : TIPO_LABEL[t]}
            {conteoPorTipo[t] > 0 && (
              <span className={`text-xs rounded-full px-1.5 leading-5 ${filtroTipo === t ? "bg-white/20" : "bg-slate-100"}`}>
                {conteoPorTipo[t]}
              </span>
            )}
          </button>
        ))}
        <button
          onClick={() => setMostrarRevisados(v => !v)}
          className={`ml-auto text-xs px-3 py-1.5 rounded-full border transition-colors ${
            mostrarRevisados ? "bg-slate-200 text-slate-700 border-slate-300" : "border-slate-200 text-slate-500 hover:bg-slate-50"
          }`}
        >
          {mostrarRevisados ? "Ocultar revisados" : `Mostrar revisados (${revisados.size})`}
        </button>
      </div>

      {/* Groups */}
      {loading ? (
        <div className="py-24 text-center text-sm text-slate-400">Analizando base de datos...</div>
      ) : gruposFiltrados.length === 0 ? (
        <div className="py-24 text-center">
          <p className="text-4xl mb-3">✅</p>
          <p className="text-base font-semibold text-slate-700 mb-1">Sin duplicados pendientes</p>
          <p className="text-sm text-slate-400">
            {revisados.size > 0 && !mostrarRevisados
              ? <>Has marcado {revisados.size} grupos como revisados. <button onClick={() => setMostrarRevisados(true)} className="underline text-orange-500">Ver revisados</button></>
              : "No se detectaron leads con los mismos datos de contacto"}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {gruposFiltrados.map(grupo => (
            <div
              key={grupo.clave}
              className={`bg-white rounded-xl border overflow-hidden ${grupo.revisado ? "border-slate-200 opacity-60" : "border-slate-200"}`}
            >
              {/* Group header */}
              <div className="flex items-center justify-between px-5 py-3 bg-slate-50 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <span className="text-base">{TIPO_EMOJI[grupo.tipo]}</span>
                  <div>
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{TIPO_LABEL[grupo.tipo]}</span>
                    <span className="ml-2 text-sm font-medium text-slate-800">{grupo.valor}</span>
                  </div>
                  <span className="ml-2 text-xs text-slate-400 bg-slate-200 rounded-full px-2 py-0.5">{grupo.leads.length} leads</span>
                </div>
                <div className="flex items-center gap-2">
                  {grupo.revisado ? (
                    <button
                      onClick={() => desmarcarRevisado(grupo.clave)}
                      className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      Desmarcar revisado
                    </button>
                  ) : (
                    <button
                      onClick={() => marcarRevisado(grupo.clave)}
                      className="flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 border border-green-200 rounded-md px-2.5 py-1 transition-colors"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      Marcar revisado
                    </button>
                  )}
                </div>
              </div>

              {/* Lead list */}
              <div className="divide-y divide-slate-50">
                {grupo.leads.map((lead, i) => {
                  const nombreCompleto = [lead.nombre, lead.apellidos].filter(Boolean).join(" ");
                  const estadoCfg = ESTADO_CONFIG[lead.estado] ?? { label: lead.estado, color: "bg-slate-100 text-slate-600" };
                  const comercialNombre = lead.comerciales
                    ? `${(lead.comerciales as unknown as { nombre: string; apellidos: string | null }).nombre}`
                    : "Sin asignar";
                  return (
                    <div key={lead.id} className={`flex items-center gap-4 px-5 py-3.5 ${i === 0 ? "" : "hover:bg-slate-50"} transition-colors group`}>
                      <div className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                        style={{ background: i === 0 ? "#fef3c7" : "#f1edeb", color: i === 0 ? "#92400e" : "#6b7280" }}>
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-slate-800 truncate">{nombreCompleto}</p>
                          <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${estadoCfg.color}`}>{estadoCfg.label}</span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5 truncate">
                          {[lead.empresa, lead.telefono ?? lead.telefono_whatsapp, lead.email, comercialNombre].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs text-slate-400">
                          {new Date(lead.created_at).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "2-digit" })}
                        </span>
                        <Link
                          href={`/leads/${lead.id}`}
                          className="text-xs font-medium text-slate-500 hover:text-orange-600 border border-slate-200 hover:border-orange-300 rounded-md px-2 py-1 transition-colors"
                        >
                          Ver →
                        </Link>
                        {!grupo.revisado && (
                          <>
                            <button
                              onClick={() => fusionarEnEste(grupo, lead.id)}
                              disabled={procesando.has(grupo.clave)}
                              title="Copia datos faltantes desde los otros y los descarta"
                              className="text-xs font-medium text-white border rounded-md px-2 py-1 transition-colors disabled:opacity-50"
                              style={{ background: "#ea650d", borderColor: "#ea650d" }}
                            >
                              ⇄ Fusionar aquí
                            </button>
                            <button
                              onClick={() => mantenerYDescartarOtros(grupo, lead.id)}
                              disabled={procesando.has(grupo.clave)}
                              title="Mantiene este lead y descarta los demás como duplicados"
                              className="text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-md px-2 py-1 transition-colors disabled:opacity-50"
                            >
                              ✓ Mantener éste
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Group footer hint */}
              {!grupo.revisado && (
                <div className="px-5 py-2.5 bg-slate-50 border-t border-slate-100">
                  {mensaje && mensaje.clave === grupo.clave ? (
                    <p className={`text-xs font-medium ${mensaje.tipo === "ok" ? "text-emerald-700" : "text-red-600"}`}>
                      {mensaje.texto}
                    </p>
                  ) : procesando.has(grupo.clave) ? (
                    <p className="text-xs text-slate-500">Procesando…</p>
                  ) : (
                    <p className="text-xs text-slate-400">
                      <strong>Mantener éste</strong> descarta los otros · <strong>Fusionar aquí</strong> copia datos faltantes y descarta los demás.
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
