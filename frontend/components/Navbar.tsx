"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import type { User } from "@supabase/supabase-js";

export function Navbar() {
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

  const links = [
    { href: "/", label: "Dashboard" },
    { href: "/hoy", label: "🎯 Hoy" },
    { href: "/leads", label: "Leads" },
    { href: "/pipeline", label: "Pipeline" },
    { href: "/mensajes", label: "Mensajes" },
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

      <div className="flex items-center gap-4">
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
