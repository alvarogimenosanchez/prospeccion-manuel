"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import type { User } from "@supabase/supabase-js";
import { usePermisos } from "./PermisosProvider";

// ── Icons ─────────────────────────────────────────────────────────────────────
function NavIcon({ name }: { name: string }) {
  const icons: Record<string, string | string[]> = {
    home:       "M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10",
    target:     ["M12 22a10 10 0 100-20 10 10 0 000 20z", "M12 18a6 6 0 100-12 6 6 0 000 12z", "M12 14a2 2 0 100-4 2 2 0 000 4z"],
    users:      ["M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2", "M9 11a4 4 0 100-8 4 4 0 000 8z", "M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"],
    pipeline:   ["M3 3h4v18H3z", "M10 8h4v13h-4z", "M17 5h4v16h-4z"],
    message:    "M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z",
    chat:       ["M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z", "M8 10h.01M12 10h.01M16 10h.01"],
    calendar:   ["M8 2v4M16 2v4M3 10h18", "M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z"],
    search:     ["M21 21l-6-6", "M11 19a8 8 0 100-16 8 8 0 000 16z"],
    map:        ["M12 2a7 7 0 017 7c0 5.25-7 13-7 13S5 14.25 5 9a7 7 0 017-7z", "M12 11a2 2 0 100-4 2 2 0 000 4z"],
    chart:      "M18 20V10M12 20V4M6 20v-6",
    trending:   ["M23 6l-9.5 9.5-5-5L1 18", "M17 6h6v6"],
    briefcase:  ["M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z", "M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"],
    team:       ["M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2", "M9 11a4 4 0 100-8 4 4 0 000 8z", "M22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"],
    bookmark:   ["M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"],
    clipboard:  ["M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2", "M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2", "M9 12h6M9 16h4"],
    settings:   ["M12 15a3 3 0 100-6 3 3 0 000 6z", "M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"],
    flag:       ["M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z", "M4 22v-7"],
    logout:     ["M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4", "M16 17l5-5-5-5M21 12H9"],
    download:   ["M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4", "M7 10l5 5 5-5M12 15V3"],
    sparkle:    ["M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"],
    trophy:     ["M6 9H4a2 2 0 01-2-2V5h4M18 9h2a2 2 0 002-2V5h-4", "M12 9a6 6 0 000 12v0M12 21h0", "M8 21h8M10 17h4", "M12 3v6"],
  };

  const d = icons[name] ?? "M12 12h.01";
  const paths = Array.isArray(d) ? d : [d];

  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {paths.map((p, i) => <path key={i} d={p} />)}
    </svg>
  );
}

