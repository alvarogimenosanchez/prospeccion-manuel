"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { createClient } from "@/lib/supabase-browser";
import type { User } from "@supabase/supabase-js";

type NotifItem = {
  id: string;
  tipo: "respondio" | "asignado" | "cita" | "interno" | "renovacion";
  titulo: string;
  subtitulo?: string;
  href: string;
};

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [user, setUser] = useState<User | null>(null);
  const [notifs, setNotifs] = useState<NotifItem[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [comercialId, setComercialId] = useState<string | null>(null);
  const bellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
  }, []);

  useEffect(() => {
    if (!user?.email) return;
    supabase.from("comerciales").select("id").eq("email", user.email).single()
      .then(({ data }) => { if (data?.id) setComercialId(data.id); });
  }, [user]);

  useEffect(() => {
    if (!comercialId) return;
    cargarNotifs();
    const interval = setInterval(cargarNotifs, 60_000);
    return () => clearInterval(interval);
  }, [comercialId]);

  // Close dropdown on outside click
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function cargarNotifs() {
    if (!comercialId) return;
    const hoy = new Date().toISOString().split("T")[0];
    const hace48h = new Date(Date.now() - 48 * 3600_000).toISOString();
    const hace24h = new Date(Date.now() - 24 * 3600_000).toISOString();

    const en7dias = new Date(Date.now() + 7 * 86400_000).toISOString().split("T")[0];

    const [{ data: respondio }, { data: asignados }, { data: citas }, { data: mensajesInternos }, { data: enNegociacion }, { data: calientes }, { data: renovaciones }] = await Promise.all([
      supabase.from("leads").select("id, nombre, empresa, updated_at")
        .eq("comercial_asignado", comercialId)
        .eq("estado", "respondio")
        .order("updated_at", { ascending: false })
        .limit(5),
      supabase.from("leads").select("id, nombre, empresa, created_at")
        .eq("comercial_asignado", comercialId)
        .in("estado", ["nuevo", "enriquecido"])
        .gte("created_at", hace48h)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase.from("appointments").select("id, tipo, fecha_hora, notas_previas")
        .eq("comercial_id", comercialId)
        .gte("fecha_hora", `${hoy}T00:00:00`)
        .lte("fecha_hora", `${hoy}T23:59:59`)
        .in("estado", ["pendiente", "confirmada"])
        .order("fecha_hora")
        .limit(5),
      supabase.from("mensajes_internos").select("id, mensaje, created_at")
        .eq("para_comercial_id", comercialId)
        .not("leido_por", "cs", `["${comercialId}"]`)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase.from("leads").select("id, nombre, empresa, updated_at")
        .eq("comercial_asignado", comercialId)
        .eq("estado", "en_negociacion")
        .gte("updated_at", hace24h)
        .order("updated_at", { ascending: false })
        .limit(3),
      supabase.from("leads").select("id, nombre, empresa, updated_at")
        .eq("comercial_asignado", comercialId)
        .eq("temperatura", "caliente")
        .gte("updated_at", hace24h)
        .not("estado", "in", "(cerrado_ganado,cerrado_perdido,descartado,cita_agendada,en_negociacion)")
        .order("updated_at", { ascending: false })
        .limit(3),
      supabase.from("clientes").select("id, nombre, empresa, apellidos, fecha_renovacion, producto")
        .eq("comercial_asignado", comercialId)
        .eq("estado", "activo")
        .gte("fecha_renovacion", hoy)
        .lte("fecha_renovacion", en7dias)
        .order("fecha_renovacion")
        .limit(5),
    ]);

    const items: NotifItem[] = [
      ...(respondio ?? []).map(l => ({
        id: `r-${l.id}`,
        tipo: "respondio" as const,
        titulo: `${l.nombre}${l.empresa ? ` · ${l.empresa}` : ""} respondió`,
        subtitulo: "Pendiente de seguimiento",
        href: `/leads/${l.id}`,
      })),
      ...(asignados ?? []).map(l => ({
        id: `a-${l.id}`,
        tipo: "asignado" as const,
        titulo: `Nuevo lead asignado: ${l.nombre}`,
        subtitulo: l.empresa ?? undefined,
        href: `/leads/${l.id}`,
      })),
      ...(citas ?? []).map(c => ({
        id: `c-${c.id}`,
        tipo: "cita" as const,
        titulo: c.notas_previas ? c.notas_previas.slice(0, 50) : `Cita: ${c.tipo ?? "pendiente"}`,
        subtitulo: `Hoy · ${new Date(c.fecha_hora).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}`,
        href: "/agenda",
      })),
      ...(enNegociacion ?? []).map(l => ({
        id: `n-${l.id}`,
        tipo: "respondio" as const,
        titulo: `🔥 ${l.nombre}${l.empresa ? ` · ${l.empresa}` : ""} en negociación`,
        subtitulo: "Nuevo hoy — cierre cercano",
        href: `/leads/${l.id}`,
      })),
      ...(calientes ?? []).map(l => ({
        id: `h-${l.id}`,
        tipo: "asignado" as const,
        titulo: `⬆️ ${l.nombre}${l.empresa ? ` · ${l.empresa}` : ""} ahora caliente`,
        subtitulo: "Score mejorado — momento para contactar",
        href: `/leads/${l.id}`,
      })),
      ...(mensajesInternos ?? []).map(m => ({
        id: `i-${m.id}`,
        tipo: "interno" as const,
        titulo: m.mensaje.length > 60 ? m.mensaje.slice(0, 60) + "…" : m.mensaje,
        subtitulo: "Mensaje interno",
        href: "/mensajes-internos",
      })),
      ...(renovaciones ?? []).map(c => {
        const dias = Math.round((new Date(c.fecha_renovacion).getTime() - Date.now()) / 86400_000);
        return {
          id: `ren-${c.id}`,
          tipo: "renovacion" as const,
          titulo: `🔄 ${c.nombre}${c.apellidos ? ` ${c.apellidos}` : ""}${c.empresa ? ` · ${c.empresa}` : ""} — vence póliza`,
          subtitulo: `${c.producto ?? "Póliza"} · ${dias === 0 ? "hoy" : `en ${dias}d`}`,
          href: "/renovaciones",
        };
      }),
    ];

    setNotifs(items);
  }

  async function cerrarSesion() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  const NOTIF_ICON: Record<NotifItem["tipo"], string> = {
    respondio: "💬",
    asignado: "📋",
    cita: "📅",
    interno: "✉️",
    renovacion: "🔄",
  };

  const links = [
    { href: "/", label: "Dashboard" },
    { href: "/hoy", label: "🎯 Hoy" },
    { href: "/leads", label: "Leads" },
    { href: "/pipeline", label: "Pipeline" },
    { href: "/mensajes-internos", label: "Chat" },
    { href: "/agenda", label: "Agenda" },
    { href: "/prospeccion", label: "Prospección" },
    { href: "/mapa", label: "Mapa" },
    { href: "/metricas", label: "Métricas" },
    { href: "/desempeno", label: "Desempeño" },
    { href: "/clientes", label: "Clientes" },
    { href: "/equipos", label: "Equipos" },
    { href: "/recursos", label: "Recursos" },
    { href: "/ajustes", label: "Ajustes" },
  ];

  return (
    <nav className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between sticky top-0 z-10">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold" style={{ background: "#ea650d" }}>
            M
          </div>
          <span className="font-semibold text-slate-800 text-sm">Manuel · Prospección</span>
        </div>
        <div className="hidden sm:flex items-center gap-4 overflow-x-auto max-w-[calc(100vw-320px)] no-scrollbar">
          {links.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`text-sm transition-colors whitespace-nowrap flex-shrink-0 ${
                pathname === href
                  ? "font-medium"
                  : "text-slate-600 hover:text-slate-900"
              }`}
              style={pathname === href ? { color: "#ea650d" } : undefined}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Notification bell */}
        <div className="relative" ref={bellRef}>
          <button
            onClick={() => setAbierto(v => !v)}
            className="relative p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-500 hover:text-slate-700"
            title="Notificaciones"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            {notifs.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full text-white text-[10px] font-bold flex items-center justify-center leading-none" style={{ background: "#ea650d" }}>
                {notifs.length > 9 ? "9+" : notifs.length}
              </span>
            )}
          </button>

          {abierto && (
            <div className="absolute right-0 top-10 w-80 bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-800">Notificaciones</p>
                {notifs.length > 0 && (
                  <span className="text-xs bg-orange-100 text-orange-700 font-semibold px-2 py-0.5 rounded-full">
                    {notifs.length} pendiente{notifs.length > 1 ? "s" : ""}
                  </span>
                )}
              </div>

              {notifs.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-2xl mb-1">✅</p>
                  <p className="text-sm text-slate-500">Todo al día</p>
                  <p className="text-xs text-slate-400 mt-0.5">No hay elementos pendientes</p>
                </div>
              ) : (
                <div className="max-h-80 overflow-y-auto divide-y divide-slate-50">
                  {notifs.map(n => (
                    <Link
                      key={n.id}
                      href={n.href}
                      onClick={() => setAbierto(false)}
                      className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50 transition-colors"
                    >
                      <span className="text-base flex-shrink-0 mt-0.5">{NOTIF_ICON[n.tipo]}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-slate-800 truncate">{n.titulo}</p>
                        {n.subtitulo && (
                          <p className="text-xs text-slate-400 truncate mt-0.5">{n.subtitulo}</p>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              )}

              <div className="border-t border-slate-100 px-4 py-2.5">
                <Link
                  href="/hoy"
                  onClick={() => setAbierto(false)}
                  className="text-xs font-medium hover:underline"
                  style={{ color: "#ea650d" }}
                >
                  Ver resumen del día →
                </Link>
              </div>
            </div>
          )}
        </div>

        <span className="text-xs text-slate-400 hidden sm:block">
          {new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}
        </span>
        {user && (
          <div className="flex items-center gap-2">
            {user.user_metadata?.avatar_url && (
              <img
                src={user.user_metadata.avatar_url}
                alt=""
                className="w-7 h-7 rounded-full border border-slate-200"
              />
            )}
            <span className="text-xs text-slate-600 hidden md:block">
              {user.user_metadata?.full_name ?? user.email}
            </span>
            <button
              onClick={cerrarSesion}
              className="text-xs text-slate-400 hover:text-slate-700 transition-colors px-2 py-1 rounded hover:bg-slate-100"
            >
              Salir
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
