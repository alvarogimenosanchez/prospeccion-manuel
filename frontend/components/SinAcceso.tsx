"use client";

import Link from "next/link";

export function SinAcceso() {
  return (
    <div className="flex flex-col items-center justify-center py-32 text-center">
      <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
        style={{ background: "#fff5f0" }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ea650d" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4M12 16h.01" />
        </svg>
      </div>
      <h2 className="text-lg font-semibold text-slate-800 mb-1">Sin acceso</h2>
      <p className="text-sm text-slate-500 mb-6 max-w-xs">
        No tienes permiso para ver esta sección. Contacta con tu administrador si crees que es un error.
      </p>
      <Link
        href="/hoy"
        className="text-sm font-medium px-4 py-2 rounded-lg text-white transition-colors"
        style={{ background: "#ea650d" }}
      >
        Volver al inicio
      </Link>
    </div>
  );
}