// ── Navigation ────────────────────────────────────────────────────────────────
const NAV_GROUPS = [
  {
    label: "Diario",
    items: [
      { href: "/hoy",             label: "Hoy",            icon: "target",    permiso: null },
      { href: "/buscar",          label: "Buscar",         icon: "search",    permiso: null },
      { href: "/notificaciones",  label: "Notificaciones", icon: "flag",       permiso: null },
      { href: "/tareas",          label: "Mis tareas",     icon: "clipboard",  permiso: null },
      { href: "/oportunidades",    label: "Oportunidades",  icon: "sparkle",    permiso: null },
      { href: "/seguimiento",      label: "Seguimiento",    icon: "calendar",   permiso: null },
      { href: "/planificacion",   label: "Planificación",  icon: "clipboard",  permiso: null },
      { href: "/negociaciones",   label: "Negociaciones",  icon: "briefcase",  permiso: null },
      { href: "/leads",           label: "Leads",          icon: "users",      permiso: null },
      { href: "/pipeline",        label: "Pipeline",       icon: "pipeline",   permiso: null },
    ],
  },
  {
    label: "Comunicación",
    items: [
      { href: "/mensajes",           label: "Mensajes WA",     icon: "message",  permiso: null },
      { href: "/llamadas",           label: "Llamadas",        icon: "chat",     permiso: null },
      { href: "/anuncios",           label: "Anuncios",        icon: "flag",     permiso: null },
      { href: "/campanas",           label: "Campañas",        icon: "flag",     permiso: "asignar_leads" },
      { href: "/ia",                 label: "Asistente IA",    icon: "sparkle",  permiso: null },
      { href: "/mensajes-internos",  label: "Chat interno",    icon: "chat",     permiso: null },
      { href: "/agenda",             label: "Agenda",          icon: "calendar", permiso: null },
      { href: "/simulador",          label: "Simulador",       icon: "sparkle",  permiso: null },
      { href: "/competencia",        label: "Competencia",     icon: "trending",  permiso: null },
      { href: "/recursos",           label: "Acceso rápido",   icon: "bookmark", permiso: null },
    ],
  },
  {
    label: "Captación",
    items: [
      { href: "/prospeccion",  label: "Prospección",  icon: "search",    permiso: "usar_scraping" },
      { href: "/mapa",         label: "Mapa",          icon: "map",       permiso: "usar_scraping" },
      { href: "/importar",     label: "Importar CSV",  icon: "download",  permiso: "asignar_leads" },
      { href: "/cuestionario", label: "Cuestionario",  icon: "clipboard", permiso: null },
    ],
  },
  {
    label: "Análisis",
    items: [
      { href: "/clasificacion", label: "Clasificación", icon: "trophy",   permiso: null },
      { href: "/logros",        label: "Logros",        icon: "sparkle",  permiso: null },
      { href: "/metricas",      label: "Métricas",      icon: "chart",    permiso: "ver_metricas" },
      { href: "/sla",           label: "SLA respuesta", icon: "target",   permiso: "ver_metricas" },
      { href: "/desempeno",     label: "Desempeño",     icon: "trending", permiso: "ver_metricas" },
      { href: "/funnel",             label: "Funnel",          icon: "pipeline",  permiso: "ver_metricas" },
      { href: "/velocidad",          label: "Velocidad",       icon: "trending",  permiso: "ver_metricas" },
      { href: "/productos-analisis", label: "Productos",       icon: "briefcase", permiso: "ver_metricas" },
      { href: "/analisis-perdidas",  label: "Pérdidas",        icon: "flag",      permiso: "ver_metricas" },
      { href: "/fuentes",            label: "Fuentes",         icon: "target",    permiso: "ver_metricas" },
      { href: "/tendencias",         label: "Tendencias",      icon: "trending",  permiso: "ver_metricas" },
      { href: "/actividad",          label: "Actividad",       icon: "sparkle",   permiso: "ver_metricas" },
      { href: "/geografico",         label: "Geográfico",      icon: "map",       permiso: "ver_metricas" },
    ],
  },
  {
    label: "Cartera",
    items: [
      { href: "/clientes",      label: "Clientes",      icon: "briefcase", permiso: "gestionar_clientes" },
      { href: "/renovaciones",  label: "Renovaciones",  icon: "calendar",  permiso: "gestionar_clientes" },
      { href: "/nps",           label: "NPS",           icon: "trending",  permiso: "gestionar_clientes" },
      { href: "/presupuestos",  label: "Presupuestos",  icon: "clipboard", permiso: "gestionar_clientes" },
      { href: "/cross-sell",    label: "Cross-sell",    icon: "trending",  permiso: "gestionar_clientes" },
      { href: "/retencion",      label: "Retención",     icon: "trophy",    permiso: "gestionar_clientes" },
      { href: "/recuperar",     label: "Recuperar",     icon: "target",    permiso: "asignar_leads" },
      { href: "/referidos",     label: "Referidos",     icon: "users",     permiso: null },
      { href: "/colaboradores", label: "Colaboradores", icon: "briefcase", permiso: "gestionar_clientes" },
    ],
  },
  {
    label: "Dirección",
    items: [
      { href: "/mando",               label: "Centro mando", icon: "sparkle",   permiso: "ver_metricas" },
      { href: "/resumen",            label: "Resumen",      icon: "clipboard", permiso: "ver_metricas" },
      { href: "/comisiones",        label: "Comisiones",  icon: "trending",  permiso: "ver_metricas" },
      { href: "/ingresos",          label: "Ingresos",    icon: "chart",    permiso: "ver_metricas" },
      { href: "/forecast",          label: "Forecast",    icon: "trending", permiso: "ver_metricas" },
      { href: "/objetivos",         label: "Objetivos",   icon: "target",   permiso: "ver_metricas" },
      { href: "/capacidad",          label: "Capacidad",   icon: "pipeline", permiso: "gestionar_equipo" },
      { href: "/coaching",          label: "Coaching",    icon: "users",    permiso: "gestionar_equipo" },
      { href: "/formaciones",       label: "Formaciones", icon: "bookmark", permiso: null },
      { href: "/calendario-equipo", label: "Cal. equipo", icon: "calendar", permiso: "gestionar_equipo" },
      { href: "/equipos",           label: "Equipos",     icon: "team",     permiso: "gestionar_equipo" },
    ],
  },
  {
    label: "Sistema",
    items: [
      { href: "/exportar",         label: "Exportar",   icon: "download",  permiso: "exportar_datos" },
      { href: "/duplicados",       label: "Duplicados", icon: "users",     permiso: "asignar_leads" },
      { href: "/calidad-datos",    label: "Calidad datos", icon: "clipboard", permiso: "ver_metricas" },
      { href: "/automatizaciones", label: "Automatiz.", icon: "sparkle",   permiso: "gestionar_ajustes" },
      { href: "/incidencias",      label: "Incidencias",icon: "flag",      permiso: "gestionar_ajustes" },
      { href: "/diagnostico",      label: "Diagnóstico",icon: "clipboard", permiso: "gestionar_ajustes" },
      { href: "/ajustes",          label: "Ajustes",    icon: "settings",  permiso: "gestionar_ajustes" },
      { href: "/reportes",         label: "Reportes",   icon: "flag",      permiso: "ver_reportes" },
    ],
  },
];

