"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { formatDistanceToNow, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { Suspense } from "react";

// ─── Types ──────────────────────────────────────────────────────────────────

type ResultadoLead = {
  tipo: "lead";
  id: string;
  titulo: string;
  subtitulo: string;
  meta: string;
  href: string;
  estado: string;
  temperatura: string;
};

type ResultadoCliente = {
  tipo: "cliente";
  id: string;
  titulo: string;
  subtitulo: string;
  meta: string;
  href: string;
  producto: string | null;
};

type ResultadoInteraccion = {
  tipo: "interaccion";
  id: string;
  titulo: string;
  subtitulo: string;
  meta: string;
  href: string;
  lead_id: string;
};

type Resultado = ResultadoLead | ResultadoCliente | ResultadoInteraccion;

// ─── Constants ───────────────────────────────────────────────────────────────

const TIPO_CFG = {
  lead:        { label: "Lead",       emoji: "👤", bg: "bg-blue-50",   text: "text-blue-700"   },
  cliente:     { label: "Cliente",    emoji: "💼", bg: "bg-green-50",  text: "text-green-700"  },
  interaccion: { label: "Mensaje",    emoji: "💬", bg: "bg-purple-50", text: "text-purple-700" },
};

const TEMP_COLOR: Record<string, string> = {
  caliente: "text-red-600", templado: "text-amber-600", frio: "text-blue-500",
};

const ESTADO_DOT: Record<string, string> = {
  nuevo: "bg-slate-400", segmentado: "bg-sky-400", mensaje_enviado: "bg-blue-500",
  respondio: "bg-amber-400", cita_agendada: "bg-orange-500", en_negociacion: "bg-violet-500",
  cerrado_ganado: "bg-emerald-500", cerrado_perdido: "bg-red-400",
};

const PRODUCTOS_LABEL: Record<string, string> = {
  contigo_autonomo: "C. Autónomo", contigo_pyme: "C. Pyme", contigo_familia: "C. Familia",
  contigo_futuro: "C. Futuro", contigo_senior: "C. Senior", sialp: "SIALP",
  liderplus: "LiderPlus", sanitas_salud: "Sanitas", mihogar: "MiHogar", hipotecas: "Hipoteca",
};

function resaltar(texto: string, q: string): string {
  if (!q.trim()) return texto;
  const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
  return texto.replace(re, "<mark class=\"bg-yellow-100 text-yellow-900\">$1</mark>");
}

// ─── Search component (needs to be in Suspense for useSearchParams) ──────────

function BuscarContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [buscado, setBuscado] = useState(false);
  const [filtroTipo, setFiltroTipo] = useState<"" | "lead" | "cliente" | "interaccion">("");
  const inputRef = useRef<HTMLInputElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Focus input on load
  useEffect(() => { inputRef.current?.focus(); }, []);

  const buscar = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setResultados([]); setBuscado(false); return; }
    setBuscando(true);
    const patron = `%${q.trim()}%`;

    const [{ data: leads }, { data: clientes }, { data: inters }] = await Promise.all([
      supabase.from("leads")
        .select("id, nombre, apellidos, empresa, sector, ciudad, telefono, telefono_whatsapp, email, estado, temperatura, nivel_interes, updated_at")
        .or(`nombre.ilike.${patron},apellidos.ilike.${patron},empresa.ilike.${patron},telefono.ilike.${patron},telefono_whatsapp.ilike.${patron},email.ilike.${patron},ciudad.ilike.${patron}`)
        .limit(20),
      supabase.from("clientes")
        .select("id, nombre, apellidos, empresa, producto, telefono, estado, created_at")
        .or(`nombre.ilike.${patron},apellidos.ilike.${patron},empresa.ilike.${patron},telefono.ilike.${patron}`)
        .limit(15),
      supabase.from("interactions")
        .select("id, lead_id, tipo, mensaje, created_at, leads(nombre, apellidos, empresa)")
        .ilike("mensaje", patron)
        .limit(10),
    ]);

    const res: Resultado[] = [];

    for (const l of leads ?? []) {
      const nombre = [l.nombre, l.apellidos].filter(Boolean).join(" ");
      const meta_parts = [l.sector, l.ciudad, l.temperatura === "caliente" ? "🔥 Caliente" : null].filter(Boolean);
      res.push({
        tipo: "lead", id: l.id,
        titulo: nombre,
        subtitulo: l.empresa ?? l.sector ?? "",
        meta: meta_parts.join(" · "),
        href: `/leads/${l.id}`,
        estado: l.estado,
        temperatura: l.temperatura,
      });
    }

    for (const c of clientes ?? []) {
      const nombre = [c.nombre, c.apellidos].filter(Boolean).join(" ");
      res.push({
        tipo: "cliente", id: c.id,
        titulo: nombre,
        subtitulo: c.empresa ?? "",
        meta: c.producto ? (PRODUCTOS_LABEL[c.producto] ?? c.producto) : "",
        href: `/clientes/${c.id}`,
        producto: c.producto,
      });
    }

    for (const i of inters ?? []) {
      const lead = i.leads as unknown as { nombre: string; apellidos: string | null; empresa: string | null } | null;
      const leadNombre = lead ? [lead.nombre, lead.apellidos].filter(Boolean).join(" ") : "Lead desconocido";
      res.push({
        tipo: "interaccion", id: i.id,
        titulo: i.mensaje ? (i.mensaje.length > 80 ? i.mensaje.slice(0, 80) + "…" : i.mensaje) : "(sin texto)",
        subtitulo: leadNombre,
        meta: formatDistanceToNow(parseISO(i.created_at), { addSuffix: true, locale: es }),
        href: `/leads/${i.lead_id}`,
        lead_id: i.lead_id,
      });
    }

    setResultados(res);
    setBuscando(false);
    setBuscado(true);

    // Update URL
    router.replace(`/buscar?q=${encodeURIComponent(q.trim())}`, { scroll: false });
  }, [router]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setQuery(v);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => buscar(v), 350);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    buscar(query);
  }

  // Run initial search if URL has q param
  useEffect(() => {
    const q = searchParams.get("q");
    if (q && q.length >= 2) buscar(q);
  }, []);

  const datos = filtroTipo ? resultados.filter(r => r.tipo === filtroTipo) : resultados;

  const nLeads    = resultados.filter(r => r.tipo === "lead").length;
  const nClientes = resultados.filter(r => r.tipo === "cliente").length;
  const nInters   = resultados.filter(r => r.tipo === "interaccion").length;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header + search box */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 mb-4">Búsqueda global</h1>
        <form onSubmit={handleSubmit}>
          <div className="relative">
            <svg className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              ref={inputRef}
              value={query}
              onChange={handleChange}
              type="search"
              placeholder="Buscar por nombre, empresa, teléfono, email, mensaje..."
              className="w-full pl-11 pr-4 py-3 text-base border-2 border-slate-200 rounded-xl focus:outline-none focus:border-orange-400 bg-white shadow-sm"
            />
            {buscando && (
              <div className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
            )}
          </div>
        </form>
      </div>

      {/* Filter tabs */}
      {buscado && resultados.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {[
            { tipo: "" as const,          label: `Todos (${resultados.length})`     },
            { tipo: "lead" as const,      label: `Leads (${nLeads})`               },
            { tipo: "cliente" as const,   label: `Clientes (${nClientes})`         },
            { tipo: "interaccion" as const, label: `Mensajes (${nInters})`         },
          ].map(f => (
            <button key={f.tipo} onClick={() => setFiltroTipo(f.tipo)}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors ${
                filtroTipo === f.tipo
                  ? "border-orange-400 text-white"
                  : "border-slate-200 text-slate-600 hover:border-orange-200 bg-white"
              }`}
              style={filtroTipo === f.tipo ? { background: "#ea650d" } : undefined}>
              {f.label}
            </button>
          ))}
        </div>
      )}

      {/* Results */}
      {!buscado && query.length < 2 ? (
        <div className="py-16 text-center space-y-4">
          <p className="text-slate-400 text-sm">Escribe al menos 2 caracteres para buscar</p>
          <div className="flex flex-wrap justify-center gap-2 mt-4">
            {["nombre o apellidos", "empresa", "teléfono", "email", "ciudad", "texto de mensaje"].map(hint => (
              <span key={hint} className="text-xs px-3 py-1.5 bg-slate-100 text-slate-500 rounded-full">
                {hint}
              </span>
            ))}
          </div>
        </div>
      ) : buscando ? (
        <div className="py-16 text-center text-sm text-slate-400">Buscando...</div>
      ) : buscado && datos.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-slate-400 text-sm">No se encontraron resultados para "{query}"</p>
          <p className="text-xs text-slate-300 mt-2">Intenta con otro nombre, empresa o número de teléfono</p>
        </div>
      ) : (
        <div className="space-y-2">
          {datos.map(r => {
            const cfg = TIPO_CFG[r.tipo];
            return (
              <Link key={`${r.tipo}-${r.id}`} href={r.href}
                className="block bg-white rounded-xl border border-slate-200 px-4 py-3 hover:border-orange-300 hover:shadow-sm transition-all">
                <div className="flex items-start gap-3">
                  {/* Type badge */}
                  <div className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-base ${cfg.bg}`}>
                    {cfg.emoji}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="text-sm font-semibold text-slate-900"
                        dangerouslySetInnerHTML={{ __html: resaltar(r.titulo, query) }}
                      />
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.bg} ${cfg.text}`}>
                        {cfg.label}
                      </span>
                      {r.tipo === "lead" && (
                        <>
                          {r.estado && (
                            <span className="flex items-center gap-1 text-xs text-slate-400">
                              <span className={`w-1.5 h-1.5 rounded-full ${ESTADO_DOT[r.estado] ?? "bg-slate-300"}`} />
                              {r.estado.replace(/_/g, " ")}
                            </span>
                          )}
                          {r.temperatura && (
                            <span className={`text-xs font-medium ${TEMP_COLOR[r.temperatura] ?? ""}`}>
                              {r.temperatura}
                            </span>
                          )}
                        </>
                      )}
                      {r.tipo === "cliente" && r.producto && (
                        <span className="text-xs text-orange-700 bg-orange-50 px-2 py-0.5 rounded-full">
                          {PRODUCTOS_LABEL[r.producto] ?? r.producto}
                        </span>
                      )}
                    </div>
                    {r.subtitulo && (
                      <p className="text-xs text-slate-500 mt-0.5"
                        dangerouslySetInnerHTML={{ __html: resaltar(r.subtitulo, query) }}
                      />
                    )}
                    {r.meta && (
                      <p className="text-xs text-slate-400 mt-0.5">{r.meta}</p>
                    )}
                  </div>

                  <svg className="shrink-0 text-slate-300 mt-1" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Search tips */}
      {!buscado && (
        <div className="bg-white rounded-xl border border-slate-200 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Accesos directos</h2>
          <div className="grid grid-cols-2 gap-2">
            {[
              { href: "/leads",     icon: "👤", label: "Ver todos los leads"    },
              { href: "/clientes",  icon: "💼", label: "Ver todos los clientes" },
              { href: "/pipeline",  icon: "📊", label: "Ver pipeline"           },
              { href: "/agenda",    icon: "📅", label: "Ver agenda"             },
            ].map(a => (
              <Link key={a.href} href={a.href}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-100 hover:border-orange-200 hover:bg-orange-50 transition-colors text-sm text-slate-600">
                <span>{a.icon}</span>
                <span>{a.label}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function BuscarPage() {
  return (
    <Suspense fallback={<div className="py-16 text-center text-sm text-slate-400">Cargando búsqueda...</div>}>
      <BuscarContent />
    </Suspense>
  );
}
