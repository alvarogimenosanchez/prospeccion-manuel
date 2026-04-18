"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import type { User } from "@supabase/supabase-js";

// ── Icons ─────────────────────────────────────────────────────────────────────
function NavIcon({ name }: { name: string }) {
  const icons: Record<string, string | string[]> = {
    home:       "M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10",
    target:     ["M12 22a10 10 0 100-20 10 10 0 000 20z", "M12 18a6 6 0 100-12 6 6 0 000 12z", "M12 14a2 2 0 100-4 2 2 0 000 4z"],
    users:      ["M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2", "M9 11a4 4 0 100-8 4 4 0 000 8z", "M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"],
    pipeline:   ["M3 3h4v18H3z", "M10 8h4v13h-4z", "M17 5h4v16h-4z"],
    message:    "M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z",
    calendar:   ["M8 2v4M16 2v4M3 10h18", "M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z"],
    search:     ["M21 21l-6-6", "M11 19a8 8 0 100-16 8 8 0 000 16z"],
    map:        ["M12 2a7 7 0 017 7c0 5.25-7 13-7 13S5 14.25 5 9a7 7 0 017-7z", "M12 11a2 2 0 100-4 2 2 0 000 4z"],
    chart:      "M18 20V10M12 20V4M6 20v-6",
    trending:   ["M23 6l-9.5 9.5-5-5L1 18", "M17 6h6v6"],
    briefcase:  ["M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z", "M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"],
    team:       ["M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2", "M9 11a4 4 0 100-8 4 4 0 000 8z", "M22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"],
    logout:     ["M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4", "M16 17l5-5-5-5M21 12H9"],
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

// ── Navigation groups ─────────────────────────────────────────────────────────
const NAV_GROUPS = [
  {
    label: "Diario",
    items: [
      { href: "/hoy",      label: "Hoy",         icon: "target"    },
      { href: "/leads",    label: "Leads",        icon: "users"     },
      { href: "/pipeline", label: "Pipeline",     icon: "pipeline"  },
    ],
  },
  {
    label: "Comunicación",
    items: [
      { href: "/mensajes", label: "Mensajes",     icon: "message"   },
      { href: "/agenda",   label: "Agenda",       icon: "calendar"  },
    ],
  },
  {
    label: "Captación",
    items: [
      { href: "/prospeccion", label: "Prospección", icon: "search"  },
      { href: "/mapa",        label: "Mapa",         icon: "map"    },
    ],
  },
  {
    label: "Análisis",
    items: [
      { href: "/metricas",  label: "Métricas",   icon: "chart"     },
      { href: "/desempeno", label: "Desempeño",  icon: "trending"  },
    ],
  },
  {
    label: "Gestión",
    items: [
      { href: "/clientes", label: "Clientes",    icon: "briefcase" },
      { href: "/equipos",  label: "Equipos",     icon: "team"      },
    ],
  },
];

// ── Component ─────────────────────────────────────────────────────────────────
export function Sidebar({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
  }, []);

  async function cerrarSesion() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <div className="flex flex-col h-full bg-[#0D1117] overflow-y-auto sidebar-scroll">

      {/* Logo */}
      <div className="flex items-center justify-between px-4 pt-5 pb-4 shrink-0">
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold shrink-0"
            style={{ background: "linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)" }}>
            M
          </div>
          <div>
            <p className="text-white text-sm font-semibold leading-tight" style={{ fontFamily: "var(--font-heading)" }}>
              Manuel
            </p>
            <p className="text-slate-600 text-[10px] leading-tight">Prospección CRM</p>
          </div>
        </Link>
        {/* Close btn — mobile only */}
        {onClose && (
          <button onClick={onClose} className="md:hidden p-1 text-slate-500 hover:text-white transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Dashboard link */}
      <div className="px-2 mb-1">
        <Link
          href="/"
          onClick={onClose}
          className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all ${
            isActive("/")
              ? "bg-white/8 text-white font-medium"
              : "text-slate-500 hover:text-slate-300 hover:bg-white/4"
          }`}
        >
          <NavIcon name="home" />
          <span>Dashboard</span>
        </Link>
      </div>

      {/* Divider */}
      <div className="mx-4 h-px bg-white/5 mb-2" />

      {/* Nav groups */}
      <nav className="flex-1 px-2 space-y-4 pb-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="px-3 mb-1 text-[10px] uppercase tracking-[0.14em] text-slate-700 font-semibold">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map(({ href, label, icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={onClose}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all ${
                    isActive(href)
                      ? "bg-indigo-500/12 text-indigo-300 font-medium"
                      : "text-slate-500 hover:text-slate-300 hover:bg-white/4"
                  }`}
                >
                  <NavIcon name={icon} />
                  <span>{label}</span>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* User footer */}
      <div className="shrink-0 border-t border-white/5 px-3 py-3">
        {user ? (
          <div className="flex items-center gap-2.5">
            {user.user_metadata?.avatar_url ? (
              <img
                src={user.user_metadata.avatar_url}
                alt=""
                className="w-7 h-7 rounded-full border border-white/10 shrink-0"
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-indigo-500/20 flex items-center justify-center shrink-0">
                <span className="text-indigo-300 text-xs font-semibold">
                  {(user.user_metadata?.full_name ?? user.email ?? "?")[0].toUpperCase()}
                </span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-slate-300 text-xs font-medium truncate leading-tight">
                {user.user_metadata?.full_name?.split(" ")[0] ?? user.email}
              </p>
              <button
                onClick={cerrarSesion}
                className="text-slate-600 text-[10px] hover:text-red-400 transition-colors leading-tight flex items-center gap-1 mt-0.5"
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
