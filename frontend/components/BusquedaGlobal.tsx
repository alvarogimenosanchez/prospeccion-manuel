"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Resultado = {
  id: string;
  tipo: "lead" | "cliente" | "appointment";
  titulo: string;
  subtitulo?: string;
  href: string;
};

const TIPO_LABEL = { lead: "Lead", cliente: "Cliente", appointment: "Cita" };
const TIPO_ICON = { lead: "👤", cliente: "⭐", appointment: "📅" };

export function BusquedaGlobal() {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [query, setQuery] = useState("");
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [seleccionado, setSeleccionado] = useState(0);
  const [buscando, setBuscando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Open on Cmd+K / Ctrl+K
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setAbierto(v => !v);
      }
      if (e.key === "Escape") setAbierto(false);
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (abierto) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery("");
      setResultados([]);
      setSeleccionado(0);
    }
  }, [abierto]);

  const buscar = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setResultados([]); return; }
    setBuscando(true);
    const termino = `%${q.trim()}%`;

    const [{ data: leads }, { data: clientes }] = await Promise.all([
      supabase.from("leads")
        .select("id, nombre, apellidos, empresa, estado")
        .or(`nombre.ilike.${termino},empresa.ilike.${termino}`)
        .limit(5),
      supabase.from("clientes")
        .select("id, nombre, apellidos, empresa, producto")
        .or(`nombre.ilike.${termino},empresa.ilike.${termino}`)
        .limit(5),
    ]);

    const items: Resultado[] = [
      ...(leads ?? []).map(l => ({
        id: `l-${l.id}`,
        tipo: "lead" as const,
        titulo: [l.nombre, l.apellidos].filter(Boolean).join(" "),
        subtitulo: [l.empresa, l.estado].filter(Boolean).join(" · "),
        href: `/leads/${l.id}`,
      })),
      ...(clientes ?? []).map(c => ({
        id: `c-${c.id}`,
        tipo: "cliente" as const,
        titulo: [c.nombre, c.apellidos].filter(Boolean).join(" "),
        subtitulo: [c.empresa, c.producto].filter(Boolean).join(" · "),
        href: `/clientes`,
      })),
    ];

    setResultados(items);
    setSeleccionado(0);
    setBuscando(false);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => buscar(query), 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, buscar]);

  function navegar(href: string) {
    setAbierto(false);
    router.push(href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSeleccionado(s => Math.min(s + 1, resultados.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSeleccionado(s => Math.max(s - 1, 0));
    } else if (e.key === "Enter" && resultados[seleccionado]) {
      navegar(resultados[seleccionado].href);
    }
  }

  if (!abierto) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4" style={{ background: "rgba(15,23,42,0.5)" }}>
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
          <svg className="w-5 h-5 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Buscar leads, clientes..."
            className="flex-1 text-sm text-slate-800 placeholder-slate-400 focus:outline-none bg-transparent"
          />
          {buscando && (
            <span className="text-xs text-slate-400">Buscando...</span>
          )}
          <button onClick={() => setAbierto(false)} className="text-xs text-slate-400 border border-slate-200 rounded px-1.5 py-0.5 hover:bg-slate-50">
            Esc
          </button>
        </div>

        {/* Results */}
        {resultados.length > 0 ? (
          <div className="py-2">
            {resultados.map((r, i) => (
              <button
                key={r.id}
                onClick={() => navegar(r.href)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                  i === seleccionado ? "bg-orange-50" : "hover:bg-slate-50"
                }`}
              >
                <span className="text-base flex-shrink-0">{TIPO_ICON[r.tipo]}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{r.titulo}</p>
                  {r.subtitulo && (
                    <p className="text-xs text-slate-400 truncate">{r.subtitulo}</p>
                  )}
                </div>
                <span className="text-xs text-slate-300 flex-shrink-0">{TIPO_LABEL[r.tipo]}</span>
              </button>
            ))}
          </div>
        ) : query.length >= 2 && !buscando ? (
          <div className="py-8 text-center">
            <p className="text-sm text-slate-400">Sin resultados para "{query}"</p>
          </div>
        ) : query.length < 2 ? (
          <div className="px-4 py-4">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Accesos rápidos</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { href: "/leads/nuevo", label: "Nuevo lead", icon: "➕" },
                { href: "/agenda", label: "Agenda hoy", icon: "📅" },
                { href: "/mensajes", label: "Mensajes", icon: "💬" },
                { href: "/pipeline", label: "Pipeline", icon: "🔄" },
              ].map(({ href, label, icon }) => (
                <button
                  key={href}
                  onClick={() => navegar(href)}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-slate-200 hover:border-orange-300 hover:bg-orange-50 transition-all text-left"
                >
                  <span className="text-sm">{icon}</span>
                  <span className="text-xs font-medium text-slate-600">{label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="border-t border-slate-100 px-4 py-2 flex items-center gap-4">
          <span className="text-xs text-slate-400">↑↓ navegar</span>
          <span className="text-xs text-slate-400">↵ abrir</span>
          <span className="text-xs text-slate-400">Esc cerrar</span>
          <span className="ml-auto text-xs text-slate-300">⌘K</span>
        </div>
      </div>
    </div>
  );
}
