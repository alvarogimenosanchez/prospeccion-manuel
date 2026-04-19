"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type PermisosContextType = {
  rol: string | null;
  puede: (permiso: string) => boolean;
  cargando: boolean;
};

const PermisosCtx = createContext<PermisosContextType>({
  rol: null,
  puede: () => true, // permissive default while loading
  cargando: true,
});

export function PermisosProvider({ children }: { children: React.ReactNode }) {
  const [rol, setRol] = useState<string | null>(null);
  const [mapa, setMapa] = useState<Record<string, boolean> | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    async function cargar() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.email) { setCargando(false); return; }

        const [{ data: comercial }, { data: perms }] = await Promise.all([
          supabase.from("comerciales").select("rol").eq("email", user.email).single(),
          // Will be fetched once we know the role
          Promise.resolve({ data: null as null }),
        ]);

        if (!comercial) { setCargando(false); return; }
        const rolUsuario = comercial.rol as string;
        setRol(rolUsuario);

        const { data: permisosData } = await supabase
          .from("role_permissions")
          .select("permiso, activo")
          .eq("rol", rolUsuario);

        const m: Record<string, boolean> = {};
        for (const p of permisosData ?? []) m[p.permiso] = p.activo;
        setMapa(m);
      } finally {
        setCargando(false);
      }
    }
    cargar();
  }, []);

  function puede(permiso: string): boolean {
    if (cargando || mapa === null) return true; // show while loading
    return mapa[permiso] ?? false;
  }

  return (
    <PermisosCtx.Provider value={{ rol, puede, cargando }}>
      {children}
    </PermisosCtx.Provider>
  );
}

export const usePermisos = () => useContext(PermisosCtx);
