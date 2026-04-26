"use client";

import { useEffect, useState } from "react";

type Atajo = { tecla: string; descripcion: string };
type Grupo = { titulo: string; atajos: Atajo[] };

const GRUPOS: Grupo[] = [
  {
    titulo: "Navegación",
    atajos: [
      { tecla: "⌘K",  descripcion: "Búsqueda global (leads, clientes)" },
      { tecla: "?",    descripcion: "Mostrar atajos de teclado" },
      { tecla: "Esc",  descripcion: "Cerrar modales y paneles" },
    ],
  },
  {
    titulo: "Crear rápido",
    atajos: [
      { tecla: "+ (FAB)", descripcion: "Botón flotante: nuevo lead, nueva cita" },
      { tecla: "↑ Importar", descripcion: "Importar leads desde CSV (/leads)" },
    ],
  },
  {
    titulo: "Lista de leads",
    atajos: [
      { tecla: "↑↓",  descripcion: "Navegar resultados de búsqueda global" },
      { tecla: "↵",   descripcion: "Abrir resultado seleccionado" },
    ],
  },
  {
    titulo: "Páginas principales",
    atajos: [
      { tecla: "/hoy",       descripcion: "Resumen del día y tareas pendientes" },
      { tecla: "/leads",     descripcion: "Gestión de leads con filtros avanzados" },
      { tecla: "/pipeline",  descripcion: "Vista Kanban del embudo de ventas" },
      { tecla: "/agenda",    descripcion: "Citas y agenda personal" },
    ],
  },
  {
    titulo: "Análisis y gestión",
    atajos: [
      { tecla: "/funnel",             descripcion: "Tasas de conversión por etapa" },
      { tecla: "/forecast",           descripcion: "Proyección de ingresos ponderada" },
      { tecla: "/objetivos",          descripcion: "Targets mensuales por comercial" },
      { tecla: "/clasificacion",      descripcion: "Ranking del equipo este mes" },
      { tecla: "/renovaciones",       descripcion: "Pólizas próximas a vencer" },
      { tecla: "/cross-sell",         descripcion: "Oportunidades de ampliación de cartera" },
      { tecla: "/calendario-equipo",  descripcion: "Vista semanal de citas del equipo" },
      { tecla: "/productos-analisis", descripcion: "Demanda y conversión por producto" },
      { tecla: "/analisis-perdidas",  descripcion: "Por qué se pierden los leads — patrones y razones" },
      { tecla: "/automatizaciones",   descripcion: "Panel de control de agentes IA" },
      { tecla: "/ingresos",           descripcion: "Revenue y comisiones por comercial" },
      { tecla: "/perfil",             descripcion: "Tu perfil y objetivos del mes" },
    ],
  },
];

export function AtajosModal() {
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "?" && !e.ctrlKey && !e.metaKey && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        setAbierto(v => !v);
      }
      if (e.key === "Escape") setAbierto(false);
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  if (!abierto) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: "rgba(15,23,42,0.5)" }}
      onClick={() => setAbierto(false)}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-800">Atajos de teclado</p>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Presiona ? para cerrar</span>
            <button onClick={() => setAbierto(false)} className="text-slate-400 hover:text-slate-700 text-xl leading-none">×</button>
          </div>
        </div>

        <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
          {GRUPOS.map(g => (
            <div key={g.titulo}>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">{g.titulo}</p>
              <div className="space-y-1.5">
                {g.atajos.map(a => (
                  <div key={a.tecla} className="flex items-center justify-between py-1">
                    <span className="text-sm text-slate-600">{a.descripcion}</span>
                    <kbd className="text-xs font-mono bg-slate-100 text-slate-700 px-2 py-1 rounded border border-slate-200 ml-4 flex-shrink-0">
                      {a.tecla}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <p className="text-xs text-slate-400">CRM NN España · v3.0 · RBAC + Forecast + Renovaciones</p>
          <button onClick={() => setAbierto(false)} className="text-xs hover:underline" style={{ color: "#ea650d" }}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