type Badges = { mensajes: number; hoy: number; agenda: number; anuncios: number; formaciones: number; };

// ── Component ─────────────────────────────────────────────────────────────────
export function Sidebar({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [user, setUser] = useState<User | null>(null);
  const [badges, setBadges] = useState<Badges>({ mensajes: 0, hoy: 0, agenda: 0, anuncios: 0, formaciones: 0 });
  const [chatNoLeidos, setChatNoLeidos] = useState(0);
  const { puede, cargando: cargandoPermisos } = usePermisos();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
  }, []);

  useEffect(() => {
    async function fetchBadges() {
      const ahora = new Date();
      const inicioDia = new Date();
      inicioDia.setHours(0, 0, 0, 0);
      const finDia = new Date();
      finDia.setHours(23, 59, 59, 999);

      const { data: { user: u } } = await supabase.auth.getUser();
      let comId: string | null = null;
      if (u?.email) {
        const { data: com } = await supabase.from("comerciales").select("id").eq("email", u.email).single();
        comId = com?.id ?? null;
      }

      let qVencidas = supabase.from("leads").select("id", { count: "exact", head: true }).not("proxima_accion", "is", null).neq("proxima_accion", "ninguna").lt("proxima_accion_fecha", ahora.toISOString()).not("estado", "in", "(cerrado_ganado,cerrado_perdido,descartado)");
      let qCalientes = supabase.from("leads").select("id", { count: "exact", head: true }).eq("temperatura", "caliente").not("estado", "in", "(cerrado_ganado,cerrado_perdido,descartado)");
      if (comId) {
        qVencidas = qVencidas.eq("comercial_asignado", comId);
        qCalientes = qCalientes.eq("comercial_asignado", comId);
      }

      const [{ count: mensajes }, { count: accionesVencidas }, { count: calientes }, { count: citasHoy }] = await Promise.all([
        supabase.from("mensajes_pendientes").select("id", { count: "exact", head: true }).eq("estado", "pendiente"),
        qVencidas,
        qCalientes,
        supabase.from("appointments").select("id", { count: "exact", head: true }).gte("fecha_hora", inicioDia.toISOString()).lte("fecha_hora", finDia.toISOString()).not("estado", "in", "(cancelada,no_asistio)"),
      ]);
      // Anuncios no leídos y formaciones obligatorias pendientes
      let anunciosBadge = 0;
      let formacionesBadge = 0;
      if (comId) {
        const [{ data: anunciosData }, { data: formData }, { data: progData }] = await Promise.all([
          supabase.from("anuncios").select("id, lecturas").eq("activo", true).is("fecha_expira", null).or(`fecha_expira.gt.${new Date().toISOString()},fecha_expira.is.null`),
          supabase.from("formaciones").select("id").eq("activa", true).eq("obligatoria", true),
          supabase.from("formaciones_progreso").select("formacion_id, estado").eq("comercial_id", comId).eq("estado", "completada"),
        ]);
        const completadasIds = new Set((progData ?? []).map(p => p.formacion_id));
        formacionesBadge = (formData ?? []).filter(f => !completadasIds.has(f.id)).length;
        anunciosBadge = (anunciosData ?? []).filter(a => !((a.lecturas as string[]) ?? []).includes(comId)).length;
      }

      setBadges({
        mensajes: mensajes ?? 0,
        hoy: (accionesVencidas ?? 0) + (calientes ?? 0),
        agenda: citasHoy ?? 0,
        anuncios: anunciosBadge,
        formaciones: formacionesBadge,
      });
    }
    fetchBadges();
  }, [pathname]);

  useEffect(() => {
    async function fetchChatBadge() {
      const { data: { user: u } } = await supabase.auth.getUser();
      if (!u?.email) return;
      const { data: com } = await supabase.from("comerciales").select("id").eq("email", u.email).single();
      if (!com) return;
      const { data: msgs } = await supabase
        .from("mensajes_internos")
        .select("id, leido_por")
        .or(`para_comercial_id.eq.${com.id},grupo_id.not.is.null`)
        .neq("de_comercial_id", com.id)
        .limit(100);
      const noLeidos = (msgs ?? []).filter(m => !((m.leido_por as string[]) ?? []).includes(com.id)).length;
      setChatNoLeidos(noLeidos);
    }
    if (pathname !== "/mensajes-internos") fetchChatBadge();
    else setChatNoLeidos(0);
  }, [pathname]);

  async function cerrarSesion() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  // Styles as inline to match brand tokens exactly
  const navItemBase: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "7px 12px",
    borderRadius: "4px",
    fontSize: "14px",
    transition: "background 0.12s, color 0.12s",
    textDecoration: "none",
    cursor: "pointer",
  };

  return (
    <div
      className="flex flex-col h-full overflow-y-auto sidebar-scroll"
      style={{ background: "#ffffff", borderRight: "1px solid #e5ded9" }}
    >
      {/* Logo */}
      <div className="flex items-center justify-between px-4 pt-5 pb-4 shrink-0">
        <Link href="/" className="flex items-center gap-2.5">
          {/* NN orange logo mark */}
          <div
            className="w-8 h-8 flex items-center justify-center text-white text-sm font-bold shrink-0"
            style={{ background: "#ea650d", borderRadius: "4px" }}
          >
            NN
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight" style={{ color: "#414141" }}>
              Manuel
            </p>
            <p className="text-[10px] leading-tight" style={{ color: "#a09890" }}>
              Prospección CRM
            </p>
          </div>
        </Link>
        {onClose && (
          <button
            onClick={onClose}
            className="md:hidden p-1 rounded transition-colors"
            style={{ color: "#a09890" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Dashboard */}
      <div className="px-2 mb-1">
        <Link
          href="/"
          onClick={onClose}
          style={{
            ...navItemBase,
            background: isActive("/") ? "#fff5f0" : "transparent",
            color: isActive("/") ? "#ea650d" : "#6b6560",
            fontWeight: isActive("/") ? 500 : 400,
            borderLeft: isActive("/") ? "3px solid #ea650d" : "3px solid transparent",
          }}
        >
          <NavIcon name="home" />
          <span>Dashboard</span>
        </Link>
      </div>

      {/* Divider */}
      <div className="mx-4 mb-2" style={{ height: "1px", background: "#f0ebe7" }} />

      {/* Nav groups */}
      <nav className="flex-1 px-2 space-y-4 pb-4">
        {NAV_GROUPS.map((group) => {
          const itemsVisibles = group.items.filter(item => !item.permiso || cargandoPermisos || puede(item.permiso));
          if (itemsVisibles.length === 0) return null;
          return (
          <div key={group.label}>
            <p
              className="px-3 mb-1 uppercase text-[10px] tracking-[0.14em] font-semibold"
              style={{ color: "#bbb5b0" }}
            >
              {group.label}
            </p>
            <div className="space-y-0.5">
              {itemsVisibles.map(({ href, label, icon }) => {
                const active = isActive(href);
                const badge = href === "/mensajes" ? badges.mensajes : href === "/hoy" ? badges.hoy : href === "/agenda" ? badges.agenda : href === "/mensajes-internos" ? chatNoLeidos : href === "/anuncios" ? badges.anuncios : href === "/formaciones" ? badges.formaciones : 0;
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={onClose}
                    style={{
                      ...navItemBase,
                      background: active ? "#fff5f0" : "transparent",
                      color: active ? "#ea650d" : "#6b6560",
                      fontWeight: active ? 500 : 400,
                      borderLeft: active ? "3px solid #ea650d" : "3px solid transparent",
                    }}
                    onMouseEnter={(e) => {
                      if (!active) {
                        e.currentTarget.style.background = "#faf8f6";
                        e.currentTarget.style.color = "#414141";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!active) {
                        e.currentTarget.style.background = "transparent";
                        e.currentTarget.style.color = "#6b6560";
                      }
                    }}
                  >
                    <NavIcon name={icon} />
                    <span className="flex-1">{label}</span>
                    {badge > 0 && (
                      <span style={{
                        background: href === "/mensajes" ? "#ea650d" : href === "/agenda" ? "#f59e0b" : href === "/formaciones" ? "#7c3aed" : "#ef4444",
                        color: "#fff",
                        borderRadius: "9999px",
                        fontSize: "10px",
                        fontWeight: 600,
                        padding: "1px 6px",
                        minWidth: "18px",
                        textAlign: "center",
                        lineHeight: "16px",
                      }}>
                        {badge > 99 ? "99+" : badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
          );
        })}
      </nav>

      {/* User footer */}
      <div
        className="shrink-0 px-3 py-3"
        style={{ borderTop: "1px solid #f0ebe7" }}
      >
        {user ? (
          <div className="flex items-center gap-2.5">
            {user.user_metadata?.avatar_url ? (
              <img
                src={user.user_metadata.avatar_url}
                alt=""
                className="w-7 h-7 rounded-full shrink-0"
                style={{ border: "1px solid #e5ded9" }}
              />
            ) : (
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                style={{ background: "#fff5f0" }}
              >
                <span className="text-xs font-semibold" style={{ color: "#ea650d" }}>
                  {(user.user_metadata?.full_name ?? user.email ?? "?")[0].toUpperCase()}
                </span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <Link
                href="/perfil"
                className="text-xs font-medium truncate leading-tight block hover:underline"
                style={{ color: "#414141" }}
                onClick={onClose}
              >
                {user.user_metadata?.full_name?.split(" ")[0] ?? user.email}
              </Link>
              <button
                onClick={cerrarSesion}
                className="text-[10px] leading-tight flex items-center gap-1 mt-0.5 transition-colors"
                style={{ color: "#a09890" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "#e64415")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "#a09890")}
              >
                <NavIcon name="logout" />
                Cerrar sesión
              </button>
            </div>
          </div>
        ) : (
          <div className="h-9" />
        )}
      </div>
    </div>
  );
}
